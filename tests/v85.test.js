// 轉帳費用、餘額調整固定 tests (V26.85)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = txs => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 1000 }, { id: 'b', name: 'B', type: 'bank', balance: 0 }, { id: 'j', name: 'J', type: 'foreign', currency: 'JPY', balance: 0 }], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: txs || [] });
test('轉出／轉入的手續費與折扣', () => {
  const b = bundle(st()); const f = b.J("transferFields(100,'a','b','',15,{discount:5,toFee:3,toDiscount:1})");
  assert.deepEqual([f.balanceEffect, f.toBalanceEffect, f.fee, f.discount, f.toFee, f.toDiscount], [-110, 98, 15, 5, 3, 1]);
  b.run("var t={id:'t',kind:'transfer',amount:100,account:'a',toAccount:'b',date:'2026-11-01'};Object.assign(t,transferFields(100,'a','b','',15,{discount:5,toFee:3,toDiscount:1}));adjust(t,1)");
  assert.deepEqual(b.J('state.accounts.map(x=>x.balance)'), [890, 98, 0]); b.run('adjust(t,-1)'); assert.deepEqual(b.J('state.accounts.map(x=>x.balance)'), [1000, 0, 0]);
  const g = b.J("transferFields(100,'a','j','450',0,{toFee:50})"); assert.deepEqual([g.toAmount, g.toBalanceEffect], [450, 400]); assert.ok(b.J("transferFields(100,'a','b','',0,{toFee:101})").error); assert.equal(b.run("transferFields(100,'a','b','',0).toBalanceEffect"), undefined);
});
test('餘額調整之前補記，調整點後的餘額不變', () => {
  const b = bundle(st()); b.run("nowTime=()=>'12:00';var p=acctAdjustTo(state.accounts[0],900)"); assert.equal(b.run('p.amount'), -100);
  b.run("var t={id:'x1',kind:'expense',amount:30,account:'a',date:'2020-01-01',time:''};state.transactions.push(t);adjust(t,1)");
  assert.equal(b.run('state.accounts[0].balance'), 900); assert.equal(b.run('p.amount'), -70); b.run('adjust(t,-1)'); assert.equal(b.run('p.amount'), -100); assert.equal(b.run('state.accounts[0].balance'), 900);
  b.run("var u={id:'x2',kind:'expense',amount:30,account:'a',date:'2099-01-01',time:''};state.transactions.push(u);adjust(u,1)"); assert.equal(b.run('state.accounts[0].balance'), 870); assert.equal(b.run('p.amount'), -100);
  assert.equal(b.run('ledgerEffects(p).length'), 1);
});
test('調整到過去某天的餘額', () => { const b = bundle(st([{ id: 'z', kind: 'expense', amount: 200, account: 'a', date: '2026-05-05', time: '' }])); assert.equal(b.run("pinBalanceAt(state.accounts[0],'2026-05-04')"), 1200); b.run("var p=acctAdjustTo(state.accounts[0],1300,'2026-05-04')"); assert.equal(b.run('p.amount'), 100); assert.equal(b.run('state.accounts[0].balance'), 1100); });
