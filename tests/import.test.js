// MOZE CSV import regression tests. Run: node --test   (from repo root)
// Loads js/import.js in a vm sandbox with a minimal window/document stub.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadImporter() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'import.js'), 'utf8');
  const document = { readyState: 'complete', getElementById: () => null, addEventListener() {} };
  const window = {};
  const ctx = vm.createContext({ window, document, console, TextDecoder, Blob: class {}, URL, setTimeout });
  vm.runInContext(src, ctx, { filename: 'import.js' });
  return window.MozeImportInternals;
}
const M = loadImporter();

const HEADER = '帳戶,幣種,記錄類型＊,主類別＊,子類別＊,金額＊,手續費,折扣,名稱,商家,日期＊,時間,專案,描述,標籤,對象';
// r(account, currency, type, main, sub, amount, fee, discount, date, time, person)
function r(acct, cur, type, main, sub, amt, fee = '', disc = '', date = '2024/1/1', time = '10:00', person = '') {
  return [acct, cur, type, main, sub, amt, fee, disc, '', '', date, time, '', '', '', person].join(',');
}
function emptyState(extra = {}) {
  return { accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [], ...extra };
}
function run(state, lines) {
  return M.buildImport(state, M.parseCSV([HEADER, ...lines].join('\n')));
}
function bal(st, name, cur = 'TWD') {
  const a = st.accounts.find(x => x.name === name && (x.currency || 'TWD') === cur);
  assert.ok(a, `account ${name}/${cur} missing`);
  return a.balance;
}
const outstanding = l => Math.max(0, l.amount - l.paid);

test('一般支出／收入／手續費／折扣：新帳戶餘額 = 初始 + Σ(金額 - 手續費 + 折扣)', () => {
  const st = emptyState();
  const res = run(st, [
    r('錢包', 'TWD', '初始金額', '', '', '1000', '', '', ''),
    r('錢包', 'TWD', '支出', '飲食', '午餐', '-100', '5', '10'),
    r('錢包', 'TWD', '收入', '薪水', '月薪', '500'),
  ]);
  assert.equal(res.errors.length, 0);
  assert.equal(bal(st, '錢包'), 1000 - 100 - 5 + 10 + 500);
  assert.equal(res.transactions.length, 2);
});

test('初始金額 0 建立帳戶、不建立交易', () => {
  const st = emptyState();
  const res = run(st, [r('空帳戶', 'TWD', '初始金額', '', '', '0', '', '', '')]);
  assert.equal(res.errors.length, 0);
  assert.equal(res.transactions.length, 0);
  assert.equal(bal(st, '空帳戶'), 0);
});

test('轉帳：同幣與跨幣別兩端各自用自己的金額', () => {
  const st = emptyState();
  const res = run(st, [
    r('銀行', 'TWD', '初始金額', '', '', '10000', '', '', ''),
    r('美元戶', 'USD', '初始金額', '', '', '0', '', '', ''),
    r('銀行', 'TWD', '轉出', '轉帳', '轉帳', '-3200', '15', '', '2024/1/2', '11:00'),
    r('美元戶', 'USD', '轉入', '轉帳', '轉帳', '100', '', '', '2024/1/2', '11:00'),
  ]);
  assert.equal(res.errors.length, 0);
  assert.equal(bal(st, '銀行'), 10000 - 3200 - 15);
  assert.equal(bal(st, '美元戶', 'USD'), 100);
  assert.equal(res.transactions.filter(t => t.kind === 'transfer').length, 1);
});

test('借出 → 部分收款 → 一筆收款跨多筆借款', () => {
  const st = emptyState();
  const res = run(st, [
    r('錢包', 'TWD', '初始金額', '', '', '10000', '', '', ''),
    r('錢包', 'TWD', '應收款項', '借還款', '借出', '-1000', '', '', '2024/1/1', '10:00', '小明'),
    r('錢包', 'TWD', '應收款項', '借還款', '借出', '-500', '', '', '2024/1/2', '10:00', '小明'),
    r('錢包', 'TWD', '應收款項', '借還款', '借出', '400', '', '', '2024/1/3', '10:00', '小明'),
    r('錢包', 'TWD', '應收款項', '借還款', '借出', '900', '', '', '2024/1/4', '10:00', '小明'),
  ]);
  assert.equal(res.errors.length, 0);
  assert.equal(bal(st, '錢包'), 10000 - 1000 - 500 + 400 + 900);
  const [a, b] = st.loans.filter(l => !l.historicalOnly).sort((x, y) => x.date.localeCompare(y.date));
  assert.equal(a.paid, 1000); assert.equal(a.status, 'completed');
  assert.equal(b.paid, 300); assert.equal(outstanding(b), 200); assert.equal(b.status, 'active');
  assert.equal(st.loans.filter(l => l.historicalOnly).length, 0);
});

test('孤兒收款建立 historicalOnly 已完成記錄並保留帳戶影響', () => {
  const st = emptyState();
  const res = run(st, [
    r('錢包', 'TWD', '初始金額', '', '', '0', '', '', ''),
    r('錢包', 'TWD', '應收款項', '借還款', '借出', '300', '', '', '2024/1/3', '10:00', '阿華'),
  ]);
  assert.equal(bal(st, '錢包'), 300);
  const h = st.loans.find(l => l.historicalOnly);
  assert.ok(h); assert.equal(h.status, 'completed'); assert.equal(outstanding(h), 0);
  assert.ok(res.warnings.some(w => /歷史/.test(w.message)));
});

test('P0：手動建立的 payable（無 recordType）可被 CSV 還款配對', () => {
  const st = emptyState({
    accounts: [{ id: 'a1', name: '錢包', balance: 0, currency: 'TWD' }],
    loans: [{ id: 'L1', person: '老王', direction: 'payable', amount: 1000, paid: 0, account: 'a1', currency: 'TWD', date: '2023-12-01', payments: [], status: 'active' }],
  });
  run(st, [r('錢包', 'TWD', '應付款項', '借還款', '還款', '-400', '', '', '2024/1/5', '10:00', '老王')]);
  const L1 = st.loans.find(l => l.id === 'L1');
  assert.equal(L1.paid, 400);
  assert.equal(st.loans.filter(l => l.historicalOnly).length, 0);
});

test('P0：手動建立的 receivable 不會被 CSV 還款（payable）配對', () => {
  const st = emptyState({
    accounts: [{ id: 'a1', name: '錢包', balance: 0, currency: 'TWD' }],
    loans: [{ id: 'L1', person: '老王', direction: 'receivable', amount: 1000, paid: 0, account: 'a1', currency: 'TWD', date: '2023-12-01', payments: [], status: 'active' }],
  });
  run(st, [r('錢包', 'TWD', '應付款項', '借還款', '還款', '-400', '', '', '2024/1/5', '10:00', '老王')]);
  assert.equal(st.loans.find(l => l.id === 'L1').paid, 0);
});

test('P0：停止追蹤的 loan 不被配對，也不會被改回 active', () => {
  const st = emptyState({
    accounts: [{ id: 'a1', name: '錢包', balance: 0, currency: 'TWD' }],
    loans: [{ id: 'L1', person: '小明', direction: 'receivable', amount: 1000, paid: 0, account: 'a1', currency: 'TWD', date: '2023-12-01', payments: [], status: 'stopped', recordType: '應收款項' }],
  });
  run(st, [r('錢包', 'TWD', '應收款項', '借還款', '收款', '400', '', '', '2024/1/5', '10:00', '小明')]);
  const L1 = st.loans.find(l => l.id === 'L1');
  assert.equal(L1.paid, 0);
  assert.equal(L1.status, 'stopped');
});

test('P0：不同幣別的 loan 不被配對', () => {
  const st = emptyState({
    accounts: [{ id: 'a1', name: '錢包', balance: 0, currency: 'TWD' }],
    loans: [{ id: 'L1', person: '小明', direction: 'receivable', amount: 100, paid: 0, account: 'x', currency: 'USD', date: '2023-12-01', payments: [], status: 'active', recordType: '應收款項' }],
  });
  const res = run(st, [r('錢包', 'TWD', '應收款項', '借還款', '收款', '50', '', '', '2024/1/5', '10:00', '小明')]);
  assert.equal(st.loans.find(l => l.id === 'L1').paid, 0);
  assert.ok(res.warnings.some(w => /TWD/.test(w.message)));
});

test('P0：同名 TWD／USD 帳戶分開建立與計算', () => {
  const st = emptyState();
  const res = run(st, [
    r('玉山', 'TWD', '初始金額', '', '', '1000', '', '', ''),
    r('玉山', 'USD', '初始金額', '', '', '50', '', '', ''),
    r('玉山', 'TWD', '支出', '飲食', '午餐', '-100'),
    r('玉山', 'USD', '支出', '飲食', '午餐', '-5'),
  ]);
  assert.equal(res.errors.length, 0);
  assert.equal(st.accounts.length, 2);
  assert.equal(bal(st, '玉山', 'TWD'), 900);
  assert.equal(bal(st, '玉山', 'USD'), 45);
});

test('P0：既有帳戶無 currency 視為 TWD，可被 TWD 或空白幣別列匹配', () => {
  const st = emptyState({ accounts: [{ id: 'a1', name: '錢包', balance: 0 }] });
  run(st, [
    r('錢包', 'TWD', '支出', '飲食', '午餐', '-100'),
    r('錢包', '', '支出', '飲食', '晚餐', '-50'),
  ]);
  assert.equal(st.accounts.length, 1);
});

test('P1：收還款列的手續費／折扣計入帳戶影響', () => {
  const st = emptyState();
  run(st, [
    r('錢包', 'TWD', '初始金額', '', '', '5000', '', '', ''),
    r('錢包', 'TWD', '應付款項', '借還款', '借入', '2000', '', '', '2024/1/1', '10:00', '老王'),
    r('錢包', 'TWD', '應付款項', '借還款', '還款', '-1000', '15', '', '2024/1/2', '10:00', '老王'),
  ]);
  assert.equal(bal(st, '錢包'), 5000 + 2000 - 1000 - 15);
  const loan = st.loans.find(l => !l.historicalOnly);
  assert.equal(loan.paid, 1000);
});

test('append：既有帳戶餘額不自動變動，但回報 existingDeltas', () => {
  const st = emptyState({ accounts: [{ id: 'a1', name: '錢包', balance: 777, currency: 'TWD' }] });
  const res = run(st, [
    r('錢包', 'TWD', '支出', '飲食', '午餐', '-100', '5'),
    r('錢包', 'TWD', '收入', '薪水', '月薪', '30'),
  ]);
  assert.equal(bal(st, '錢包'), 777);
  assert.equal(res.existingDeltas.get('a1'), -100 - 5 + 30);
});

test('append：重複匯入同一列會略過', () => {
  const st = emptyState();
  const lines = [r('錢包', 'TWD', '初始金額', '', '', '0', '', '', ''), r('錢包', 'TWD', '支出', '飲食', '午餐', '-100')];
  run(st, lines);
  const res2 = run(st, lines);
  assert.equal(res2.transactions.length, 0);
});

test('轉帳：來源為既有帳戶、目的為新帳戶時，新帳戶仍計入轉入金額', () => {
  const st = emptyState({ accounts: [{ id: 'a1', name: '銀行', balance: 5000, currency: 'TWD' }] });
  const res = run(st, [
    r('銀行', 'TWD', '轉出', '轉帳', '轉帳', '-300', '', '', '2024/2/1', '09:00'),
    r('悠遊卡', 'TWD', '轉入', '轉帳', '轉帳', '300', '', '', '2024/2/1', '09:00'),
  ]);
  assert.equal(res.errors.length, 0);
  assert.equal(bal(st, '銀行'), 5000);
  assert.equal(bal(st, '悠遊卡'), 300);
  assert.equal(res.existingDeltas.get('a1'), -300);
});
