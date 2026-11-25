// 自動備份 tests (V26.16). Run: node --test   (from repo root)
// Uses a tiny in-memory IndexedDB stand-in (only what js/backup.js calls).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function fakeIDB() {
  const dbs = new Map();
  const later = f => setImmediate(f);
  const request = run => { const r = {}; later(() => { try { r.result = run(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); } }); return r; };
  return {
    dbs,
    open(name) {
      const r = {};
      later(() => {
        let fresh = false;
        if (!dbs.has(name)) { dbs.set(name, new Map()); fresh = true; }
        const stores = dbs.get(name);
        const db = {
          objectStoreNames: { contains: n => stores.has(n) },
          createObjectStore: (n, o) => { stores.set(n, { key: o.keyPath, rows: new Map() }); },
          transaction(n) {
            const st = stores.get(n), tx = {};
            let pending = 0; const done = () => { if (--pending === 0) later(() => tx.oncomplete?.()); };
            const op = f => { pending++; return request(() => { const v = f(); done(); return v; }); };
            tx.objectStore = () => ({
              get: k => op(() => st.rows.get(k)), getAll: () => op(() => [...st.rows.values()]), getAllKeys: () => op(() => [...st.rows.keys()]),
              put: v => op(() => st.rows.set(v[st.key], JSON.parse(JSON.stringify(v)))), delete: k => op(() => st.rows.delete(k)),
            });
            later(() => { if (pending === 0) tx.oncomplete?.(); });
            return tx;
          },
        };
        r.result = db; if (fresh) r.onupgradeneeded?.(); r.onsuccess?.();
      });
      return r;
    },
  };
}
function bundle(state, idb) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: idb, alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  return code => vm.runInContext(code, ctx);
}
const ST = { accounts: [{ id: 'a' }], categories: [], projects: [], transactions: [{ id: 1 }, { id: 2 }], budgets: [], recurring: [], loans: [] };

test('backupPrune()／backupShouldRun()：只留最新 N 天，同一天只跑一次', () => {
  const run = bundle(ST, fakeIDB());
  assert.equal(run(`JSON.stringify(backupPrune(['2026-11-01','2026-11-09','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08','2026-11-02'], 7))`), '["2026-11-02","2026-11-01"]');
  assert.equal(run(`backupShouldRun('2026-11-19','2026-11-19')`), false);
  assert.equal(run(`backupShouldRun('','2026-11-19')`), true);
});

test('backupMaybe()：今天第一次存檔建立快照，同一天再存不重複；可列出與讀回', async () => {
  const idb = fakeIDB(), run = bundle(ST, idb);
  await run('backupMaybe()');
  await run('backupMaybe()');
  const list = await run('backupList()');
  assert.equal(list.length, 1);
  assert.equal(list[0].summary.transactions, 2);
  const snap = await run(`backupGet(${JSON.stringify(list[0].day)})`);
  assert.equal(JSON.parse(snap.data).transactions.length, 2);
});

test('backupMaybe()：超過 30 天時刪掉最舊的', async () => {
  const idb = fakeIDB(), run = bundle(ST, idb);
  // seed 30 older days directly
  await run(`backupOpen().then(db=>backupTx(db,'readwrite',s=>{for(let i=1;i<=30;i++)s.put({day:'2026-10-'+String(i).padStart(2,'0'),at:'x',summary:{transactions:0},data:'{}'})}))`);
  await run('backupMaybe()');
  const days = (await run('backupList()')).map(b => b.day);
  assert.equal(days.length, 30);
  assert.ok(!days.includes('2026-10-01'));
});
