// 帳單分期 tests (V26.74)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = () => ({ accounts: [{ id: 'c', name: '卡', type: 'card', balance: -1000, limit: 9999, statement: 15, due: 5 }], categories: [], projects: [], loans: [], budgets: [], recurring: [], transactions: [{ id: 't', account: 'c', date: '2026-11-01', amount: 1000, kind: 'expense', name: 'x' }] });
const sum = (l, k) => Math.round(l.reduce((s, x) => s + x[k], 0) * 100) / 100;
test('攤還表：本金合計正確、三種方式、零利率、寬限期', () => {
  const { J } = bundle(base());
  for (const m of ['annuity', 'principal', 'flat']) { const l = J(`loanSchedule(120000,12,2,'${m}',0)`); assert.equal(sum(l, 'principal'), 120000); assert.equal(l.at(-1).balance, 0); }
  const an = J("loanSchedule(100000,12,6,'annuity',0)"); assert.equal(an[0].interest, 500); assert.equal(an[0].principal + an[0].interest, 8607); assert.ok(an.every(x => Math.abs(x.principal + x.interest - 8607) <= 6));
  assert.deepEqual(J("loanSchedule(1200,12,12,'flat',0)").map(x => x.interest), Array(12).fill(12));
  assert.equal(sum(J("loanSchedule(1000,3,0,'annuity',0)"), 'interest'), 0); assert.deepEqual(J("loanSchedule(1000,3,0,'annuity',0)").map(x => x.principal), [334, 333, 333]);
  const g = J("loanSchedule(1200,12,12,'principal',0,6)"); assert.deepEqual(g.slice(0, 6).map(x => x.principal), [0, 0, 0, 0, 0, 0]); assert.equal(sum(g, 'principal'), 1200);
});
test('帳單分期：本期清零、下期含本金利息、總欠款不變、可取消', () => {
  const { J, run } = bundle(base()); const D = 'new Date(2026,10,25)';
  const r = J(`stmtInstCreate(state.accounts[0],${D},0,{amount:1000,n:4,rate:12,method:'principal'})`); assert.equal(r.plan.length, 4);
  assert.equal(J(`creditStmt(state.accounts[0],${D},0).owed`), 0);
  run("autoPostDue('2026-11-16')"); assert.equal(J(`creditStmt(state.accounts[0],new Date(2026,11,25),0).spend`), 260);
  assert.equal(run('state.accounts[0].balance'), -1010); assert.equal(run("monthStats('2026-11').out"), 1010, '本金不重複計入支出');
  assert.equal(run('pendingVisible(state.transactions.find(t=>t.autoPost))'), false);
  run(`stmtInstRemove('${r.group}')`); assert.equal(run('state.accounts[0].balance'), -1000); assert.equal(run('state.transactions.length'), 1);
  assert.ok(J(`stmtInstCreate(state.accounts[0],${D},0,{amount:2000,n:4})`).error);
});
