// 跨幣種／自訂幣種 tests (V26.68)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = () => ({ accounts: [{ id: 'c', name: '卡', type: 'card', balance: 0, fxFeePct: 1.5 }, { id: 'lp', name: 'LINE', type: 'ewallet', balance: 100, currency: 'LP', curRate: 1, curBase: 'TWD', curSym: 'P', curDigits: 0 }, { id: 'm', name: '哩', type: 'ewallet', balance: 1, currency: 'MILE', curRate: 0.02, curBase: 'USD' }], categories: [], projects: [], loans: [], budgets: [], recurring: [], transactions: [] });
const fx = r => r("fxCache={rates:{USD:0.03125,JPY:5},fetchedAt:1}");
test('換算：線上匯率、手動金額、缺匯率', () => {
  const { run, J } = bundle(base()); fx(run);
  assert.deepEqual(J("fxFromForm(10,{cur:'USD',acctCur:'TWD',auto:true})"), { amount: 320, orig: { cur: 'USD', amount: 10, rate: 32, auto: true } });
  assert.equal(J("fxFromForm(10,{cur:'USD',acctCur:'TWD',auto:false,conv:325}).amount"), 325);
  assert.deepEqual(J("fxFromForm(10,{cur:'TWD',acctCur:'TWD'})"), { amount: 10 });
  assert.ok(J("fxFromForm(10,{cur:'EUR',acctCur:'TWD',auto:true})").error); assert.ok(J("fxFromForm(10,{cur:'USD',acctCur:'TWD',auto:false,conv:''})").error);
});
test('自訂幣種：換算、基準幣種、符號', () => {
  const { run } = bundle(base()); fx(run);
  assert.equal(run("toTWD(100,'LP')"), 100); assert.equal(Math.round(run("toTWD(1000,'MILE')")), 640);
  assert.equal(run("curText(1234.6,'LP')"), 'P1,235'); assert.equal(run("acctMoney(5,state.accounts[1])"), 'P5');
});
test('國外交易手續費：建立同卡同日的手續費記錄', () => {
  const { run, J } = bundle(base());
  const x = J("fxFeeCreate({id:'t',kind:'expense',amount:1000,account:'c',date:'2026-11-01',name:'x'})");
  assert.equal(x.amount, 15); assert.equal(x.feeOf, 't'); assert.equal(run('state.accounts[0].balance'), -15); assert.equal(run("fxFeeCreate({kind:'income',amount:1000,account:'c'})"), null);
});
