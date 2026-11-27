// 資安加強 (V26.124) tests — CSP, pinned SDK, Edge Function input checks and origin allow-list, MOF data cleaning.
'use strict';
const { bundle, test, assert, path, root } = require('./_bundle.js');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const P = () => import(pathToFileURL(path.join(root, 'supabase', 'functions', 'einvoice', 'protocol.js')).href);
const csp = () => { const m = read('index.html').match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/); assert.ok(m, 'CSP meta'); return Object.fromEntries(m[1].split(';').map(x => x.trim().split(/\s+/)).map(([k, ...v]) => [k, v])); };

test('CSP：不准內嵌程式與 eval，資料只能送往自己的 Supabase 與匯率服務', () => {
  const c = csp(), h = read('index.html');
  assert.deepEqual(c['script-src'], ["'self'"]); assert.deepEqual(c['object-src'], ["'none'"]); assert.deepEqual(c['base-uri'], ["'self'"]);
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(h), 'index.html 不能有內嵌 <script>');
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(h.replace(/<!--[\s\S]*?-->/g, '')), '不能有 onclick= 之類的屬性');
  // every host the app fetches must be allowed, and nothing else
  const sync = read('js/sync-config.js').match(/https:\/\/[a-z0-9-]+\.supabase\.co/)[0];
  const fx = [...read('js/app.js').matchAll(/FX_URLS=\[([^\]]+)\]/g)][0][1].match(/https:\/\/[^/'"]+/g);
  assert.deepEqual(c['connect-src'].slice().sort(), ["'self'", sync, ...new Set(fx)].sort());
  assert.ok(c['img-src'].every(x => ["'self'", 'data:', 'blob:'].includes(x)), '圖片不能從外部網站載入（避免偷偷送出資料）');
});
test('沒有任何 JS 用到 eval、new Function、字串型 setTimeout', () => {
  for (const f of fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js') && f !== 'app.bundle.js')) {
    const s = read('js/' + f); assert.ok(!/\beval\(|new Function\(|setTimeout\(\s*['"`]/.test(s), f);
  }
});
test('Supabase SDK 用專案內固定版本，不從 CDN 載入；離線快取也包含它', () => {
  const s = read('js/sync.js'); assert.ok(!/jsdelivr|unpkg|esm\.sh/.test(s)); assert.match(s, /const CDN='\.\/js\/vendor\/supabase\.js'/);
  assert.match(read('js/vendor/supabase.js').slice(0, 40), /^var supabase=/); assert.match(read('js/vendor/supabase-LICENSE.txt'), /MIT/);
  const sw = read('sw.js'); for (const f of ['./js/vendor/supabase.js', './js/boot.js', './js/sw-register.js']) assert.ok(sw.includes(`'${f}'`), f);
});
test('boot.js：主題照舊；被其他網站嵌入時標記 framed', () => {
  const vm = require('node:vm'), src = read('js/boot.js');
  const run = (top) => { const de = { dataset: {} }, self = {}; const ctx = vm.createContext({ localStorage: { getItem: () => '{"theme":"light"}' }, matchMedia: () => ({ matches: false }), document: { documentElement: de }, location: { origin: 'https://me.example' } });
    ctx.window = { self, top: top === 'same' ? self : top }; vm.runInContext(src, ctx); return de.dataset; };
  assert.deepEqual(run('same'), { theme: 'light' });
  assert.equal(run({ location: { origin: 'https://me.example' } }).framed, undefined);
  assert.equal(run({ get location() { throw new Error('cross-origin'); } }).framed, '1');
});
test('Edge Function：只接受自己的網站與 localhost，可用 ALLOWED_ORIGINS 增加', async () => {
  const p = await P();
  assert.equal(p.allowOrigin('https://gshihwei.github.io'), 'https://gshihwei.github.io');
  assert.equal(p.allowOrigin('http://localhost:5600'), 'http://localhost:5600');
  assert.equal(p.allowOrigin('https://evil.example'), '');
  assert.equal(p.allowOrigin('https://gshihwei.github.io.evil.example'), '');
  assert.equal(p.allowOrigin('http://localhost.evil.example'), '');
  assert.equal(p.allowOrigin('https://my.site', 'https://a.b, https://my.site'), 'https://my.site');
  assert.equal(p.allowOrigin(''), '');
  const ts = read('supabase/functions/einvoice/index.ts'); assert.ok(!ts.includes("'Access-Control-Allow-Origin': '*'")); assert.match(ts, /text\.length > 16384/);
});
test('Edge Function：格式不對的輸入不會轉送到財政部', async () => {
  const p = await P(); let calls = 0; const f = async () => { calls++; throw new Error('should not be called'); };
  const s = { loginSsMe: 'K', carrierCode: '/ABC1234' };
  await assert.rejects(p.handle({ action: 'login', mobile: '12345', password: 'x' }, f), /手機號碼格式不正確/);
  await assert.rejects(p.handle({ action: 'login', mobile: '0912345678', password: 'x', carrier: 'abc' }, f), /手機條碼格式不正確/);
  await assert.rejects(p.handle({ action: 'login', mobile: '0912345678', password: 'x'.repeat(65) }, f), /密碼格式不正確/);
  await assert.rejects(p.handle({ action: 'headers', session: s, startDate: '2026-11-01', endDate: '2026/11/26' }, f), /日期格式不正確/);
  await assert.rejects(p.handle({ action: 'headers', session: s, startDate: '2026/11/01', endDate: '2026/11/26', page: 999 }, f), /頁碼不正確/);
  await assert.rejects(p.handle({ action: 'detail', session: s, invNum: '../x', invDate: '2026/11/01' }, f), /發票號碼格式不正確/);
  assert.equal(calls, 0);
});
test('財政部回來的資料存入前先檢查：格式不對的欄位清掉、太長的文字截斷', () => {
  const b = bundle({ accounts: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [], categories: [] });
  assert.equal(b.J("einvClean({no:'<img>',date:'2026-11-01'})"), null);
  assert.equal(b.J("einvClean({no:'AB12345678',date:'2026/11/01'})"), null);
  const c = b.J("einvClean({no:'AB12345678',date:'2026-11-01',api:'x\"><b>',time:'12:00<b>',total:'90',code:'12a4',seller:'12345678',sellerName:'店\\u0000家'+'x'.repeat(300)})");
  assert.deepEqual([c.api, c.time, c.total, c.code, c.seller, c.sellerName.length, c.sellerName.slice(0, 3)], ['2026/11/01', '', 90, '', '12345678', 120, '店 家']);
  assert.deepEqual(b.J("einvCleanItems([['鮮奶','2','45'],[null,1,1],['x',null,'abc'],'bad'])"), [['鮮奶', 2, 45], ['x', 0, 0]]);
});
