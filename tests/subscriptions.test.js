// 訂閱管理 tests (V26.34). Run: node --test   (from repo root)
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
const rec = (id, name, amount, freq, o = {}) => ({ id, name, amount, kind: 'expense', freq, interval: 1, start: '2026-01-10', next: '2026-12-10', account: 'bank', category: '', end: { type: 'never' }, seq: 0, posted: 0, ...o });
const base = recurring => ({ accounts: [{ id: 'bank', name: 'B', type: 'bank', balance: 1000 }], categories: [], projects: [], transactions: [], loans: [], budgets: [], recurring });

test('subMonthly：月／年／週／日與間隔換算', () => {
  const { J } = bundle(base([]));
  assert.equal(J(`subMonthly({amount:300,freq:'month',interval:1})`), 300);
  assert.equal(J(`subMonthly({amount:600,freq:'month',interval:3})`), 200);
  assert.equal(J(`subMonthly({amount:1200,freq:'year',interval:1})`), 100);
  assert.equal(Math.round(J(`subMonthly({amount:100,freq:'week',interval:1})`)), 433);
  assert.equal(Math.round(J(`subMonthly({amount:10,freq:'day',interval:1})`)), 304);
});

test('subSummary：只統計標為訂閱、未暫停、未結束的支出', () => {
  const { J } = bundle(base([rec('a', 'Netflix', 390, 'month', { sub: true }), rec('b', 'iCloud', 1200, 'year', { sub: true }),
    rec('c', '暫停的', 500, 'month', { sub: true, paused: true }), rec('d', '房租', 9000, 'month'), rec('e', '薪水', 50000, 'month', { sub: true, kind: 'income' })]));
  const s = J('subSummary()');
  assert.deepEqual(s.active.map(r => r.name).sort(), ['Netflix', 'iCloud']);
  assert.deepEqual(s.paused.map(r => r.name), ['暫停的']);
  assert.equal(Math.round(s.monthly), 490); assert.equal(Math.round(s.yearly), 5880);
});

test('暫停：不自動入帳、不在即將到來、不提醒；恢復後恢復', () => {
  const r = rec('a', 'Netflix', 390, 'month', { sub: true, auto: true, next: '2026-11-01' });
  const { run, J } = bundle(base([r]));
  run(`subToggle(state.recurring[0], 'paused')`);
  assert.equal(run(`autoPostRecurring('2026-11-20')`), 0);
  assert.equal(J(`state.transactions.length`), 0);
  assert.equal(J(`upcomingList(3650).length`), 0);
  assert.equal(J(`reminderList('2026-11-20T09:00:00', 3).length`), 0);
  run(`subToggle(state.recurring[0], 'paused')`);
  assert.equal(run(`autoPostRecurring('2026-11-20')`), 1);
  assert.equal(J(`state.transactions.length`), 1);
});

test('subToggle 切換標記；找不到時回傳 false；編輯表單的展開會保留標記', () => {
  const { run, J } = bundle(base([rec('a', 'X', 10, 'month')]));
  assert.equal(run(`subToggle(state.recurring[0], 'sub')`), true);
  assert.equal(J(`state.recurring[0].sub`), true);
  assert.equal(run(`subToggle(null, 'sub')`), false);
  assert.equal(J(`({ ...state.recurring[0], name: 'Y' }).sub`), true);
});

test('subSummaryHTML：空狀態提示與合計文字', () => {
  const { J } = bundle(base([rec('a', 'Netflix', 390, 'month', { sub: true })]));
  assert.match(J(`subSummaryHTML(subSummary([]))`), /標為訂閱/);
  assert.match(J(`subSummaryHTML(subSummary())`), /訂閱 1 項/);
});
