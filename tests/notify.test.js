// 通知中心／月曆 tests (V26.71)
'use strict';
const { bundle, test, assert } = require('./_bundle.js');
const base = () => ({ accounts: [{ id: 'c', name: '卡', type: 'card', balance: -500, limit: 9999, statement: 15, due: 5 }, { id: 'b', name: '銀行', type: 'bank', balance: 0 }], categories: [], projects: [], loans: [], budgets: [],
  recurring: [{ id: 'r', name: '房租', amount: 100, kind: 'expense', freq: 'month', interval: 1, start: '2026-12-01', next: '2026-12-01', account: 'b', end: { type: 'never' } }, { id: 'r2', name: '遠', amount: 1, kind: 'expense', freq: 'year', start: '2027-06-01', next: '2027-06-01', account: 'b' }],
  transactions: [{ id: 't', date: '2026-11-01', kind: 'expense', amount: 500, account: 'c', name: 'x' }, { id: 'p', date: '2026-11-20', kind: 'expense', amount: 5, account: 'b', name: 'p', pending: true, pendingApplied: false }, { id: 'i', date: '2026-12-10', kind: 'expense', amount: 7, account: 'c', name: 'i', installment: { group: 'g', n: 2, total: 3, amount: 21 } }, { id: 'in', date: '2026-11-01', kind: 'income', amount: 900, account: 'b', name: 'y' }] });
test('未繳帳單、對帳狀態、移除通知', () => {
  const { J, run } = bundle(base()); const l = J("billNotices('2026-11-25')");
  assert.equal(l.length, 1); assert.equal(l[0].owed, 500); assert.equal(l[0].due, '2026-12-05'); assert.equal(l[0].reconDone, false);
  run('state.transactions[0].recon=true'); assert.equal(J("billNotices('2026-11-25')[0].reconDone"), true);
  run(`setPref('billDismissed',[${JSON.stringify(l[0].key)}])`); assert.equal(J("billNotices('2026-11-25').length"), 0);
});
test('即將到來：30 天內的週期與分期', () => {
  const { J } = bundle(base()); assert.deepEqual(J("upcomingNotices('2026-11-25',30).map(x=>x.id)"), ['r', 'i']);
});
test('待完成與月曆統計（不含未入帳）', () => {
  const { J } = bundle(base()); assert.deepEqual(J('pendingNotices().map(t=>t.id)'), ['p']);
  const m = J('calMonth(2026,10)'); assert.equal(m.out, 500); assert.equal(m.inc, 900); assert.equal(m.n, 30);
  const b = J("calBills(2026,10,'2026-11-25')"); assert.equal(b['2026-11-15'][0].unpaid, true); assert.equal(b['2026-11-15'][0].owed, 500);
  assert.equal(J("holidayName('2026-10-10')"), '國慶日');
});
