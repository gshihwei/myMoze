// 入帳方式與訂金尾款 tests (V26.67)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = () => ({ accounts: [{ id: 'b', name: '銀行', type: 'bank', balance: 9000 }], categories: [{ id: 'f', name: '住宿', kind: 'expense' }], projects: [], loans: [], budgets: [], recurring: [],
  transactions: [{ id: 'd', date: '2026-11-01', kind: 'expense', amount: 1000, account: 'b', category: 'f', name: '飯店', tags: [], merchant: 'M', project: 'p' }] });
test('入帳方式：提醒改日期、延後只設入帳日且必須晚於消費日', () => {
  const { J } = bundle(base());
  assert.equal(J("txApplyPostMode({date:'2026-11-01',pending:true},{mode:'remind',on:'2026-12-01'}).date"), '2026-12-01');
  assert.equal(J("txApplyPostMode({date:'2026-11-01'},{mode:'postpone',on:'2026-11-20'}).postDate"), '2026-11-20');
  assert.equal(J("'postDate' in txApplyPostMode({date:'2026-11-01',postDate:'x'},{mode:'postpone',on:'2026-10-20'})"), false);
  assert.equal(J("'postDate' in txApplyPostMode({date:'2026-11-01',postDate:'x'},{mode:'now'})"), false);
});
test('訂金：建立待完成尾款、沿用類別商家專案、不影響餘額', () => {
  const { run, J } = bundle(base());
  const b = J("depositSync(state.transactions[0],{on:true,amount:5000,date:'2026-12-17'})");
  assert.equal(b.pending, true); assert.equal(b.merchant, 'M'); assert.equal(b.project, 'p'); assert.equal(b.date, '2026-12-17');
  assert.equal(run('state.accounts[0].balance'), 9000); assert.equal(run('depositLabel(state.transactions[1])'), '尾款'); assert.equal(run('depositLabel(state.transactions[0])'), '訂金');
  assert.match(run('depositText(state.transactions[0])'), /6,000/);
  run("confirmPending(state.transactions[1])"); assert.equal(run('state.accounts[0].balance'), 4000); assert.match(run('depositText(state.transactions[0])'), /已於 2026-12-17/);
});
test('尾款未定、取消追蹤、刪除訂金一併刪除未付尾款、訂金未付時尾款不顯示', () => {
  const { run, J } = bundle(base());
  const b = J("depositSync(state.transactions[0],{on:true,amount:'',date:''})"); assert.ok(b.amountTbd && b.dateTbd);
  assert.equal(run('pendingVisible(state.transactions[1])'), true);
  run('state.transactions[0].pending=true'); assert.equal(run('pendingVisible(state.transactions[1])'), false); run('state.transactions[0].pending=false');
  run('depositSync(state.transactions[0],{on:false})'); assert.equal(run('state.transactions.length'), 1);
  run("depositSync(state.transactions[0],{on:true,amount:5})"); run('var d0=state.transactions[0];state.transactions=state.transactions.slice(1);txAfterDelete(d0)'); assert.equal(run('state.transactions.length'), 0);
});
test('收入、分期、週期不能開訂金追蹤', () => {
  const { run } = bundle(base());
  assert.equal(run("depositAllowed({kind:'income'})"), false); assert.equal(run("depositAllowed({kind:'expense',installment:{}})"), false); assert.equal(run("depositAllowed({kind:'transfer'})"), true);
});
