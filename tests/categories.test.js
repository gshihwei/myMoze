// 分類管理 tests (V26.7). Run: node --test   (from repo root)
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
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const base = extra => ({
  accounts: [{ id: 'a', name: '錢包', balance: 0 }],
  categories: [
    { id: 'food', name: '飲食', icon: '🍜', kind: 'expense' },
    { id: 'home', name: '居家', icon: '⌂', kind: 'expense' },
    { id: 'lunch', name: '午餐', icon: '🍱', kind: 'expense', parentId: 'food' },
    { id: 'pay', name: '薪資', icon: '＄', kind: 'income' },
    { id: 'tea', name: '飲料', icon: '☕', kind: 'expense', parentId: 'food' },
  ],
  projects: [], transactions: [
    { id: 1, kind: 'expense', amount: 10, account: 'a', category: 'lunch', date: '2026-06-01' },
    { id: 2, kind: 'expense', amount: 10, account: 'a', date: '2026-06-02', splits: [{ category: 'lunch', amount: 5 }, { category: 'home', amount: 5 }] },
  ],
  budgets: [{ id: 'b', scope: 'category', category: 'lunch', limit: 100 }],
  recurring: [{ id: 'r', name: '便當', amount: 80, category: 'lunch', next: '2026-07-01' }], loans: [], ...extra,
});

test('catOrdered()：主分類依 order，子分類接在主分類後', () => {
  const { J, run } = bundle(base());
  assert.deepEqual(J(`catOrdered('expense').map(c=>c.id)`), ['food', 'lunch', 'tea', 'home']);
  run(`state.categories.find(c=>c.id==='home').order=0;state.categories.find(c=>c.id==='food').order=1`);
  assert.deepEqual(J(`catOrdered('expense').map(c=>c.id)`), ['home', 'food', 'lunch', 'tea']);
  assert.equal(J(`catLabel(state.categories.find(c=>c.id==='tea'))`), '飲食 › 飲料');
});

test('catMove()：同層上下移動', () => {
  const { J, run } = bundle(base());
  assert.equal(J(`catMove(state.categories.find(c=>c.id==='tea'),-1)`), true);
  assert.deepEqual(J(`catOrdered('expense').map(c=>c.id)`), ['food', 'tea', 'lunch', 'home']);
  assert.equal(J(`catMove(state.categories.find(c=>c.id==='tea'),-1)`), false, 'already first');
  run('0');
});

test('catUsage() 與 catReassign()：交易、拆帳、週期、預算都改到新分類', () => {
  const { J, run } = bundle(base());
  assert.deepEqual(J(`catUsage('lunch')`), { tx: 2, recurring: 1, budgets: 1, total: 4 });
  run(`catReassign('lunch','home')`);
  assert.deepEqual(J(`catUsage('lunch')`), { tx: 0, recurring: 0, budgets: 0, total: 0 });
  assert.equal(J('state.transactions[0].category'), 'home');
  assert.deepEqual(J('state.transactions[1].splits.map(s=>s.category)'), ['home', 'home']);
  assert.equal(J('state.recurring[0].category'), 'home');
  assert.equal(J('state.budgets[0].category'), 'home');
});

test('catFromForm()：名稱必填、不可重複、最多兩層、子分類跟隨上層收支類型', () => {
  const { J } = bundle(base());
  const form = o => `({get:k=>(${JSON.stringify(o)})[k]??null})`;
  assert.match(J(`catFromForm(${form({ cname: ' ' })},null).error`), /名稱/);
  assert.match(J(`catFromForm(${form({ cname: '居家', ckind: 'expense' })},null).error`), /已經存在/);
  assert.match(J(`catFromForm(${form({ cname: 'x', cparent: 'lunch' })},null).error`), /兩層/);
  const sub = J(`catFromForm(${form({ cname: '早餐', cparent: 'food', ckind: 'income', cicon: '🥪' })},null).category`);
  assert.deepEqual([sub.name, sub.parentId, sub.kind, sub.icon], ['早餐', 'food', 'expense', '🥪']);
  // a main with children cannot become a subcategory
  const main = J(`catFromForm(${form({ cname: '飲食', cparent: 'home', ckind: 'expense' })},state.categories[0]).category`);
  assert.equal(main.parentId, undefined);
});

test('分類頁：依收支切換、顯示子分類與使用次數，並跳脫名稱', () => {
  const categoryGrid = { innerHTML: '', querySelectorAll: () => [] };
  const { run } = bundle(base({ categories: [...base().categories, { id: 'x', name: '<b>壞', icon: '<i>', kind: 'expense' }] }), { categoryGrid });
  run('renderCategoryPage()');
  const h = categoryGrid.innerHTML;
  assert.match(h, /data-cat-addsub="food"/); assert.match(h, /data-cat-edit="lunch"/); assert.match(h, /2 個子分類/);
  assert.ok(!h.includes('薪資'), 'income hidden on expense tab');
  assert.ok(!h.includes('<b>壞') && !h.includes('<i>'));
  run(`catPageKind='income';renderCategoryPage()`);
  assert.match(categoryGrid.innerHTML, /薪資/);
});

test('catOptionsHTML()：子分類縮排，可選 all', () => {
  const { run } = bundle(base());
  const h = run(`catOptionsHTML('expense','tea',{all:true})`);
  assert.match(h, /^<option value="all">全部分類<\/option>/);
  assert.match(h, /value="tea" selected>　└ ☕ 飲料/);
});
