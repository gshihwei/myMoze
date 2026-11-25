// 附件與發票 tests (V26.70)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = { accounts: [], categories: [], projects: [], loans: [], budgets: [], recurring: [], transactions: [] };
test('發票號碼與隨機碼格式', () => {
  const { J } = bundle(st);
  assert.deepEqual(J("invoiceParse('ab-12345678','1234')"), { invoiceNo: 'AB12345678', invoiceCode: '1234' }); assert.deepEqual(J("invoiceParse('','')"), { invoiceNo: '', invoiceCode: '' });
  assert.ok(J("invoiceParse('A12345678','')").error); assert.ok(J("invoiceParse('','12')").error);
});
test('附件只接受合法的圖片 data URL，最多 3 張', () => {
  const { J } = bundle(st); const ok = 'data:image/jpeg;base64,AAAA';
  assert.equal(J(`attachList({attachments:['${ok}','${ok}','${ok}','${ok}']}).length`), 3); assert.equal(J(`attachList({attachments:['http://x/a.png','javascript:1']}).length`), 0);
});
test('Code 39：每字 9 條（5 黑 4 白、3 寬），條碼格式檢查', () => {
  const { J, run } = bundle(st);
  for (const p of Object.values(J('code39Table()'))) { assert.equal(p.length, 9); assert.equal([...p].filter(c => c === 'w').length, 3); }
  assert.equal(new Set(Object.values(J('code39Table()'))).size, 44);
  assert.equal(J("code39Bars('/ABC1234').bars.length"), 50); assert.equal(run("carrierValid('/ABC1234')"), true); assert.equal(run("carrierValid('ABC12345')"), false); assert.equal(run("code39Bars('a')"), null);
});
