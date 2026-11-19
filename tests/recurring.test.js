// Recurring / upcoming / pending tests (V26.2). Run: node --test   (from repo root)
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
  let formValues = {};
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    FormData: class { get(k) { return formValues[k] ?? null; } },
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return { run, J: code => JSON.parse(run(`JSON.stringify(${code})`)), setForm: v => { formValues = v; } };
}
const base = extra => ({ accounts: [{ id: 'a', name: '錢包', balance: 1000 }], categories: [{ id: 'c', name: '帳單', icon: '•' }], projects: [], transactions: [], budgets: [], recurring: [], loans: [], ...extra });
function importer() {
  const window = {};
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'import.js'), 'utf8'), vm.createContext({ window, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} }, console, TextDecoder, Blob: class {}, URL, setTimeout }));
  return window.MozeImportInternals;
}

test('addPeriod()：月底日期遇到短月取該月最後一天，之後回到原本的日', () => {
  const { J } = bundle(base());
  const seq = J(`(()=>{const r={freq:'month',interval:1,start:'2026-01-31'};const out=[];let d=r.start;for(let i=0;i<4;i++){d=addPeriod(d,r);out.push(d)}return out})()`);
  assert.deepEqual(seq, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.equal(J(`addPeriod('2026-06-02',{freq:'week',interval:2,start:'2026-06-02'})`), '2026-06-16');
  assert.equal(J(`addPeriod('2026-12-30',{freq:'day',interval:3,start:'2026-12-30'})`), '2027-01-02');
  assert.equal(J(`addPeriod('2025-02-28',{freq:'year',interval:3,start:'2024-02-29'})`), '2028-02-29');
});

test('入帳：建立交易、調整餘額、下一期往後推；共 2 期結束後不能再入帳', () => {
  const { run, J } = bundle(base({ recurring: [{ id: 'r', name: '房租', amount: 300, kind: 'expense', category: 'c', account: 'a', freq: 'month', interval: 1, start: '2026-06-05', next: '2026-06-05', end: { type: 'count', value: 2 } }] }));
  const t = J(`postRecurring(state.recurring[0])`);
  assert.equal(t.date, '2026-06-05'); assert.equal(t.recurringId, 'r'); assert.equal(t.recurringSeq, 1);
  assert.equal(run('state.accounts[0].balance'), 700);
  assert.equal(J('state.recurring[0].next'), '2026-07-05');
  assert.equal(J('recurringLabel(state.recurring[0])'), '週期 #2 / 共 2 期');
  run('skipRecurring(state.recurring[0])');
  assert.equal(run('state.transactions.length'), 1, 'skip creates nothing');
  assert.equal(J('state.recurring[0].ended'), true);
  assert.equal(J('postRecurring(state.recurring[0])'), null);
  assert.equal(run('state.accounts[0].balance'), 700);
});

test('舊格式週期交易（只有 next）讀取時補預設值', () => {
  const { J } = bundle(base({ recurring: [{ id: 1, name: 'Netflix', amount: 390, next: '2026-09-05', category: 'c' }] }));
  const r = J('normRecurring(state.recurring[0])');
  assert.equal(r.freq, 'month'); assert.equal(r.interval, 1); assert.equal(r.start, '2026-09-05'); assert.equal(r.kind, 'expense');
  assert.deepEqual(r.end, { type: 'never' }); assert.equal(r.account, 'a');
  assert.equal(J('recurringLabel(state.recurring[0])'), '週期 #1 / 無限期');
});

test('即將到來：只列 30 天內未結束的，依日期排序，並跳脫名稱', () => {
  const upcoming = { innerHTML: '' }, upcomingTotal = { textContent: '' };
  const { run, J } = bundle(base(), { upcoming, upcomingTotal });
  run(`(()=>{const d=n=>isoDate(new Date(Date.now()+n*864e5));state.recurring=[{id:'x',name:'<b>遠',amount:1,next:d(40)},{id:'y',name:'明天<i>',amount:20,next:d(1)},{id:'z',name:'今天',amount:5,kind:'income',next:d(0)},{id:'w',name:'結束',amount:1,next:d(2),ended:true}]})()`);
  assert.deepEqual(J('upcomingList(30).map(r=>r.id)'), ['z', 'y']);
  run('renderUpcoming()');
  assert.ok(upcoming.innerHTML.indexOf('今天') < upcoming.innerHTML.indexOf('明天'));
  assert.ok(!upcoming.innerHTML.includes('明天<i>'));
  assert.match(upcomingTotal.textContent, /2 筆 · 合計 −\$15/);
  assert.equal(J(`relDay(isoDate(new Date(Date.now()-9*864e5)))`), '上星期');
});

test('待完成交易：新建立的不計入餘額，確認入帳才計入；舊的（已計入）確認時不重複計入', async () => {
  const txForm = { elements: {}, reset() {} }, splitRows = { querySelectorAll: () => [] };
  const b = bundle(base({ transactions: [{ id: 'old', kind: 'expense', amount: 100, account: 'a', date: '2026-06-01', pending: true }] }), { txForm, splitRows });
  b.run(`editId=null`);
  b.setForm({ kind: 'expense', amount: '250', date: '2026-06-02', name: '保險', category: 'c', account: 'a', pending: 'on' });
  b.run(`submitTx({preventDefault(){}})`);
  const t = b.J(`state.transactions.find(t=>t.name==='保險')`);
  assert.equal(t.pending, true); assert.equal(t.pendingApplied, false);
  assert.equal(b.run('state.accounts[0].balance'), 1000);
  assert.equal(b.J(`monthStats('2026-06').out`), 100, 'unapplied pending excluded from stats');
  b.run(`confirmPending(state.transactions.find(t=>t.name==='保險'))`);
  assert.equal(b.run('state.accounts[0].balance'), 750);
  b.run(`confirmPending(state.transactions.find(t=>t.id==='old'))`);
  assert.equal(b.run('state.accounts[0].balance'), 750, 'legacy pending already applied');
  assert.equal(b.J('state.transactions.filter(t=>t.pending).length'), 0);
});

test('對帳會跳過尚未入帳的待完成交易', () => {
  const M = importer();
  const st = base({ accounts: [{ id: 'a', name: '錢包', balance: 900 }], transactions: [
    { id: 1, kind: 'expense', amount: 100, account: 'a', date: '2026-06-01' },
    { id: 2, kind: 'expense', amount: 500, account: 'a', date: '2026-06-02', pending: true, pendingApplied: false },
    { id: 3, kind: 'expense', amount: 0, account: 'a', date: '2026-06-02', pending: true },
  ] });
  const rows = M.reconcile(st, null, new Map([['a', 1000]]));
  assert.equal(rows[0].mismatch, false);
  const { J } = bundle(st);
  assert.deepEqual(J(`ledgerEffects(state.transactions[1])`), []);
});
