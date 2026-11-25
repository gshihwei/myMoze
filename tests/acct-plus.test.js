// 帳戶進階 tests (V26.80)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = x => ({ accounts: [{ id: 'a', name: 'A', type: 'bank', balance: 700 }, { id: 'b', name: 'B', type: 'bank', balance: 5000 }, { id: 'c', name: 'C', type: 'card', balance: -200, limit: 1000 }], categories: [], projects: [], budgets: [], loans: [], recurring: [], transactions: [{ id: '1', date: '2026-10-05', kind: 'income', amount: 1000, account: 'a', name: 'x' }, { id: '2', date: '2026-11-05', kind: 'expense', amount: 200, account: 'a', name: 'y' }, { id: '3', date: '2026-11-06', kind: 'transfer', amount: 100, account: 'a', toAccount: 'b', name: 'z' }], ...x });
test('存摺式餘額由現在往回推', () => { const { J } = bundle(base()); assert.deepEqual(J("passbook('a').map(r=>[r.t.id,r.effect,r.after])"), [['3', -100, 700], ['2', -200, 800], ['1', 1000, 1000]]); });
test('歷史統計：期末餘額、流入流出、起始日', () => {
  const { J } = bundle(base()); const h = J("acctHistory('a',3,'2026-11-25')"); assert.deepEqual(h.map(x => [x.key, x.end, x.inc, x.out]), [['2026-09', 0, 0, 0], ['2026-10', 1000, 1000, 0], ['2026-11', 700, 0, 300]]); assert.equal(h[2].diff, -300);
  const s = base(); s.accounts[0].cycleStart = 6; assert.deepEqual(bundle(s).J("acctHistory('a',2,'2026-11-25')").map(x => [x.start, x.out]), [['2026-10-06', 200], ['2026-11-06', 100]]);
});
test('總額：資產負債與分組、不納入總額', () => { const s = base(); s.accounts[1].excludeNet = true; const t = bundle(s).J('acctTotals()'); assert.equal(t.total, 500); assert.equal(t.assets, 700); assert.equal(t.debts, 200); assert.equal(t.groups.length, 2); });
test('自動儲值：三種方式', () => {
  const mk = u => { const s = base(); s.accounts[0].topUp = { from: 'b', below: 500, ...u }; return bundle(s); }, T = "{kind:'expense',account:'a',amount:1,date:'2026-11-25'}";
  let b = mk({ mode: 'after', amount: 300 }); b.run('state.accounts[0].balance=100'); b.run(`topUpHook(${T},'after')`); assert.equal(b.run('state.accounts[0].balance'), 700); assert.equal(b.run('state.accounts[1].balance'), 4400);
  b = mk({ mode: 'diff' }); b.run('state.accounts[0].balance=120'); b.run(`topUpHook(${T},'after')`); assert.equal(b.run('state.accounts[0].balance'), 500);
  b = mk({ mode: 'before', amount: 300 }); b.run('state.accounts[0].balance=100'); assert.equal(b.run(`topUpHook(${T},'after')`), null); b.run(`topUpHook(${T},'before')`); assert.equal(b.run('state.accounts[0].balance'), 400);
  b = mk({ mode: 'diff' }); assert.equal(b.run(`topUpHook(${T},'after')`), null);
});
test('隱私模式隱藏金額', () => { const { run } = bundle(base()); assert.match(run('money(1234)'), /1,234/); run("setPref('privacy',true)"); assert.ok(!/1/.test(run('money(1234)'))); });
