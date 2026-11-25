// 借還款補齊 tests (V26.93)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 1000 }, { id: 'c', name: 'C', type: 'card', balance: 0, fxFeePct: 1.5, fxFeeRefund: true, fxFeeRound: 'floor' }], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
const mk = s => { const b = bundle(s || st()); b.run("var k=0;id=()=>'i'+(++k)"); return b; };
test('週期應收：每期一筆借款，重跑不重複', () => {
  const b = mk(); const r = b.J("loanFromEntry({ev:'recurring',direction:'receivable',amount:100,account:'a',date:'2026-09-10',person:'P',label:'代付',rec:{freq:'month',endType:'never',auto:true}})"); assert.equal(r.rule.loan.person, 'P');
  assert.equal(b.run("autoPostRecurring('2026-11-25')"), 3); assert.equal(b.run('state.loans.length'), 3); assert.equal(b.run('state.accounts[0].balance'), 700); assert.equal(b.run("autoPostRecurring('2026-11-25')"), 0);
  b.run("state.recurring[0].next='2026-11-10';state.recurring[0].seq=2"); b.run("autoPostRecurring('2026-11-25')"); assert.equal(b.run('state.loans.length'), 3);
});
test('借款分期與既有欠款分期', () => { const b = mk(); const r = b.J("loanFromEntry({ev:'inst',direction:'payable',amount:1200,account:'a',date:'2026-11-01',person:'銀行',label:'信貸',inst:{n:12,rate:2,method:'annuity'}})"); assert.deepEqual([r.loan.inst.n, r.loan.inst.next], [12, '2026-12-01']); assert.equal(b.run('state.accounts[0].balance'), 2200); const e = b.J("loanFromEntry({ev:'inst',existing:true,direction:'payable',amount:900,date:'2026-11-01',person:'x',label:'車貸',inst:{n:18,startNo:7,rate:0,next:'2026-12-05'}})"); assert.equal(e.loan.inst.n, 24); assert.equal(b.run('state.accounts[0].balance'), 2200); });
test('代刷分期：N 筆應收、未開始、全數退款', () => {
  const b = mk(); b.run("loanFromEntry({ev:'inst',direction:'receivable',amount:1000,account:'c',date:'2026-10-05',person:'P',label:'代付',inst:{n:3,type:'card'}})");
  assert.deepEqual(b.J('state.loans.map(l=>l.amount)'), [334 + 0, 333, 333].map((v, i) => i ? 333 : 334)); assert.equal(b.run('state.accounts[1].balance'), -1000); assert.equal(b.run("loanNotStarted(state.loans[2],'2026-11-25')"), true);
  b.run("loanPay(state.loans[0],334,'a','2026-10-20','')"); const r = b.J("loanRefund(state.loans[1],true,'2026-11-20')"); assert.deepEqual(r, { back: 667, removed: 1 });
  assert.equal(b.run('state.accounts[1].balance'), 0); assert.equal(b.run("state.loans.find(l=>l.label==='退款應還').amount"), 334); assert.equal(b.run('state.accounts[0].balance'), 1334);
});
test('多筆收款不足視為結清', () => { const b = mk(); for (const i of [1, 2]) b.run(`entryPostLoan(state,{direction:'receivable',amount:100,account:'a',date:'2026-11-0${i}',person:'P'})`); b.run("loanPayMany(state.loans.map(l=>l.id),150,'a','2026-11-20','settle')"); assert.deepEqual(b.J('state.loans.map(loanStatus)'), ['completed', 'stopped']); });
test('改名／合併', () => { const s = st(); s.transactions = [{ id: 1, name: 'a', merchant: '7-11', tags: ['x', 'y'], kind: 'expense', amount: 1, account: 'a', date: '2026-01-01' }, { id: 2, name: 'a', merchant: '統一', tags: ['z'], kind: 'expense', amount: 1, account: 'a', date: '2026-01-01' }]; const b = mk(s); assert.equal(b.run("dataRename('merchant','7-11','統一')"), 1); assert.deepEqual(b.J("dataList('merchant')"), [['統一', 2]]); b.run("dataRename('tags','x','y')"); assert.deepEqual(b.J('state.transactions[0].tags'), ['y']); assert.equal(b.run("dataRename('name','a','')"), 0); });
test('國外手續費：捨去、退款按比例', () => { const s = st(); s.transactions = [{ id: 't', kind: 'expense', amount: 1000, account: 'c', date: '2026-11-01', name: 'n' }]; const b = mk(s); assert.equal(b.run("fxFeeAmount(state.accounts[1],999)"), 14); b.run("fxFeeCreate(state.transactions[0]);refundCreate(state.transactions[0],{amount:500,account:'c',date:'2026-11-05'})"); const f = b.J("state.transactions.filter(x=>x.refundOf!==undefined).map(x=>x.amount)"); assert.deepEqual(f, [500, 8]); });
