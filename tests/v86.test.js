// 轉帳版面 tests (V26.86)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'k', name: '卡', type: 'card', balance: 0 }, { id: 'a', name: '中信', type: 'bank', balance: 1000 }, { id: 'a2', name: '玉山', type: 'bank', balance: 0 }, { id: 'w', name: '錢包', type: 'cash', balance: 0 }, { id: 'j', name: 'J', type: 'foreign', currency: 'JPY', balance: 0 }], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [{ id: 1, account: 'k', kind: 'expense', amount: 1, date: '2026-01-01' }] });
test('提款／存款／轉帳的預設帳戶', () => {
  const b = bundle(st());
  assert.deepEqual(b.J("tfDefaults(state,'提款')"), { from: 'a', to: 'w' }); assert.deepEqual(b.J("tfDefaults(state,'存款')"), { from: 'w', to: 'a' });
  assert.deepEqual(b.J("tfDefaults(state,'提款',{from:'a2'})"), { from: 'a2', to: 'w' }); assert.deepEqual(b.J("tfDefaults(state,'存款',{to:'w'})"), { from: 'a', to: 'w' }); assert.deepEqual(b.J("tfDefaults(state,'轉帳',{from:'a'})"), { from: 'a', to: 'a2' });
});
test('同幣別可填不同的轉入金額', () => {
  const b = bundle(st()); assert.equal(b.run("tfToAmount(100,100,acct('a'),acct('a2'))"), ''); assert.equal(b.run("tfToAmount(100,95,acct('a'),acct('a2'))"), '95'); assert.equal(b.run("tfToAmount(100,450,acct('a'),acct('j'))"), '450');
  const f = b.J("transferFields(100,'a','a2','95',0)"); assert.deepEqual([f.toAmount, f.toBalanceEffect], [95, 95]);
});
test('轉帳計入專案統計（需開啟）', () => {
  const s = st(); s.projects = [{ id: 'p', name: 'P', countTransfers: true }, { id: 'q', name: 'Q' }]; s.transactions = [{ id: 't', kind: 'transfer', account: 'a', toAccount: 'a2', amount: 300, date: '2026-11-01', project: 'p', toProject: 'q', tags: [] }];
  const b = bundle(s); assert.equal(b.run('projStats(state.projects[0]).spent'), 300); assert.equal(b.run('projStats(state.projects[1]).income'), 0); assert.equal(b.run('projStats(state.projects[1]).count'), 1);
});
