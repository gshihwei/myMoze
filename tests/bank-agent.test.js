// 帳小簿銀行同步 (bank-agent/) tests: crypto, CTBC and E.SUN parsing, CTBC login flow against a fake bank, feed merge, cloud writes.
'use strict';
const { test, assert, fs, path, root } = require('./_bundle.js');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zxb-bank-'));
process.env.ZXB_BANK_DIR = tmp;
const lib = f => import('file://' + path.join(root, 'bank-agent', 'lib', f).replace(/\\/g, '/'));
const day = n => new Date(Date.now() + 8 * 3600e3 - n * 864e5).toISOString().slice(0, 10); // Taipei date n days ago
const ymd = (d, sep = '/') => d.replace(/-/g, sep);

test('中信 PIN 加密：XOR 數字、AES-256-CBC（零 IV）、RSA 包金鑰，可以還原', async () => {
  const { encryptPin } = await lib('ctbc.mjs'); let seq = 7, key;
  const rand = n => Buffer.from(Array.from({ length: n }, () => (seq = (seq * 31 + 11) % 251)));
  const out = encryptPin('pw-123', rand, k => { key = k; return Buffer.alloc(256, 1); });
  const [hex, wrapped] = out.split('|'); assert.equal(wrapped.length, 512);
  const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.alloc(16)), clear = Buffer.concat([d.update(Buffer.from(hex, 'hex')), d.final()]).toString('utf8');
  assert.equal(clear.slice(0, 2), '06'); const xk = clear.slice(2, 8), xt = clear.slice(8);
  assert.match(xk, /^\d{6}$/); assert.equal([...xt].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ xk.charCodeAt(i))).join(''), 'pw-123');
});
test('RSA PKCS#1 v1.5（BigInt）可以用私鑰解開；PEM 兩種格式都讀得到', async () => {
  const { rsaPkcs1Encrypt, rsaFromPem } = await lib('util.mjs');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  for (const pem of [publicKey.export({ type: 'pkcs1', format: 'pem' }), publicKey.export({ type: 'spki', format: 'pem' })]) {
    const { modulus, exponent } = rsaFromPem(pem), msg = Buffer.from('secret+1700000000');
    const enc = rsaPkcs1Encrypt(modulus, exponent, msg); assert.equal(enc.length, 256);
    assert.equal(crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, enc).toString(), msg.toString());
  }
});
test('中信資料解析：存款、帳單、未出帳、即時授權合併，卡片負債與已繳', async () => {
  const { parseCtbc } = await lib('ctbc.mjs'), mmddyy = d => d.slice(5, 7) + d.slice(8, 10) + d.slice(2, 4);
  const r = parseCtbc({
    depositOverview: { rsData: { twdAcctSummaryResponse: { demDepBalSummaryResponse: { infoList: [{ accountId: '0123456789012', balance: '1,000', accountNickName: '薪轉' }] } } } },
    depositTransactions: { rsData: { detailList: [{ sourceAccountId: '0123456789012', trnDtFull: `${ymd(day(3))} 10:05:00`, dbAmt: '100', memo1: 'ATM 提款' }, { sourceAccountId: '0123456789012', trnDtFull: ymd(day(2)), crAmt: '30000', memo1: '薪資', memo2: '某公司' }] } },
    creditCards: { rsData: { billData: { TWD: { [day(40).slice(0, 7).replace('-', '/')]: { summary: { billAmt: '1200', currPmtAmt: '1200', minPmtAmt: '100', pmtExpDt: mmddyy(day(-5)) }, bills: [{ purchaseDt: mmddyy(day(45)), postingDt: mmddyy(day(43)), ntAmt: '500', description: '超商', cardNoSuffixFour: '5678', authCode: 'A1' }] } } } } },
    unbilled: { rsData: { allItems: [{ purchaseDt: ymd(day(6)), purchaseAmt: '300', description: '餐廳', authCode: 'B2', cardNoSuffixFour: '5678' }, { purchaseDt: ymd(day(8)), purchaseAmt: '1200', description: '繳款－謝謝', cardNoSuffixFour: '5678' }] } },
    realtime: { rsData: { allItems: [{ txnDate: ymd(day(6)), txnDateTime: `${ymd(day(6))} 12:30:00`, txnAmt: '300', merchName: '餐廳', authCode: 'B2', cardNoSuffixFour: '5678' }, { txnDate: ymd(day(1)), txnAmt: '99', merchName: '咖啡', authCode: 'C3', cardNoSuffixFour: '5678' }] } },
  });
  assert.deepEqual(r.accounts.map(a => [a.id, a.type, a.balance]), [['ctbc:dep:9012', 'bank', 1000], ['ctbc:card', 'card', -300]]);
  assert.equal(r.accounts[1].bill.paid, true); assert.equal(r.accounts[1].bill.due, day(-5));
  const t = r.tx.map(x => [x.acct, x.date, x.amount, x.desc, x.status || '', x.time || '']);
  assert.deepEqual(t, [['ctbc:dep:9012', day(3), -100, 'ATM 提款', '', '10:05'], ['ctbc:dep:9012', day(2), 30000, '薪資', '', ''], ['ctbc:card', day(45), -500, '超商', '', ''], ['ctbc:card', day(6), -300, '餐廳', '', '12:30'], ['ctbc:card', day(8), 1200, '繳款－謝謝', '', ''], ['ctbc:card', day(1), -99, '咖啡', 'pending', '']]);
  assert.ok(!JSON.stringify(r.accounts).includes('0123456789012'), '帳戶 id 不含完整帳號');
});
test('中信登入流程（假的銀行）：密碼不以明文送出、需要 App 核准時在排程模式停下、成功後登出', async () => {
  const { createCtbc } = await lib('ctbc.mjs');
  const fake = (loginData, calls) => async (url, init) => {
    const u = String(url), body = init.body ? (() => { try { return JSON.parse(init.body); } catch { return {}; } })() : {}; calls.push({ u, raw: String(init.body || ''), resource: body.resource });
    const j = o => ({ ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify(o) }); j.headers = { get: () => null };
    const res = o => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(o) });
    if (u.includes('/oauth/token')) return res({ access_token: 'AT' }); if (u.includes('/main/init')) return res({ statusCode: '0000' });
    if (init.headers['X-Request-Type'] === 'handshakewb') return res({ success: true, token: 'T1', rsData: { seed: 'SEED' } });
    const ok = rsData => res({ code: '0000', token: 'T2', rsData });
    switch (body.resource) {
      case '/twrbm-general/ot001/010': return ok(loginData);
      case '/twrbm-deposit/qu001/010': return ok({ twdAcctSummaryResponse: { demDepBalSummaryResponse: { infoList: [{ accountId: '0001112223334', balance: '1000' }] } } });
      case '/twrbm-deposit/qu002/010': return ok({ accountId: '0001112223334' });
      case '/twrbm-deposit/qu002/011': return ok({ detailList: calls.filter(c => c.resource === '/twrbm-deposit/qu002/011').length === 1 ? [{ trnDtFull: ymd(day(1)), dbAmt: '100', memo1: 'ATM' }] : [] });
      default: return ok({});
    }
  };
  let calls = [], dev = {};
  await assert.rejects(createCtbc({ fetcher: fake({ isTwoStageLogin: true }, calls), onDevice: d => { dev = { ...dev, ...d }; } }).sync({ userId: 'A123456789', account: 'myuser', password: 'pw123' }), e => e.needUser && e.code === 'CTBC_TWO_STAGE');
  assert.equal(dev.deviceSeed, 'SEED'); assert.match(dev.deviceCode, /^[0-9a-f-]{36}$/);
  assert.ok(!calls.some(c => c.raw.includes('pw123') || c.raw.includes('myuser')), '密碼與代號都加密');
  assert.ok(!calls.some(c => c.resource === '/twrbm-general/ot002/010'), '沒有登入成功就不用登出');
  calls = [];
  const r = await createCtbc({ fetcher: fake({ haveCC: '0' }, calls) }).sync({ userId: 'A123456789', account: 'myuser', password: 'pw123', deviceCode: dev.deviceCode, deviceSeed: 'SEED' });
  assert.deepEqual([r.accounts.length, r.tx.length, r.tx[0].amount], [1, 1, -100]);
  assert.equal(calls.at(-1).resource, '/twrbm-general/ot002/010', '最後登出');
  assert.ok(!calls.some(c => c.resource?.startsWith('/twrbm-card/')), '沒有信用卡就不查卡片');
});
test('玉山資料解析：歷史已入帳取代即時授權（同一個 id）、退款為正數、存款與卡片餘額', async () => {
  const { parseEsun } = await lib('esun.mjs'), { buildFeed } = await lib('feed.mjs');
  const d5 = day(5), md = d5.slice(5, 7) + d5.slice(8, 10), d7 = day(7), md7 = d7.slice(5, 7) + d7.slice(8, 10);
  const rt = { body: { rtnCode: 'S', cardInfoList: [{ cardNo: '****1111' }], transList: [{ year: d5.slice(0, 4), month: d5.slice(5, 7), transDetailList: [{ merchantName: '全家', transMonthDay: md, transTime: `${d5.slice(5, 7)}/${d5.slice(8, 10)} 12:30:00`, paymentAmount: 85, cardNo: '****1111' }] }] } };
  const hist = { body: { rtnCode: 'S', transList: [{ year: String(Number(d5.slice(0, 4)) - 1911), month: d5.slice(5, 7), transDetailList: [{ merchantName: '全家', transMonthDay: md, paymentAmount: 85, cardNo: '****1111', statusName: '已入帳' }, { merchantName: '退貨', transMonthDay: md7, paymentAmount: -50, positiveTrans: false, cardNo: '****1111', statusName: '已入帳' }] }] } };
  const tw = [{ accountNo: '12345678901234', alias: '', currency: 'TWD', balance: 5000, details: [{ txDate: ymd(day(2)), txTime: '09:00:00', detailTitle: '跨行轉帳', amount: '1000', debitCredit: 'DR', passbookRemark: '轉給 0081234567890123' }] }];
  const ov = { resultCode: '0000', resultBody: { currentStatement: [{ currency: 'TWD', totalAmountDue: 1000, minimumAmountDue: 100 }], currentStatementPaymentDueDate: ymd(day(-8)), nextStatement: [{ currency: 'TWD', unpostedAmount: 200 }] } };
  const pendingOnly = parseEsun({ hasCard: true, realtime: rt, history: [], overview: ov, billPeriod: '202611', tw, fr: [] });
  const r = parseEsun({ hasCard: true, realtime: rt, history: [hist], overview: ov, billPeriod: '202611', tw, fr: [] });
  const card = r.tx.filter(t => t.acct === 'esun:card').map(t => [t.date, t.amount, t.desc, t.status || '', t.time]);
  assert.deepEqual(card, [[d5, -85, '全家', '', '12:30'], [d7, 50, '退貨', '', '']]);
  assert.deepEqual(pendingOnly.tx.filter(t => t.acct === 'esun:card').map(t => [t.amount, t.status]), [[-85, 'pending']]);
  const idOf = res => buildFeed(null, { source: 'esun', name: '玉山', result: res }).bank.tx.find(t => t.desc === '全家').id;
  assert.equal(idOf(pendingOnly), idOf(r), '授權入帳後還是同一筆');
  assert.deepEqual(r.accounts.map(a => [a.id, a.balance]), [['esun:card', -1200], ['esun:dep:1234', 5000]]); assert.equal(r.accounts[0].bill.period, '2026-11');
  const f = buildFeed(null, { source: 'esun', name: '玉山', result: r }).bank, dep = f.tx.find(t => t.acct === 'esun:dep:1234');
  assert.deepEqual([dep.amount, dep.party], [-1000, '轉給 …0123']); assert.ok(!JSON.stringify(f).includes('12345678901234') && !JSON.stringify(f).includes('0081234567890123'));
});
test('雲端記錄合併：新的取代舊的、未入帳的授權不留、失敗時保留上次資料並記下原因', async () => {
  const { buildFeed, feedId } = await lib('feed.mjs');
  assert.equal(feedId('ctbc'), '__bank_ctbc__');
  const prev = { bank: { okAt: 'x', accounts: [{ id: 'a' }], tx: [{ id: 'old', acct: 'a', date: day(30), amount: -1, desc: '舊' }, { id: 'pend', acct: 'a', date: day(1), amount: -2, desc: '授權', status: 'pending' }, { id: 'gone', acct: 'a', date: day(200), amount: -3, desc: '太舊' }] } };
  const f = buildFeed(prev, { source: 'ctbc', name: '中信', result: { accounts: [{ id: 'a', name: 'x', type: 'bank', currency: 'TWD', balance: 1 }], tx: [{ key: 'k1', acct: 'a', date: day(0), amount: -5, desc: '新' }] } });
  assert.deepEqual(f.bank.tx.map(t => t.desc), ['新', '舊']); assert.equal(f.kind, 'prefs'); assert.equal(f.hidden, true); assert.equal(f.bank.ok, true);
  const e = buildFeed(f, { source: 'ctbc', name: '中信', error: '需要驗證', needUser: true });
  assert.deepEqual([e.bank.ok, e.bank.need, e.bank.error, e.bank.tx.length, e.bank.okAt], [false, true, '需要驗證', 2, f.bank.okAt]);
});
test('雲端寫入：版本衝突時重讀再寫；設定從 js/sync-config.js 讀', async () => {
  const { Supa, readSyncConfig } = await lib('supa.mjs'), cfg = readSyncConfig(root); assert.match(cfg.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  let version = 3, writes = [];
  const fetch = async (url, init) => { const res = o => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
    if (url.includes('/auth/v1/token')) return res({ access_token: 'A', refresh_token: 'R2', user: { id: 'u1', email: 'e' } });
    if (url.includes('/rest/v1/moze_records')) return res([{ record_id: '__bank_esun__', data: { n: version }, version, deleted: false }]);
    const b = JSON.parse(init.body); writes.push(b.p_base_version); if (writes.length === 1) { version = 4; return res({ status: 'conflict', row: null }); } return res({ status: 'applied', row: { version: 5 } }); };
  const s = new Supa({ url: cfg.url, key: cfg.key, fetch }); await s.refresh('R1'); assert.equal(s.refreshToken, 'R2');
  const seen = []; await s.update('categories', '__bank_esun__', prev => { seen.push(prev.n); return { id: '__bank_esun__' }; });
  assert.deepEqual(writes, [3, 4]); assert.deepEqual(seen, [3, 4]);
});
test('Windows 加密存放：檔案裡沒有明文，可以解回來', { skip: process.platform !== 'win32' }, async () => {
  const s = await lib('secure-store.mjs'); await s.saveSecrets({ banks: { esun: { password: 'pässwörd-測試' } } });
  assert.ok(!fs.readFileSync(path.join(tmp, 'secrets.dat'), 'utf8').includes('測試'));
  assert.equal((await s.loadSecrets()).banks.esun.password, 'pässwörd-測試');
});
test('登入被銀行拒絕後暫停：不再自動登入，狀態會提示重新輸入', { skip: process.platform !== 'win32' }, async () => {
  const cli = fs.readFileSync(path.join(root, 'bank-agent', 'cli.mjs'), 'utf8');
  assert.match(cli, /LOGIN_REJECTED = new Set\(\['CTBC_LOGIN_FAILED', 'ESUN_LOGIN', 'ESUN_FORM'\]\)/); assert.match(cli, /if \(cfg\.paused\)/); assert.match(cli, /delete cfg\.paused/);
  const s = await lib('secure-store.mjs'); await s.saveSecrets({ banks: { ctbc: { userId: 'A1', account: 'u', password: 'p', paused: true } } });
  const out = execFileSync(process.execPath, [path.join(root, 'bank-agent', 'cli.mjs'), 'status'], { env: { ...process.env, ZXB_BANK_DIR: tmp }, encoding: 'utf8' });
  assert.match(out, /中國信託：已暫停（上次登入被拒絕，執行 node cli\.mjs add ctbc 重新輸入）/);
});
test('命令列說明是中文，不帶參數不會出錯', () => {
  const out = execFileSync(process.execPath, [path.join(root, 'bank-agent', 'cli.mjs')], { env: { ...process.env, ZXB_BANK_DIR: tmp }, encoding: 'utf8' });
  assert.match(out, /node cli\.mjs setup/); assert.match(out, /銀行密碼只用 Windows 加密/);
});
