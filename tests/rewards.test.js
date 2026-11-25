// 紅利回饋 tests (V26.75)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const rule = x => ({ id: 'r', name: '網購', mode: 'pct', value: 2, period: 'month', timing: 'manual', ...x });
const tx = (id, date, amount, x) => ({ id, date, amount, kind: 'expense', account: 'c', category: 'f', name: id, rewards: ['r'], ...x });
const base = (rules, txs) => ({ accounts: [{ id: 'c', name: '卡', type: 'card', balance: 0, statement: 15, due: 5, rewards: rules }, { id: 'p', name: '點', type: 'ewallet', balance: 0 }], categories: [{ id: 'f', name: '飲食', kind: 'expense' }], projects: [], loans: [], budgets: [], recurring: [], transactions: txs });
const S = "rewardStats(state.accounts[0].rewards[0],state.accounts[0],rewardPeriod(state.accounts[0].rewards[0],state.accounts[0],'2026-11-10'))";
test('三種方式與進位', () => {
  const { run } = bundle(base([], []));
  assert.equal(run("rewardUnit({mode:'ratio',value:1,per:15},3000)"), 200); assert.equal(run("rewardUnit({mode:'pct',value:2},150)"), 3); assert.equal(run("rewardUnit({mode:'fixed',value:15,minSingle:100},99)"), 0);
  assert.equal(run("rewardRound(1.999,'floorInt',2)"), 1); assert.equal(run("rewardRound(1.235,'round',2)"), 1.24); assert.equal(run("rewardRound(0.1+0.2,'ceil',1)"), 0.3); assert.equal(run("rewardRound(1.2345,'',0)"), 1.2345);
});
test('單筆捨去再加總、上限與還可消費、退款扣除', () => {
  const s = base([rule({ roundEach: 'floorInt', cap: 150 })], [tx('a', '2026-11-01', 199), tx('b', '2026-11-02', 1000), tx('z', '2026-10-31', 999)]);
  const { J, run } = bundle(s), r = J(S); assert.equal(r.total, 23); assert.equal(r.spend, 1199); assert.equal(r.capLeft, 127); assert.equal(r.spendLeft, 6350);
  run("refundCreate(state.transactions[1],{amount:500,account:'c',date:'2026-11-03'})"); assert.equal(J(S).total, 13);
});
test('門檻：累積、單筆、次數', () => {
  assert.equal(bundle(base([rule({ minTotal: 2000 })], [tx('a', '2026-11-01', 1500)])).J(S).minLeft, 500); assert.equal(bundle(base([rule({ minTotal: 2000 })], [tx('a', '2026-11-01', 1500)])).J(S).total, 0);
  const r = bundle(base([rule({ minSingle: 100, minCount: 2 })], [tx('a', '2026-11-01', 99), tx('b', '2026-11-01', 100)])).J(S); assert.equal(r.countLeft, 1); assert.equal(r.spend, 100);
});
test('共同上限', () => {
  const s = base([rule({ value: 3, cap: 50, capGroup: 'g' }), rule({ id: 'q', value: 3, cap: 50, capGroup: 'g' })], [tx('a', '2026-11-01', 1000, { rewards: ['r', 'q'] })]);
  const { J } = bundle(s); assert.equal(J(S).total, 30); assert.equal(J("rewardStats(state.accounts[0].rewards[1],state.accounts[0],{start:'2026-11-01',end:'2026-11-30'}).total"), 20);
});
test('區間：帳單、整月（入帳日）、活動', () => {
  const { J } = bundle(base([], [])); const c = 'state.accounts[0]';
  assert.deepEqual(J(`rewardPeriod({period:'stmt'},${c},'2026-11-16')`), { start: '2026-11-16', end: '2026-12-15' }); assert.deepEqual(J(`rewardPeriod({period:'month'},${c},'2026-02-10')`), { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(J("rewardTxDate({period:'month',basis:'post'},{date:'2026-11-30',postDate:'2026-12-02'})"), '2026-12-02');
});
test('自動入帳：區間結束、當下交易後；不重複；手動取得後剩餘歸零', () => {
  let b = bundle(base([rule({ timing: 'end', payMonth: 1, payDay: 10, account: 'p', roundTotal: 'round' })], [tx('a', '2026-11-01', 1000)]));
  assert.equal(b.run("rewardRun('2026-12-09')"), 0); assert.equal(b.run("rewardRun('2026-12-10')"), 1); assert.equal(b.run("rewardRun('2026-12-11')"), 0); assert.equal(b.run('state.accounts[1].balance'), 20); assert.equal(b.run('state.transactions.at(-1).date'), '2026-12-10');
  b = bundle(base([rule({ timing: 'now', days: 2, cap: 25 })], [tx('a', '2026-11-01', 1000), tx('b', '2026-11-02', 1000)]));
  assert.equal(b.run("rewardRun('2026-11-03')"), 1); assert.equal(b.run("rewardRun('2026-11-30')"), 1); assert.equal(b.run('state.accounts[0].balance'), 25); assert.equal(b.run("rewardRun('2026-12-30')"), 0);
  b = bundle(base([rule()], [tx('a', '2026-11-01', 1000)])); b.run("rewardPost(state.accounts[0].rewards[0],state.accounts[0],{start:'2026-11-01',end:'2026-11-30'},20,{date:'2026-11-20'})"); assert.equal(b.J(S).left, 0); assert.equal(b.run("rewardRun('2027-01-01')"), 0);
});
test('預設帶入：基本回饋與上次同類別', () => {
  const s = base([rule({ base: true }), rule({ id: 'q' }), rule({ id: 'old', base: true, end: '2026-01-01' })], [tx('a', '2026-11-01', 10, { rewards: ['q'] })]);
  assert.deepEqual(bundle(s).J("rewardDefaults(state.accounts[0],'f','2026-11-25')"), ['r', 'q']); assert.deepEqual(bundle(s).J("rewardDefaults(state.accounts[0],'x','2026-11-25')"), ['r']);
  assert.ok(bundle(s).J("rewardValidate({name:'x',value:1,mode:'ratio'})").error);
});
