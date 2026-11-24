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
