// 繳款期限／假日／索引／離線 tests (V26.82)
'use strict';
const { bundle, test, assert, fs, path, root } = require('./_bundle.js');
const st = x => ({ accounts: [{ id: 'c', name: 'C', type: 'card', balance: -10, limit: 99, statement: 15, due: 5, ...x }], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [{ id: 't', account: 'c', kind: 'expense', amount: 10, date: '2026-11-01', name: 't' }, { id: 'p', account: 'b', toAccount: 'c', kind: 'transfer', cardPayment: true, cardStatementKey: 'c|2026-10-16|2026-11-15', amount: 4, date: '2026-11-20', name: 'p' }] });
test('結帳日後第 N 天繳款', () => assert.equal(bundle(st({ dueAfter: 7 })).run("isoDate(cardStatementDueDate(state.accounts[0],{end:'2026-07-15'}))"), '2026-07-22'));
test('非工作日：週末與國定假日', () => {
  const f = (x, d, m) => bundle(st(x)).run(`isoDate(cardAdjustDate(state.accounts[0],new Date(${d}),'${m}'))`);
  assert.equal(f({}, '2026,9,9', 'next'), '2026-10-09'); assert.equal(f({ useHoliday: true }, '2026,9,9', 'next'), '2026-10-12'); assert.equal(f({ useHoliday: true }, '2026,9,11', 'prev'), '2026-10-08'); assert.equal(f({}, '2026,9,10', 'prev'), '2026-10-09'); assert.equal(f({ useHoliday: true }, '2026,1,16', 'next'), '2026-02-23');
});
test('索引結果與逐筆掃描相同，且用完即清除', () => { const b = bundle(st()); const a = b.J('creditStmt(state.accounts[0],new Date(2026,10,25),0)'); assert.deepEqual(b.J('withTxIndex(()=>creditStmt(state.accounts[0],new Date(2026,10,25),0))'), a); assert.equal(a.owed, 6); assert.equal(b.run('window.__txIdx'), null); });
test('離線模式會在同步前停止', () => assert.match(fs.readFileSync(path.join(root, 'js/sync.js'), 'utf8'), /syncNow\(mode='auto'\)\{if\(localStorage\.getItem\('moze-offline-mode'\)==='1'\)/));
