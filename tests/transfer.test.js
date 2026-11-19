// Manual transfers: cross-currency amount and fee (V26.11). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const elements = { txForm: { elements: {}, reset() {} }, splitRows: { querySelectorAll: () => [] } };
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? id => elements[id] || any() : k === 'querySelectorAll' ? () => [] : k === 'querySelector' ? () => null : any()) });
  let formValues = {}; const alerts = [];
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert: m => alerts.push(m), confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    FormData: class { get(k) { return formValues[k] ?? null; } },
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)), alerts, submit: (v, edit = null) => { formValues = v; run(`editId=${JSON.stringify(edit)};submitTx({preventDefault(){}})`); } };
}
function importer() {
  const window = {};
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'import.js'), 'utf8'), vm.createContext({ window, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} }, console, TextDecoder, Blob: class {}, URL, setTimeout }));
  return window.MozeImportInternals;
}
const base = () => ({
  accounts: [{ id: 'twd', name: '銀行', type: 'bank', balance: 10000 }, { id: 'usd', name: '美元', type: 'bank', currency: 'USD', balance: 0 }, { id: 'cash', name: '錢包', type: 'cash', balance: 0 }],
  categories: [{ id: 'c', name: '其他', kind: 'expense' }], projects: [], transactions: [], budgets: [], recurring: [], loans: [],
});
const bal = b => b.J('Object.fromEntries(state.accounts.map(a=>[a.id,a.balance]))');
const tx = (o = {}) => ({ kind: 'transfer', amount: '3200', date: '2026-06-02', name: '換匯', account: 'twd', toAccount: 'usd', category: 'c', ...o });

test('跨幣別轉帳：需要轉入金額，兩邊各用自己的幣別；手續費從轉出帳戶扣', () => {
  const b = bundle(base());
  b.submit(tx());
  assert.match(b.alerts[0], /轉入金額（USD）/);
  assert.equal(b.J('state.transactions.length'), 0);
  b.submit(tx({ toAmount: '100', fee: '15' }));
  assert.deepEqual(bal(b), { twd: 10000 - 3200 - 15, usd: 100, cash: 0 });
  const t = b.J('state.transactions[0]');
  assert.deepEqual([t.toAmount, t.toBalanceEffect, t.toCurrency, t.fee, t.balanceEffect], [100, 100, 'USD', 15, -3215]);
});

test('同幣別轉帳：轉入金額忽略、可有手續費；不能轉給自己', () => {
  const b = bundle(base());
  b.submit(tx({ toAccount: 'cash', amount: '500', toAmount: '999', fee: '0' }));
  assert.deepEqual(bal(b), { twd: 9500, usd: 0, cash: 500 });
  const t = b.J('state.transactions[0]');
  assert.equal(t.toAmount, undefined); assert.equal(t.fee, undefined); assert.equal(t.balanceEffect, undefined);
  b.submit(tx({ toAccount: 'twd' }));
  assert.match(b.alerts.at(-1), /不能相同/);
});

test('編輯：改金額重算兩邊；改成支出時清掉轉帳欄位且餘額正確', () => {
  const b = bundle(base());
  b.submit(tx({ toAmount: '100', fee: '15' }));
  const tid = b.J('state.transactions[0].id');
  b.submit(tx({ amount: '6400', toAmount: '200', fee: '30' }), tid);
  assert.deepEqual(bal(b), { twd: 10000 - 6430, usd: 200, cash: 0 });
  b.submit({ kind: 'expense', amount: '50', date: '2026-06-02', name: '換匯', account: 'twd', category: 'c' }, tid);
  assert.deepEqual(bal(b), { twd: 9950, usd: 0, cash: 0 });
  const t = b.J('state.transactions[0]');
  for (const k of ['toAccount', 'toAmount', 'toBalanceEffect', 'fee', 'balanceEffect']) assert.equal(t[k], undefined, k);
});

test('對帳：手動跨幣別轉帳與手續費都與帳戶餘額一致', () => {
  const M = importer();
  const b = bundle(base());
  b.submit(tx({ toAmount: '100', fee: '15' }));
  b.submit(tx({ toAccount: 'cash', amount: '700', fee: '10' }));
  const rows = M.reconcile(b.J('state'), null, new Map([['twd', 10000], ['usd', 0], ['cash', 0]]));
  assert.deepEqual(rows.filter(r => r.mismatch), []);
});
