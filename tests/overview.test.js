// Overview statistics and chart tests (V26.0). Run: node --test   (from repo root)
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
function bundle(state) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const ctx = vm.createContext({ document: any(), window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)};fxCache={rates:{USD:0.032},fetchedAt:Date.now()}`, ctx);
  return code => vm.runInContext(code, ctx);
}
const J = (run, code) => JSON.parse(run(`JSON.stringify(${code})`));
const base = extra => ({ accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [], ...extra });

test('ledgerEffects() 與匯入／對帳的 txAccountEffects() 規則一致', () => {
  const M = importer();
  const H = '帳戶,幣種,記錄類型＊,主類別＊,子類別＊,金額＊,手續費,折扣,名稱,商家,日期＊,時間,專案,描述,標籤,對象';
  const r = (a, c, t, m, s, amt, fee = '', date = '2026/1/1', person = '') => [a, c, t, m, s, amt, fee, '', '', '', date, '10:00', '', '', '', person].join(',');
  const st = base();
  M.buildImport(st, M.parseCSV([H,
    r('銀行', 'TWD', '初始金額', '', '', '10000', '', ''), r('美元', 'USD', '初始金額', '', '', '0', '', ''),
    r('銀行', 'TWD', '支出', '飲食', '午餐', '-100', '5'), r('銀行', 'TWD', '轉出', '轉帳', '轉帳', '-3200', '15', '2026/1/2'),
    r('美元', 'USD', '轉入', '轉帳', '轉帳', '100', '', '2026/1/2'), r('銀行', 'TWD', '應收款項', '借還款', '借出', '-500', '', '2026/1/3', '小明'),
  ].join('\n')));
  st.transactions.push({ id: 'm1', kind: 'loan', loanAction: 'borrow', amount: 50, account: st.accounts[0].id, date: '2026-01-04' });
  const run = bundle(st);
  const mine = {};
  for (const t of st.transactions) for (const [id, e] of J(run, `ledgerEffects(${JSON.stringify(t)})`)) mine[id] = (mine[id] || 0) + e;
  const theirs = Object.fromEntries(M.ledgerByAccount(st).sum);
  for (const k of Object.keys(theirs)) assert.ok(Math.abs(theirs[k] - mine[k]) < 1e-9, k);
});

test('netWorthAt()：月底淨資產 = 目前淨資產 − 之後交易的影響（外幣依匯率換算）', () => {
  const run = bundle(base({
    accounts: [{ id: 'a', balance: 1000 }, { id: 'u', currency: 'USD', balance: 32 }],
    transactions: [
      { id: 1, kind: 'income', amount: 500, account: 'a', date: '2026-01-10' },
      { id: 2, kind: 'expense', amount: 200, account: 'a', date: '2026-02-05' },
      { id: 3, kind: 'income', amount: 32, account: 'u', date: '2026-02-20' },
    ],
  }));
  // now: 1000 + 32/0.032 = 2000
  assert.deepEqual(J(run, `netWorthAt(['2025-12','2026-01','2026-02','2026-03'])`), [2000 - 1000 - (-200) - 500, 2000 - 1000 + 200, 2000, 2000]);
});

test('monthStats()：只算支出／收入，外幣支出換算成 TWD', () => {
  const run = bundle(base({
    accounts: [{ id: 'a', balance: 0 }, { id: 'u', currency: 'USD', balance: 0 }],
    transactions: [
      { id: 1, kind: 'expense', amount: 100, account: 'a', date: '2026-03-01' },
      { id: 2, kind: 'expense', amount: 3.2, account: 'u', date: '2026-03-02' },
      { id: 3, kind: 'income', amount: 50, account: 'a', date: '2026-03-03' },
      { id: 4, kind: 'transfer', amount: 999, account: 'a', toAccount: 'u', date: '2026-03-03' },
      { id: 5, kind: 'expense', amount: 7, account: 'a', date: '2026-04-01' },
    ],
  }));
  assert.deepEqual(J(run, `monthStats('2026-03')`), { key: '2026-03', out: 200, inc: 50, nOut: 2, nInc: 1 });
});

test('pctChange()／deltaText()：上期為 0 時不顯示百分比', () => {
  const run = bundle(base());
  assert.equal(run('pctChange(110,100)'), 10);
  assert.equal(run('pctChange(5,0)'), null);
  assert.match(run('deltaText(110,100)'), /^↑ 10\.00%（\+10）$/);
  assert.match(run('deltaText(90,100)'), /^↓ 10\.00%（−10）$/);
  assert.doesNotMatch(run('deltaText(5,0)'), /%/);
});

test('chartSeries()：月份跟著所選月份走，圖表每月一個可點區塊', () => {
  const run = bundle(base({ accounts: [{ id: 'a', balance: 0 }] }));
  const keys = J(run, `chartSeries(12,'2026-03').map(s=>s.key)`);
  assert.equal(keys.length, 12);
  assert.equal(keys[0], '2025-04'); assert.equal(keys[11], '2026-03');
  const svg = run(`chartSVG(chartSeries(6,'2026-03'))`);
  assert.equal((svg.match(/data-chart-month=/g) || []).length, 6);
  assert.ok(!/NaN|Infinity/.test(svg));
  assert.match(run(`chartLegend(chartSeries(1,'2026-03')[0])`), /2026 年 3 月/);
  assert.equal(run('compactNum(85000)'), '8.5 萬');
  assert.equal(run('compactNum(5388940)'), '539 萬');
});
