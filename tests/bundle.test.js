// Runtime bundle tests. Run: node --test   (from repo root)
// 1) js/app.bundle.js must be generated from the current sources (tools/build-bundle.js).
// 2) The bundle that index.html actually loads must reverse balances with the same
//    balanceEffect rules the CSV importer uses (fee/discount, cross-currency transfers).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

test('app.bundle.js 與來源同步（tools/build-bundle.js --check）', () => {
  execFileSync(process.execPath, [path.join(root, 'tools', 'build-bundle.js'), '--check'], { stdio: 'pipe' });
});

test('app.bundle.js 為 classic script（沒有 import/export）', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8');
  assert.ok(!/^\s*(import|export)\s/m.test(src));
});

// Load the real runtime bundle against a permissive DOM stub. Only top-level declarations
// are needed; UI bootstrap errors after that point are ignored.
function loadBundle() {
  const src = fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8');
  const any = () => new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()),
    apply: () => any(), construct: () => any(), set: () => true,
  });
  const alerts = [];
  const document = any();
  const ctx = vm.createContext({
    document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(),
    alert: m => alerts.push(m), confirm: () => true, console: { ...console, warn() {}, error() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, crypto: { randomUUID: () => 'id' },
  });
  try { vm.runInContext(src, ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  const run = code => vm.runInContext(code, ctx);
  return { run, alerts, ctx };
}

function setup(accounts) {
  const b = loadBundle();
  b.run(`state={accounts:${JSON.stringify(accounts)},categories:[],projects:[],transactions:[],budgets:[],recurring:[],loans:[]}`);
  return b;
}
const balances = b => JSON.parse(b.run('JSON.stringify(Object.fromEntries(state.accounts.map(a=>[a.id,a.balance])))'));

test('bundle adjust()：刪除匯入的支出會用 balanceEffect（含手續費／折扣）還原', () => {
  const b = setup([{ id: 'a', balance: 895 }]);
  b.run(`adjust({kind:'expense',amount:100,account:'a',imported:true,balanceEffect:-105},-1)`);
  assert.equal(balances(b).a, 1000);
});

test('bundle adjust()：刪除跨幣別轉帳，目的端用 toBalanceEffect 還原', () => {
  const b = setup([{ id: 'twd', balance: 6785 }, { id: 'usd', balance: 100 }]);
  b.run(`adjust({kind:'transfer',amount:3200,account:'twd',toAccount:'usd',balanceEffect:-3215,toBalanceEffect:100,toAmount:100,imported:true},-1)`);
  assert.deepEqual(balances(b), { twd: 10000, usd: 0 });
});

test('bundle adjust()：手動支出／收入維持原行為', () => {
  const b = setup([{ id: 'a', balance: 0 }]);
  b.run(`adjust({kind:'expense',amount:50,account:'a'},1)`);
  b.run(`adjust({kind:'income',amount:80,account:'a'},1)`);
  assert.equal(balances(b).a, 30);
});

test('bundle：借還款交易不能從交易明細刪除', { timeout: 5000 }, async () => {
  const b = setup([{ id: 'a', balance: 500 }]);
  b.run(`state.transactions.push({id:'t1',kind:'loanPayment',amount:200,account:'a',loanId:'L1',loanRecord:true,name:'收款'})`);
  await b.run(`deleteTx('t1')`);
  assert.equal(b.run('state.transactions.length'), 1);
  assert.equal(balances(b).a, 500);
  assert.match(b.alerts.at(-1), /借還款/);
});

// V25.14: imported / synced text must never become markup.
const EVIL = '<img src=x onerror="alert(1)">';
test('bundle esc()：特殊字元全部跳脫', () => {
  const b = loadBundle();
  assert.equal(b.run(`esc(${JSON.stringify(EVIL + "&'")})`), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
});

test('bundle txRow()：交易名稱、商家、帳戶、分類圖示不會變成 HTML', () => {
  const b = setup([{ id: 'a', name: EVIL, balance: 0 }]);
  b.run(`state.categories.push({id:'c',name:${JSON.stringify(EVIL)},icon:${JSON.stringify(EVIL)}})`);
  const html = b.run(`txRow({id:'t',kind:'expense',amount:1,account:'a',category:'c',name:${JSON.stringify(EVIL)},merchant:${JSON.stringify(EVIL)}})`);
  assert.ok(!html.includes('<img'), html);
  assert.match(html, /&lt;img/);
});

test('app.js：使用者文字欄位放進 HTML 前都經過 esc()', () => {
  const src = ['app.js', 'analysis.js', 'budgets.js', 'categories.js', 'search.js', 'projects.js'].map(f => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n')
    .replace(/(?:alert|confirm)\(`[^`]*`|name:`[^`]*`/g, ''); // plain-text contexts, not HTML
  const raw = [...src.matchAll(/\$\{([^{}]*(?:\.name|\.note|\.person|\.merchant|\.icon|\.tags|\.time)\b[^{}]*)\}/g)]
    .map(m => m[1]).filter(e => !/^esc\(/.test(e));
  assert.deepEqual(raw, []);
});

// V25.16: same-name accounts in different currencies must be distinguishable.
test('bundle acctName()／acctMoney()：非 TWD 帳戶顯示幣別並用自己的幣別格式化', () => {
  const b = loadBundle();
  assert.equal(b.run(`acctName({name:'玉山'})`), '玉山');
  assert.equal(b.run(`acctName({name:'玉山',currency:'TWD'})`), '玉山');
  assert.equal(b.run(`acctName({name:'玉山',currency:'usd'})`), '玉山（USD）');
  assert.equal(b.run(`acctName({name:'<b>',currency:'USD'})`), '&lt;b&gt;（USD）');
  assert.equal(b.run(`acctMoney(1234,{currency:'TWD'})`), b.run('money(1234)'));
  const usd = b.run(`acctMoney(12.5,{currency:'USD'})`);
  assert.match(usd, /12\.5/); assert.notEqual(usd, b.run('money(12.5)'));
  assert.match(b.run(`acctMoney(5,{currency:'XX1'})`), /^XX1 5$/); // invalid code falls back
});

// V25.17: new devices start blank — no demo transactions or balances.
test('bundle seed：新裝置只有預設分類與兩個 0 元帳戶', () => {
  const b = loadBundle();
  const seed = JSON.parse(b.run('JSON.stringify(seed)'));
  for (const k of ['transactions', 'projects', 'budgets', 'recurring', 'loans']) assert.equal(seed[k].length, 0, k);
  assert.deepEqual(seed.accounts.map(a => [a.id, a.balance]), [['cash', 0], ['bank', 0]]);
  assert.ok(seed.categories.length >= 6);
});

// V25.20: exchange rates for net worth.
test('bundle parseFx()：兩種匯率來源格式', () => {
  const b = loadBundle();
  const a = JSON.parse(b.run(`JSON.stringify(parseFx({result:'success',rates:{TWD:1,USD:0.032},time_last_update_utc:'x'}))`));
  assert.equal(a.rates.USD, 0.032);
  const c = JSON.parse(b.run(`JSON.stringify(parseFx({date:'2026-11-18',twd:{usd:0.032,jpy:4.8,btc:'x'}}))`));
  assert.deepEqual(c.rates, { USD: 0.032, JPY: 4.8 });
  assert.equal(b.run('parseFx({error:1})'), null);
});

test('bundle netWorth()：有匯率的外幣換算成 TWD，沒有匯率的另列', () => {
  const b = loadBundle();
  b.run(`fxCache={rates:{USD:0.032},fetchedAt:Date.now()}`);
  const nw = JSON.parse(b.run(`JSON.stringify(netWorth([{balance:1000},{currency:'USD',balance:100},{currency:'JPY',balance:500}]))`));
  assert.equal(nw.total, 1000 + 3125);
  assert.deepEqual(nw.missing, { JPY: 500 });
});

test('bundle refreshFx()：主來源失敗時用備用來源、成功後 12 小時內不再抓取', async () => {
  const b = loadBundle();
  const calls = [];
  b.run('fxCache=null;fxLastTry=0');
  b.ctx.fetch = async url => { calls.push(url); if (url.includes('er-api')) return { ok: false }; return { ok: true, json: async () => ({ date: 'd', twd: { usd: 0.031 } }) }; };
  assert.equal(await b.run('refreshFx()'), true);
  assert.equal(calls.length, 2);
  assert.equal(b.run(`fxRate('usd')`), 0.031);
  await b.run('refreshFx()');
  assert.equal(calls.length, 2, 'cached');
});

// A parse error in the bundle (e.g. a function named like an app.js const) must fail loudly:
// the behaviour tests swallow bootstrap errors, so check compilation on its own.
test('app.bundle.js 可以完整解析（沒有語法錯誤或重複宣告）', () => {
  const src = fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(src, { filename: 'app.bundle.js' }));
});
