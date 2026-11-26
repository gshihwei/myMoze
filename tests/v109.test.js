// 日期選擇器 tests (V26.109)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
test('月曆格子：六週、從週日或指定星期開始', () => {
  const b = bundle(st()), c = b.J("dpCells('2024-12',0)"); assert.equal(c.length, 42); assert.equal(c[0].iso, '2024-12-01'); assert.equal(c[6].iso, '2024-12-07'); assert.equal(c[30].iso, '2024-12-31'); assert.equal(c[31].out, true); assert.equal(c[41].iso, '2025-01-11');
  const m = b.J("dpCells('2024-12',1)"); assert.equal(m[0].iso, '2024-11-25'); assert.equal(m[0].out, true);
});
test('鍵盤輸入的日期格式', () => {
  const b = bundle(st()), P = s => b.run(`dpParse(${JSON.stringify(s)},'2024-05-01')`);
  assert.equal(P('2024-12-07'), '2024-12-07'); assert.equal(P('2024/12/7'), '2024-12-07'); assert.equal(P('20241207'), '2024-12-07'); assert.equal(P('2024年12月7日'), '2024-12-07'); assert.equal(P('12/7'), '2024-12-07'); assert.equal(P('2024-02-30'), ''); assert.equal(P('abc'), '');
});
