// 專案頁 tests (V26.9). Run: node --test   (from repo root)
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
  accounts: [{ id: 'a', name: '錢包', balance: 0 }, { id: 'u', name: '美元', currency: 'USD', balance: 0 }],
  categories: [{ id: 'food', name: '飲食', icon: '🍜', kind: 'expense' }, { id: 'lunch', name: '午餐', icon: '🍱', kind: 'expense', parentId: 'food' }, { id: 'hotel', name: '住宿', icon: '🏨', kind: 'expense' }],
  projects: [{ id: 'p', name: '台南旅行', budget: 5000 }, { id: 'q', name: '<b>舊', budget: 0, archived: true }],
  budgets: [{ id: 'bp', scope: 'project', project: 'p', limit: 5000 }, { id: 'bc', scope: 'category', category: 'food', limit: 100 }],
  recurring: [], loans: [],
  transactions: [
    { id: 1, kind: 'expense', amount: 2800, account: 'a', category: 'hotel', date: '2026-06-02', project: 'p', name: '住宿' },
    { id: 2, kind: 'expense', amount: 3.2, account: 'u', category: 'lunch', date: '2026-06-03', project: 'p', name: '早午餐' },
    { id: 3, kind: 'expense', amount: 300, account: 'a', date: '2026-06-04', project: 'p', name: '混合', splits: [{ category: 'lunch', amount: 100 }, { category: 'hotel', amount: 200 }] },
    { id: 4, kind: 'income', amount: 500, account: 'a', date: '2026-06-05', project: 'p', name: '退款' },
    { id: 5, kind: 'expense', amount: 999, account: 'a', category: 'hotel', date: '2026-06-06', project: 'p', pending: true, pendingApplied: false },
    { id: 6, kind: 'expense', amount: 50, account: 'a', category: 'food', date: '2026-06-07', name: '無專案' },
  ],
});

test('projStats()：支出／收入、外幣換算、拆帳分類、跳過未入帳待完成、期間', () => {
  const { J } = bundle(base());
  const s = J(`(({count,spent,income,first,last,categories})=>({count,spent,income,first,last,cats:categories.rows.map(r=>[r.id,r.amount])}))(projStats(state.projects[0]))`);
  assert.deepEqual(s, { count: 4, spent: 2800 + 100 + 300, income: 500, first: '2026-06-02', last: '2026-06-05', cats: [['hotel', 3000], ['food', 200]] });
});

test('projFromForm()：名稱必填不重複、日期順序、封存', () => {
  const { J } = bundle(base());
  const form = o => `({get:k=>(${JSON.stringify(o)})[k]??null})`;
  assert.match(J(`projFromForm(${form({ pname: '' })},null).error`), /名稱/);
  assert.match(J(`projFromForm(${form({ pname: '台南旅行' })},null).error`), /已經存在/);
  assert.match(J(`projFromForm(${form({ pname: 'x', pstart: '2026-07-02', pend: '2026-07-01' })},null).error`), /結束日期/);
  const p = J(`projFromForm(${form({ pname: '台南旅行', pbudget: '8000', pstart: '2026-06-01', parchived: 'on' })},state.projects[0]).project`);
  assert.deepEqual([p.id, p.budget, p.start, p.end, p.archived], ['p', 8000, '2026-06-01', undefined, true]);
});

test('projRemove()：交易保留但解除專案、刪除專案預算、其他預算不動', () => {
  const { J, run } = bundle(base());
  assert.deepEqual(J('projRemove(state.projects[0])'), { tx: 5, budgets: 1 });
  assert.equal(J('state.transactions.filter(t=>t.project).length'), 0);
  assert.equal(J('state.transactions.length'), 6);
  assert.deepEqual(J('state.budgets.map(b=>b.id)'), ['bc']);
  assert.deepEqual(J('state.projects.map(p=>p.id)'), ['q']);
  run('0');
});

test('專案頁：預算狀態、封存切換、明細列出分類與交易，並跳脫名稱', () => {
  const projectGrid = { innerHTML: '' }, projectDetail = { innerHTML: '', querySelectorAll: () => [] };
  const { run } = bundle(base(), { projectGrid, projectDetail });
  run('renderProjectPage()');
  assert.match(projectGrid.innerHTML, /\$3,200/); assert.match(projectGrid.innerHTML, /\/ \$5,000/); assert.match(projectGrid.innerHTML, /64%/);
  assert.match(projectGrid.innerHTML, /顯示已封存（1）/);
  assert.ok(!projectGrid.innerHTML.includes('舊'), 'archived hidden by default');
  run(`projShowArchived=true;projSelected='p';renderProjectPage()`);
  assert.ok(!projectGrid.innerHTML.includes('<b>舊')); assert.match(projectGrid.innerHTML, /&lt;b&gt;舊/);
  assert.match(projectDetail.innerHTML, /分類花費/); assert.match(projectDetail.innerHTML, /data-proj-tx="1"/); assert.match(projectDetail.innerHTML, /住宿/);
});
