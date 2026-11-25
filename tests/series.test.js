// 週期與分期進階 tests (V26.79)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = x => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 1000 }, { id: 'b', name: 'B', type: 'bank', balance: 0 }], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [], ...x });
const form = o => `({get:k=>(${JSON.stringify(o)})[k]??null,getAll:k=>(${JSON.stringify(o)})[k]||[]})`;
test('每週多天：下一天、跨週、每兩週', () => {
  const { run } = bundle(base()); const n = (d, i) => run(`addPeriod('${d}',{freq:'week',interval:${i || 1},days:[0,6],start:'2026-11-01'})`);
  assert.equal(n('2026-11-01'), '2026-11-07'); assert.equal(n('2026-11-07'), '2026-11-08'); assert.equal(n('2026-11-07', 2), '2026-11-15'); assert.equal(run("addPeriod('2026-11-01',{freq:'week',interval:1,start:'2026-11-01'})"), '2026-11-08');
});
test('起始期數與剩餘次數；多天不支援', () => {
  const { run, J } = bundle(base()); const r = J(`(()=>{const r={freq:'month',start:'2026-11-20',next:'2026-11-20',end:{type:'count',value:18},seq:0,account:'a',kind:'expense'};recurringFromForm(r,${form({ rstartno: '6' })},true);return r})()`);
  assert.equal(r.seq, 5); assert.equal(r.end.value, 23); assert.match(run(`recurringLabel(${JSON.stringify(r)})`), /#6 \/ 共 23/);
  assert.ok(run(`recurringFromForm({freq:'week',start:'2026-11-01',next:'2026-11-01',end:{type:'never'}},${form({ rstartno: '3', rdays: ['1'] })},true)`));
});
test('週期轉帳入帳會動兩個帳戶', () => {
  const { run } = bundle(base({ recurring: [{ id: 'r', kind: 'transfer', freq: 'month', start: '2026-11-01', next: '2026-11-01', account: 'a', toAccount: 'b', amount: 300, name: '存錢' }] }));
  run('postRecurring(state.recurring[0])'); assert.equal(run('state.accounts[0].balance'), 700); assert.equal(run('state.accounts[1].balance'), 300);
});
test('套用到未來週期、終止未來週期', () => {
  const tx = (i, d) => ({ id: i, kind: 'expense', date: d, amount: 10, account: 'a', name: 'x', category: '', recurringId: 'r' });
  const { run } = bundle(base({ recurring: [{ id: 'r', kind: 'expense', freq: 'month', start: '2026-09-01', next: '2026-12-01', account: 'a', amount: 10, name: 'x' }], transactions: [tx('1', '2026-09-01'), tx('2', '2026-10-01'), tx('3', '2026-11-01')] }));
  run("Object.assign(state.transactions[1],{amount:20,name:'新'});recurringApplyFrom(state.transactions[1])"); assert.equal(run('state.recurring[0].amount'), 20); assert.equal(run('recurringStop(state.transactions[1])'), 1); assert.equal(run('state.accounts[0].balance'), 1010); assert.equal(run('recurringEnded(state.recurring[0])'), true);
});
test('分期：整數、餘額末期、起始期數', () => {
  const { J } = bundle(base()); const p = J("installmentPlan({id:'t',kind:'expense',date:'2026-11-01',amount:1000,name:'x'},3,{int:true,rem:'last',startNo:4}).list");
  assert.deepEqual(p.map(x => x.amount), [333, 333, 334]); assert.deepEqual(p.map(x => x.name), ['x（4/6）', 'x（5/6）', 'x（6/6）']);
});
test('提前繳清與終止：餘額一致', () => {
  const mk = () => base({ transactions: [1, 2, 3].map(n => ({ id: 'i' + n, kind: 'expense', date: `2026-1${n - 1}-01`, amount: 100, account: 'a', name: `x（${n}/3）`, category: '', installment: { group: 'g', n, total: 3, amount: 300 } })) });
  let b = bundle(mk()); assert.equal(b.J("instPayoff(state.transactions[0],'2026-11-25')").amount, 200); assert.equal(b.run('state.accounts[0].balance'), 1000); assert.equal(b.run('state.transactions.length'), 2);
  b = bundle(mk()); b.run('instStop(state.transactions[0])'); assert.equal(b.run('state.accounts[0].balance'), 1200);
  b = bundle(mk()); b.run("state.transactions[0].account='b';instApply(state.transactions[0])"); assert.equal(b.run('state.accounts[0].balance'), 1200); assert.equal(b.run('state.accounts[1].balance'), -200);
});
