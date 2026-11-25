// 手勢與快捷 tests (V26.96)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 100 }], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
test('滑動方向', () => { const b = bundle(st()); assert.deepEqual(b.J('[[80,5],[-80,5],[5,90],[50,0],[80,70]].map(([x,y])=>swipeDir(x,y))'), ['right', 'left', 'down', '', '']); });
test('下拉完成只在最上方', () => { const b = bundle(st()); assert.deepEqual(b.J('[[0,0,150],[10,0,150],[0,80,150],[0,0,100]].map(x=>pullSaves(...x))'), [true, false, false, false]); });
test('範本直接新增', () => { const b = bundle(st()); b.run("nowTime=()=>'09:00'"); assert.ok(b.J("tplMake({data:{kind:'expense',account:'a'}})").error); assert.ok(b.J("tplMake({data:{kind:'expense',account:'zz',amount:5}})").error); b.run("tplMake({data:{kind:'expense',account:'a',amount:30,name:'n',tags:[]}})"); assert.equal(b.run('state.accounts[0].balance'), 70); });
