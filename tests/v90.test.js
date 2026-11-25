// 多類別 tests (V26.90)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 0 }, { id: 'p', name: 'P', type: 'ewallet', balance: 0 }], categories: [{ id: 'f', name: 'F', kind: 'expense' }, { id: 'g', name: 'G', kind: 'expense' }], projects: [], budgets: [], loans: [], recurring: [], transactions: [] });
const I = o => JSON.stringify({ tab: 'expense', kind: 'expense', category: 'f', expr: '100', account: 'a', ...o });
test('合計：支出、代付、借入', () => {
  const b = bundle(st());
  assert.equal(b.run(`itemsTotal([${I()},${I({ expr: '200+50', discount: 50 })}])`), -300);
  assert.equal(b.run(`itemsTotal([${I({ tab: 'payable' })},${I()}])`), 0); // 別人幫你先出錢
  assert.equal(b.run(`itemsTotal([${I()},${I({ tab: 'receivable', expr: '180' })}])`), -280);
});
test('同帳戶同專案只差類別＝同一筆；其餘分成多筆', () => {
  const b = bundle(st()), u = l => b.run(`itemsUniform([${l.join(',')}])`);
  assert.equal(u([I(), I({ category: 'g' })]), true); assert.equal(u([I(), I({ account: 'p' })]), false); assert.equal(u([I(), I({ project: 'x' })]), false); assert.equal(u([I(), I({ tab: 'receivable' })]), false); assert.equal(u([I(), I({ kind: 'income' })]), false); assert.equal(u([I(), I({ name: '另一個' })]), false); assert.equal(u([I({ name: '晚餐' }), I({ category: 'g' })]), true);
});
test('檢查', () => { const b = bundle(st()); assert.match(b.J(`itemsCheck([${I()},${I({ expr: '' })}])`).error, /第 2 項/); assert.match(b.J(`itemsCheck([${I()},${I({ tab: 'transfer', kind: 'transfer' })}])`).error, /轉帳/); assert.deepEqual(b.J(`itemsCheck([${I()},${I()}])`), {}); });
test('讀回：拆帳與拆帳組', () => {
  const s = st(); s.transactions = [{ id: 't', kind: 'expense', amount: 270, account: 'a', category: 'f', date: '2026-11-01', name: 'n', fee: 0, discount: 30, feeIncluded: true, splits: [{ category: 'f', amount: 180, base: 200 }, { category: 'g', amount: 90, base: 100 }] }, { id: 'x', kind: 'expense', amount: 10, account: 'a', category: 'f', date: '2026-11-01', name: 'x', splitGroup: { id: 'G', n: 1, total: 2 } }, { id: 'y', kind: 'loan', direction: 'receivable', loanRecord: true, amount: 20, account: 'a', date: '2026-11-01', name: 'y', splitGroup: { id: 'G', n: 2, total: 2 } }];
  const b = bundle(s); const l = b.J('itemsOfTx(state.transactions[0])'); assert.deepEqual(l.map(x => [x.category, x.expr, x.discount]), [['f', '200', 20], ['g', '100', 10]]); assert.deepEqual(b.J('itemsOfTx(state.transactions[0]).map(itemNet)'), [180, 90]);
  assert.deepEqual(b.J('itemsOfTx(state.transactions[1])').map(x => [x.id, x.tab, x.locked]), [['x', 'expense', false], ['y', 'receivable', true]]); assert.equal(b.run("itemsOfTx({id:'z',kind:'expense'})"), null);
});
