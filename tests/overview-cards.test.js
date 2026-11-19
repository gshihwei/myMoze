// Overview credit card bills and loan tracking tests (V26.3). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state, elements = {}) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? id => elements[id] || any() : k === 'querySelectorAll' ? () => [] : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)) };
}
const base = extra => ({ accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [], ...extra });

test('cardBills()：本期帳單、已繳、未繳、狀態與到期日；逾期排最前', () => {
  const { J } = bundle(base({
    accounts: [
      { id: 'c1', name: '甲卡', type: 'card', balance: -3000, statement: 15, due: 5 },
      { id: 'c2', name: '乙卡', type: 'card', balance: -500, statement: 20, due: 10 },
      { id: 'bank', name: '銀行', balance: 0 },
    ],
    transactions: [
      { id: 1, kind: 'expense', amount: 1200, account: 'c1', date: '2026-05-20' },
      { id: 2, kind: 'expense', amount: 800, account: 'c1', date: '2026-06-10' },
      { id: 3, kind: 'expense', amount: 999, account: 'c1', date: '2026-06-16' },     // next statement
      { id: 4, kind: 'transfer', amount: 500, account: 'bank', toAccount: 'c1', cardPayment: true, date: '2026-06-18' },
      { id: 5, kind: 'expense', amount: 500, account: 'c2', date: '2026-05-10' },
    ],
  }));
  const bills = J(`cardBills(new Date(2026,5,18)).map(b=>({id:b.card.id,bill:b.bill,paid:b.paid,due:b.due,key:b.status.key,date:b.status.date}))`);
  const c1 = bills.find(b => b.id === 'c1'), c2 = bills.find(b => b.id === 'c2');
  assert.deepEqual(c1, { id: 'c1', bill: 2000, paid: 500, due: 1500, key: c1.key, date: '2026-07-05' });
  assert.equal(c2.bill, 500); assert.equal(c2.date, '2026-06-10');
  assert.equal(c2.key, 'overdue');       // 6/10 already passed (real "today" is after 2026-06)
  assert.equal(bills[0].id, 'c2', 'overdue first');
});

test('信用卡帳單卡片：狀態、到期文字、合計，並跳脫卡名', () => {
  const creditCards = { innerHTML: '' }, creditTotal = { textContent: '' };
  const { run } = bundle(base({ accounts: [{ id: 'c', name: '<b>卡', type: 'card', balance: 0, statement: 15, due: 5 }] }), { creditCards, creditTotal });
  run('renderCards()');
  assert.match(creditCards.innerHTML, /data-dashboard-credit="c"/);
  assert.match(creditCards.innerHTML, /已繳清/);
  assert.ok(!creditCards.innerHTML.includes('<b>卡'));
  assert.match(creditCards.innerHTML, /class="avatar"[^>]*>&lt;</);
  assert.match(creditTotal.textContent, /^1 張 · 未繳合計/);
});

test('loanGroups()：只算進行中，依對象分組計算未結淨額與最近日期', () => {
  const { J } = bundle(base({ loans: [
    { id: 'a', person: '小明', direction: 'receivable', amount: 1000, paid: 0, date: '2026-05-01', payments: [], status: 'active' },
    { id: 'b', person: '小明', direction: 'payable', amount: 300, paid: 100, date: '2026-05-03', payments: [{ date: '2026-05-22', amount: 100 }], status: 'active' },
    { id: 'c', person: '小明', direction: 'receivable', amount: 50, paid: 50, date: '2026-06-01', payments: [], status: 'completed' },
    { id: 'd', person: '阿華', direction: 'payable', amount: 200, paid: 0, date: '2026-04-01', payments: [], status: 'active' },
    { id: 'e', person: '停', direction: 'receivable', amount: 9, paid: 0, date: '2026-04-01', payments: [], status: 'stopped' },
  ] }));
  const gs = J('loanGroups()');
  assert.deepEqual(gs.map(g => [g.person, g.receivable, g.payable, g.net, g.latest]), [['小明', 1, 1, 800, '2026-05-22'], ['阿華', 0, 1, -200, '2026-04-01']]);
});

test('借還款追蹤：最多 5 位，其餘顯示「查看更多」；跳脫對象名稱', () => {
  const loanSummary = { innerHTML: '' }, loanTrackTotal = { textContent: '' };
  const loans = Array.from({ length: 7 }, (_, i) => ({ id: 'L' + i, person: i === 0 ? '<i>x' : 'P' + i, direction: 'receivable', amount: 100 + i, paid: 0, date: '2026-05-01', payments: [], status: 'active' }));
  const { run } = bundle(base({ loans }), { loanSummary, loanTrackTotal });
  run('renderLoanTracking()');
  assert.equal((loanSummary.innerHTML.match(/class="loan-track/g) || []).length, 5);
  assert.match(loanSummary.innerHTML, /查看更多（另 2 位）/);
  assert.ok(!loanSummary.innerHTML.includes('<i>x'));
  assert.equal(loanTrackTotal.textContent, '7 位對象');
});
