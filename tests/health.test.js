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

test('V26.33：轉帳缺轉入帳戶、未來日期、金額為 0 只提示不修改', () => {
  const st = { accounts: [{ id: 'a', name: 'A', balance: 0 }, { id: 'b', name: 'B', balance: 0 }], categories: [], projects: [],
    transactions: [
      { id: 't1', kind: 'transfer', amount: 10, account: 'a', toAccount: '', date: '2026-01-01' },
      { id: 't2', kind: 'transfer', amount: 10, account: 'a', toAccount: 'a', date: '2026-01-01' },
      { id: 't3', kind: 'transfer', amount: 10, account: 'a', toAccount: 'b', date: '2026-01-01' },
      { id: 't4', kind: 'expense', amount: 5, account: 'a', date: '2026-12-31' },
      { id: 't5', kind: 'expense', amount: 0, account: 'a', date: '2026-01-02' }] };
  const { J } = bundle(st);
  const keys = Object.fromEntries(J(`healthCheck(state, '2026-06-01')`).map(i => [i.key, i.count]));
  assert.equal(keys.transfer, 2); assert.equal(keys.future, 1); assert.equal(keys.zero, 1);
  assert.deepEqual(J(`state.transactions.map(t => t.amount)`), [10, 10, 10, 5, 0]);
});

test('V26.33：「不是重複」標記後不再列入疑似重複，且不刪除交易', () => {
  const mk = id => ({ id, kind: 'expense', amount: 50, account: 'a', date: '2026-05-01', time: '12:00', name: '咖哩飯' });
  const { J, run } = bundle({ accounts: [{ id: 'a', name: 'A', balance: 0 }], categories: [], projects: [], transactions: [mk('x1'), mk('x2')] });
  assert.equal(J(`healthCheck(state, '2026-06-01').find(i => i.key === 'duplicate').count`), 1);
  assert.equal(run(`healthIgnoreDup('x2')`), true);
  assert.equal(J(`healthCheck(state, '2026-06-01').some(i => i.key === 'duplicate')`), false);
  assert.equal(J(`state.transactions.length`), 2);
  assert.equal(run(`healthIgnoreDup('nope')`), false);
});

test('V26.33：renderHealth 含不是重複按鈕與帳戶對帳區', () => {
  const html = { v: '' };
  const { J, run } = bundle({ accounts: [{ id: 'a', name: 'A', balance: 100 }], categories: [], projects: [], transactions: [] });
  run(`document = { getElementById: id => id === 'healthResult' ? { set innerHTML(v) { globalThis.__html = v; } } : null }`);
  run(`renderHealth([{ key: 'duplicate', level: 'info', count: 1, text: 't', hint: 'h', pairs: [['x1', 'x2']] }])`);
  const out = run('globalThis.__html'); html.v = out;
  assert.match(out, /帳戶對帳/); assert.match(out, /data-acct-adjust="a"/);
});
