// 交易批次編輯 tests (V26.15). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : k === 'querySelector' ? () => null : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
function importer() {
  const window = {};
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'import.js'), 'utf8'), vm.createContext({ window, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} }, console, TextDecoder, Blob: class {}, URL, setTimeout }));
  return window.MozeImportInternals;
}
const base = () => ({
  accounts: [{ id: 'a', name: '錢包', balance: 1000 - 100 - 50 + 300 - 200 + 500 - 80 }, { id: 'b', name: '銀行', balance: 200 - 500 }],
  categories: [{ id: 'food', name: '飲食', kind: 'expense' }, { id: 'home', name: '居家', kind: 'expense' }, { id: 'pay', name: '薪資', kind: 'income' }],
  projects: [{ id: 'p', name: '旅行' }], budgets: [], recurring: [], loans: [],
  transactions: [
    { id: 1, kind: 'expense', amount: 100, account: 'a', category: 'food', date: '2026-06-01', tags: ['外食'] },
    { id: 2, kind: 'expense', amount: 50, account: 'a', category: 'food', date: '2026-06-02' },
    { id: 3, kind: 'income', amount: 300, account: 'a', category: 'pay', date: '2026-06-03' },
    { id: 4, kind: 'loan', loanAction: 'borrow', amount: 200, account: 'a', loanId: 'L', date: '2026-06-04' },
    { id: 5, kind: 'transfer', amount: 500, account: 'b', toAccount: 'a', date: '2026-06-05' },
    { id: 6, kind: 'expense', amount: 80, account: 'a', date: '2026-06-06', splits: [{ category: 'food', amount: 40 }, { category: 'home', amount: 40 }] },
  ],
});
// fix balances: loan borrow adds 200 to 錢包 (not -200); transfer adds 500 to 錢包, takes 500 from 銀行
function fixed() { const s = base(); s.accounts[0].balance = 1000 - 100 - 50 + 300 + 200 + 500 - 80; s.accounts[1].balance = 200 - 500; return s; }

test('改分類：只改收支相符、非拆帳、非借還款／轉帳的交易', () => {
  const { J } = bundle(fixed());
  assert.deepEqual(J(`bulkSetCategory(['1','2','3','4','5','6'],'home')`), { changed: 2, skipped: 4 });
  assert.deepEqual(J('state.transactions.map(t=>t.category||null)'), ['home', 'home', 'pay', null, null, null]);
});

test('改專案與加標籤：略過借還款，標籤不重複', () => {
  const { J } = bundle(fixed());
  assert.deepEqual(J(`bulkSetProject(['1','4','5'],'p')`), { changed: 2, skipped: 1 });
  assert.deepEqual(J(`bulkAddTags(['1','2','4'],'#外食 公司')`), { changed: 2, skipped: 1 });
  assert.deepEqual(J('state.transactions[0].tags'), ['外食', '公司']);
  assert.deepEqual(J('state.transactions[1].tags'), ['外食', '公司']);
  assert.equal(J('state.transactions[3].tags===undefined'), true);
});

test('刪除：還原餘額（含轉帳兩端）、不刪借還款，對帳仍一致', () => {
  const M = importer(), { J } = bundle(fixed());
  assert.deepEqual(J(`bulkDelete(['1','4','5','6'])`), { changed: 3, skipped: 1 });
  assert.deepEqual(J('state.transactions.map(t=>t.id)'), [2, 3, 4]);
  const rows = M.reconcile(J('state'), null, new Map([['a', 1000], ['b', 200]]));
  assert.equal(rows.filter(r => r.mismatch).length, 0);
});
