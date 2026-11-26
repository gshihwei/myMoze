// 概覽排序 (V26.119) tests
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [], categories: [] });
const fresh = () => { const b = bundle(st()); b.run('var __P={};prefs=()=>__P'); return b; };
const DEF = ['metrics', 'chart', 'cards', 'pending', 'loans', 'budgets', 'upcoming', 'recent', 'calendar', 'daily', 'quick'];
test('預設順序就是原本的版面', () => { assert.deepEqual(fresh().J('ovOrder()'), DEF); });
test('上移、下移，頭尾不能再移', () => {
  const b = fresh(); assert.deepEqual(b.J("ovMove(ovOrder(),'recent',-1)").slice(6, 8), ['recent', 'upcoming']);
  assert.deepEqual(b.J("ovMove(ovOrder(),'metrics',-1)"), DEF); assert.deepEqual(b.J("ovMove(ovOrder(),'quick',1)"), DEF);
});
test('存過的順序遇到新區塊時，新區塊放在原本的位置附近', () => {
  const b = fresh(); b.run("prefs().ovOrder=['recent','metrics','cards','nope']");
  const o = b.J('ovOrder()'); assert.equal(o.length, DEF.length); const at = k => o.indexOf(k); assert.equal(at('chart'), at('metrics') + 1); assert.equal(at('calendar'), at('recent') + 1); assert.equal(at('metrics') < at('cards'), true); assert.ok(!o.includes('nope'));
});
