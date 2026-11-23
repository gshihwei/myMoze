// 帳務對帳稽核 tests (V26.28). Run: node --test   (from repo root)
// 用「獨立於 App 的算法」從 CSV 原始列直接算出每個帳戶的預期餘額與借還款餘額，
// 再與 buildImport 的結果逐帳戶比對（不只驗證筆數）。CSV 由固定種子產生，結果可重現。
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
const emptyState = () => ({ accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [] });

// ---- 固定種子亂數 ----
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

const ACCOUNTS = [
  { name: '錢包', cur: 'TWD', open: 5000 }, { name: '銀行', cur: 'TWD', open: 120000 },
  { name: '銀行', cur: 'USD', open: 800 },   // 同名不同幣別
  { name: '零帳戶', cur: 'TWD', open: 0 },
];
const key = (name, cur) => `${name}|${cur}`;
function row(a, type, main, sub, amt, fee, disc, date, time, person = '') {
  return [a.name, a.cur, type, main, sub, amt, fee || '', disc || '', '', '', date, time, '', '', '', person].join(',');
}

// 產生 N 筆事件；回傳 CSV 列、獨立算出的預期餘額、預期借還款餘額、預期交易數。
function generate(n, seed) {
  const R = rng(seed), pick = arr => arr[Math.floor(R() * arr.length)], int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  const lines = [], expected = new Map(), txCount = { n: 0, settle: 0 };
  const add = (a, v) => expected.set(key(a.name, a.cur), (expected.get(key(a.name, a.cur)) || 0) + v);
  for (const a of ACCOUNTS) { lines.push(row(a, '初始金額', '', '', a.open, '', '', '')); expected.set(key(a.name, a.cur), a.open); }
  const owed = new Map();   // `${direction}|${person}|${cur}` → 未結金額（獨立計算）
  let day = 0;
  const stamp = () => { day++; const d = new Date(Date.UTC(2023, 0, 1) + day * 3600e3 * 7); return [`${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`, `${String(8 + (day % 12)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`]; };
  const twd = ACCOUNTS.filter(a => a.cur === 'TWD');
  for (let i = 0; i < n; i++) {
    const [date, time] = stamp(), kind = R();
    const fee = R() < 0.3 ? int(1, 30) : 0, disc = R() < 0.2 ? int(1, 20) : 0;
    if (kind < 0.30) { const a = pick(ACCOUNTS), v = int(1, 5000); lines.push(row(a, '支出', '飲食', '午餐', -v, fee, disc, date, time)); add(a, -v - fee + disc); txCount.n++; }
    else if (kind < 0.45) { const a = pick(ACCOUNTS), v = int(1, 9000); lines.push(row(a, '收入', '薪水', '月薪', v, fee, disc, date, time)); add(a, v - fee + disc); txCount.n++; }
    else if (kind < 0.58) {   // 同幣別轉帳（兩個不同 TWD 帳戶）
      const from = pick(twd), to = pick(twd.filter(x => x !== from)), v = int(10, 3000);
      lines.push(row(from, '轉出', '轉帳', '轉帳', -v, fee, '', date, time), row(to, '轉入', '轉帳', '轉帳', v, '', '', date, time));
      add(from, -v - fee); add(to, v); txCount.n++;
    } else if (kind < 0.66) { // 跨幣別轉帳：兩端金額不同
      const usd = ACCOUNTS[2], tw = ACCOUNTS[1], v = int(100, 3000), got = Math.round(v / 31);
      const out = R() < 0.5;
      const [from, to, vf, vt] = out ? [tw, usd, v, got] : [usd, tw, got, v];
      lines.push(row(from, '轉出', '轉帳', '轉帳', -vf, fee, '', date, time), row(to, '轉入', '轉帳', '轉帳', vt, '', '', date, time));
      add(from, -vf - fee); add(to, vt); txCount.n++;
    } else if (kind < 0.72) { const a = pick(ACCOUNTS), v = int(-50, 50) || 1; lines.push(row(a, '餘額調整', '其他', '調整', v, '', '', date, time)); add(a, v); txCount.n++; }
    else if (kind < 0.84) {   // 借出 / 借入
      const a = pick(twd), person = pick(['小明', '阿華', '老王']), lend = R() < 0.5, v = int(100, 4000);
      if (lend) { lines.push(row(a, '應收款項', '借還款', '借出', -v, fee, disc, date, time, person)); add(a, -v - fee + disc); owed.set(`receivable|${person}|TWD`, (owed.get(`receivable|${person}|TWD`) || 0) + v); }
      else { lines.push(row(a, '應付款項', '借還款', '借入', v, fee, disc, date, time, person)); add(a, v - fee + disc); owed.set(`payable|${person}|TWD`, (owed.get(`payable|${person}|TWD`) || 0) + v); }
      txCount.n++;
    } else {                  // 收款 / 還款：只在有未結金額時發生，且不超過未結（避免孤兒款項）
      const open = [...owed.entries()].filter(([, v]) => v > 0);
      if (!open.length) { i--; day--; continue; }
      const [k, left] = pick(open), [dir, person] = k.split('|'), a = pick(twd), v = Math.min(left, int(50, 2500));
      if (dir === 'receivable') { lines.push(row(a, '應收款項', '借還款', '收款', v, fee, disc, date, time, person)); add(a, v - fee + disc); }
      else { lines.push(row(a, '應付款項', '借還款', '還款', -v, fee, disc, date, time, person)); add(a, -v - fee + disc); }
      owed.set(k, left - v); txCount.settle++;
    }
  }
  return { lines, expected, owed, txCount: txCount.n, settleCount: txCount.settle };
}
const csvOf = lines => [HEADER, ...lines].join('\n');
const balOf = (st, name, cur) => st.accounts.find(a => a.name === name && (a.currency || 'TWD') === cur)?.balance;

test('對帳稽核：2000 筆混合 CSV，每個帳戶餘額 = 初始金額 + Σ(金額 − 手續費 + 折扣)', () => {
  const g = generate(2000, 20260101), st = emptyState();
  const res = M.buildImport(st, M.parseCSV(csvOf(g.lines)));
  assert.equal(res.errors.length, 0, JSON.stringify(res.errors.slice(0, 3)));
  assert.equal(st.accounts.length, 4, '同名銀行 TWD/USD 必須是兩個帳戶');
  for (const a of ACCOUNTS) assert.equal(balOf(st, a.name, a.cur), g.expected.get(key(a.name, a.cur)), `${a.name}/${a.cur}`);
  assert.equal(res.transactions.filter(t => t.kind !== 'loanPayment').length, g.txCount, '轉帳兩列合併為一筆，其餘一列一筆');
  assert.ok(res.transactions.filter(t => t.kind === 'loanPayment').length >= g.settleCount, '每筆收還款至少一筆交易（跨多筆借款時會拆開）');
});

test('對帳稽核：借還款未結餘額與獨立計算一致，且 paid／payments／status 內部一致', () => {
  const g = generate(2000, 777), st = emptyState();
  const res = M.buildImport(st, M.parseCSV(csvOf(g.lines)));
  assert.equal(res.errors.length, 0);
  assert.equal(st.loans.filter(l => l.historicalOnly).length, 0, '收還款不超過未結金額，不應出現孤兒歷史款項');
  const got = new Map();
  for (const l of st.loans) {
    const out = Math.max(0, l.amount - l.paid), k = `${l.direction}|${l.person}|${l.currency || 'TWD'}`;
    got.set(k, (got.get(k) || 0) + out);
    assert.ok(l.paid <= l.amount + 1e-9, `paid 不可超過 amount：${l.id}`);
    assert.equal(Math.round(((l.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0)) * 100), Math.round(l.paid * 100), `payments 加總 = paid：${l.id}`);
    assert.equal(l.status, out <= 0 ? 'completed' : 'active');
  }
  for (const [k, v] of g.owed) assert.equal(got.get(k) || 0, v, `未結餘額 ${k}`);
});

test('對帳稽核：App 的 reconcile() 對同一份資料沒有任何差額', () => {
  const g = generate(1500, 424242), st = emptyState(), rows = M.parseCSV(csvOf(g.lines));
  M.buildImport(st, rows);
  assert.deepEqual(M.reconcile(st, M.csvOpenings(rows)).filter(x => x.mismatch), []);
});

test('對帳稽核：同一份 CSV 追加第二次——全部略過，餘額與借還款完全不變', () => {
  const g = generate(800, 99), st = emptyState(), rows = M.parseCSV(csvOf(g.lines));
  M.buildImport(st, rows);
  const snap = JSON.stringify({ a: st.accounts.map(a => [a.name, a.currency, a.balance]), l: st.loans.map(l => [l.id, l.paid]), n: st.transactions.length });
  const again = M.buildImport(st, M.parseCSV(csvOf(g.lines)));
  assert.equal(again.transactions.length, 0, '第二次不應新增交易');
  assert.equal(JSON.stringify({ a: st.accounts.map(a => [a.name, a.currency, a.balance]), l: st.loans.map(l => [l.id, l.paid]), n: st.transactions.length }), snap);
});

test('對帳稽核：還款超過未結金額——超出的部分成為歷史款項，帳戶餘額仍完整反映', () => {
  const st = emptyState(), A = { name: '錢包', cur: 'TWD' };
  const lines = [row(A, '初始金額', '', '', 1000, '', '', ''),
    row(A, '應付款項', '借還款', '借入', 500, '', '', '2024/1/1', '10:00', '老王'),
    row(A, '應付款項', '借還款', '還款', -800, 10, '', '2024/1/2', '10:00', '老王')];
  const res = M.buildImport(st, M.parseCSV(csvOf(lines)));
  assert.equal(res.errors.length, 0);
  assert.equal(balOf(st, '錢包', 'TWD'), 1000 + 500 - 800 - 10);
  const live = st.loans.find(l => !l.historicalOnly);
  assert.equal(live.paid, 500); assert.equal(live.status, 'completed');
  assert.equal(st.loans.filter(l => l.historicalOnly).reduce((s, l) => s + l.amount, 0), 300);
});

test('對帳稽核：停止追蹤的借款遇到同對象收款——收款成為歷史款項，不動到停止追蹤的借款', () => {
  const st = emptyState(), A = { name: '錢包', cur: 'TWD' };
  M.buildImport(st, M.parseCSV(csvOf([row(A, '初始金額', '', '', 0, '', '', ''), row(A, '應收款項', '借還款', '借出', -1000, '', '', '2024/1/1', '10:00', '小明')])));
  const before = st.loans[0]; before.status = 'stopped';
  const res = M.buildImport(st, M.parseCSV(csvOf([row(A, '應收款項', '借還款', '收款', 400, '', '', '2024/2/1', '10:00', '小明')])));
  assert.equal(res.errors.length, 0);
  assert.equal(before.paid || 0, 0); assert.equal(before.status, 'stopped');
  assert.equal(st.loans.filter(l => l.historicalOnly).length, 1);
});

test('對帳稽核：沒有任何對應借款的孤兒收款／還款，手續費與折扣仍計入帳戶', () => {
  const st = emptyState(), A = { name: '錢包', cur: 'TWD' };
  const res = M.buildImport(st, M.parseCSV(csvOf([row(A, '初始金額', '', '', 1000, '', '', ''),
    row(A, '應收款項', '借還款', '收款', 300, 7, 2, '2024/1/1', '10:00', '阿華'),
    row(A, '應付款項', '借還款', '還款', -200, 5, 1, '2024/1/2', '10:00', '老王')])));
  assert.equal(res.errors.length, 0);
  assert.equal(balOf(st, '錢包', 'TWD'), 1000 + (300 - 7 + 2) + (-200 - 5 + 1));
});
