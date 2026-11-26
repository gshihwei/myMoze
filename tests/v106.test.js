// 專案預算分配、子預算、借還款對象篩選 tests (V26.106)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: '錢包', type: 'cash', balance: 0 }], categories: [{ id: 'f', name: '飲食', kind: 'expense' }, { id: 'd', name: '飲料', kind: 'expense', parentId: 'f' }, { id: 't', name: '交通', kind: 'expense' }], projects: [{ id: 'p', name: '家居', budget: 0 }], loans: [{ id: 'l1', person: 'Alan', direction: 'receivable', amount: 100, date: '2026-01-01' }, { id: 'l2', person: 'Ken', direction: 'receivable', amount: 50, date: '2026-01-01' }], recurring: [],
  budgets: [{ id: 'bp', scope: 'project', project: 'p', limit: 1000 }, { id: 'bf', scope: 'category', category: 'f', inProject: 'p', limit: 400 }, { id: 'bd', scope: 'category', category: 'd', inProject: 'p', limit: 100 }],
  transactions: [{ id: 1, kind: 'expense', amount: 30, category: 'd', account: 'a', project: 'p', date: '2026-11-03' }, { id: 2, kind: 'expense', amount: 70, category: 't', account: 'a', project: 'p', date: '2026-11-04' }] });
test('專案預算分配：已分配、未分配、未設定預算的類別', () => {
  const b = bundle(st()), a = b.J("(()=>{const r=projAlloc(state.projects[0],'2026-11-10');return {t:r.total,al:r.allocated,un:r.unallocated,rows:r.rows.length,unset:r.unset}})()");
  assert.equal(a.t, 1000); assert.equal(a.al, 500); assert.equal(a.un, 500); assert.equal(a.rows, 2); assert.deepEqual(a.unset, [{ category: 't', spent: 70 }]);
});
test('清除專案預算', () => { const b = bundle(st()); assert.equal(b.run("projClearBudgets(state.projects[0],true)"), 2); assert.equal(b.run('state.budgets.length'), 1); assert.equal(b.run("projClearBudgets(state.projects[0])"), 1); assert.equal(b.run('state.budgets.length'), 0); });
test('子預算與預算類型', () => { const b = bundle(st()); assert.deepEqual(b.J("budgetSubs(budgetNorm(state.budgets[1])).map(x=>x.id)"), ['bd']); assert.deepEqual(b.J("budgetSubs(budgetNorm(state.budgets[2]))"), []); assert.deepEqual(b.J("state.budgets.map(x=>budgetKindLabel(budgetNorm(x)))"), ['專案', '主類別', '子類別']); });
test('借還款對象篩選', () => { const b = bundle(st()); assert.match(b.run("loanPersonChips('all')"), /Alan[\s\S]*Ken/); b.run("window.__loanPerson='Ken'"); assert.deepEqual(b.J("state.loans.filter(loanPersonOk).map(l=>l.id)"), ['l2']); });
