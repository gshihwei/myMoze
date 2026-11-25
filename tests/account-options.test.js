// 帳戶不計入總資產／餘額不足提醒 tests (V26.37). Run: node --test   (from repo root)
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
const mk = accounts => ({ accounts, categories: [], projects: [], loans: [], budgets: [], recurring: [], transactions: [] });
const A = (id, balance, o = {}) => ({ id, name: id, type: 'bank', balance, ...o });

test('netWorth／資產負債總覽：不納入總資產的帳戶被排除', () => {
  const { J } = bundle(mk([A('a', 1000), A('b', 5000, { excludeNet: true }), A('c', -200, { type: 'card' })]));
  assert.equal(J('netWorth(state.accounts).total'), 800);
  const o = J('balanceOverview()');
  assert.equal(o.assets, 1000); assert.equal(o.liabilities, 200);
});

test('netWorthAt：不納入的帳戶之交易不影響淨資產走勢', () => {
  const st = mk([A('a', 1000), A('b', 500, { excludeNet: true })]);
  st.transactions = [{ id: 't1', date: '2026-02-10', kind: 'income', amount: 300, account: 'a' }, { id: 't2', date: '2026-02-12', kind: 'income', amount: 400, account: 'b' }];
  const { J } = bundle(st);
  assert.deepEqual(J(`netWorthAt(['2026-01'])`), [700]);
});

test('lowBalanceHit：只有設定門檻且餘額低於門檻的非信用卡、未封存帳戶', () => {
  const { J } = bundle(mk([]));
  assert.equal(J(`lowBalanceHit({type:'bank',balance:100,lowBalance:500})`), true);
  assert.equal(J(`lowBalanceHit({type:'bank',balance:500,lowBalance:500})`), false);
  assert.equal(J(`lowBalanceHit({type:'bank',balance:1})`), false);
  assert.equal(J(`lowBalanceHit({type:'card',balance:-9,lowBalance:500})`), false);
  assert.equal(J(`lowBalanceHit({type:'bank',balance:1,lowBalance:500,archived:true})`), false);
});

test('餘額不足會出現在提醒；設定表單可存取兩個選項', () => {
  const { J, run } = bundle(mk([A('錢包', 100, { lowBalance: 300 }), A('銀行', 9000, { lowBalance: 300 })]));
  const l = J(`reminderList('2026-11-20T09:00:00', 3)`);
  assert.equal(l.length, 1); assert.equal(l[0].type, 'low'); assert.equal(l[0].title, '錢包 餘額不足');
  assert.match(J(`reminderBarHTML(reminderList('2026-11-20T09:00:00', 3))`), /低於/);
  const f = J(`acctFromEditForm(new Map([['aname','錢包'],['acur','TWD'],['atype','bank'],['aexclude','on'],['alow','500']]), state.accounts[0]).account`);
  assert.equal(f.excludeNet, true); assert.equal(f.lowBalance, 500);
  run(`state.accounts[0].excludeNet = true`);
  const g = J(`acctFromEditForm(new Map([['aname','錢包'],['acur','TWD'],['atype','bank'],['alow','']]), state.accounts[0]).account`);
  assert.equal(g.excludeNet, undefined); assert.equal(g.lowBalance, undefined);
  assert.match(J(`acctEditFormHTML(state.accounts[0])`), /name="aexclude"/);
});

test('新增帳戶表單：選項 HTML 與表單轉換（信用卡不存餘額不足門檻）', () => {
  const { J } = bundle(mk([]));
  assert.match(J('acctNewOptionsHTML()'), /name="aexclude"/);
  assert.deepEqual(J(`acctOptionsFromForm(new Map([['aexclude','on'],['alow','300']]), 'bank')`), { excludeNet: true, lowBalance: 300 });
  assert.deepEqual(J(`acctOptionsFromForm(new Map([['alow','300']]), 'card')`), {});
  assert.deepEqual(J(`acctOptionsFromForm(new Map([['alow','']]), 'bank')`), {});
  assert.deepEqual(J(`acctOptionsFromForm(new Map([['alow','0']]), 'cash')`), { lowBalance: 0 });
});

test('帳戶類型：新增電子支付；現有帳戶可改類型，轉成信用卡帶預設欄位、轉離信用卡清掉卡片欄位', () => {
  const { J, run } = bundle(mk([A('錢包', 100), A('卡', -500, { type: 'card', limit: 80000, statement: 10, due: 25, lowBalance: 5 })]));
  assert.equal(J(`acctTypeLabel({type:'ewallet'})`), '電子支付');
  assert.deepEqual(J('acctTypes().map(x => x[0])'), ['bank', 'cash', 'ewallet', 'card']);
  const e = J(`acctFromEditForm(new Map([['aname','錢包'],['acur','TWD'],['atype','ewallet']]), state.accounts[0]).account`);
  assert.equal(e.type, 'ewallet'); assert.equal(e.limit, undefined); assert.equal(e.balance, 100);
  const c = J(`acctFromEditForm(new Map([['aname','錢包'],['acur','TWD'],['atype','card'],['alimit','30000']]), state.accounts[0]).account`);
  assert.equal(c.type, 'card'); assert.equal(c.limit, 30000); assert.equal(c.statement, 15); assert.equal(c.due, 5);
  const b = J(`acctFromEditForm(new Map([['aname','卡'],['acur','TWD'],['atype','bank']]), state.accounts[1]).account`);
  assert.equal(b.type, 'bank'); assert.equal(b.limit, undefined); assert.equal(b.statement, undefined); assert.equal(b.balance, -500);
  const bad = J(`acctFromEditForm(new Map([['aname','錢包'],['acur','TWD'],['atype','hack']]), state.accounts[0]).account`);
  assert.equal(bad.type, 'bank');
  assert.match(J('acctEditFormHTML(state.accounts[1])'), /data-acct-card-fields\s*>/);
  assert.match(J('acctEditFormHTML(state.accounts[0])'), /data-acct-card-fields hidden/);
});
