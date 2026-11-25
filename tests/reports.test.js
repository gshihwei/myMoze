// 統計報表／比較報表 tests (V26.77)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const tx = (id, date, amount, x) => ({ id, date, amount, kind: 'expense', account: 'a', category: 'f', name: id, tags: [], ...x });
const st = () => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 0 }], categories: [{ id: 'f', name: '飲食', icon: 'x', kind: 'expense' }, { id: 'l', name: '午餐', icon: 'x', kind: 'expense', parentId: 'f' }, { id: 't', name: '交通', icon: 'x', kind: 'expense' }], projects: [], loans: [], recurring: [], budgets: [],
  transactions: [tx('a', '2026-11-02', 100), tx('b', '2026-11-03', 4000, { category: 'l' }), tx('c', '2026-10-03', 50, { category: 't' }), tx('i', '2026-11-05', 900, { kind: 'income' }), tx('r', '2026-11-06', 10, { recurringId: 'x' }), tx('p', '2026-11-07', 10, { pending: true, pendingApplied: false })] });
test('報表區間：每週、每月、每年、單一區間、截至今天', () => {
  const { J } = bundle(st());
  assert.deepEqual(J("rptUnit('week','2026-11-25',0)"), { start: '2026-11-22', end: '2026-11-28' }); assert.deepEqual(J("rptPeriod({type:'cycle',unit:'month'},-1,'2026-11-25')"), { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(J("rptPeriod({type:'cycle',unit:'year'},0,'2026-11-25')"), { start: '2026-01-01', end: '2026-12-31' }); assert.deepEqual(J("rptPeriod({type:'today',from:'2026-02-01'},0,'2026-11-25')"), { start: '2026-02-01', end: '2026-11-25' });
});
test('篩選：金額、類型、事件、排除、未入帳不計', () => {
  const { J } = bundle(st()); const ids = f => J(`rptTxs({type:'cycle',unit:'month',filter:${JSON.stringify(f)}},0,'2026-11-25').map(t=>t.id)`);
  assert.deepEqual(ids({}), ['a', 'b', 'i', 'r']); assert.deepEqual(ids({ min: 3000, kinds: { mode: 'in', list: ['expense'] } }), ['b']); assert.deepEqual(ids({ events: { mode: 'in', list: ['recurring'] } }), ['r']); assert.deepEqual(ids({ categories: { mode: 'ex', list: ['f'] } }), []);
});
test('比較報表：合計、平均、增率、選取後重算', () => {
  const { J } = bundle(st()); const m = "cmpBuild({by:'expense',unit:'month',count:2,filter:{}},'2026-11-25')";
  const M = J(m); assert.deepEqual(M.cols.map(c => [c.name, c.total]), [['飲食', 4110], ['交通', 50]]); assert.equal(M.cell['1|f'], 4110);
  const k = J(`cmpCalc(${m})`); assert.deepEqual(k.rowTotal, [50, 4110]); assert.equal(k.growth[1], 81.2); assert.equal(k.colTotal.f, 4110);
  const k2 = J(`cmpCalc(${m},[0],['f'])`); assert.deepEqual(k2.rowTotal, [0, 4110]); assert.equal(k2.colTotal.t, 50); assert.equal(k2.growth[1], null);
  assert.deepEqual(J("cmpBuild({by:'sub',unit:'month',count:2},'2026-11-25').cols.map(c=>c.name)"), ['午餐', '飲食', '交通']); assert.equal(J(`cmpTxs({by:'expense',filter:{}},${m},[1],[{key:'f'}]).length`), 3);
});
