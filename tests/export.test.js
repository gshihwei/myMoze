// MOZE CSV export + preferences tests (V26.12). Run: node --test   (from repo root)
// Round trip: export with the real bundle, re-import with the real importer, balances must match.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state, store = new Map()) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : k === 'querySelector' ? () => null : any()) });
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage, indexedDB: any(), alert() {}, confirm: () => true,
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
const STATE = {
  accounts: [
    { id: 'bank', name: '銀行', type: 'bank', balance: 10000 - 3215 + 50000 - 120 - 7 - 300 + 100 - 80 },
    { id: 'usd', name: '美元', type: 'bank', currency: 'USD', balance: 100 },
    { id: 'cash', name: '錢包', type: 'cash', balance: 500 - 60 },
  ],
  categories: [
    { id: 'food', name: '飲食', icon: '🍜', kind: 'expense' }, { id: 'lunch', name: '午餐', icon: '🍱', kind: 'expense', parentId: 'food' },
    { id: 'home', name: '居家', icon: '⌂', kind: 'expense' }, { id: 'pay', name: '薪資', icon: '＄', kind: 'income' },
  ],
  projects: [{ id: 'p', name: '旅行' }], budgets: [], recurring: [], loans: [],
  transactions: [
    { id: 1, kind: 'transfer', amount: 3200, account: 'bank', toAccount: 'usd', toAmount: 100, toBalanceEffect: 100, fee: 15, balanceEffect: -3215, date: '2026-06-01', time: '09:00', name: '換匯' },
    { id: 2, kind: 'income', amount: 50000, account: 'bank', category: 'pay', date: '2026-06-05', name: '薪水, "六月"', merchant: '公司' },
    { id: 3, kind: 'expense', amount: 120, account: 'bank', category: 'lunch', date: '2026-06-06', time: '12:30', name: '午餐', tags: ['公司', '外食'], project: 'p' },
    { id: 4, kind: 'balance_adjustment', amount: -7, account: 'bank', date: '2026-06-07', name: '餘額調整' },
    { id: 5, kind: 'loan', loanAction: 'lend', amount: 300, account: 'bank', date: '2026-06-08', name: '借小明', person: '小明' },
    { id: 6, kind: 'loanPayment', loanDirection: 'receivable', amount: 100, account: 'bank', date: '2026-06-09', name: '收款', person: '小明' },
    { id: 7, kind: 'expense', amount: 80, account: 'bank', date: '2026-06-10', name: '混合', splits: [{ category: 'home', amount: 30 }, { category: 'lunch', amount: 50 }] },
    { id: 8, kind: 'transfer', amount: 500, account: 'bank', toAccount: 'cash', date: '2026-06-11', name: '提款' },
    { id: 9, kind: 'expense', amount: 60, account: 'cash', category: 'home', date: '2026-06-12', name: '日用品' },
    { id: 10, kind: 'expense', amount: 999, account: 'cash', category: 'home', date: '2026-06-13', name: '未入帳', pending: true, pendingApplied: false },
  ],
};
// the bank also sent 500 to cash; fix its balance for that transfer
STATE.accounts[0].balance -= 500;

test('匯出的 CSV 欄位與匯入格式相同，文字中的逗號與引號正確跳脫', () => {
  const M = importer(), { run } = bundle(STATE);
  const rows = M.parseCSV(run('mozeCsv()').replace(/^﻿/, ''));
  assert.deepEqual([...rows[0]], ['帳戶', '幣種', '記錄類型＊', '主類別＊', '子類別＊', '金額＊', '手續費', '折扣', '名稱', '商家', '日期＊', '時間', '專案', '描述', '標籤', '對象']);
  assert.ok(rows.some(r => r[8] === '薪水, "六月"'));
  const lunch = rows.find(r => r[8] === '午餐');
  assert.deepEqual([lunch[2], lunch[3], lunch[4], lunch[5], lunch[10], lunch[11], lunch[12], lunch[14]], ['支出', '飲食', '午餐', '-120', '2026/6/6', '12:30', '旅行', '公司;外食']);
  assert.ok(!rows.some(r => r[8] === '未入帳'), 'unapplied pending is not exported');
  assert.equal(rows.filter(r => r[2] === '初始金額').length, 3);
});

test('來回：匯出後再匯入到空白資料，每個帳戶餘額與原本相同，對帳全部一致', () => {
  const M = importer(), { run, J } = bundle(STATE);
  const csv = run('mozeCsv()').replace(/^﻿/, '');
  const rows = M.parseCSV(csv);
  const st = { accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [] };
  const res = M.buildImport(st, rows);
  assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
  const byKey = new Map(st.accounts.map(a => [`${a.name}|${a.currency || 'TWD'}`, a.balance]));
  for (const a of STATE.accounts) assert.equal(Math.round(byKey.get(`${a.name}|${a.currency || 'TWD'}`) * 100) / 100, a.balance, a.name);
  assert.equal(M.reconcile(st, M.csvOpenings(rows)).filter(r => r.mismatch).length, 0);
  assert.equal(st.loans.filter(l => !l.historicalOnly).length, 1);
  assert.equal(st.loans[0].paid, 100);
  assert.ok(J('true'));
});

test('偏好：每週第一天影響日曆開頭空格，設定存在本機', () => {
  const store = new Map();
  const { run, J } = bundle({ accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [] }, store);
  assert.equal(J('calendarLead(2026,5)'), 1);            // 2026-06-01 is a Monday; week starts Sunday → 1 blank
  run('setPref("weekStart",1)');
  assert.equal(J('calendarLead(2026,5)'), 0);
  assert.equal(J('calendarLead(2026,10)'), 6);           // 2026-11-01 is a Sunday → 6 blanks when weeks start Monday
  assert.equal(JSON.parse(store.get('moze-prefs-v1')).weekStart, 1);
  assert.equal(J('prefs().jumpToTxDate'), false);
});

test('偏好：概覽區塊可隱藏；舊的「不顯示快速記帳」設定沿用', () => {
  const store = new Map([['moze-prefs-v1', JSON.stringify({ showQuick: false })]]);
  const { run, J } = bundle({ accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [] }, store);
  assert.deepEqual(J('overviewHidden()'), ['quick']);
  run('setPref("hiddenPanels",["loans","recent"])');
  assert.deepEqual(J('overviewHidden().sort()'), ['loans', 'quick', 'recent']);
  assert.deepEqual(JSON.parse(store.get('moze-prefs-v1')).hiddenPanels, ['loans', 'recent']);
  assert.equal(J('overviewPanels().length'), 7);
});
