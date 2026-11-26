// 每期預算（沿用上期、清除這期後）與餘額調整時間 tests (V26.107)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: '錢包', type: 'cash', balance: 1000 }], categories: [{ id: 'f', name: '飲食', kind: 'expense' }], projects: [], loans: [], recurring: [],
  budgets: [{ id: 'b1', scope: 'category', category: 'f', limit: 500 }, { id: 'b2', scope: 'total', limit: 3000, period: 'year' }],
  transactions: [{ id: 1, kind: 'expense', amount: 100, category: 'f', account: 'a', date: '2026-11-10', time: '09:00' }, { id: 2, kind: 'expense', amount: 50, category: 'f', account: 'a', date: '2026-11-10', time: '18:00' }] });
test('本期金額覆寫預設金額', () => {
  const b = bundle(st()); b.run("state.budgets[0].amounts={'2026-11':800}");
  assert.equal(b.run("budgetLimit(budgetNorm(state.budgets[0]),'2026-11')"), 800); assert.equal(b.run("budgetLimit(budgetNorm(state.budgets[0]),'2026-10')"), 500);
});
test('沿用上期預算', () => {
  const b = bundle(st()); b.run("state.budgets[0].amounts={'2026-10':650}");
  assert.equal(b.run("budgetCopyPrev(state.budgets,'2026-11')"), 1); assert.equal(b.run("state.budgets[0].amounts['2026-11']"), 650); assert.equal(b.run("budgetLimit(budgetNorm(state.budgets[0]),'2026-11')"), 650);
  assert.equal(b.run("budgetCopyPrev(state.budgets,'2026-11')"), 0);
});
test('清除這期後所有預算，之前各期保留，沿用上期可恢復', () => {
  const b = bundle(st()); b.run("state.budgets[0].amounts={'2026-12':900}"); assert.equal(b.run("budgetStopFrom(state.budgets,'2026-11')"), 2);
  assert.equal(b.run("state.budgets[0].stop"), '2026-11'); assert.equal(b.run("state.budgets[1].stop"), '2026'); assert.equal(b.run("state.budgets[0].amounts"), undefined);
  assert.equal(b.run("budgetLimit(budgetNorm(state.budgets[0]),'2026-12')"), 0); assert.equal(b.run("budgetLimit(budgetNorm(state.budgets[0]),'2026-10')"), 500); assert.equal(b.run("budgetRows('2026-11').length"), 0); assert.equal(b.run("budgetRows('2026-10').length"), 1);
  b.run("budgetCopyPrev(state.budgets,'2026-11')"); assert.equal(b.run("budgetRows('2026-11').length"), 2); assert.equal(b.run("budgetLimit(budgetNorm(state.budgets[0]),'2026-11')"), 500);
});
test('餘額調整可指定時間', () => {
  const b = bundle(st()); assert.equal(b.run("pinBalanceAt(state.accounts[0],'2026-11-10','12:00')"), 1050); assert.equal(b.run("pinBalanceAt(state.accounts[0],'2026-11-10')"), 1000);
  const t = b.J("(()=>{const t=acctAdjustTo(state.accounts[0],2000,'2026-11-10','','12:00');return {amt:t.amount,time:t.time,bal:state.accounts[0].balance}})()"); assert.deepEqual(t, { amt: 950, time: '12:00', bal: 1950 });
});
