// 類別管理 tests (V26.92)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = c => ({ accounts: [], categories: c || [], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
test('內建轉帳類別加上自訂、隱藏、排序、移除', () => {
  const b = bundle(st([{ id: 1, name: '提款', kind: 'transfer', icon: '🏧', order: -1, color: '#112233' }, { id: 2, name: '定存', kind: 'transfer', icon: '🔒' }, { id: 3, name: '兌換', kind: 'transfer', icon: 'x', hidden: true }, { id: 4, name: '退款', kind: 'transfer', icon: 'x', removed: true }]));
  assert.deepEqual(b.J("catPresetList('transfer').map(x=>x.name)"), ['提款', '轉帳', '存款', '兌換', '定存']); assert.equal(b.run("catPresetList('transfer')[0].icon"), '🏧'); assert.deepEqual(b.J("entryPresets().transfer.map(x=>x.name)"), ['提款', '轉帳', '存款', '定存']);
});
test('系統類別用實際收支類別，內建功能用 system', () => { const b = bundle(st()); assert.equal(b.run("catSpecialRec('system','手續費').kind"), 'expense'); assert.equal(b.run("catSpecialRec('system','多類別').kind"), 'system'); assert.equal(b.run("catSpecialIcon('多類別','x').icon"), '🗂️'); });
test('圖片類別只接受合法圖片，其餘跳脫', () => { const b = bundle(st()); assert.match(b.run("catIconHTML({image:'data:image/png;base64,AAAA'})"), /<img/); assert.equal(b.run("catIconHTML({image:'javascript:1',icon:'<'})"), '&lt;'); });
test('表單保留特殊類型', () => { const b = bundle(st()); const f = o => `({get:k=>(${JSON.stringify(o)})[k]??null})`; assert.equal(b.J(`catFromForm(${f({ cname: '定存', ckind: 'transfer', cicon: '🔒' })},null).category`).kind, 'transfer'); });
