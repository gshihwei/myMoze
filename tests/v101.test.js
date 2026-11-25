// 幣種設定 tests (V26.101)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 0 }, { id: 'l', name: 'LP', type: 'ewallet', currency: 'LP', curRate: 1, balance: 0 }], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
const mk = p => { const b = bundle(st()); b.run(`privacyOn=()=>false;prefsCache={...prefsDefaults(),...${JSON.stringify(p || {})}};localStorage={setItem(){},getItem(){return null}}`); return b; };
test('自訂幣種：檢查與換算', () => {
  const b = mk(); assert.match(b.run("curSaveCustom({code:'1',rate:1})"), /英文/); assert.match(b.run("curSaveCustom({code:'USD',rate:1})"), /已經存在/); assert.match(b.run("curSaveCustom({code:'LP',rate:1})"), /已經存在/); assert.match(b.run("curSaveCustom({code:'SUN',rate:0})"), /比例/);
  assert.equal(b.run("curSaveCustom({code:'sun',name:'紅利',sym:'E$',base:'TWD',rate:0.1,digits:0})"), ''); assert.equal(b.run("fxConvert(100,'SUN','TWD')"), 10); assert.equal(b.run("acctMoney(1234,{currency:'SUN'})"), 'E$1,234'); assert.equal(b.run("curKind('SUN')"), 'custom'); assert.equal(b.run("curDigits('SUN')"), 0);
});
test('內建幣種自訂符號與小數', () => { const b = mk({ curCfg: { USD: { sym: 'US$', dg: 1 } } }); assert.equal(b.run("acctMoney(-12.34,{currency:'USD'})"), '-US$12.3'); assert.equal(b.run("curDigits('USD')"), 1); assert.equal(b.run("curDigits('BTC')"), 8); });
test('常用幣種', () => { const b = mk(); b.run("curFavSet('usd',true);curFavSet('JPY',true);curFavSet('TWD',true);curFavSet('x',true)"); assert.deepEqual(b.J('curFav()'), ['USD', 'JPY']); b.run("curFavSet('USD',false)"); assert.deepEqual(b.J('curFav()'), ['JPY']); assert.deepEqual(b.J("curListFor('bit','crypto')"), ['BTC', 'BCH']); });
