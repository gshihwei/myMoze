// 分期進階 tests (V26.88)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'c', name: 'C', type: 'bank', balance: 0 }], categories: [{ id: 'f', name: 'F', kind: 'expense' }], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
const T = "{id:'t',kind:'expense',amount:12000,account:'c',category:'f',date:'2026-01-10',name:'冷氣',tags:[]}";
const mk = o => { const b = bundle(st()); b.run(`var k=0;id=()=>'i'+(++k);var pl=installmentPlan(${T},${o.n || 12},${JSON.stringify(o)});for(const x of pl.list){state.transactions.push(x);adjust(x,1)}`); return b; };
const sum = (b, e) => Math.round(b.run(`state.transactions.reduce((s,x)=>s+(${e}),0)`) * 100) / 100;
test('含利息分期：本金合計等於總額、金額＝本金＋利息', () => {
  for (const method of ['annuity', 'principal', 'flat']) { const b = mk({ rate: 6, method, int: true }); assert.equal(sum(b, 'x.installment.principal'), 12000); assert.ok(sum(b, 'x.installment.interest') > 300); assert.equal(sum(b, 'x.amount'), sum(b, 'x.installment.principal+x.installment.interest')); assert.equal(b.run('state.accounts[0].balance'), -sum(b, 'x.amount')); }
  assert.equal(sum(mk({ rate: 0, int: true }), 'x.amount'), 12000);
});
test('按日計息依天數不同', () => { const b = mk({ rate: 6, method: 'principal', int: true, daily: true }); const i = b.J('state.transactions.map(x=>x.installment.interest)'); assert.equal(i[0], Math.round(12000 * 6 / 36500 * 31)); assert.equal(i[2], Math.round(10000 * 6 / 36500 * 28)); });
test('寬限期只繳利息', () => { const b = mk({ rate: 6, method: 'annuity', int: true, grace: 3 }); assert.deepEqual(b.J('state.transactions.slice(0,3).map(x=>x.installment.principal)'), [0, 0, 0]); assert.equal(sum(b, 'x.installment.principal'), 12000); });
test('提前償還本金後重算，本金總和不變、利息變少、餘額一致', () => {
  const b = mk({ rate: 6, method: 'annuity', int: true }), before = sum(b, 'x.installment.interest'); const r = b.J("instPrepay(state.transactions[2],3000,'2026-03-20')"); assert.ok(r.tx);
  assert.equal(sum(b, 'instPrincipal(x)'), 12000); assert.ok(sum(b, 'x.installment.interest') < before); assert.equal(b.run('state.accounts[0].balance'), -sum(b, 'x.amount')); assert.ok(b.J("instPrepay(state.transactions[2],99999,'2026-03-20')").error);
});
test('調息只影響這一期之後', () => { const b = mk({ rate: 2, method: 'annuity', int: true }); const a = b.J('state.transactions.slice(0,5).map(x=>x.amount)'); b.run('instRate(state.transactions[5],8)'); assert.deepEqual(b.J('state.transactions.slice(0,5).map(x=>x.amount)'), a); assert.equal(b.run('state.transactions[6].installment.rate'), 8); assert.equal(sum(b, 'x.installment.principal'), 12000); });
test('單期改金額後重算後面', () => { const b = mk({ rate: 0, int: true }); b.run("var o={...state.transactions[0]},n={...o,amount:2000};adjust(o,-1);state.transactions[0]=n;adjust(n,1);instAfterEdit(o,n)"); assert.equal(sum(b, 'x.amount'), 12000); assert.equal(b.run('state.accounts[0].balance'), -12000); });
test('提前繳清含當期利息', () => { const b = mk({ rate: 6, method: 'annuity', int: true }); b.run("instPayoff(state.transactions[2],'2026-03-20',20)"); assert.equal(b.run('state.transactions.length'), 4); assert.equal(sum(b, 'instPrincipal(x)'), 12000); assert.equal(b.run('state.accounts[0].balance'), -sum(b, 'x.amount')); });
test('尾款改分期', () => {
  const s = st(); s.transactions = [{ id: 'd', kind: 'expense', amount: 1000, account: 'c', category: 'f', date: '2026-01-01', name: '飯店', balanceTx: 'b', tags: [] }, { id: 'b', kind: 'expense', amount: 5600, account: 'c', category: 'f', date: '2026-02-01', name: '飯店', depositOf: 'd', pending: true, pendingApplied: false, tags: [] }];
  const b = bundle(s); b.run("var k=0;id=()=>'i'+(++k);var o=state.transactions[1],n={...o};delete n.pending;delete n.pendingApplied;instFromBalance(o,installmentPlan(n,6,{int:true}))");
  assert.equal(b.run('state.transactions.length'), 7); assert.equal(b.run('state.accounts[0].balance'), -5600); assert.match(b.run('depositText(state.transactions[0])'), /分期付款/); assert.equal(b.run("state.transactions.filter(x=>x.depositOf).length"), 1);
});
test('分期事件統計', () => { const b = mk({ rate: 0, int: true }); const g = b.J("instSummary('i1',state.transactions,'2026-03-15')"); assert.deepEqual([g.done, g.left, g.rest, g.next], [3, 9, 9000, '2026-04-10']); });
