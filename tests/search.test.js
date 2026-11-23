// 交易進階搜尋 tests (V26.8). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state, elements = {}) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? id => elements[id] || null : k === 'querySelectorAll' ? () => [] : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)};fxCache={rates:{USD:0.032},fetchedAt:Date.now()}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const base = () => ({
  accounts: [{ id: 'a', name: '錢包', balance: 0 }, { id: 'b', name: '銀行', balance: 0 }, { id: 'u', name: '美元', currency: 'USD', balance: 0 }],
  categories: [{ id: 'food', name: '飲食', kind: 'expense' }, { id: 'lunch', name: '午餐', kind: 'expense', parentId: 'food' }, { id: 'home', name: '居家', kind: 'expense' }],
  projects: [{ id: 'p', name: '旅行' }], budgets: [], recurring: [], loans: [],
  transactions: [
    { id: 1, kind: 'expense', amount: 120, account: 'a', category: 'lunch', date: '2026-06-02', time: '12:00', name: '午餐', merchant: '麥當勞', tags: ['公司'] },
    { id: 2, kind: 'expense', amount: 3000, account: 'b', category: 'home', date: '2026-05-20', name: '房租', project: 'p' },
    { id: 3, kind: 'income', amount: 50000, account: 'b', date: '2026-06-05', name: '薪水' },
    { id: 4, kind: 'transfer', amount: 500, account: 'b', toAccount: 'a', date: '2026-06-06', name: '提款' },
    { id: 5, kind: 'loanPayment', amount: 200, account: 'a', loanId: 'L', date: '2026-06-07', name: '收款', person: '小明' },
    { id: 6, kind: 'expense', amount: 80, account: 'a', date: '2026-06-08', name: '混合', splits: [{ category: 'home', amount: 30 }, { category: 'lunch', amount: 50 }] },
    { id: 7, kind: 'expense', amount: 999, account: 'a', category: 'home', date: '2026-06-09', name: '保險', pending: true, pendingApplied: false },
    { id: 8, kind: 'expense', amount: 3.2, account: 'u', category: 'lunch', date: '2026-06-10', name: 'Coffee', imported: true },
  ],
});
const F = o => JSON.stringify({ q: '', type: 'all', category: 'all', account: 'all', range: 'all', from: '', to: '', min: '', max: '', tag: 'all', project: 'all', status: 'all', sort: 'dateDesc', ...o });
const ids = (J, f) => J(`txSearchRun(${F(f)}).map(t=>t.id)`);

test('文字搜尋：名稱、商家、對象、#標籤', () => {
  const { J } = bundle(base());
  assert.deepEqual(ids(J, { q: '麥當' }), [1]);
  assert.deepEqual(ids(J, { q: '小明' }), [5]);
  assert.deepEqual(ids(J, { q: '#公司' }), [1]);
});

test('類型：借還款含 loan 與 loanPayment；分類含子分類與拆帳；帳戶含轉入', () => {
  const { J } = bundle(base());
  assert.deepEqual(ids(J, { type: 'loan' }), [5]);
  assert.deepEqual(ids(J, { category: 'food' }), [8, 6, 1]);
  assert.deepEqual(ids(J, { category: 'home' }), [7, 6, 2]);
  assert.deepEqual(ids(J, { account: 'a' }).sort(), [1, 4, 5, 6, 7]);
});

test('期間、金額範圍、標籤、專案、狀態', () => {
  const { J } = bundle(base());
  assert.deepEqual(ids(J, { range: 'custom', from: '2026-06-05', to: '2026-06-07' }), [5, 4, 3]);
  assert.deepEqual(ids(J, { range: 'custom', from: '2026-06-09', to: '' }), [8, 7]);
  assert.deepEqual(ids(J, { min: '100', max: '1000' }), [7, 5, 4, 1]);
  assert.deepEqual(ids(J, { tag: '公司' }), [1]);
  assert.deepEqual(ids(J, { project: 'p' }), [2]);
  assert.equal(ids(J, { project: 'none' }).length, 7);
  assert.deepEqual(ids(J, { status: 'pending' }), [7]);
  assert.deepEqual(ids(J, { status: 'imported' }), [8]);
  assert.deepEqual(J(`txRangeBounds(${F({ range: 'thisMonth' })},new Date(2026,5,18))`), { start: '2026-06-01', end: '2026-06-30' });
});

test('排序：日期與金額', () => {
  const { J } = bundle(base());
  assert.deepEqual(ids(J, { sort: 'amountDesc' }).slice(0, 3), [3, 2, 7]);
  assert.deepEqual(ids(J, { sort: 'dateAsc' }).slice(0, 2), [2, 1]);
});

test('txSearchSummary()：外幣換算，未入帳待完成另計', () => {
  const { J } = bundle(base());
  const s = J(`txSearchSummary(txSearchRun(${F({})}))`);
  assert.deepEqual(s, { count: 8, out: 120 + 3000 + 80 + 100, inc: 50000, net: 50000 - 3300, pending: 1 });
});

test('進階篩選選單：標籤去重排序、專案含「無專案」，名稱跳脫', () => {
  const txTag = { value: 'all', innerHTML: '' }, txProject = { value: 'all', innerHTML: '' }, txRange = { value: 'custom' }, txCustomRange = { hidden: true };
  const st = base(); st.transactions.push({ id: 9, kind: 'expense', amount: 1, account: 'a', date: '2026-06-11', tags: ['<b>', '公司'] }); st.projects.push({ id: 'q', name: '<i>x' });
  const { run } = bundle(st, { txTag, txProject, txRange, txCustomRange });
  run('txFillAdvanced()');
  assert.equal((txTag.innerHTML.match(/<option/g) || []).length, 3);
  assert.ok(!txTag.innerHTML.includes('<b>') && !txProject.innerHTML.includes('<i>x'));
  assert.match(txProject.innerHTML, /value="none">無專案/);
  assert.equal(txCustomRange.hidden, false);
});

test('搜尋結果匯出 CSV（V26.27）：標題、跳脫、篩選後筆數', () => {
  const { run } = bundle(base());
  const csv = run(`txExportCsv(txSearchRun({q:'',type:'expense',category:'all',account:'all',range:'all',from:'',to:'',min:'100',max:'5000',tag:'all',project:'all',status:'done',sort:'dateAsc'}))`);
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  assert.equal(lines[0].split(',')[0], '日期');
  assert.equal(lines.length, 3, '標題 + 2 筆支出');
  assert.ok(lines[1].includes('房租') && lines[2].includes('麥當勞') && lines[2].includes('公司'));
  assert.equal(run(`txExportCsv([{id:9,kind:'expense',amount:5,account:'a',date:'2026-01-01',name:'a,"b"'}])`).split('\r\n')[1].includes('"a,""b"""'), true);
});
