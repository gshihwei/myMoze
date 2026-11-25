// 信用帳戶頁 tests (V26.103)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const st = () => ({ accounts: [{ id: 'b', name: 'B', type: 'bank', balance: 5000 }, { id: 'c', name: 'C', type: 'card', balance: -1000, limit: 9000, statement: 15, due: 5 }, { id: 'o', name: 'old', type: 'cash', balance: 7, archived: true, excludeNet: true }], categories: [{ id: 'f', name: 'F', icon: '🍜', kind: 'expense' }], projects: [], budgets: [], loans: [], recurring: [], transactions: [{ id: 't', kind: 'expense', amount: 1000, account: 'c', category: 'f', date: '2026-11-10', name: '<i>', time: '10:00', recon: true }] });
test('統計列與帳單分期分開顯示', () => {
  const b = bundle(st()); b.run("creditStatementOffset=0;var C=state.accounts[1];Date.now=()=>new Date(2026,10,25).getTime()"); const r = b.J("(()=>{const st=creditStmt(C,new Date(2026,10,25),0);return st})()"); assert.equal(r.owed, 1000);
  assert.equal(b.run("cardPayApply({kind:'transfer',toAccount:'c'}).cardPayment"), undefined); b.run("window.__cardPay={card:'c',key:'K'}"); assert.deepEqual(b.J("cardPayApply({kind:'transfer',toAccount:'c'})"), { kind: 'transfer', toAccount: 'c', cardPayment: true, cardStatementKey: 'K' }); assert.equal(b.run("cardPayApply({kind:'transfer',toAccount:'b'}).cardPayment"), undefined);
});
test('帳戶頁跳脫名稱、可匯出 CSV', () => { const b = bundle(st()); const h = b.run("cardViewHTML(state.accounts[1])"); assert.ok(!h.includes('<b><i>')); assert.match(h, /對帳筆數/); const c = b.run("acctCSV('c')"); assert.match(c, /2026-11-10/); assert.equal(c.split('\r\n').length, 2); });
test('封存分組與分組總額只算納入的', () => { const b = bundle(st()); const h = b.J("acctGroupsHTML([state.accounts[1]],['<i>c</i>'],[state.accounts[0],state.accounts[2]],['<i>b</i>','<i>o</i>'])"); assert.match(h, /封存 \(1\)/); b.run("prefsCache={...prefsDefaults(),groupTotal:'net'}"); assert.equal(b.run("acctTotalList(state.accounts,'groupTotal').length"), 2); });
test('預設日期用當地日期', () => { const b = bundle(st()); assert.equal(b.run('selectedDate===isoDate(new Date())'), true); });
