// 記帳輔助 tests (V26.13). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function field(value = '', options) { return { value, dataset: {}, options: options ? options.map(v => ({ value: v })) : undefined, dispatchEvent() {} }; }
function bundle(state, elements = {}) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? id => elements[id] || any() : k === 'querySelectorAll' ? () => [] : k === 'querySelector' ? sel => (sel === 'input[name=kind]:checked' ? { value: elements.__kind || 'expense' } : null) : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Event: class { constructor(type) { this.type = type; } },
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const base = () => ({
  accounts: [{ id: 'cash', name: '錢包' }, { id: 'card', name: '信用卡', type: 'card' }],
  categories: [{ id: 'food', name: '飲食' }, { id: 'drink', name: '飲料' }], projects: [], budgets: [], recurring: [], loans: [],
  transactions: [
    { id: 1, kind: 'expense', name: '午餐', merchant: '自助餐', category: 'food', account: 'cash', date: '2026-06-01' },
    { id: 2, kind: 'expense', name: '咖啡', merchant: '星巴克', category: 'drink', account: 'card', date: '2026-06-02', tags: ['提神'] },
    { id: 3, kind: 'expense', name: '午餐', merchant: '麥當勞', category: 'food', account: 'card', date: '2026-06-03' },
    { id: 4, kind: 'income', name: '薪水', merchant: '公司', account: 'cash', date: '2026-06-05' },
    { id: 5, kind: 'loan', name: '午餐', account: 'cash', date: '2026-06-06', loanId: 'L' },
  ],
});

test('entryRanked()：依使用次數、再依最近使用排序，可限定類型', () => {
  const { J } = bundle(base());
  assert.deepEqual(J(`entryRanked('name','expense')`), ['午餐', '咖啡']);
  assert.deepEqual(J(`entryRanked('merchant','')`), ['公司', '麥當勞', '星巴克', '自助餐']);
});

test('entryTemplate()：取最近一筆同名同類型交易，忽略借還款', () => {
  const { J } = bundle(base());
  assert.equal(J(`entryTemplate('午餐','expense').id`), 3);
  assert.equal(J(`entryTemplate('不存在','expense')`), null);
});

test('entryApplyTemplate()：新交易帶入分類／帳戶／商家／標籤，不覆蓋使用者改過或已填的欄位，編輯時不動作', () => {
  const txForm = { elements: { name: field('咖啡'), category: field('food', ['food', 'drink']), account: field('cash', ['cash', 'card']), merchant: field(''), tags: field(''), toAccount: field('', ['cash', 'card']) } };
  const b = bundle(base(), { txForm });
  b.run('editId=null');
  assert.equal(b.J('entryApplyTemplate()'), true);
  assert.deepEqual([txForm.elements.category.value, txForm.elements.account.value, txForm.elements.merchant.value, txForm.elements.tags.value], ['drink', 'card', '星巴克', '提神']);
  // user already chose an account and typed a merchant → keep them
  const f2 = { elements: { name: field('午餐'), category: field('drink', ['food', 'drink']), account: field('cash', ['cash', 'card']), merchant: field('全家'), tags: field(''), toAccount: field('', ['cash']) } };
  f2.elements.account.dataset.userSet = '1';
  const b2 = bundle(base(), { txForm: f2 });
  b2.run('editId=null;entryApplyTemplate()');
  assert.deepEqual([f2.elements.category.value, f2.elements.account.value, f2.elements.merchant.value], ['food', 'cash', '全家']);
  const f3 = { elements: { name: field('咖啡'), category: field('food', ['food', 'drink']), account: field('cash', ['cash', 'card']), merchant: field(''), tags: field(''), toAccount: field('') } };
  const b3 = bundle(base(), { txForm: f3 });
  assert.equal(b3.J(`(editId=1,entryApplyTemplate())`), false);
  assert.equal(f3.elements.category.value, 'food');
});

test('entryCopyOf()：保留內容，清除 id、匯入／待完成／週期等標記，日期改為所選日期', () => {
  const { J, run } = bundle(base());
  run(`selectedDate='2026-07-01'`);
  const c = J(`entryCopyOf({id:9,kind:'transfer',amount:3200,account:'cash',toAccount:'card',toAmount:100,fee:15,toBalanceEffect:100,balanceEffect:-3215,imported:true,_importKey:'k',pending:true,pendingApplied:false,recurringId:'r',name:'換匯',tags:['a'],date:'2026-06-01'})`);
  assert.equal(c.id, undefined); assert.equal(c.imported, undefined); assert.equal(c._importKey, undefined); assert.equal(c.pending, undefined); assert.equal(c.recurringId, undefined); assert.equal(c.balanceEffect, undefined);
  assert.deepEqual([c.date, c.amount, c.toAmount, c.fee, c.name, c.tags[0]], ['2026-07-01', 3200, 100, 15, '換匯', 'a']);
  assert.match(c.time, /^\d\d:\d\d$/);
});

test('記帳範本：存成範本不含日期／時間／id，最多 12 個，可刪除', () => {
  const store = new Map();
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : k === 'querySelector' ? () => null : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }, indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {}, Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' + Math.random() } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx); } catch {}
  const run = c => vm.runInContext(c, ctx);
  run(`state=${JSON.stringify(base())}`);
  const tp = JSON.parse(run(`JSON.stringify(tplSave(state.transactions[1],'早上咖啡'))`));
  assert.equal(tp.name, '早上咖啡'); assert.equal(tp.data.id, undefined); assert.equal(tp.data.date, undefined); assert.equal(tp.data.time, undefined);
  assert.equal(tp.data.merchant, '星巴克');
  for (let i = 0; i < 15; i++) run(`tplSave(state.transactions[0],'t${i}')`);
  assert.equal(run('tplList().length'), 12);
  run(`tplRemove(tplList()[0].id)`);
  assert.equal(run('tplList().length'), 11);
  assert.equal(JSON.parse(store.get('moze-prefs-v1')).templates.length, 11);
});
