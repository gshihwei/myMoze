// 子類別圖示 tests (V26.113)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [], categories: [{ id: 'm', name: '個人', kind: 'expense', icon: '👤' }, { id: 'a', name: 'Youtube', kind: 'expense', icon: '•', parentId: 'm' }, { id: 'b', name: '補助', kind: 'income', icon: '＄' }, { id: 'c', name: '某某某', kind: 'expense', icon: '•', parentId: 'm' }, { id: 'd', name: '電腦', kind: 'expense', icon: '•', parentId: 'm' }, { id: 'e', name: '自選', kind: 'expense', icon: '🦄', parentId: 'm' }, { id: 'f', name: '某某', kind: 'expense', icon: '•' }] });
test('預設符號的類別自動補上圖示，自選的不動', () => {
  const b = bundle(st()); assert.equal(b.run('catIconAuto()'), true); assert.deepEqual(b.J('state.categories.map(c=>c.icon)'), ['👤', '▶️', '🤲', '👤', '💻', '🦄', '•']); assert.equal(b.run('catIconAuto()'), false);
});
test('畫面上的圖示：預設符號改用名稱或主類別的圖示', () => {
  const b = bundle(st()); assert.equal(b.run('catIconShown(state.categories[1])'), '▶️'); assert.equal(b.run('catIconShown(state.categories[3])'), '👤'); assert.equal(b.run('catIconShown(state.categories[5])'), '🦄'); assert.equal(b.run('catIconShown(state.categories[6])'), '•');
});
