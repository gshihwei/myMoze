// 進階設定列表 tests (V26.110)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
test('進階設定列的數值文字與範圍', () => {
  const b = bundle({ accounts: [], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
  assert.equal(b.run("advNumText('rcStartNo',6)"), '第 6 期'); assert.equal(b.run("advNumText('instCount',18)"), '18 期'); assert.equal(b.run("advNumText('rcEndCount',3)"), '3 次');
  assert.deepEqual(b.J("advNumRange('instCount')"), [2, 60]); assert.deepEqual(b.J("advNumRange('rcStartNo')"), [1, 360]);
});
test('時間鍵盤輸入格式', () => {
  const b = bundle({ accounts: [], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [] }), P = s => b.run(`tpParse(${JSON.stringify(s)})`);
  assert.equal(P('09:30'), '09:30'); assert.equal(P('930'), '09:30'); assert.equal(P('2359'), '23:59'); assert.equal(P('9點5分'), '09:05'); assert.equal(P('7'), '07:00'); assert.equal(P('24:00'), ''); assert.equal(P('12:60'), ''); assert.equal(P('abc'), '');
});
