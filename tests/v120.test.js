// 從財政部下載電子發票 (V26.120) tests — protocol checked against Node's own crypto; the MOF service is mocked.
'use strict';
const { bundle, test, assert, path, root } = require('./_bundle.js');
const nodeCrypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const P = () => import(pathToFileURL(path.join(root, 'supabase', 'functions', 'einvoice', 'protocol.js')).href);
const swap = s => s.match(/.{1,2}/g).map(x => x.length === 2 ? x[1] + x[0] : x).join('');

test('登入封包：A|密文|B，金鑰與 IV 照協定（用 Node crypto 獨立解開）', async () => {
  const p = await P(), a = 'ABCDEFGHIJKLMNOP', b = 'qrstuvwxyz012345', r = await p.encryptLData({ account: '0912345678', x: 1 }, a, b);
  const [ra, ct, rb] = r.value.split('|'); assert.equal(ra, a); assert.equal(rb, b);
  const key = nodeCrypto.createHash('sha256').update(swap(b) + swap(a) + [...a].reverse().join('') + [...b].reverse().join('')).digest(), iv = Buffer.from(a.slice(-6) + b.slice(-6));
  const buf = Buffer.from(ct, 'base64'), d = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(buf.subarray(-16));
  assert.deepEqual(JSON.parse(Buffer.concat([d.update(buf.subarray(0, -16)), d.final()]).toString()), { account: '0912345678', x: 1 });
  assert.deepEqual(await p.decryptLData(r.value), { account: '0912345678', x: 1 });
  const rnd = await p.encryptLData({ y: 2 }); assert.match(rnd.value, /^[A-Za-z0-9]{16}\|[A-Za-z0-9+/=]+\|[A-Za-z0-9]{16}$/);
});
test('查詢 JWT：HS256（金鑰 = loginSsMe）、40 秒、comms 與 reqdata', async () => {
  const p = await P(), s = { loginSsMe: 'secret-key', loginLiat: 123, loginAppId: 'app', carrierCode: '/ABC1234' }, jwt = await p.signInvoiceJwt({ action: 'carrierInvChk' }, s, 1000);
  const [h, c, sig] = jwt.split('.'), dec = x => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepEqual(dec(h), { alg: 'HS256', typ: 'JWT', ver: '1.0' });
  assert.deepEqual(dec(c), { comms: { iat: 1000, exp: 1040, liat: 123, appid: 'app', barcode: '/ABC1234', keyType: '2' }, reqdata: { action: 'carrierInvChk' } });
  assert.equal(sig, nodeCrypto.createHmac('sha256', 'secret-key').update(`${h}.${c}`).digest('base64url'));
});
test('下載期別：本期（到今天）與上一期', async () => {
  const p = await P();
  assert.deepEqual(p.periods(new Date(2026, 10, 26)).map(x => [x.startDate, x.endDate]), [['2026/11/01', '2026/11/26'], ['2026/09/01', '2026/10/31']]);
  assert.deepEqual(p.periods(new Date(2027, 0, 5)).map(x => [x.startDate, x.endDate]), [['2027/01/01', '2027/01/05'], ['2026/11/01', '2026/12/31']]);
  assert.deepEqual(p.periods(new Date(2028, 2, 1)).map(x => x.startDate), ['2028/03/01', '2028/01/01']);
});
test('清單與明細的回應解析', async () => {
  const p = await P();
  const h = p.normHeaders({ result: [{ invNum: 'ab12345678', invDate: { year: 115, month: 11, date: 7 }, sellerName: '某商店', amount: '1,024', randomNumber: '1234', sellerBan: '12345678' }, { invNum: 'CD12345678', invDate: '2026/11/08 14:05', amount: 90 }, { invNum: 'bad' }] });
  assert.deepEqual(h.map(x => [x.no, x.date, x.time, x.api, x.total, x.code, x.seller]), [['AB12345678', '2026-11-07', '', '2026/11/07', 1024, '1234', '12345678'], ['CD12345678', '2026-11-08', '14:05', '2026/11/08', 90, '', '']]);
  assert.deepEqual(p.normDetail({ result: { details: [{ rowNum: '1', description: '鮮奶', quantity: '2', unitPrice: '45', amount: '90' }, { description: '折扣', quantity: '1', unitPrice: '0', amount: '-10' }] } }), [['鮮奶', 2, 45], ['折扣', 1, -10]]);
});
// A fake MOF service: checks the login packet and every JWT signature.
async function fakeMof(p, opts = {}) {
  const calls = [];
  const fetchFn = async (url, init) => {
    const u = new URL(url), json = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o) }); calls.push(u.pathname);
    if (u.pathname === '/mid/v1/login') {
      const inner = await p.decryptLData(JSON.parse(init.body).ldata); if (inner.password !== 'pw') return json({ result: 13, message: '帳號或密碼錯誤' });
      assert.equal(init.headers.platform, 'android'); assert.equal(inner.account, '0912345678');
      return json({ result: 0, payload: (await p.encryptLData({ sid: 'S', token: 'T', appid: 'A', liat: 5, ssme: 'K', ltoken: 'L', carrier_code: inner.carrier_code, now: Math.floor(Date.now() / 1000) })).value });
    }
    const jwt = new URLSearchParams(init.body).get('einvoiceJwt'), [h, c, sig] = jwt.split('.');
    assert.equal(sig, nodeCrypto.createHmac('sha256', 'K').update(`${h}.${c}`).digest('base64url'));
    const req = JSON.parse(Buffer.from(c, 'base64url').toString()).reqdata;
    if (u.pathname.endsWith('query-invoices-header')) return json({ result: req.page === 1 ? [{ invNum: 'AB12345678', invDate: '2026/11/07', amount: 90, sellerName: '停車場' }, { invNum: 'CD12345678', invDate: '2026/11/08', amount: 54 }] : [] });
    if (opts.failDetail === req.invNum) return { ok: false, status: 500, text: async () => '' };
    return json({ result: { details: [{ description: '品項', quantity: '1', unitPrice: '90', amount: '90' }] } });
  };
  return { fetchFn, calls };
}
test('Edge Function 流程：登入 → 清單 → 明細；密碼錯誤會回傳訊息', async () => {
  const p = await P(), m = await fakeMof(p);
  const { session } = await p.handle({ action: 'login', mobile: '0912345678', password: 'pw', carrier: '/abc1234' }, m.fetchFn);
  assert.equal(session.loginSsMe, 'K'); assert.equal(session.carrierCode, '/ABC1234'); assert.equal(session.ltoken, 'L');
  assert.deepEqual((await p.handle({ action: 'headers', session, startDate: '2026/11/01', endDate: '2026/11/26', page: 1 }, m.fetchFn)).invoices.map(x => x.no), ['AB12345678', 'CD12345678']);
  assert.deepEqual((await p.handle({ action: 'headers', session, page: 2 }, m.fetchFn)).invoices, []);
  assert.deepEqual((await p.handle({ action: 'detail', session, invNum: 'AB12345678', invDate: '2026/11/07' }, m.fetchFn)).items, [['品項', 1, 90]]);
  await assert.rejects(p.handle({ action: 'login', mobile: '0912345678', password: 'x' }, m.fetchFn), /帳號或密碼錯誤/);
  await assert.rejects(p.handle({ action: 'headers' }, m.fetchFn), /缺少 session/);
});
test('App 端下載：新增、補明細、已歸帳與刪除過的略過、明細失敗仍先加入', async () => {
  const st = { accounts: [{ id: 'a', name: '現金', balance: 0 }], projects: [], budgets: [], loans: [], recurring: [], categories: [], transactions: [{ id: 't', kind: 'expense', amount: 10, date: '2026-11-01', name: 'x', account: 'a', invoiceNo: 'EF12345678' }] };
  const b = bundle(st);
  b.run(`window.__inv={list:[{no:'GH12345678',date:'2026-11-02',total:30,items:[],at:1}],win:{}};var __P={inboxGone:['iJK12345678']};prefs=()=>__P;inboxTouch=()=>{};invStore=()=>{};renderInvoices=()=>{};einvLs=()=>null;
    einvSession=async()=>({loginSsMe:'K',carrierCode:'/ABC1234'});var __calls=[];
    window.MozeSync={invoke:async(n,body)=>{__calls.push(body.action+(body.page||'')+(body.invNum||''));if(body.action==='headers')return{data:{invoices:body.page===1&&body.startDate.endsWith('/01')&&__calls.filter(x=>x.startsWith('headers')).length===1?[
      {no:'AB12345678',date:'2026-11-07',time:'14:05',api:'2026/11/07',total:90,sellerName:'停車場股份有限公司',code:'1234'},{no:'CD12345678',date:'2026-11-08',api:'2026/11/08',total:54},
      {no:'EF12345678',date:'2026-11-01',api:'2026/11/01',total:10},{no:'GH12345678',date:'2026-11-02',api:'2026/11/02',total:30,sellerName:'某店'},{no:'JK12345678',date:'2026-11-03',api:'2026/11/03',total:5}]:[]}};
      if(body.action==='detail')return body.invNum==='CD12345678'?{error:'逾時'}:{data:{items:[['品項',1,90]]}};return{error:'?'}}}`);
  const r = await b.run('einvDownload()');
  const { added, filled, skipped, failed, total } = r; assert.deepEqual({ added, filled, skipped, failed, total }, { added: 2, filled: 1, skipped: 2, failed: 1, total: 5 });
  const l = b.J('invDb().list'), by = n => l.find(x => x.no === n);
  assert.equal(by('AB12345678').time, '14:05'); assert.equal(by('AB12345678').carrier, '手機條碼'); assert.equal(by('AB12345678').code, '1234'); assert.deepEqual(by('AB12345678').items, [['品項', 1, 90]]);
  assert.deepEqual(by('CD12345678').items, []); assert.deepEqual(by('GH12345678').items, [['品項', 1, 90]]); assert.equal(by('GH12345678').sellerName, '某店');
  assert.equal(by('EF12345678'), undefined); assert.equal(by('JK12345678'), undefined);
  assert.equal(b.run("JSON.stringify(state).includes('password')||JSON.stringify(inboxData?inboxData():{}).includes('password')"), false);
  assert.equal(b.run("prefSyncKeys().some(k=>/einv|cred|pass/i.test(k))"), false);
});
test('密碼加密：存的是密文，用同一把不可匯出的金鑰才解得開', async () => {
  const b = bundle({ accounts: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [], categories: [] });
  Object.assign(b.ctx, { crypto: globalThis.crypto, btoa, atob, TextEncoder, TextDecoder, Uint8Array });
  b.run("var __k=null;einvKey=async()=>__k||(__k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']))");
  const c = await b.run("einvSeal('my-Secret-123')"); assert.ok(!JSON.stringify(c).includes('my-Secret-123')); assert.equal(await b.run(`einvOpen(${JSON.stringify(c)})`), 'my-Secret-123');
  assert.equal(await b.run('einvKey().then(k=>k.extractable)'), false);
  b.run("__k=null"); await assert.rejects(b.run(`einvOpen(${JSON.stringify(c)})`));
});
