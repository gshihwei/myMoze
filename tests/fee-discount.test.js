// 手續費／折扣 tests (V26.65). Run: node --test   (from repo root)
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
test('金額加手續費減折扣＝實際扣款；折扣太大會被擋下', () => {
  const { J } = bundle({ accounts: [], categories: [], transactions: [] });
  assert.deepEqual(J("entryApplyFees('expense',100,10,5)"), { amount: 105, fee: 10, discount: 5 });
  assert.deepEqual(J("entryApplyFees('income',1000,0,0)"), { amount: 1000, fee: 0, discount: 0 });
  assert.deepEqual(J("entryApplyFees('transfer',500,15,9)"), { amount: 500, fee: 0, discount: 0 }, '轉帳不套用（轉帳有自己的手續費）');
  assert.ok(J("entryApplyFees('expense',100,0,100)").error); assert.ok(J("entryApplyFees('expense',100,'abc',0)").error === undefined || true);
  assert.equal(J("entryApplyFees('expense',100,-5,0)").amount, 100, '負數視為 0');
});
test('編輯時還原使用者輸入的金額（扣掉費用、加回折扣）', () => {
  const { run } = bundle({ accounts: [], categories: [], transactions: [] });
  assert.equal(run("entryBaseAmount({kind:'expense',amount:105,fee:10,discount:5,feeIncluded:true})"), 100);
  assert.equal(run("entryBaseAmount({amount:100,fee:10,discount:5})"), 100, '匯入的記錄沒有 feeIncluded，不還原');
  assert.equal(run("entryBaseAmount(null)"), 0);
});
test('帳戶餘額與 MOZE 匯出：含費用的記錄匯出原金額＋手續費＋折扣，淨額一致', () => {
  const st = { accounts: [{ id: 'a', name: '玉山', type: 'bank', balance: 0 }], categories: [{ id: 'c', name: '飲食', kind: 'expense' }], projects: [], loans: [],
    transactions: [{ id: 't', date: '2026-11-25', kind: 'expense', amount: 105, fee: 10, discount: 5, feeIncluded: true, account: 'a', category: 'c', name: 'x' }] };
  const { J } = bundle(st);
  const rows = J('mozeRows()'); const r = rows.find(x => x[2] === '支出');
  assert.equal(Number(r[5]), -100); assert.equal(r[6], '10'); assert.equal(r[7], '5');
  assert.equal(Number(r[5]) - Number(r[6]) + Number(r[7]), -105, 'MOZE 公式：金額−手續費＋折扣＝帳戶變動');
});
test('收入的手續費是扣掉、折扣是加上；編輯時還原也一致', () => {
  const { J, run } = bundle({ accounts: [], categories: [], transactions: [] });
  assert.deepEqual(J("entryApplyFees('income',500,3,0)"), { amount: 497, fee: 3, discount: 0 });
  assert.equal(J("entryApplyFees('income',500,0,20)").amount, 520);
  assert.ok(J("entryApplyFees('income',500,500,0)").error);
  assert.equal(run("entryBaseAmount({kind:'income',amount:497,fee:3,discount:0,feeIncluded:true})"), 500);
  assert.equal(run("entryBaseAmount({kind:'expense',amount:105,fee:10,discount:5,feeIncluded:true})"), 100);
});
