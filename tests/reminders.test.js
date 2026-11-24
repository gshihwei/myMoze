// 信用卡額度使用率與繳款倒數 tests (V26.31). Run: node --test   (from repo root)
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
  if (state) vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  return { ctx, J: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}
const card = (o = {}) => ({ id: 'c1', name: '卡', type: 'card', balance: 0, limit: 10000, statement: 15, due: 5, ...o });
const exp = (date, amount, extra = {}) => ({ id: 'e' + date + amount, date, name: 'x', amount, kind: 'expense', category: '', account: 'c1', ...extra });

test('creditUsage：使用率分級與超額', () => {
  const { J } = bundle();
  assert.equal(J(`creditUsage(${JSON.stringify(card({ balance: -1000 }))})`).level, 'ok');
  assert.equal(J(`creditUsage(${JSON.stringify(card({ balance: -8500 }))})`).level, 'high');
  const o = J(`creditUsage(${JSON.stringify(card({ balance: -12000 }))})`);
  assert.equal(o.level, 'over'); assert.equal(o.over, 2000); assert.equal(o.available, 0);
  assert.equal(J(`creditUsage(${JSON.stringify(card({ limit: 0, balance: -50 }))})`).level, 'none');
});

test('creditDueInfo：已結帳未繳 → 倒數天數；繳清後為 null', () => {
  const c = card();
  const { J } = bundle({ accounts: [c], transactions: [exp('2026-10-20', 3000)], categories: [] });
  // 10/15 結帳（期間 9/16–10/15 無消費）；11/15 結帳（期間 10/16–11/15 有 3000），繳款日 12/5
  const i = J(`creditDueInfo(state.accounts[0], '2026-11-20T10:00:00')`);
  assert.equal(i.owed, 3000); assert.equal(i.dueDate, '2026-12-05'); assert.equal(i.days, 15); assert.equal(i.overdue, false);
  const late = J(`creditDueInfo(state.accounts[0], '2026-12-08T10:00:00')`);
  assert.equal(late.overdue, true); assert.equal(late.days, -3);
  const b2 = bundle({ accounts: [c], transactions: [exp('2026-10-20', 3000), exp('2026-12-01', 3000, { kind: 'transfer', toAccount: 'c1', account: 'bank', cardPayment: true, id: 'p' })].map(t => t.cardPayment ? { ...t, account: 'bank', toAccount: 'c1' } : t), categories: [] });
  assert.equal(b2.J(`creditDueInfo(state.accounts[0], '2026-12-03T10:00:00')`), null);
});

test('creditDueText 與列表區塊', () => {
  const { J } = bundle({ accounts: [card({ balance: -9000 })], transactions: [exp('2026-10-20', 9000)], categories: [] });
  assert.match(J(`creditDueText({days:0,owed:100,overdue:false})`), /今天繳款/);
  assert.match(J(`creditDueText({days:-2,owed:100,overdue:true})`), /已逾期 2 天/);
  assert.match(J(`creditRowExtraHTML(state.accounts[0])`), /使用率 90%/);
});

test('reminderList：信用卡繳款與週期交易依到期日排序，範圍外與已結束的不列', () => {
  const rec = (id, name, next, o = {}) => ({ id, name, amount: 100, kind: 'expense', account: 'bank', category: '', next, seq: 0, every: 1, unit: 'month', ...o });
  const { J } = bundle({ accounts: [card()], categories: [], transactions: [exp('2026-10-20', 3000)],
    recurring: [rec('r1', '房租', '2026-11-22'), rec('r2', '訂閱', '2026-11-30'), rec('r3', '舊', '2026-11-21', { ended: true }), rec('r4', '逾期', '2026-11-18')] });
  const l = J(`reminderList('2026-11-20T09:00:00', 3)`);
  assert.deepEqual(l.map(x => x.title), ['逾期', '房租']);
  assert.equal(l[0].days, -2);
  const wide = J(`reminderList('2026-11-20T09:00:00', 15)`);
  assert.deepEqual(wide.map(x => x.title), ['逾期', '房租', '訂閱', '卡 信用卡繳款']);
  assert.equal(wide[3].amount, 3000);
});

test('renderReminders 摘要：文字與逾期標示', () => {
  const { J } = bundle({ accounts: [], categories: [], transactions: [], recurring: [] });
  assert.equal(J(`reminderDayText(-2)`), '逾期 2 天');
  assert.equal(J(`reminderDayText(0)`), '今天');
  assert.match(J(`reminderBarHTML([{title:'房租',date:'2026-11-22',days:2,amount:100}])`), /提醒 1 項/);
});
