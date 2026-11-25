// 額度共用／合併繳款／自動扣繳／調整結帳日 tests (V26.73)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const card = (id, x) => ({ id, name: id, type: 'card', balance: 0, limit: 1000, statement: 15, due: 5, bank: '玉山', ...x });
const tx = (id, account, date, amount, x) => ({ id, account, date, amount, kind: 'expense', name: id, ...x });
const base = () => ({ accounts: [card('c', { balance: -300 }), card('d', { balance: -200, limit: 5000 }), { id: 'b', name: '銀行', type: 'bank', balance: 1000 }], categories: [], projects: [], loans: [], budgets: [], recurring: [], transactions: [tx('t', 'c', '2026-11-01', 300), tx('u', 'd', '2026-11-02', 200)] });
const D = "new Date(2026,10,25)";
test('額度共用：合計已用、取最高額度', () => {
  const s = base(); const { J } = bundle(s); assert.equal(J('creditUsage(state.accounts[0]).available'), 700);
  s.accounts[0].shareLimit = s.accounts[1].shareLimit = true; const u = bundle(s).J('creditUsage(state.accounts[0])'); assert.equal(u.limit, 5000); assert.equal(u.used, 500); assert.equal(u.available, 4500);
});
test('合併繳款自動分配', () => {
  const { J, run } = bundle(base()); const cs = 'state.accounts.slice(0,2)';
  assert.equal(run(`bankOwed(${cs},${D},0)`), 500); const p = J(`bankPayPlan(${cs},${D},0,350)`); assert.deepEqual(p.list.map(x => x.amount), [300, 50]); assert.equal(p.left, 0); assert.equal(J(`bankPayPlan(${cs},${D},0,600).left`), 100);
  run(`bankPayPlan(${cs},${D},0,350).list.forEach(x=>cardPayCreate(x.card,x.period,state.accounts[2],x.amount))`);
  assert.equal(run('state.accounts[2].balance'), 650); assert.equal(run('state.accounts[0].balance'), 0); assert.equal(run(`bankOwed(${cs},${D},0)`), 150);
});
test('自動扣繳：對帳完成且餘額足夠、到期才扣、不重複、不補扣開啟前的帳單', () => {
  const s = base(); Object.assign(s.accounts[0], { autoPay: true, payFrom: 'b', autoPaySince: '2026-11-25' }); const { run } = bundle(s);
  assert.equal(run("autoPayReason(state.accounts[0],0,'2026-12-05')"), '尚未完成對帳'); assert.equal(run("autoPayRun('2026-12-05')"), 0);
  run('state.transactions[0].recon=true'); assert.equal(run("autoPayRun('2026-12-04')"), 0); assert.equal(run("autoPayRun('2026-12-05')"), 1); assert.equal(run("autoPayRun('2026-12-06')"), 0);
  assert.equal(run('state.accounts[2].balance'), 700); assert.equal(run('state.transactions.at(-1).date'), '2026-12-05');
  const s2 = base(); Object.assign(s2.accounts[0], { autoPay: true, payFrom: 'b', autoPaySince: '2026-12-06' }); s2.transactions[0].recon = true; assert.equal(bundle(s2).run("autoPayRun('2026-12-05')"), 0);
  const s3 = base(); Object.assign(s3.accounts[0], { autoPay: true, payFrom: 'b', autoPaySince: '2026-11-25' }); s3.accounts[2].balance = 10; s3.transactions[0].recon = true; assert.equal(bundle(s3).run("autoPayReason(state.accounts[0],0,'2026-12-05')"), '扣繳帳戶餘額不足');
});
test('調整本期結帳日：只影響一期、繳款仍歸同一期、可還原、範圍檢查', () => {
  const { run, J } = bundle(base()); const c = 'state.accounts[0]';
  run(`cardPayCreate(${c},cardPeriod(${c},${D},0),state.accounts[2],100)`);
  assert.equal(J(`stmtAdjust(${c},${D},0,'2026-11-17','once')`).period.end, '2026-11-17');
  assert.equal(J(`cardPeriod(${c},${D},0)`).end, '2026-11-17'); assert.equal(J(`cardPeriod(${c},${D},-1)`).end, '2026-10-15'); assert.equal(J(`stmtRange(${c},2026,11)`).start, '2026-11-18');
  assert.equal(J(`creditStmt(${c},${D},0).paid`), 100);
  assert.ok(J(`stmtAdjust(${c},${D},0,'2026-10-10','once')`).error);
  run(`stmtAdjust(${c},${D},0,'','once')`); assert.equal(J(`cardPeriod(${c},${D},0)`).end, '2026-11-15'); assert.equal(J(`creditStmt(${c},${D},0).paid`), 100);
  run(`stmtAdjust(${c},${D},0,'2026-11-20','all')`); assert.equal(run(`${c}.statement`), 20);
});
test('合併對帳涵蓋該銀行所有卡', () => {
  const { J, run } = bundle(base()); run("Object.assign(reconSt(),{card:'c',cards:['c','d'],offset:0,order:'asc'})");
  assert.ok(J('reconAll(reconSt()).length') <= 2);
});
