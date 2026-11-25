// 偏好同步 tests (V26.84)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = host => ({ accounts: [], categories: [{ id: 'f', name: 'F', kind: 'expense' }, ...(host ? [host] : [])], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
const H = (at, data) => ({ id: '__prefs__', kind: 'prefs', name: 'x', icon: '⚙', hidden: true, data, at });
const setp = (b, o) => b.run(`prefsCache={...prefsDefaults(),...${JSON.stringify(o)}}`);
test('關閉時不寫入也不套用', () => { const b = bundle(st(H(9, { weekStart: 1 }))); setp(b, {}); assert.equal(b.run('prefSyncPush()'), false); assert.equal(b.run('prefSyncPull()'), false); assert.equal(b.run('prefs().weekStart'), 0); });
test('上傳只含可同步的鍵，且內容相同不重複寫', () => {
  const b = bundle(st()); setp(b, { prefSync: true, theme: 'light', lockHash: 'z', carrier: '/A', weekStart: 1 });
  assert.equal(b.run('prefSyncPush(5)'), true); const d = b.J('prefSyncHost().data'); assert.equal(d.weekStart, 1); for (const k of ['theme', 'lockHash', 'carrier', 'prefSync']) assert.equal(d[k], undefined); assert.equal(b.run('prefSyncPush(6)'), false);
});
test('較新的才套用', () => { const b = bundle(st(H(10, { weekStart: 1 }))); setp(b, { prefSync: true, prefSyncAt: 10 }); assert.equal(b.run('prefSyncPull()'), false); setp(b, { prefSync: true, prefSyncAt: 9 }); assert.equal(b.run('prefSyncPull()'), true); assert.equal(b.run('prefs().weekStart'), 1); });
test('第一次開啟時合併範本', () => { const b = bundle(st(H(10, { templates: [{ id: 1, n: 'cloud' }, { id: 2 }] }))); setp(b, { templates: [{ id: 1, n: 'local' }, { id: 3 }] }); b.run('prefSyncEnable()'); assert.deepEqual(b.J('prefs().templates').map(x => [x.id, x.n]), [[1, 'cloud'], [2, undefined], [3, undefined]].map(([a, c]) => [a, c])); });
test('同步記錄不出現在類別清單', () => { const b = bundle(st(H(1, {}))); assert.deepEqual(b.J('catOrdered().map(c=>c.id)'), ['f']); assert.deepEqual(b.J('catMains().map(c=>c.id)'), ['f']); });
