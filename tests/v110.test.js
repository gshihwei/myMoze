// 進階設定列表 tests (V26.110)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
test('進階設定列的數值文字與範圍', () => {
  const b = bundle({ accounts: [], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
  assert.equal(b.run("advNumText('rcStartNo',6)"), '第 6 期'); assert.equal(b.run("advNumText('instCount',18)"), '18 期'); assert.equal(b.run("advNumText('rcEndCount',3)"), '3 次');
  assert.deepEqual(b.J("advNumRange('instCount')"), [2, 60]); assert.deepEqual(b.J("advNumRange('rcStartNo')"), [1, 360]);
});
