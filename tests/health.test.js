// 資料健檢 tests (V26.17). Run: node --test   (from repo root)
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
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const messy = () => ({
  accounts: [{ id: 'a', name: '錢包', balance: 500 }],
  categories: [{ id: 'food', name: '飲食' }], projects: [{ id: 'p', name: '旅行' }],
  transactions: [
    { id: 1, kind: 'expense', amount: 100, account: 'a', category: 'gone', date: '2026-06-01', name: '午餐' },
    { id: 2, kind: 'expense', amount: 100, account: 'a', category: 'food', project: 'gone', date: '2026-06-01', name: '午餐' },
    { id: 3, kind: 'expense', amount: 50, account: 'deleted', category: 'food', date: '2026-06-02', name: '孤兒' },
    { id: 4, kind: 'expense', amount: 80, account: 'a', date: '2026-06-03', splits: [{ category: 'food', amount: 40 }, { category: 'x', amount: 40 }] },
  ],
  budgets: [{ id: 'b1', scope: 'category', category: 'gone', limit: 1 }, { id: 'b2', scope: 'project', project: 'gone', limit: 1 }, { id: 'b3', scope: 'total', limit: 1 }, { id: 'b4', scope: 'category', category: 'food', limit: 1 }],
  recurring: [{ id: 'r', name: 'x', amount: 1, category: 'gone', account: 'gone', next: '2026-07-01' }],
  loans: [{ id: 'L', person: '小明', direction: 'receivable', amount: 300, paid: 50, payments: [{ amount: 100 }, { amount: 200 }], status: 'active' }],
});

test('healthCheck()：找出失效帳戶／分類／專案／預算／週期、借還款金額不符、疑似重複', () => {
  const { J } = bundle(messy());
  const byKey = Object.fromEntries(J('healthCheck()').map(i => [i.key, i.count]));
  assert.deepEqual(byKey, { txAccount: 1, txCategory: 2, txProject: 1, budget: 2, recurring: 1, loanPaid: 1, duplicate: 1 });
});

test('healthFix()：修正只改參照，帳戶餘額不變；修正後只剩不能自動處理的項目', () => {
  const { J, run } = bundle(messy());
  for (const k of ['txCategory', 'txProject', 'budget', 'recurring', 'loanPaid']) assert.ok(J(`healthFix('${k}')`) > 0, k);
  assert.deepEqual(J('healthCheck().map(i=>i.key)'), ['txAccount', 'duplicate']);
  assert.equal(J('state.accounts[0].balance'), 500);
  assert.deepEqual(J('state.budgets.map(b=>b.id)'), ['b3', 'b4']);
  assert.deepEqual([J('state.loans[0].paid'), J('state.loans[0].status')], [300, 'completed']);
  assert.equal(J('state.transactions[3].splits[1].category'), '');
  run('0');
});

test('乾淨的資料沒有任何問題', () => {
  const { J } = bundle({ accounts: [{ id: 'a' }], categories: [{ id: 'c' }], projects: [], transactions: [{ id: 1, kind: 'expense', amount: 1, account: 'a', category: 'c', date: '2026-01-01' }], budgets: [], recurring: [], loans: [] });
  assert.equal(J('healthCheck().length'), 0);
});
