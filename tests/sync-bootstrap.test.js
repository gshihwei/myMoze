// Sync bootstrap / conflict tests (V25.17). Run: node --test   (from repo root)
// Loads js/sync.js against a mocked Supabase client and localStorage.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'sync.js'), 'utf8');
const STARTER = () => ({
  accounts: [{ id: 'cash', name: '現金', type: 'cash', balance: 0 }, { id: 'bank', name: '銀行帳戶', type: 'bank', balance: 0 }],
  categories: [{ id: 'food', name: '飲食', kind: 'expense' }, { id: 'salary', name: '薪資', kind: 'income' }],
  projects: [], transactions: [], budgets: [], recurring: [], loans: [],
});

function boot({ appState, cloudRows = [], meta = {}, confirmAnswer = true }) {
  const ls = new Map();
  const user = { id: 'u1', email: 'a@b.c' };
  ls.set('moze-sync-last-user-v25', 'u1');
  ls.set('moze-sync-meta-state-v26|u1', JSON.stringify(meta));
  const cloud = new Map(cloudRows.map(r => [`${r.entity}|${r.record_id}`, r]));
  const confirms = [];
  let since = '';
  const q = {
    select() { since = ''; return q; }, order() { return q; }, range() { return q; }, gte(k, v) { since = v; return q; }, eq() { return q; },
    maybeSingle: async () => ({ data: null, error: null }),
    then(res) { res({ data: [...cloud.values()].filter(r => !since || r.updated_at >= since), error: null }); },
  };
  const client = {
    auth: { onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }, getSession: async () => ({ data: { session: { user } } }) },
    from: () => q,
    rpc: async (fn, a) => {
      const k = `${a.p_entity}|${a.p_record_id}`, ex = cloud.get(k);
      if ((ex ? ex.version : 0) !== a.p_base_version) return { data: { status: 'conflict', row: ex || null }, error: null };
      const row = { entity: a.p_entity, record_id: a.p_record_id, data: a.p_data, deleted: a.p_deleted, version: (ex ? ex.version : 0) + 1, updated_at: 'n' };
      cloud.set(k, row); return { data: { status: 'applied', row }, error: null };
    },
  };
  const els = {};
  const el = id => els[id] || (els[id] = { id, innerHTML: '', value: '', textContent: '', dataset: {}, addEventListener() {}, focus() {}, scrollIntoView() {} });
  let st = appState;
  const window = {
    addEventListener() {}, MOZE_SUPABASE_CONFIG: { url: 'https://x.supabase.co', publishableKey: 'pk' }, supabase: { createClient: () => client },
    MozeApp: { getState: () => st, setState: async s => { st = JSON.parse(JSON.stringify(s)); }, nav() {} },
  };
  const ctx = vm.createContext({
    window, document: { getElementById: el, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({}), head: { appendChild() {} } },
    location: { hash: '', search: '', origin: 'o', pathname: '/' }, crypto: { randomUUID: () => 'dev' }, history: { replaceState() {} },
    navigator: { onLine: true }, setTimeout: f => setTimeout(f, 0), clearTimeout, setInterval() {},
    console: { ...console, warn() {}, error() {}, log() {} }, alert: m => { throw new Error('alert:' + m); },
    confirm: m => { confirms.push(m); return confirmAnswer; },
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k), key: i => [...ls.keys()][i], get length() { return ls.size; } },
  });
  vm.runInContext(SRC, ctx);
  return { S: window.MozeSync, cloud, confirms, els, ls, get state() { return st; } };
}
const settle = () => new Promise(r => setTimeout(r, 30));
const cloudTx = { entity: 'transactions', record_id: 't9', data: { id: 't9', name: '雲端交易', amount: 10, kind: 'expense', account: 'bank' }, deleted: false, version: 4, updated_at: '2026-01-01' };
const cloudAcc = { entity: 'accounts', record_id: 'bank', data: { id: 'bank', name: '銀行帳戶', balance: 990 }, deleted: false, version: 2, updated_at: '2026-01-01' };

test('新裝置（空白起始資料）登入有資料的帳號：不詢問，直接採用雲端資料', async () => {
  const b = boot({ appState: STARTER(), cloudRows: [cloudTx, cloudAcc] });
  b.S.appReady(); await settle();
  await b.S.syncNow('silent');
  assert.equal(b.confirms.length, 0);
  assert.equal(b.state.transactions.length, 1);
  assert.equal(b.state.accounts.find(a => a.id === 'bank').balance, 990);
  assert.equal(b.cloud.get('transactions|t9').deleted, false, 'cloud data untouched');
});

test('本機已有資料時仍會詢問；回答「確定」採用雲端', async () => {
  const st = STARTER(); st.transactions.push({ id: 'L1', name: '本機', amount: 5, kind: 'expense', account: 'cash' });
  const b = boot({ appState: st, cloudRows: [cloudTx] });
  b.S.appReady(); await settle();
  await b.S.syncNow('silent');
  assert.equal(b.confirms.length, 1);
  assert.match(b.confirms[0], /1 筆/);
  assert.match(b.confirms[0], /會被刪除/);
  assert.deepEqual(b.state.transactions.map(t => t.id), ['t9']);
});

test('本機帳戶有餘額或自訂分類就不算空白', async () => {
  const st = STARTER(); st.accounts[0].balance = 100;
  const b = boot({ appState: st, cloudRows: [cloudTx] });
  b.S.appReady(); await settle(); await b.S.syncNow('silent');
  assert.equal(b.confirms.length, 1);
  const st2 = STARTER(); st2.categories.push({ id: 'pet', name: '寵物', kind: 'expense' });
  const b2 = boot({ appState: st2, cloudRows: [cloudTx] });
  b2.S.appReady(); await settle(); await b2.S.syncNow('silent');
  assert.equal(b2.confirms.length, 1);
});

test('同步衝突：「全部保留本機」一次處理所有衝突', async () => {
  const st = STARTER();
  st.transactions.push({ id: 'a', name: 'A', amount: 1, kind: 'expense', account: 'cash' }, { id: 'b', name: 'B', amount: 2, kind: 'expense', account: 'cash' });
  const rows = ['a', 'b'].map(id => ({ entity: 'transactions', record_id: id, data: { id, name: '雲端' + id }, deleted: false, version: 5, updated_at: 't' }));
  const b = boot({ appState: st, cloudRows: rows, meta: { bootstrapped: true, lastPull: 'z' } });
  for (const id of ['a', 'b']) b.ls.set(`moze-sync-meta-item-v26|u1|transactions|${id}`, JSON.stringify({ version: 3 }));
  b.S.appReady(); await settle();
  b.S.queueStateDiff([{ entity: 'transactions', recordId: 'a', op: 'upsert' }, { entity: 'transactions', recordId: 'b', op: 'upsert' }]);
  await b.S.syncNow('silent');
  assert.match(b.els.syncConflictArea.innerHTML, /同步衝突 2 筆/);
  assert.match(b.els.syncConflictArea.innerHTML, /data-conflict-all="local"/);
  await b.S.resolveAllConflicts('local');
  assert.equal(b.els.syncConflictArea.innerHTML, '');
  assert.equal(b.cloud.get('transactions|a').data.name, 'A');
  assert.equal(b.cloud.get('transactions|b').data.name, 'B');
  assert.equal(b.confirms.length, 1);
});
