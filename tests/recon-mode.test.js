// 信用卡對帳模式 tests (V26.63). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  return { ctx, run: c => vm.runInContext(c, ctx), J: c => JSON.parse(vm.runInContext(`JSON.stringify(${c})`, ctx)) };
}
const CARD = { id: 'c1', name: '卡', type: 'card', balance: 0, limit: 50000, statement: 15, due: 5 };
const tx = (id, date, amount, extra) => ({ id, date, kind: 'expense', amount, account: 'c1', name: id, category: '', time: '12:00', tags: [], ...extra });
const P = { start: '2026-10-16', end: '2026-11-15' };
test('帳單明細：只含這張卡、這一期、非繳款的支出，預設由遠到近', () => {
  const { J } = bundle({ accounts: [CARD, { id: 'x', name: 'x', type: 'bank', balance: 0 }], categories: [], transactions: [tx('b', '2026-11-02', 20), tx('a', '2026-10-20', 10), tx('out', '2026-11-16', 5), tx('pay', '2026-11-05', 99, { cardPayment: true }), { ...tx('o', '2026-11-03', 7), account: 'x' }, { ...tx('inc', '2026-11-04', 3), kind: 'income' }] });
  assert.deepEqual(J(`reconItems(state.accounts[0], ${JSON.stringify(P)}, 'asc').map(t=>t.id)`), ['a', 'b']);
  assert.deepEqual(J(`reconItems(state.accounts[0], ${JSON.stringify(P)}, 'desc').map(t=>t.id)`), ['b', 'a']);
});
test('對帳統計：筆數與已確認金額', () => {
  const { J, run } = bundle({ accounts: [CARD], categories: [], transactions: [tx('a', '2026-10-20', 100), tx('b', '2026-11-02', 250.5), tx('c', '2026-11-03', 50)] });
  run('reconMark(state.transactions[0], true); reconMark(state.transactions[1], true)');
  assert.deepEqual(J('reconStats(state.transactions)'), { count: 3, doneCount: 2, total: 400.5, doneAmount: 350.5, remaining: 50 });
  run('reconMark(state.transactions[0], false)'); assert.equal(run('state.transactions[0].recon'), undefined);
  assert.equal(run('reconClear(state.transactions)'), 1);
});
test('延後入帳：只改入帳日到下一期第一天，消費日不變，可改回', () => {
  const { run, J } = bundle({ accounts: [CARD], categories: [], transactions: [tx('a', '2026-11-10', 100, { recon: true })] });
  run(`reconPostpone(state.transactions[0], ${JSON.stringify(P)})`);
  assert.equal(run('state.transactions[0].date'), '2026-11-10'); assert.equal(run('state.transactions[0].postDate'), '2026-11-16'); assert.equal(run('state.transactions[0].recon'), undefined);
  assert.equal(J(`reconItems(state.accounts[0], ${JSON.stringify(P)}).length`), 0);
  assert.equal(J("reconItems(state.accounts[0], {start:'2026-11-16',end:'2026-12-15'}).length"), 1);
  run('reconRestore(state.transactions[0])'); assert.equal(run('state.transactions[0].postDate'), undefined);
});
test('舊版 origDate 會轉成 date + postDate', () => {
  const { run } = bundle({ accounts: [CARD], categories: [], transactions: [tx('a', '2026-11-16', 100, { origDate: '2026-11-10' })] });
  assert.equal(run('reconMigrate(state)'), 1); assert.equal(run('state.transactions[0].date'), '2026-11-10'); assert.equal(run('state.transactions[0].postDate'), '2026-11-16'); assert.equal(run('reconMigrate(state)'), 0);
});
test('延後跨年與月底：下一期第一天', () => {
  const { run } = bundle({ accounts: [], categories: [], transactions: [] });
  assert.equal(run("reconNextStart({start:'2026-12-01',end:'2026-12-31'})"), '2027-01-01');
  assert.equal(run("reconNextStart({start:'2026-02-01',end:'2026-02-28'})"), '2026-03-01');
});
test('搜尋：名稱、商家、金額', () => {
  const { run } = bundle({ accounts: [], categories: [], transactions: [] });
  const m = (t, q) => run(`reconMatch(${JSON.stringify(t)}, ${JSON.stringify(q)})`);
  const t = { name: '午餐', merchant: '麥當勞', amount: 1134, date: '2026-11-02' };
  assert.ok(m(t, '')); assert.ok(m(t, '麥當')); assert.ok(m(t, '1134')); assert.ok(!m(t, '咖啡'));
});
