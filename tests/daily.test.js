// Calendar, daily list, tags and time tests (V26.1). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

// Real runtime bundle with a document stub: named elements are plain objects we can inspect,
// everything else is a permissive proxy.
function bundle(state, elements = {}) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const els = {};
  const el = id => els[id] || (els[id] = elements[id] || null);
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? id => el(id) || any() : k === 'querySelectorAll' ? () => [] : any()) });
  let formValues = {};
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    FormData: class { get(k) { return formValues[k] ?? null; } },
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, els, setForm: v => { formValues = v; } };
}
const base = extra => ({ accounts: [{ id: 'a', name: '錢包', balance: 0 }], categories: [{ id: 'food', name: '飲食', icon: '🍜' }], projects: [{ id: 'p', name: '旅行' }], transactions: [], budgets: [], recurring: [], loans: [], ...extra });

test('parseTags()：支援 # 前綴、空白／逗號／頓號分隔、去重', () => {
  const { run } = bundle(base());
  assert.equal(run(`JSON.stringify(parseTags('#午餐 公司,公司、 #LinePay  '))`), '["午餐","公司","LinePay"]');
  assert.equal(run(`JSON.stringify(parseTags(''))`), '[]');
});

test('dayTotals()／monthProjectTotal()', () => {
  const { run } = bundle(base({ transactions: [
    { id: 1, kind: 'expense', amount: 120, account: 'a', date: '2026-06-02', project: 'p' },
    { id: 2, kind: 'income', amount: 500, account: 'a', date: '2026-06-02' },
    { id: 3, kind: 'transfer', amount: 999, account: 'a', toAccount: 'a', date: '2026-06-02' },
    { id: 4, kind: 'expense', amount: 80, account: 'a', date: '2026-06-20', project: 'p' },
  ] }));
  assert.equal(run(`JSON.stringify(dayTotals('2026-06-02'))`), '{"out":120,"inc":500,"net":380}');
  assert.equal(run(`monthProjectTotal('2026-06')`), 200);
});

test('當日明細：顯示時間、#標籤、專案與帳戶標籤，並跳脫特殊字元', () => {
  const dailyList = { innerHTML: '', querySelectorAll: () => [] }, dailyCaption = { textContent: '' }, monthStats = { innerHTML: '' };
  const { run } = bundle(base({ transactions: [
    { id: 't1', kind: 'expense', amount: 170, account: 'a', category: 'food', date: '2026-06-02', time: '12:30', name: '午餐<b>', merchant: '麥當勞', tags: ['LinePay', '<x>'], project: 'p' },
  ] }), { dailyList, dailyCaption, monthStats });
  run(`selectedDate='2026-06-02';renderDaily()`);
  const h = dailyList.innerHTML;
  assert.match(h, /12:30/); assert.match(h, /#LinePay/); assert.match(h, /<i>旅行<\/i>/); assert.match(h, /<i>錢包<\/i>/);
  assert.ok(!h.includes('午餐<b>') && !h.includes('<x>')); assert.match(h, /午餐&lt;b&gt;/);
  assert.match(dailyCaption.textContent, /2026\/06\/02（週二）/);
  assert.match(monthStats.innerHTML, /6 月統計/); assert.match(monthStats.innerHTML, /專案總額/);
});

test('日曆格子顯示當日淨額，週末加 wkend', () => {
  const calendarGrid = { innerHTML: '', querySelectorAll: () => [] };
  const { run } = bundle(base({ transactions: [{ id: 1, kind: 'expense', amount: 15800, account: 'a', date: '2026-06-02' }] }), { calendarGrid, monthTitle: {}, periodLabel: {} });
  run(`calendarMonth=new Date(2026,5,1);selectedDate='2026-06-02';renderCalendar()`);
  assert.match(calendarGrid.innerHTML, /data-date="2026-06-02"><span class="day-num">2<\/span><small class="day-amt neg">−1\.6 萬<\/small>/);
  assert.match(calendarGrid.innerHTML, /class="day[^"]*wkend[^"]*" data-date="2026-06-06"/); // Saturday
});

test('編輯交易會保留原有欄位（時間、幣別、匯入 key 等），並寫入新的標籤', () => {
  const txForm = { elements: {}, reset() {} }, splitRows = { querySelectorAll: () => [] };
  const b = bundle(base({ accounts: [{ id: 'a', name: '錢包', balance: -170 }], transactions: [
    { id: 't1', kind: 'expense', amount: 170, account: 'a', category: 'food', date: '2026-06-02', time: '12:30', name: '午餐', currency: 'TWD', fee: 0, _importKey: 'K', imported: true, recordType: '支出', balanceEffect: -170 },
  ] }), { txForm, splitRows });
  b.run(`editId='t1'`);
  b.setForm({ kind: 'expense', amount: '170', date: '2026-06-02', time: '12:45', name: '午餐', category: 'food', account: 'a', tags: '#公司 便當' });
  b.run(`submitTx({preventDefault(){}})`);
  const t = JSON.parse(b.run(`JSON.stringify(state.transactions[0])`));
  assert.equal(t._importKey, 'K'); assert.equal(t.currency, 'TWD'); assert.equal(t.imported, true);
  assert.equal(t.time, '12:45'); assert.deepEqual(t.tags, ['公司', '便當']);
  assert.equal(b.run('state.accounts[0].balance'), -170);
});

test('記帳表單的「對象」會寫入交易', () => {
  const txForm = { elements: {}, reset() {} }, splitRows = { querySelectorAll: () => [] };
  const b = bundle(base(), { txForm, splitRows });
  b.run('editId=null');
  b.setForm({ kind: 'expense', amount: '80', date: '2026-06-02', name: '晚餐', category: 'food', account: 'a', person: ' 同事 ' });
  b.run(`submitTx({preventDefault(){}})`);
  assert.equal(b.run('state.transactions[0].person'), '同事');
});
