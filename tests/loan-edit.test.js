// Loan edit/delete tests (V25.19). Run: node --test   (from repo root)
// Builds data with the real CSV importer, then deletes loans / payments with the real runtime
// bundle and checks every account still reconciles (balance = opening + Σ transaction effects).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function importer() {
  const window = {};
  const document = { readyState: 'complete', getElementById: () => null, addEventListener() {} };
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'import.js'), 'utf8'), vm.createContext({ window, document, console, TextDecoder, Blob: class {}, URL, setTimeout }));
  return window.MozeImportInternals;
}
function bundle(stateJson) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const ctx = vm.createContext({ document: any(), window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${stateJson}`, ctx);
  return code => vm.runInContext(code, ctx);
}

const M = importer();
const HEADER = '帳戶,幣種,記錄類型＊,主類別＊,子類別＊,金額＊,手續費,折扣,名稱,商家,日期＊,時間,專案,描述,標籤,對象';
const r = (acct, type, sub, amt, fee, date, person) => [acct, 'TWD', type, '借還款', sub, amt, fee, '', '', '', date, '10:00', '', '', '', person].join(',');
const ROWS = M.parseCSV([HEADER,
  ['錢包', 'TWD', '初始金額', '', '', '10000', '', '', '', '', '', '', '', '', '', ''].join(','),
  r('錢包', '應收款項', '借出', '-1000', '', '2024/1/1', '小明'),
  r('錢包', '應收款項', '借出', '-500', '', '2024/1/2', '小明'),
  r('錢包', '應收款項', '收款', '1200', '10', '2024/1/3', '小明'),   // spans both loans, fee on first
  r('錢包', '應付款項', '還款', '-300', '', '2024/1/4', '阿華'),      // orphan → historicalOnly
].join('\n'));

function fresh() {
  const st = { accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [] };
  assert.equal(M.buildImport(st, ROWS).errors.length, 0);
  return bundle(JSON.stringify(st));
}
const openings = M.csvOpenings(ROWS);
const check = run => {
  const st = JSON.parse(run('JSON.stringify(state)'));
  assert.deepEqual(M.reconcile(st, openings).filter(x => x.mismatch), []);
  return st;
};
const wallet = st => st.accounts.find(a => a.name === '錢包').balance;

test('匯入後每筆收款交易都連到 payment（paymentId）', () => {
  const run = fresh();
  const st = check(run);
  for (const t of st.transactions.filter(t => t.kind === 'loanPayment')) {
    const loan = st.loans.find(l => l.id === t.loanId);
    assert.ok(loan.payments.some(p => p.id === t.paymentId));
  }
  assert.equal(wallet(st), 10000 - 1000 - 500 + 1200 - 10 - 300);
});

test('刪除一筆收款：餘額還原（含手續費）、借款回到進行中、對帳仍一致', () => {
  const run = fresh();
  const first = JSON.parse(run(`JSON.stringify(state.loans.find(l=>l.amount===1000))`));
  const p = first.payments[0];
  run(`removeLoanPayment(state.loans.find(l=>l.id===${JSON.stringify(first.id)}),state.loans.find(l=>l.id===${JSON.stringify(first.id)}).payments[0])`);
  const st = check(run);
  const loan = st.loans.find(l => l.id === first.id);
  assert.equal(loan.paid, 0); assert.equal(loan.status, 'active'); assert.equal(loan.payments.length, 0);
  assert.equal(wallet(st), 10000 - 1000 - 500 + 1200 - 10 - 300 - (p.amount - 10));
  assert.ok(!st.transactions.some(t => t.paymentId === p.id));
});

test('刪除整筆借款：連同借出與收款交易一起刪除，對帳仍一致', () => {
  const run = fresh();
  const id = run(`state.loans.find(l=>l.amount===500).id`);
  const before = JSON.parse(run('JSON.stringify(state)'));
  const n = run(`removeLoan(state.loans.find(l=>l.id===${JSON.stringify(id)}))`);
  const st = check(run);
  assert.equal(n, before.transactions.filter(t => t.loanId === id).length);
  assert.ok(!st.loans.some(l => l.id === id));
  assert.ok(!st.transactions.some(t => t.loanId === id));
  assert.equal(wallet(st), wallet(before) + 500 - 200);
});

test('刪除歷史收還款（historicalOnly）會刪掉整筆歷史記錄', () => {
  const run = fresh();
  const h = JSON.parse(run('JSON.stringify(state.loans.find(l=>l.historicalOnly))'));
  const res = JSON.parse(run(`JSON.stringify(removeLoanPayment(state.loans.find(l=>l.historicalOnly),state.loans.find(l=>l.historicalOnly).payments[0]))`));
  assert.equal(res.removedLoan, true);
  const st = check(run);
  assert.ok(!st.loans.some(l => l.id === h.id));
});

test('手動建立的舊收款（沒有 paymentId）仍能用日期／金額／帳戶找到交易', () => {
  const run = bundle(JSON.stringify({
    accounts: [{ id: 'a', name: '錢包', balance: 1000 - 300 + 100 }], categories: [], projects: [], budgets: [], recurring: [],
    loans: [{ id: 'L', person: 'X', direction: 'receivable', amount: 300, paid: 100, account: 'a', payments: [{ id: 'p1', date: '2025-01-02', amount: 100, account: 'a' }], status: 'active' }],
    transactions: [
      { id: 't0', kind: 'loan', loanAction: 'lend', amount: 300, account: 'a', loanId: 'L', date: '2025-01-01' },
      { id: 't1', kind: 'loanPayment', loanDirection: 'receivable', amount: 100, account: 'a', loanId: 'L', date: '2025-01-02' },
    ],
  }));
  const res = JSON.parse(run(`JSON.stringify(removeLoanPayment(state.loans[0],state.loans[0].payments[0]))`));
  assert.equal(res.txFound, true);
  assert.equal(run('state.accounts[0].balance'), 700);
  assert.equal(run('state.transactions.length'), 1);
  run('removeLoan(state.loans[0])');
  assert.equal(run('state.accounts[0].balance'), 1000);
  assert.equal(run('state.transactions.length'), 0);
});

test('停止追蹤的借款刪除收款後仍維持停止追蹤', () => {
  const run = fresh();
  run(`(()=>{const l=state.loans.find(l=>l.amount===1000);l.status='stopped';removeLoanPayment(l,l.payments[0])})()`);
  assert.equal(run(`state.loans.find(l=>l.amount===1000).status`), 'stopped');
});
