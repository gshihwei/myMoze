// 記帳欄位 tests (V26.89)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 0 }, { id: 'j', name: 'J', type: 'foreign', currency: 'JPY', balance: 0 }], categories: [{ id: 'f', name: 'F', kind: 'expense' }], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
const T = "{id:'t',kind:'expense',amount:599,account:'a',category:'f',date:'2026-11-20',name:'電話',project:'p',tags:['x'],note:'n',time:'08:00'}";
test('日期文字', () => { const b = bundle(st()); assert.equal(b.run("efDateText('2026-11-25','2026-11-25')"), '今天 (週三)'); assert.equal(b.run("efDateText('2026-11-24','2026-11-25')"), '昨天 (週二)'); assert.equal(b.run("efDateText('2026-11-10','2026-11-25')"), '2026/11/10 (週二)'); });
test('從記帳建立週期：起始期數＋剩餘次數，入帳帶入專案標籤', () => {
  const b = bundle(st()); b.run(`var r=recurringFromTx(${T},{freq:'month',interval:1,startNo:6,endType:'count',endValue:18,auto:true}).rule;state.recurring.push(r)`);
  assert.deepEqual(b.J('[r.seq,r.end.value,r.next]'), [5, 23, '2026-11-20']); assert.equal(b.run("autoPostRecurring('2026-11-25')"), 1); const t = b.J('state.transactions[0]'); assert.deepEqual([t.recurringSeq, t.project, t.tags, t.note, t.time, t.amount], [6, 'p', ['x'], 'n', '08:00', 599]); assert.equal(b.run('state.accounts[0].balance'), -599);
});
test('遇非工作日', () => { const b = bundle(st()); assert.equal(b.run("recurringPostDate({adjust:'next'},'2026-11-21')"), '2026-11-23'); assert.equal(b.run("recurringPostDate({adjust:'prev'},'2026-11-22')"), '2026-11-20'); assert.equal(b.run("recurringPostDate({},'2026-11-22')"), '2026-11-22'); b.run(`state.recurring.push(recurringFromTx(${T.replace('11-20', '11-21')},{freq:'month',endType:'never',auto:true,adjust:'prev'}).rule)`); assert.equal(b.run("autoPostRecurring('2026-11-20')"), 1); assert.equal(b.run('state.transactions[0].date'), '2026-11-20'); });
test('錯誤：次數、外幣轉帳、拆帳', () => { const b = bundle(st()); assert.ok(b.J(`recurringFromTx(${T},{endType:'count',endValue:0})`).error); assert.ok(b.J(`recurringFromTx({...${T},kind:'transfer',toAccount:'j'},{endType:'never'})`).error); assert.ok(b.J(`recurringFromTx({...${T},splits:[{}]},{endType:'never'})`).error); });
