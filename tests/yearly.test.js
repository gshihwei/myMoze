// 年度回顧與資產負債 tests (V26.36–37). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(state) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  return { ctx, run: c => vm.runInContext(c, ctx), J: c => JSON.parse(vm.runInContext(`JSON.stringify(${c})`, ctx)) };
}
const tx = (id, date, kind, amount, extra = {}) => ({ id, date, kind, amount, account: 'bank', category: 'food', name: id, ...extra });
const st = (transactions, accounts) => ({ accounts: accounts || [{ id: 'bank', name: '銀行', type: 'bank', balance: 1000 }], categories: [{ id: 'food', name: '飲食', kind: 'expense' }], projects: [], loans: [], budgets: [], recurring: [], transactions });

test('yearReview：收支、結餘、儲蓄率、去年比較與月均（過去年度用 12 個月）', () => {
  const { J } = bundle(st([tx('a', '2025-03-01', 'income', 100000), tx('b', '2025-03-05', 'expense', 40000), tx('c', '2024-06-01', 'expense', 20000),
    tx('d', '2025-12-31', 'expense', 20000), tx('e', '2025-05-01', 'expense', 999, { pending: true, pendingApplied: false })]));
  const r = J(`yearReview(2025, new Date('2026-06-15T00:00:00'))`);
  assert.equal(r.inc, 100000); assert.equal(r.out, 60000); assert.equal(r.net, 40000);
  assert.equal(r.savingsRate, 0.4); assert.equal(r.avgOut, 5000); assert.equal(r.prev.out, 20000);
  assert.equal(r.rows[2].out, 40000); assert.equal(r.rows[11].out, 20000);
  assert.equal(r.top[0].name, '飲食');
});

test('yearReview：今年只用已過月份算月均；沒有收入時儲蓄率為 null', () => {
  const { J } = bundle(st([tx('a', '2026-01-10', 'expense', 6000)]));
  const r = J(`yearReview(2026, new Date('2026-03-20T00:00:00'))`);
  assert.equal(r.months, 3); assert.equal(r.avgOut, 2000); assert.equal(r.savingsRate, null);
  assert.equal(J(`yrDeltaText(5, 0)`), '去年無資料');
  assert.match(J(`yrDeltaText(150, 100)`), /↑ 50.0%/);
});

test('balanceOverview：正餘額為資產、負餘額（信用卡欠款）為負債、外幣缺匯率不列入', () => {
  const accounts = [{ id: 'b', name: '銀行', type: 'bank', balance: 90000 }, { id: 'c', name: '卡', type: 'card', balance: -30000, limit: 100000 },
    { id: 'z', name: '怪幣', type: 'bank', balance: 500, currency: 'ZZZ' }];
  const { J } = bundle(st([], accounts));
  const o = J('balanceOverview()');
  assert.equal(o.assets, 90000); assert.equal(o.liabilities, 30000); assert.equal(o.net, 60000);
  assert.ok(Math.abs(o.ratio - 1 / 3) < 1e-9); assert.deepEqual(o.missing, ['ZZZ']);
  assert.match(J('balanceOverviewHTML(balanceOverview())'), /缺少 ZZZ/);
});

test('資產負債：沒有資產時負債比為 null；年度 HTML 含分類與柱狀圖', () => {
  const { J } = bundle(st([tx('a', '2026-02-01', 'expense', 100)], [{ id: 'c', name: '卡', type: 'card', balance: -500 }]));
  assert.equal(J('balanceOverview().ratio'), null);
  const h = J(`yearReviewHTML(yearReview(2026, new Date('2026-03-01T00:00:00')))`);
  assert.match(h, /yr-bars/); assert.match(h, /飲食/);
  assert.deepEqual(J('yrYears()').includes('2026'), true);
});
