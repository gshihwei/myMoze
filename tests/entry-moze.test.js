// MOZE-style entry sheet tests (V26.62). Run: node --test   (from repo root)
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
  return { ctx, run: c => vm.runInContext(c, ctx), J: c => JSON.parse(vm.runInContext(`JSON.stringify(${c})`, ctx)) };
}
const fs2 = fs;
test('計算機：按鍵組成算式（運算子取代、前導零、小數點）', () => {
  const { run } = bundle({ accounts: [], categories: [], transactions: [] });
  const k = (e, key) => run(`entryCalcKey(${JSON.stringify(e)}, ${JSON.stringify(key)})`);
  assert.equal(k('', '5'), '5'); assert.equal(k('0', '5'), '5'); assert.equal(k('', '00'), ''); assert.equal(k('0', '00'), '0');
  assert.equal(k('', '+'), ''); assert.equal(k('12', '+'), '12+'); assert.equal(k('12+', '*'), '12*'); assert.equal(k('12', '.'), '12.'); assert.equal(k('12.5', '.'), '12.5');
  assert.equal(k('3+', '.'), '3+0.'); assert.equal(k('123', 'back'), '12'); assert.equal(k('123', 'clear'), '');
});
test('計算機：運算優先順序、尾端運算子、除以零', () => {
  const { run } = bundle({ accounts: [], categories: [], transactions: [] });
  const ev = e => run(`entryCalcEval(${JSON.stringify(e)})`);
  assert.equal(ev('2+3*4'), 14); assert.equal(ev('10/4'), 2.5); assert.equal(ev('100-30-20'), 50); assert.equal(ev('12+'), 12); assert.equal(ev('5.'), 5);
  assert.equal(ev(''), null); assert.equal(ev('5/0'), null); assert.equal(ev('0.1+0.2'), 0.3);
});
test('建議分類：近期最常用優先，不足以主分類補滿', () => {
  const cats = [{ id: 'a', name: 'A', kind: 'expense' }, { id: 'b', name: 'B', kind: 'expense' }, { id: 'c', name: 'C', kind: 'income' }];
  const tx = d => ({ kind: 'expense', category: 'b', date: d, account: 'x' });
  const { J } = bundle({ accounts: [], categories: cats, transactions: [tx('2026-11-20'), tx('2026-11-21'), { kind: 'income', category: 'c', date: '2026-11-22' }, tx('2025-01-01')] });
  assert.deepEqual(J("entrySuggest(state,'2026-11-25',3).map(c=>c.id)"), ['b', 'c', 'a']);
});
test('常用帳戶：用得多的在前，封存的不列出', () => {
  const { J } = bundle({ accounts: [{ id: 'a' }, { id: 'b' }, { id: 'c', archived: true }], categories: [], transactions: [{ account: 'b' }, { account: 'a', toAccount: 'b' }, { account: 'c' }] });
  assert.deepEqual(J('entryAccountsByUse(state).map(a=>a.id)'), ['b', 'a']);
});
test('應收／應付：寫入借還款與帳戶餘額，信用卡不可用', () => {
  const { J, run } = bundle({ accounts: [{ id: 'bk', name: '玉山', type: 'bank', balance: 1000 }, { id: 'cc', name: '卡', type: 'card', balance: 0 }], categories: [], transactions: [], loans: [] });
  assert.ok(J("entryPostLoan(state,{direction:'receivable',amount:300,account:'bk',date:'2026-11-25',person:'小明',label:'代付'})").loan);
  assert.equal(run('state.accounts[0].balance'), 700);
  assert.equal(run('state.loans[0].label'), '代付'); assert.equal(run('state.loans[0].direction'), 'receivable'); assert.equal(run("state.transactions[0].kind"), 'loan');
  assert.ok(J("entryPostLoan(state,{direction:'payable',amount:200,account:'bk',date:'2026-11-25',person:''})").loan);
  assert.equal(run('state.accounts[0].balance'), 900); assert.equal(run('state.loans[1].person'), '未指定對象');
  assert.ok(J("entryPostLoan(state,{direction:'payable',amount:5,account:'cc'})").error);
  assert.ok(J("entryPostLoan(state,{direction:'payable',amount:0,account:'bk'})").error);
});
test('系統分類：找得到就沿用，沒有才建立', () => {
  const { J, run } = bundle({ accounts: [], categories: [{ id: 'fee', name: '手續費', kind: 'expense' }], transactions: [] });
  assert.equal(J("entryEnsureCategory(state,'手續費','expense')").id, 'fee');
  const n = J("entryEnsureCategory(state,'紅利回饋','income')"); assert.equal(n.kind, 'income'); assert.equal(run('state.categories.length'), 2);
});
test('新增記錄視窗：七個分頁與必要欄位都在', () => {
  const html = fs2.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const t of ['suggest', 'expense', 'income', 'transfer', 'receivable', 'payable', 'system']) assert.ok(html.includes(`data-etab-btn="${t}"`), t);
  for (const id of ['txForm', 'formCategory', 'formAccount', 'formToAccount', 'formProject', 'amountInput', 'amountDisplay', 'amountKeypad', 'accountChoices', 'categoryChoices', 'splitRows', 'modalCancel', 'modalClose', 'entryFee']) assert.ok(html.includes(`id="${id}"`), id);
  for (const n of ['name', 'date', 'time', 'merchant', 'person', 'tags', 'note', 'toAmount', 'pending', 'instOn']) assert.ok(html.includes(`name="${n}"`), n);
});
