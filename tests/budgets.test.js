// 預算 tests (V26.6). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state, elements = {}) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? id => elements[id] || any() : k === 'querySelectorAll' ? () => [] : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)};fxCache={rates:{USD:0.032},fetchedAt:Date.now()}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const base = extra => ({
  accounts: [{ id: 'a', name: '錢包', balance: 0 }, { id: 'u', name: '美元', currency: 'USD', balance: 0 }],
  categories: [{ id: 'food', name: '飲食', icon: '🍜', kind: 'expense' }, { id: 'lunch', name: '午餐', icon: '🍜', kind: 'expense', parentId: 'food' }, { id: 'home', name: '居家', icon: '⌂', kind: 'expense' }],
  projects: [{ id: 'p', name: '旅行' }], transactions: [
    { id: 1, kind: 'expense', amount: 300, account: 'a', category: 'lunch', date: '2026-06-02' },
    { id: 2, kind: 'expense', amount: 200, account: 'a', category: 'food', date: '2026-06-05', project: 'p' },
    { id: 3, kind: 'expense', amount: 3.2, account: 'u', category: 'home', date: '2026-06-06' },
    { id: 4, kind: 'expense', amount: 60, account: 'a', date: '2026-06-07', splits: [{ category: 'lunch', amount: 40 }, { category: 'home', amount: 20 }] },
    { id: 5, kind: 'expense', amount: 999, account: 'a', category: 'food', date: '2026-06-08', pending: true, pendingApplied: false },
    { id: 6, kind: 'income', amount: 5000, account: 'a', date: '2026-06-09' },
    { id: 7, kind: 'expense', amount: 700, account: 'a', category: 'food', date: '2026-05-30' },
  ], budgets: [], recurring: [], loans: [], ...extra,
});

test('舊格式預算 {category, limit} 讀成分類預算', () => {
  const { J } = bundle(base({ budgets: [{ id: 1, category: 'food', limit: 6000 }] }));
  assert.equal(J('budgetNorm(state.budgets[0]).scope'), 'category');
});

test('budgetSpent()：分類含子分類與拆帳、專案、總支出；跳過未入帳待完成；外幣換算', () => {
  const { J } = bundle(base());
  assert.equal(J(`budgetSpent({scope:'category',category:'food'},'2026-06-01','2026-06-30')`), 300 + 200 + 40);
  assert.equal(J(`budgetSpent({scope:'category',category:'home'},'2026-06-01','2026-06-30')`), 100 + 20);
  assert.equal(J(`budgetSpent({scope:'project',project:'p'},'2026-06-01','2026-06-30')`), 200);
  assert.equal(J(`budgetSpent({scope:'total'},'2026-06-01','2026-06-30')`), 300 + 200 + 100 + 60);
});

test('budgetRows()：狀態、剩餘、每日可用與今日進度（總預算排最前）', () => {
  const { J } = bundle(base({ budgets: [
    { id: 'f', scope: 'category', category: 'food', limit: 600 },
    { id: 'h', scope: 'category', category: 'home', limit: 100 },
    { id: 't', scope: 'total', limit: 2000 },
  ] }));
  const rows = J(`budgetRows('2026-06',new Date(2026,5,11)).map(r=>({id:r.budget.id,spent:r.spent,rem:r.remaining,st:r.status.key,perDay:r.perDay,left:r.daysLeft,pace:+r.pace.toFixed(3)}))`);
  assert.deepEqual(rows[0], { id: 't', spent: 660, rem: 1340, st: 'ok', perDay: Math.floor(1340 / 20), left: 20, pace: +(11 / 30).toFixed(3) });
  assert.deepEqual(rows.find(r => r.id === 'h'), { id: 'h', spent: 120, rem: -20, st: 'over', perDay: 0, left: 20, pace: +(11 / 30).toFixed(3) });
  assert.equal(rows.find(r => r.id === 'f').st, 'near'); // 540 / 600 = 90%
  const past = J(`budgetRows('2026-05',new Date(2026,5,11)).find(r=>r.budget.id==='f')`);
  assert.equal(past.spent, 700); assert.equal(past.daysLeft, 0); assert.equal(past.pace, 1);
});

test('budgetFromForm()：驗證金額、專案、只能有一個總預算', () => {
  const { J, run } = bundle(base({ budgets: [{ id: 't', scope: 'total', limit: 1 }] }));
  const form = o => `({get:k=>(${JSON.stringify(o)})[k]??null})`;
  assert.match(J(`budgetFromForm(${form({ bscope: 'category', limit: '' })},null).error`), /上限/);
  assert.match(J(`budgetFromForm(${form({ bscope: 'total', limit: '5' })},null).error`), /總預算/);
  const ok = J(`budgetFromForm(${form({ bscope: 'total', limit: '5' })},state.budgets[0]).budget`);
  assert.equal(ok.limit, 5); assert.equal(ok.id, 't');
  const c = J(`budgetFromForm(${form({ bscope: 'category', bcategory: 'home', limit: '300', bname: ' 房子 ' })},null).budget`);
  assert.deepEqual([c.scope, c.category, c.limit, c.name], ['category', 'home', 300, '房子']);
  run('0');
});

test('預算頁與概覽卡片：狀態附圖示與文字，名稱跳脫', () => {
  const budgetGrid = { innerHTML: '' }, budgetOverview = { innerHTML: '' }, budgetSummary = { textContent: '' }, budgetOverviewTotal = { textContent: '' };
  const { run } = bundle(base({ budgets: [{ id: 'x', scope: 'category', category: 'home', limit: 100, name: '<b>家' }] }), { budgetGrid, budgetOverview, budgetSummary, budgetOverviewTotal });
  run(`calendarMonth=new Date(2026,5,1);renderBudgetPage();renderBudgetOverview()`);
  assert.match(budgetGrid.innerHTML, /已超支/); assert.match(budgetGrid.innerHTML, /role="meter"/);
  assert.ok(!budgetGrid.innerHTML.includes('<b>家')); assert.match(budgetGrid.innerHTML, /&lt;b&gt;家/);
  assert.match(budgetGrid.innerHTML, /data-budget-edit="x"/);
  assert.match(budgetSummary.textContent, /1 項超支/);
  assert.match(budgetOverview.innerHTML, /\$120 \/ \$100/);
});
