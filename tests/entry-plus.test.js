// 記帳表單細節 tests (V26.69)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = () => ({ accounts: [{ id: 'a' }, { id: 'b' }], categories: [], projects: [], loans: [], budgets: [], recurring: [], transactions: [{ kind: 'expense', category: 'f', account: 'a', project: 'p' }, { kind: 'expense', category: 'f', account: 'b', project: '' }, { kind: 'income', category: 'f', account: 'a' }] });
test('類別記住上次搭配的帳戶與專案', () => {
  const { J } = bundle(base()); assert.deepEqual(J("catMemory('f','expense')"), { account: 'b', project: '' }); assert.equal(J("catMemory('zz','expense')"), null);
});
test('記帳模式：限制清單、刪除使用中的模式會回到一般模式', () => {
  const { run } = bundle(base());
  run("modeSave({id:'m1',name:'日本',accounts:['b']});setPref('modeId','m1')");
  assert.equal(run("modeAllows('accounts','a')"), false); assert.equal(run("modeAllows('accounts','b')"), true); assert.equal(run("modeAllows('projects','x')"), true);
  run("modeRemove('m1')"); assert.equal(run("modeActive()"), null); assert.equal(run("modeAllows('accounts','a')"), true);
});
test('範本順序', () => {
  const { run, J } = bundle(base()); run("setPref('templates',[{id:1,name:'x'},{id:2,name:'y'}]);tplMove(2,-1)"); assert.deepEqual(J('tplList().map(t=>t.id)'), [2, 1]); assert.equal(run('tplMove(2,-1)'), false);
});
