// 借還款進階 tests (V26.78)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = () => ({ accounts: [{ id: 'b', name: '銀行', type: 'bank', balance: 10000 }, { id: 'c', name: '卡', type: 'card', balance: 0, statement: 15, due: 5 }], categories: [{ id: 'x', name: '其他', kind: 'expense', icon: 'x' }], projects: [], budgets: [], recurring: [], transactions: [], loans: [] });
const L = 'state.loans[0]', bal = b => b.run('state.accounts[0].balance');
const lend = (b, n) => b.run(`entryPostLoan(state,{direction:'receivable',amount:${n},account:'b',date:'2026-11-01',person:'Alan',label:'代付'})`);
test('超收：繼續追蹤變成反向應付；視為結清記為收入', () => {
  let b = bundle(base()); lend(b, 1000); b.run(`loanSettle(${L},{amount:1200,account:'b',date:'2026-11-02',over:'track'})`);
  assert.equal(bal(b), 10200); assert.equal(b.run(`loanStatus(${L})`), 'completed'); assert.deepEqual(b.J('[state.loans[1].direction,state.loans[1].amount]'), ['payable', 200]);
  b = bundle(base()); lend(b, 1000); b.run(`loanSettle(${L},{amount:1200,account:'b',date:'2026-11-02',over:'settle'})`); assert.equal(bal(b), 10200); assert.equal(b.run('state.loans.length'), 1); assert.equal(b.run('state.transactions.at(-1).kind'), 'income');
});
test('不足：視為結清會停止追蹤', () => { const b = bundle(base()); lend(b, 1000); b.run(`loanSettle(${L},{amount:400,account:'b',date:'2026-11-02',under:'settle'})`); assert.equal(b.run(`loanStatus(${L})`), 'stopped'); assert.equal(b.run(`loanOutstanding(${L})`), 600); });
test('轉成支出：帳戶不變、應收結清、多一筆支出', () => { const b = bundle(base()); lend(b, 1000); const v = bal(b); assert.ok(b.J(`loanWriteOff(${L},{account:'b',date:'2026-11-02',category:'x'})`).tx); assert.equal(bal(b), v); assert.equal(b.run(`loanStatus(${L})`), 'completed'); assert.equal(b.run("monthStats('2026-11').out"), 1000); });
test('既有款項不動帳戶；健檢不誤報；還款會動', () => {
  const b = bundle(base()); b.run("loanCreateExisting({direction:'payable',amount:5000,person:'銀行',date:'2026-11-01'})"); assert.equal(bal(b), 10000); assert.ok(!b.J('healthCheck()').some(i => i.key === 'txAccount'));
  b.run(`loanPay(${L},1000,'b','2026-11-02','')`); assert.equal(bal(b), 9000); b.run(`removeLoan(${L})`); assert.equal(bal(b), 10000);
});
test('多筆收款、對象改名、不納入總額', () => {
  const b = bundle(base()); b.run("var uq=0;crypto.randomUUID=()=>'u'+(++uq)"); lend(b, 300); lend(b, 200); assert.deepEqual(b.J("loanPayMany(state.loans.map(l=>l.id),400,'b','2026-11-03')"), { n: 2, left: 0 }); assert.equal(b.run('loanNetSummary().receivable'), 100);
  assert.ok(b.run("personRename('Alan','艾倫')") >= 4); assert.equal(b.run("personHistory('艾倫').length"), 4); b.run('state.loans.forEach(l=>l.excludeNet=true)'); assert.equal(b.run('loanNetSummary().receivable'), 0);
});
test('分期還款：本金利息、提前償還後重算、寬限期、最後一期結清', () => {
  const b = bundle(base()); b.run("loanCreateExisting({direction:'payable',amount:1200,person:'車貸',date:'2026-11-01'})"); b.run(`loanInstSet(${L},{n:3,startNo:10,rate:12,method:'principal',next:'2026-11-30'})`);
  assert.deepEqual(b.J(`loanInstNext(${L})`), { no: 10, date: '2026-11-30', principal: 400, interest: 12 });
  b.run(`loanInstPay(${L},'b','2026-11-30')`); assert.equal(bal(b), 9588); assert.equal(b.run(`${L}.inst.next`), '2026-12-30');
  b.run(`loanPay(${L},400,'b','2026-12-01','')`); assert.equal(b.J(`loanInstNext(${L})`).principal, 200); b.run(`loanInstPay(${L},'b','2026-12-30')`); b.run(`loanInstPay(${L},'b','2027-01-30')`); assert.equal(b.run(`loanStatus(${L})`), 'completed'); assert.equal(b.run(`loanInstNext(${L})`), null);
});
test('信用卡代付：算進帳單；應付不能用信用卡', () => {
  const b = bundle(base()); assert.ok(b.J("entryPostLoan(state,{direction:'receivable',amount:500,account:'c',date:'2026-11-01',person:'A'})").loan); assert.equal(b.run("cardSpendSum(cardSpendTxs(state.accounts[1],'2026-10-16','2026-11-15'))"), 500); assert.equal(b.run('state.accounts[1].balance'), -500);
  assert.ok(b.J("entryPostLoan(state,{direction:'payable',amount:500,account:'c',date:'2026-11-01'})").error);
});
