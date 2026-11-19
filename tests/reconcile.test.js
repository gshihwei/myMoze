// Account reconciliation tests (V25.13). Run: node --test   (from repo root)
// balance = CSV 初始金額 + Σ transaction effects, using the same rules as the app.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'import.js'), 'utf8');
  const window = {};
  const document = { readyState: 'complete', getElementById: () => null, addEventListener() {} };
  vm.runInContext(src, vm.createContext({ window, document, console, TextDecoder, Blob: class {}, URL, setTimeout }));
  return window.MozeImportInternals;
}
const M = load();

const HEADER = '帳戶,幣種,記錄類型＊,主類別＊,子類別＊,金額＊,手續費,折扣,名稱,商家,日期＊,時間,專案,描述,標籤,對象';
function r(acct, cur, type, main, sub, amt, fee = '', disc = '', date = '2024/1/1', time = '10:00', person = '') {
  return [acct, cur, type, main, sub, amt, fee, disc, '', '', date, time, '', '', '', person].join(',');
}
const CSV = [HEADER,
  r('銀行', 'TWD', '初始金額', '', '', '10000', '', '', ''),
  r('美元戶', 'USD', '初始金額', '', '', '20', '', '', ''),
  r('錢包', 'TWD', '初始金額', '', '', '500', '', '', ''),
  r('錢包', 'TWD', '支出', '飲食', '午餐', '-100', '5', '10'),
  r('銀行', 'TWD', '收入', '薪水', '月薪', '30000', '', '', '2024/1/5'),
  r('銀行', 'TWD', '轉出', '轉帳', '轉帳', '-3200', '15', '', '2024/1/6', '11:00'),
  r('美元戶', 'USD', '轉入', '轉帳', '轉帳', '100', '', '', '2024/1/6', '11:00'),
  r('銀行', 'TWD', '餘額調整', '其他', '調整', '-7', '', '', '2024/1/7'),
  r('錢包', 'TWD', '應收款項', '借還款', '借出', '-300', '', '', '2024/1/8', '10:00', '小明'),
  r('錢包', 'TWD', '應收款項', '借還款', '借出', '100', '', '', '2024/1/9', '10:00', '小明'),
  r('銀行', 'TWD', '應付款項', '借還款', '借入', '2000', '', '', '2024/1/10', '10:00', '老王'),
  r('銀行', 'TWD', '應付款項', '借還款', '還款', '-1000', '15', '', '2024/1/11', '10:00', '老王'),
].join('\n');

function imported() {
  const st = { accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [] };
  const rows = M.parseCSV(CSV);
  const res = M.buildImport(st, rows);
  assert.equal(res.errors.length, 0);
  return { st, openings: M.csvOpenings(rows) };
}
const byName = (rows, name) => rows.find(x => x.name === name);

test('csvOpenings 只讀初始金額，以 (名稱, 幣別) 為 key', () => {
  const { openings } = imported();
  assert.equal(openings.size, 3);
  assert.equal(openings.get('銀行\u001fTWD'), 10000);
  assert.equal(openings.get('美元戶\u001fUSD'), 20);
});

test('剛匯入的資料對帳全部一致（含手續費、跨幣別轉帳、餘額調整、借還款）', () => {
  const { st, openings } = imported();
  const rows = M.reconcile(st, openings);
  assert.deepEqual(rows.filter(x => x.mismatch), []);
  assert.equal(byName(rows, '銀行').expected, 10000 + 30000 - 3200 - 15 - 7 + 2000 - 1000 - 15);
  assert.equal(byName(rows, '美元戶').expected, 120);
  assert.equal(byName(rows, '錢包').expected, 500 - 100 - 5 + 10 - 300 + 100);
});

test('V25.6–V25.10.1 舊 bug：刪除跨幣別轉帳時目的端扣錯金額 → 對帳抓到差額', () => {
  const { st, openings } = imported();
  const i = st.transactions.findIndex(t => t.kind === 'transfer');
  const t = st.transactions[i];
  const acc = id => st.accounts.find(a => a.id === id);
  // old bundle adjust(t,-1): src += amount, dst -= amount (3200 instead of 100)
  acc(t.account).balance += t.amount;
  acc(t.toAccount).balance -= t.amount;
  st.transactions.splice(i, 1);
  const rows = M.reconcile(st, openings);
  assert.equal(byName(rows, '美元戶').diff, -(3200 - 100));
  assert.equal(byName(rows, '銀行').diff, -15); // fee was not given back either
  assert.equal(rows.filter(x => x.mismatch).length, 2);
});

test('App 內手動交易、信用卡繳款、手動借還款都計入交易合計', () => {
  const { st, openings } = imported();
  const bank = st.accounts.find(a => a.name === '銀行');
  st.accounts.push({ id: 'card', name: '信用卡', type: 'card', balance: -1000 });
  const add = (t, effects) => { st.transactions.push(t); for (const [id, e] of effects) st.accounts.find(a => a.id === id).balance += e; };
  add({ id: 'm1', kind: 'expense', amount: 80, account: bank.id }, [[bank.id, -80]]);
  add({ id: 'm2', kind: 'income', amount: 50, account: bank.id }, [[bank.id, 50]]);
  add({ id: 'm3', kind: 'transfer', amount: 600, account: bank.id, toAccount: 'card', cardPayment: true }, [[bank.id, -600], ['card', 600]]);
  add({ id: 'm4', kind: 'loan', loanAction: 'lend', amount: 200, account: bank.id }, [[bank.id, -200]]);
  add({ id: 'm5', kind: 'loanPayment', loanDirection: 'receivable', amount: 150, account: bank.id }, [[bank.id, 150]]);
  add({ id: 'm6', kind: 'loanPayment', loanDirection: 'payable', amount: 40, account: bank.id }, [[bank.id, -40]]);
  const rows = M.reconcile(st, openings);
  assert.deepEqual(rows.filter(x => x.mismatch), []);
  const card = byName(rows, '信用卡');
  assert.equal(card.opening, null);          // not in CSV → cannot be compared
  assert.equal(card.ledger, 600);
  assert.equal(card.balance, -400);
  assert.equal(card.implied, -1000);         // = balance the card was created with
});
