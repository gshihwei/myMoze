// 退款 tests (V26.66)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = () => ({ accounts: [{ id: 'c', name: '卡', type: 'card', balance: -1000, limit: 9999, statement: 15, due: 5 }, { id: 'b', name: '銀行', type: 'bank', balance: 0 }], categories: [{ id: 'f', name: '飲食', kind: 'expense' }], projects: [], loans: [], budgets: [], recurring: [],
  transactions: [{ id: 't', date: '2026-11-01', kind: 'expense', amount: 1000, account: 'c', category: 'f', name: '鞋子', tags: [] }] });
test('退款：部分退款、連結原記錄、餘額與帳單扣減、不可超退', () => {
  const { run, J } = bundle(base());
  assert.ok(J("refundCreate(state.transactions[0],{amount:300,account:'c',date:'2026-11-05'})").tx);
  assert.equal(run('state.accounts[0].balance'), -700); assert.equal(run('refundLeft(state.transactions[0])'), 700);
  assert.equal(run("cardSpendSum(cardSpendTxs(state.accounts[0],'2026-10-16','2026-11-15'))"), 700);
  assert.ok(J("refundCreate(state.transactions[0],{amount:701,account:'c',date:'2026-11-05'})").error);
  run("refundCreate(state.transactions[0],{amount:700,account:'b',date:'2026-11-06'})");
  assert.equal(run('state.accounts[1].balance'), 700); assert.equal(run('refundable(state.transactions[0])'), false);
  assert.equal(J('state.categories').filter(c => c.name === '退款').length, 1);
});
test('拆帳只能退單一子項目', () => {
  const s = base(); s.transactions[0].splits = [{ category: 'f', amount: 400 }, { category: 'f', amount: 600 }];
  const { run, J } = bundle(s);
  assert.ok(J("refundCreate(state.transactions[0],{amount:500,account:'b',date:'2026-11-05',split:0})").error);
  assert.ok(J("refundCreate(state.transactions[0],{amount:400,account:'b',date:'2026-11-05',split:0})").tx); assert.equal(run('refundLeft(state.transactions[0],1)'), 600);
});
test('分期全數退款：退到這一期並移除未來分期', () => {
  const s = base(); s.transactions = [1, 2, 3].map(n => ({ id: 'i' + n, date: `2026-1${n - 1}-01`, kind: 'expense', amount: 100, account: 'c', category: 'f', name: 'x', installment: { group: 'g', n, total: 3, amount: 300 } })); s.accounts[0].balance = -300;
  const { run, J } = bundle(s);
  const r = J("refundInstallment(state.transactions[1],'all',{account:'c',date:'2026-11-05'})"); assert.equal(r.amount, 200); assert.equal(r.removed, 1);
  assert.equal(run('state.accounts[0].balance'), 0);
});
test('分期不會重複帶手續費欄位', () => {
  const { J } = bundle(base());
  const p = J("installmentPlan({kind:'expense',amount:105,fee:5,feeIncluded:true,date:'2026-11-01',name:'x',id:'q'},3)").list;
  assert.equal(p.reduce((a, x) => a + x.amount, 0), 105); assert.ok(p.every(x => x.fee === undefined && !x.feeIncluded));
});
