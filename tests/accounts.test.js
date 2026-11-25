// 帳戶管理 tests (V26.10). Run: node --test   (from repo root)
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
function importer() {
  const window = {};
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'import.js'), 'utf8'), vm.createContext({ window, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} }, console, TextDecoder, Blob: class {}, URL, setTimeout }));
  return window.MozeImportInternals;
}
const base = () => ({
  accounts: [
    { id: 'a', name: '錢包', type: 'cash', balance: 900 },
    { id: 'b', name: '空帳戶', type: 'bank', balance: 0 },
    { id: 'c', name: '信用卡', type: 'card', balance: -500, limit: 30000, statement: 15, due: 5 },
    { id: 'z', name: '舊帳戶', type: 'bank', balance: 10, archived: true },
  ],
  categories: [], projects: [], budgets: [], recurring: [], loans: [],
  transactions: [{ id: 1, kind: 'expense', amount: 100, account: 'a', date: '2026-06-01' }, { id: 2, kind: 'expense', amount: 500, account: 'c', date: '2026-06-02' }],
});
const form = o => `({get:k=>(${JSON.stringify(o)})[k]??null})`;

test('acctFromEditForm()：名稱、幣別格式、已有交易不能改幣別、名稱＋幣別不可重複', () => {
  const { J } = bundle(base());
  assert.match(J(`acctFromEditForm(${form({ aname: '' })},state.accounts[0]).error`), /名稱/);
  assert.match(J(`acctFromEditForm(${form({ aname: 'x', acur: 'U1' })},state.accounts[1]).error`), /個英文字母/);
  assert.match(J(`acctFromEditForm(${form({ aname: '錢包', acur: 'USD' })},state.accounts[0]).error`), /不能修改/);
  assert.match(J(`acctFromEditForm(${form({ aname: '錢包', acur: 'TWD' })},state.accounts[1]).error`), /已經有/);
  const ok = J(`acctFromEditForm(${form({ aname: '美金戶', acur: 'usd', atype: 'cash', anote: '末四碼 1234', aarchived: 'on' })},state.accounts[1]).account`);
  assert.deepEqual([ok.name, ok.currency, ok.type, ok.note, ok.archived, ok.balance], ['美金戶', 'USD', 'cash', '末四碼 1234', true, 0]);
  const card = J(`acctFromEditForm(${form({ aname: '信用卡', acur: 'TWD', alimit: '50000', astatement: '40', adue: '0' })},state.accounts[2]).account`);
  assert.deepEqual([card.type, card.limit, card.statement, card.due], ['card', 50000, 31, 1]);
});

test('acctAdjustTo()：以「餘額調整」交易補差額，對帳仍一致；沒有差額不建立交易', () => {
  const M = importer();
  const { J, run } = bundle(base());
  const t = J(`acctAdjustTo(state.accounts[0],1250,'2026-06-10','對帳')`);
  assert.deepEqual([t.kind, t.amount, t.account, t.date, t.note], ['balance_adjustment', 350, 'a', '2026-06-10', '對帳']);
  assert.equal(J('state.accounts[0].balance'), 1250);
  assert.equal(J(`acctAdjustTo(state.accounts[0],1250)`), null);
  J(`acctAdjustTo(state.accounts[2],-800)`);
  assert.equal(J('state.accounts[2].balance'), -800);
  const st = J('state');
  // opening balances: 錢包 1000, 信用卡 0 → still reconciles after the adjustments
  const rows = M.reconcile(st, null, new Map([['a', 1000], ['c', 0]]));
  assert.equal(rows.find(r => r.id === 'a').mismatch, false);
  assert.equal(rows.find(r => r.id === 'c').mismatch, false);
  run('0');
});

test('acctActive()：封存帳戶不出現在選單，除非是目前選取的帳戶', () => {
  const { J } = bundle(base());
  assert.deepEqual(J(`acctActive(state.accounts,'a').map(a=>a.id)`), ['a', 'b', 'c']);
  assert.deepEqual(J(`acctActive(state.accounts,'z').map(a=>a.id)`), ['a', 'b', 'c', 'z']);
  assert.equal(J(`acctHasTx('b')`), false);
});

test('管理表單：已有交易時幣別唯讀，並提供調整餘額與刪除', () => {
  const { run } = bundle(base());
  const h = run(`acctEditFormHTML(state.accounts[0])`);
  assert.match(h, /name="acur"[^>]*readonly/);
  assert.match(h, /data-acct-adjust="a"/); assert.match(h, /data-acct-delete="a"/);
  assert.doesNotMatch(run(`acctEditFormHTML(state.accounts[1])`), /name="acur"[^>]*readonly/);
  assert.match(run(`acctEditFormHTML(state.accounts[2])`), /name="astatement"/);
});

test('acctOrdered()／acctMove()：同類型（一般帳戶或信用卡）內上下移動', () => {
  const { J } = bundle(base());
  assert.deepEqual(J('acctOrdered(state.accounts).map(a=>a.id)'), ['a', 'b', 'c', 'z']);
  assert.equal(J(`acctMove(state.accounts.find(a=>a.id==='b'),-1)`), true);
  assert.deepEqual(J('acctOrdered(state.accounts).map(a=>a.id)'), ['b', 'a', 'c', 'z']);
  assert.equal(J(`acctMove(state.accounts.find(a=>a.id==='c'),-1)`), false, 'the only card cannot move among cards');
  assert.equal(J(`acctMove(state.accounts.find(a=>a.id==='b'),-1)`), false, 'already first');
});
