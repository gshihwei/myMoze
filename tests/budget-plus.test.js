// 統計專案與進階預算 tests (V26.76)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const tx = (id, date, amount, x) => ({ id, date, amount, kind: 'expense', account: 'a', category: 'f', name: id, tags: [], ...x });
const base = (budgets, txs, projects) => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 0 }], categories: [{ id: 'f', name: '飲食', icon: 'x', kind: 'expense' }, { id: 'l', name: '午餐', icon: 'x', kind: 'expense', parentId: 'f' }], projects: projects || [{ id: 'p', name: '生活' }], loans: [], recurring: [], budgets, transactions: txs });
const row = b => b.J("budgetRows('2026-11', new Date(2026,10,10)).map(r=>({limit:r.limit,spent:r.spent,rem:r.remaining,parts:r.parts,daily:r.daily}))[0]");
test('累積剩餘與扣超支', () => {
  const t = [tx('a', '2026-09-05', 2000), tx('b', '2026-10-05', 13500)], B = x => ({ id: 'b', scope: 'total', limit: 12000, rollover: true, since: '2026-09', ...x });
  assert.equal(row(bundle(base([B()], [t[0]]))).limit, 34000); // 10000 + 12000 left over
  assert.equal(row(bundle(base([B({ since: '2026-10' })], t))).limit, 12000); assert.equal(row(bundle(base([B({ since: '2026-10', rollDebt: true })], t))).limit, 10500);
});
test('收入併入、每日預算（固定／比例）', () => {
  const t = [tx('a', '2026-11-01', 200, { project: 'p' }), tx('i', '2026-11-02', 600, { kind: 'income', project: 'p' })];
  assert.equal(row(bundle(base([{ id: 'b', scope: 'project', project: 'p', limit: 12000, addIncome: true }], t))).limit, 12600);
  const D = (daily, date) => bundle(base([{ id: 'b', scope: 'project', project: 'p', limit: 12000, daily }], t)).J(`budgetDaily(budgetNorm(state.budgets[0]),'${date}')`);
  assert.deepEqual(D('fixed', '2026-11-01'), { allow: 400, spent: 200, left: 200 }); assert.equal(D('ratio', '2026-11-01').allow, 400); assert.equal(D('ratio', '2026-11-02').allow, 406);
});
test('專案內類別預算：金額與比例、子分類、年度', () => {
  const t = [tx('a', '2026-11-01', 100, { project: 'p', category: 'l' }), tx('b', '2026-11-01', 50, { category: 'l' }), tx('c', '2026-03-01', 70, { category: 'f' })];
  const b = bundle(base([{ id: 'x', scope: 'category', category: 'f', inProject: 'p', pct: 40, limit: 0 }, { id: 'y', scope: 'project', project: 'p', limit: 12000 }], t));
  assert.deepEqual(b.J("budgetRows('2026-11').map(r=>[r.budget.id,r.limit,r.spent]).sort()"), [['x', 4800, 100], ['y', 12000, 100]]);
  assert.equal(row(bundle(base([{ id: 'x', scope: 'category', category: 'l', limit: 500 }], t))).spent, 150); assert.equal(row(bundle(base([{ id: 'x', scope: 'category', category: 'f', limit: 500, period: 'year' }], t))).spent, 220);
});
test('統計專案：包含／排除條件、循環區間、已結束', () => {
  const t = [tx('a', '2026-11-01', 10, { tags: ['非必要'] }), tx('b', '2026-11-02', 20, { merchant: '星巴克', category: 'l' }), tx('c', '2026-10-02', 40, { project: 'p', tags: ['不納入預算'] })];
  const ids = rules => bundle(base([], t, [{ id: 's', name: 'S', rules }])).J("projTxs('s').map(t=>t.id).sort()");
  assert.deepEqual(ids({ tags: { mode: 'in', list: ['非必要'] } }), ['a']); assert.deepEqual(ids({ tags: { mode: 'ex', list: ['不納入預算'] } }), ['a', 'b']); assert.deepEqual(ids({ merchants: { mode: 'in', list: ['星巴'] } }), ['b']);
  assert.deepEqual(ids({ categories: { mode: 'in', list: ['f'] }, projects: { mode: 'ex', list: ['p'] } }), ['a', 'b']);
  const b = bundle(base([], t)); assert.deepEqual(b.J("projPeriod({cycle:'year'},'2026-11-25')"), { start: '2026-01-01', end: '2026-12-31' }); assert.equal(b.run("projEnded({end:'2026-11-01'},'2026-11-25')"), true); assert.equal(b.run("projEnded({cycle:'month',end:'2026-11-01'},'2026-11-25')"), false);
});
