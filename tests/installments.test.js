// 分期付款 tests (V26.14). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state, confirms = []) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const elements = { txForm: { elements: {}, reset() {} }, splitRows: { querySelectorAll: () => [] } };
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? id => elements[id] || any() : k === 'querySelectorAll' ? () => [] : k === 'querySelector' ? () => null : any()) });
  let formValues = {}; const alerts = [];
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert: m => alerts.push(m), confirm: () => (confirms.length ? confirms.shift() : true),
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    FormData: class { get(k) { return formValues[k] ?? null; } },
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' + Math.random() } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)), alerts, submit: v => { formValues = v; run(`editId=null;submitTx({preventDefault(){}})`); } };
}
function importer() {
  const window = {};
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'import.js'), 'utf8'), vm.createContext({ window, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} }, console, TextDecoder, Blob: class {}, URL, setTimeout }));
  return window.MozeImportInternals;
}
const base = () => ({ accounts: [{ id: 'card', name: '信用卡', type: 'card', balance: 0, statement: 15, due: 5 }], categories: [{ id: 'c', name: '3C', kind: 'expense' }], projects: [], transactions: [], budgets: [], recurring: [], loans: [] });
const buy = o => ({ kind: 'expense', amount: '10000', date: '2026-01-31', name: '筆電', category: 'c', account: 'card', instOn: 'on', instCount: '3', ...o });

test('installmentPlan()：金額平均、尾數在第 1 期，每月同一天（月底取該月最後一天）', () => {
  const { J } = bundle(base());
  const p = J(`installmentPlan({id:'t',kind:'expense',amount:10000,date:'2026-01-31',name:'筆電'},3).list.map(x=>[x.date,x.amount,x.name,x.installment.n,x.installment.total])`);
  assert.deepEqual(p, [['2026-01-31', 3333.34, '筆電（1/3）', 1, 3], ['2026-02-28', 3333.33, '筆電（2/3）', 2, 3], ['2026-03-31', 3333.33, '筆電（3/3）', 3, 3]]);
  assert.equal(J(`installmentPlan({kind:'expense',amount:100,date:'2026-01-01'},1)`), null);
  assert.match(J(`installmentPlan({kind:'expense',amount:100,date:'2026-01-01'},61).error`), /60/);
  assert.match(J(`installmentPlan({kind:'expense',amount:100,date:'2026-01-01',splits:[{category:'c',amount:100}]},3).error`), /拆帳/);
});

test('記帳送出分期：建立 N 筆、信用卡餘額扣總額，對帳一致', () => {
  const M = importer(), b = bundle(base());
  b.submit(buy());
  const txs = b.J('state.transactions');
  assert.equal(txs.length, 3);
  assert.ok(txs.every(t => t.installment && t.installment.group === txs[0].installment.group));
  assert.equal(b.J('state.accounts[0].balance'), -10000);
  assert.equal(M.reconcile(b.J('state'), null, new Map([['card', 0]]))[0].mismatch, false);
});

test('刪除分期：可刪整組，或只刪這一期', () => {
  const b = bundle(base(), [true]);
  b.submit(buy());
  b.run(`deleteTx(state.transactions[1].id)`);
  assert.equal(b.J('state.transactions.length'), 0);
  assert.equal(b.J('state.accounts[0].balance'), 0);
  const b2 = bundle(base(), [false, true]);
  b2.submit(buy());
  b2.run(`deleteTx(state.transactions[2].id)`);
  assert.deepEqual(b2.J('state.transactions.map(t=>t.installment.n)'), [1, 2]);
  assert.equal(b2.J('state.accounts[0].balance'), -6666.67);
});

test('不勾分期或期數 1 時照常建立一筆', () => {
  const b = bundle(base());
  b.submit(buy({ instOn: null }));
  b.submit(buy({ instCount: '1' }));
  assert.equal(b.J('state.transactions.length'), 2);
  assert.equal(b.J('state.transactions.filter(t=>t.installment).length'), 0);
});
