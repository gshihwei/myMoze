// 拆帳進階 tests (V26.83)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 1000 }, { id: 'p', name: '點數', type: 'ewallet', balance: 100 }, { id: 'j', name: 'J', type: 'foreign', currency: 'JPY', balance: 9000 }], categories: [{ id: 'f', name: 'F', kind: 'expense' }, { id: 'g', name: 'G', kind: 'expense' }], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
const T = "{id:'t',kind:'expense',amount:300,account:'a',category:'f',date:'2026-11-01',name:'n',person:'',project:'',tags:[],time:''}";
test('不同帳戶 → 各自一筆，餘額正確', () => {
  const b = bundle(st()); b.run(`var t=${T};var r=[{category:'f',amount:250},{category:'g',amount:50,account:'p'}]`);
  assert.equal(b.run('splitNeedsGroup(t,r)'), true); b.run('splitGroupSave(splitGroupPlan(t,r))');
  assert.deepEqual(b.J('state.accounts.map(x=>x.balance)'), [750, 50, 9000]); assert.deepEqual(b.J('state.transactions.map(x=>[x.amount,x.category,x.splitGroup.n])'), [[250, 'f', 1], [50, 'g', 2]]);
});
test('同帳戶不分組；手續費折扣按比例分攤', () => {
  const b = bundle(st()), t2 = T.replace('300', '270'); assert.equal(b.run(`splitNeedsGroup(${T},[{category:'f',amount:300,account:'a'}])`), false);
  assert.deepEqual(b.J(`splitStored(${t2},[{category:'f',amount:200},{category:'g',amount:100}])`), [{ category: 'f', amount: 180, base: 200 }, { category: 'g', amount: 90, base: 100 }]);
  const c = `splitGroupPlan({...${t2},fee:0,discount:30,feeIncluded:true},[{category:'f',amount:200},{category:'g',amount:100,account:'p'}])`;
  assert.deepEqual(b.J(c).list.map(x => [x.amount, x.discount]), [[180, 20], [90, 10]]); assert.equal(b.run(`entryBaseAmount(${c}.list[0])`), 200);
});
test('代付建立應收', () => {
  const b = bundle(st()); b.run(`splitGroupSave(splitGroupPlan(${T},[{category:'f',amount:100},{category:'f',amount:200,lend:true,person:'小明'}]))`);
  assert.equal(b.run('state.accounts[0].balance'), 700); assert.equal(b.run('state.loans[0].amount'), 200); assert.equal(b.run('state.loans[0].person'), '小明'); assert.equal(b.run("state.transactions.filter(x=>x.kind==='expense').length"), 1);
});
test('編輯既有記錄改成分組，先還原舊餘額', () => {
  const s = st(); s.accounts[0].balance = 700; const b = bundle(s); b.run(`var o=${T};state.transactions.push(o);splitGroupSave(splitGroupPlan({...o},[{category:'f',amount:100},{category:'g',amount:200,account:'p'}]),o)`);
  assert.deepEqual(b.J('state.accounts.slice(0,2).map(x=>x.balance)'), [900, -100]); assert.equal(b.run('state.transactions.length'), 2);
});
test('錯誤情況', () => {
  const b = bundle(st());
  assert.ok(b.J(`splitGroupPlan(${T},[{category:'f',amount:300,lend:true}])`).error); assert.ok(b.J(`splitGroupPlan({...${T},pending:true},[{category:'f',amount:100},{category:'f',amount:200,lend:true}])`).error); assert.ok(b.J(`splitGroupPlan({...${T},kind:'transfer'},[{category:'f',amount:300}])`).error);
});
