// 進階設定 tests (V26.102)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 0 }, { id: 'c', name: '京东', type: 'card', currency: 'CNY', balance: 0, statement: 26, due: 15 }], categories: [{ id: 'f', name: 'F', kind: 'expense' }], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
const mk = s => { const b = bundle(s || st()); b.run("var k=0;id=()=>'i'+(++k)"); return b; };
const T = "{id:'t',kind:'expense',amount:1000,account:'a',category:'f',date:'2026-01-31',name:'n',rewards:['r'],tags:[]}";
test('無利息：計算方式、每期金額、餘額納入首末期、間隔、首次還款日', () => {
  const b = mk(), P = o => b.J(`installmentPlan(${T},3,${JSON.stringify({ how: 'round', int: true, ...o })})`);
  assert.deepEqual(P({}).list.map(x => x.amount), [334, 333, 333]); assert.deepEqual(P({ how: 'ceil', rem: 'last' }).list.map(x => x.amount), [334, 334, 332]); assert.deepEqual(P({ each: 300 }).list.map(x => x.amount), [400, 300, 300]); assert.ok(P({ each: 600 }).error); assert.deepEqual(P({ how: 'keep', int: false }).list.map(x => x.amount), [333.34, 333.33, 333.33]);
  assert.deepEqual(P({ every: 2, first: '2026-03-31' }).list.map(x => x.date), ['2026-03-31', '2026-05-31', '2026-07-31']); assert.equal(P({ post: 'remind' }).list.every(x => x.pending && x.pendingApplied === false), true); assert.deepEqual(P({ reward: 'first' }).list.map(x => !!x.rewards), [true, false, false]); assert.deepEqual(P({}).list.map(x => !!x.rewards), [true, true, true]); assert.deepEqual(P({ startNo: 3 }).list.map(x => x.installment.n), [3, 4, 5]);
});
test('月利率換成年利率；利息類型決定是否計息', () => { const b = mk(); const f = o => `instOptsFromForm({get:k=>(${JSON.stringify(o)})[k]??null})`; assert.equal(b.run(f({ instMethod: 'annuity', instRate: '0.5', instRateType: 'month' }) + '.rate'), 6); assert.equal(b.run(f({ instMethod: '', instRate: '5' }) + '.rate'), 0); const l = b.J(`installmentPlan(${T},3,${JSON.stringify({ how: 'round', int: true, rate: 6, method: 'principal' })}).list`); assert.equal(l.reduce((s, x) => s + x.installment.principal, 0), 1000); assert.ok(l[0].installment.interest > 0); });
test('代付的訂金尾款', () => {
  const b = mk(); b.run("var l=entryPostLoan(state,{direction:'receivable',amount:100,account:'a',date:'2026-11-01',person:'P',label:'代付'}).loan;var bal=loanDepositCreate(l,{amount:400,date:'2026-11-20'})"); assert.equal(b.run('state.accounts[0].balance'), -100); assert.equal(b.run('pendingVisible(bal)'), true);
  b.run("loanBalanceFinish(bal,{...bal,amount:450,date:'2026-11-21',account:'a',time:''})"); assert.equal(b.run('state.accounts[0].balance'), -550); assert.deepEqual(b.J('state.loans.map(x=>x.amount)'), [100, 450]); assert.equal(b.run('state.transactions.length'), 2); assert.equal(b.run('state.transactions[0].balanceTx===state.transactions[1].id'), true);
});
test('帳單折抵：只限 CNY／HKD，計入已繳且不再抵下一期', () => {
  const s = st(); s.accounts[1].balance = -843; s.transactions = [{ id: 'x', kind: 'expense', amount: 843, account: 'c', category: 'f', date: '2026-10-10', name: 'x' }]; const b = mk(s);
  const g = b.J("offsetTarget(acct('c'),'2026-10-31')"); assert.equal(g.period.end, '2026-10-26'); assert.equal(b.run("offsetTarget(acct('a'),'2026-10-31')"), null); assert.equal(b.run("offsetTarget(acct('c'),'2026-11-20')"), null);
  b.run("var r=offsetApply({id:'r',kind:'income',amount:150,account:'c',date:'2026-10-31',refundOf:'x',name:'r'});state.transactions.push(r);adjust(r,1)"); const p = b.J("creditStmt(acct('c'),new Date(2026,9,31),0)"); assert.deepEqual([p.spend, p.paid, p.owed], [843, 150, 693]); assert.equal(b.run("cardSpendTxs(acct('c'),'2026-10-27','2026-11-26').length"), 0);
});
