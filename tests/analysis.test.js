// 報表分析頁 tests (V26.4). Run: node --test   (from repo root)
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
  categories: [
    { id: 'food', name: '飲食', icon: '🍜', kind: 'expense' },
    { id: 'lunch', name: '午餐', icon: '🍜', kind: 'expense', parentId: 'food' },
    { id: 'dinner', name: '晚餐', icon: '🍜', kind: 'expense', parentId: 'food' },
    { id: 'home', name: '居家', icon: '⌂', kind: 'expense' },
    { id: 'pay', name: '薪資', icon: '＄', kind: 'income' },
  ],
  projects: [{ id: 'p', name: '旅行' }], transactions: [], budgets: [], recurring: [], loans: [], ...extra,
});
const TX = [
  { id: 1, kind: 'expense', amount: 100, account: 'a', category: 'lunch', date: '2026-06-02', merchant: '麥當勞', tags: ['公司'] },
  { id: 2, kind: 'expense', amount: 300, account: 'a', category: 'dinner', date: '2026-06-03', merchant: '麥當勞', project: 'p' },
  { id: 3, kind: 'expense', amount: 50, account: 'a', category: 'food', date: '2026-06-04' },
  { id: 4, kind: 'expense', amount: 3.2, account: 'u', category: 'home', date: '2026-06-05', tags: ['公司', '房租'] },
  { id: 5, kind: 'income', amount: 5000, account: 'a', category: 'pay', date: '2026-06-10' },
  { id: 6, kind: 'expense', amount: 999, account: 'a', category: 'home', date: '2026-06-11', pending: true, pendingApplied: false },
  { id: 7, kind: 'expense', amount: 200, account: 'a', category: 'home', date: '2026-05-20' },
  { id: 8, kind: 'transfer', amount: 777, account: 'a', toAccount: 'u', date: '2026-06-12' },
  { id: 9, kind: 'expense', amount: 60, account: 'a', date: '2026-06-13', splits: [{ category: 'lunch', amount: 40 }, { category: 'home', amount: 20 }] },
];

test('anRange()：各期間與「上一期」', () => {
  const { J } = bundle(base());
  const today = 'new Date(2026,5,18)';
  assert.deepEqual(J(`(({start,end,prevStart,prevEnd,days,elapsed})=>({start,end,prevStart,prevEnd,days,elapsed}))(anRange('thisMonth','','',${today}))`),
    { start: '2026-06-01', end: '2026-06-30', prevStart: '2026-05-01', prevEnd: '2026-05-31', days: 30, elapsed: 18 });
  assert.deepEqual(J(`[anRange('lastMonth','','',${today}).start,anRange('lastMonth','','',${today}).end]`), ['2026-05-01', '2026-05-31']);
  assert.deepEqual(J(`[anRange('3m','','',${today}).start,anRange('3m','','',${today}).prevStart,anRange('3m','','',${today}).prevEnd]`), ['2026-04-01', '2026-01-01', '2026-03-31']);
  assert.deepEqual(J(`[anRange('ytd','','',${today}).start,anRange('ytd','','',${today}).prevStart]`), ['2026-01-01', '2025-01-01']);
  assert.deepEqual(J(`[anRange('12m','','',${today}).start,anRange('12m','','',${today}).end]`), ['2025-07-01', '2026-06-30']);
  const c = J(`anRange('custom','2026-06-20','2026-06-11',${today})`); // reversed input is swapped
  assert.deepEqual([c.start, c.end, c.days, c.prevStart, c.prevEnd], ['2026-06-11', '2026-06-20', 10, '2026-06-01', '2026-06-10']);
  assert.equal(J(`anRange('custom','bad','',${today}).start`), '2026-06-01');
});

test('anTotals()：只算收支、外幣換算、跳過未入帳待完成、可篩帳戶', () => {
  const { J } = bundle(base({ transactions: TX }));
  assert.deepEqual(J(`anTotals('2026-06-01','2026-06-30','all',18)`), { out: 100 + 300 + 50 + 100 + 60, inc: 5000, net: 5000 - 610, nOut: 5, nInc: 1, perDay: Math.round(610 / 18) });
  assert.equal(J(`anTotals('2026-06-01','2026-06-30','u').out`), 100);
});

test('anByCategory()：子分類併入主分類、拆帳分開計算，可下鑽子分類', () => {
  const { J } = bundle(base({ transactions: TX }));
  const top = J(`anByCategory('2026-06-01','2026-06-30','expense')`);
  assert.equal(top.total, 610);
  assert.deepEqual(top.rows.map(r => [r.id, r.amount, r.count, r.drillable]), [['food', 490, 4, true], ['home', 120, 2, false]]);
  const sub = J(`anByCategory('2026-06-01','2026-06-30','expense','all','food')`);
  assert.deepEqual(sub.rows.map(r => [r.name, r.amount]), [['晚餐', 300], ['午餐', 140], ['飲食（未分子類）', 50]]);
  assert.ok(Math.abs(sub.rows.reduce((s, r) => s + r.share, 0) - 1) < 1e-9);
});

test('anRank()：超過上限的尾端併成「其他」', () => {
  const { J } = bundle(base());
  const r = J(`anRank(new Map([1,2,3,4,5].map(i=>[i,{id:i,name:'c'+i,amount:i*10,count:1}])),3)`);
  assert.deepEqual(r.rows.map(x => [x.name, x.amount]), [['c5', 50], ['c4', 40], ['其他（3 項）', 60]]);
});

test('商家／標籤／帳戶／專案排行', () => {
  const { J } = bundle(base({ transactions: TX }));
  const s = "'2026-06-01','2026-06-30','expense','all'";
  assert.deepEqual(J(`anMerchants(${s}).rows.map(r=>[r.name,r.amount,r.count])`), [['麥當勞', 400, 2]]);
  assert.deepEqual(J(`anTags(${s}).rows.map(r=>[r.name,r.amount])`), [['#公司', 200], ['#房租', 100]]);
  assert.deepEqual(J(`anAccounts(${s}).rows.map(r=>[r.name,r.amount])`), [['錢包', 510], ['美元', 100]]);
  assert.deepEqual(J(`anProjects(${s}).rows.map(r=>[r.name,r.amount])`), [['旅行', 300]]);
});

test('anBuckets()：62 天內每日、更長每月', () => {
  const { J } = bundle(base({ transactions: TX }));
  const d = J(`anBuckets('2026-06-01','2026-06-30')`);
  assert.equal(d.daily, true); assert.equal(d.rows.length, 30);
  assert.deepEqual(d.rows[1], { key: '2026-06-02', out: 100, inc: 0 });
  const m = J(`anBuckets('2026-01-01','2026-06-30')`);
  assert.equal(m.daily, false); assert.deepEqual(m.rows.map(r => r.key), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  assert.deepEqual(m.rows[4], { key: '2026-05', out: 200, inc: 0 });
});

test('圖表：單一 y 軸、每格可滑過，依容器寬度輸出、不拉伸文字', () => {
  const { run } = bundle(base({ transactions: TX }));
  const svg = run(`anColumnsSVG(anBuckets('2026-01-01','2026-06-30').rows,[{key:'out',label:'支出',color:'#d95926'},{key:'inc',label:'收入',color:'#3987e5'}],false,360)`);
  assert.match(svg, /viewBox="0 0 360 180"/);
  assert.ok(!/preserveAspectRatio="none"/.test(svg));
  assert.equal((svg.match(/class="cg-hit"/g) || []).length, 6);
  assert.equal((svg.match(/text-anchor="start"/g) || []).length, 0, 'no right-hand axis');
  const ov = run(`chartSVG(chartSeries(12,'2026-06'),{bars:true,line:true,width:360})`);
  assert.ok(!/polyline/.test(ov), 'overview bars chart has no second-axis line');
  assert.match(ov, /viewBox="0 0 360 180"/);
});

test('renderAnalysis()：輸出篩選、KPI、排行與表格，並跳脫名稱', () => {
  const root = { innerHTML: '', clientWidth: 0, querySelector: () => ({}), querySelectorAll: () => [] };
  const { run } = bundle(base({ transactions: [...TX, { id: 10, kind: 'expense', amount: 5, account: 'a', category: 'home', date: '2026-06-14', merchant: '<img src=x>' }] }), { analysisRoot: root });
  run(`anState={range:'custom',from:'2026-06-01',to:'2026-06-30',kind:'expense',account:'all',drill:null};renderAnalysis()`);
  const h = root.innerHTML;
  for (const s of ['支出分類排行', '每日支出', '淨資產走勢', '商家排行', '標籤排行', '帳戶排行', '專案排行', '以表格檢視', 'data-an-drill="food"']) assert.ok(h.includes(s), s);
  assert.ok(!h.includes('<img src=x>'));
  assert.match(h, /&lt;img src=x&gt;/);
  run(`anState.drill='food';renderAnalysis()`);
  assert.match(root.innerHTML, /飲食 · 子分類/);
});

test('對象排行：忽略空白與「不限定對象」', () => {
  const { J } = bundle(base({ transactions: [
    { id: 1, kind: 'expense', amount: 100, account: 'a', date: '2026-06-02', person: '家人' },
    { id: 2, kind: 'expense', amount: 50, account: 'a', date: '2026-06-03', person: '家人' },
    { id: 3, kind: 'expense', amount: 30, account: 'a', date: '2026-06-04', person: '不限定對象' },
    { id: 4, kind: 'expense', amount: 20, account: 'a', date: '2026-06-05' },
  ] }));
  assert.deepEqual(J(`anPersons('2026-06-01','2026-06-30','expense','all').rows.map(r=>[r.name,r.amount,r.count])`), [['家人', 150, 2]]);
});
