// App 密碼鎖 tests (V26.22). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function bundle(store = new Map()) {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : k === 'querySelector' ? () => null : any()) });
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage, indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, Uint8Array, TextEncoder, crypto: globalThis.crypto });
  try { vm.runInContext(fs.readFileSync(path.join(root, 'js', 'app.bundle.js'), 'utf8'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  vm.runInContext('state={accounts:[],categories:[],projects:[],transactions:[],budgets:[],recurring:[],loans:[]}', ctx);
  return code => vm.runInContext(code, ctx);
}

test('lockSetPin()／lockVerify()：只存加鹽雜湊，正確 PIN 通過、錯誤失敗', async () => {
  const store = new Map(), run = bundle(store);
  assert.equal(run('lockEnabled()'), false);
  await run(`lockSetPin('2468')`);
  assert.equal(run('lockEnabled()'), true);
  const saved = JSON.parse(store.get('moze-prefs-v1'));
  assert.ok(!JSON.stringify(saved).includes('2468'), 'PIN never stored in clear');
  assert.match(saved.lockHash, /^[0-9a-f]{64}$/); assert.match(saved.lockSalt, /^[0-9a-f]{32}$/);
  assert.equal(await run(`lockVerify('2468')`), true);
  assert.equal(await run(`lockVerify('1357')`), false);
  run('lockClear()');
  assert.equal(run('lockEnabled()'), false);
});

test('PIN 格式與重新鎖定時間', async () => {
  const run = bundle();
  for (const bad of ['123', '1234567', '12a4', '']) await assert.rejects(run(`lockSetPin(${JSON.stringify(bad)})`), /4 到 6 位數字/);
  assert.equal(run('lockShouldRelock(0, 1e9, 1)'), false, 'never hidden');
  assert.equal(run('lockShouldRelock(1000, 1000 + 59000, 1)'), false);
  assert.equal(run('lockShouldRelock(1000, 1000 + 60000, 1)'), true);
  assert.equal(run('lockShouldRelock(1000, 1001, 0)'), true, '0 = lock every time');
});

test('相同 PIN 每次設定產生不同的鹽與雜湊', async () => {
  const s1 = new Map(), s2 = new Map();
  await bundle(s1)(`lockSetPin('0000')`); await bundle(s2)(`lockSetPin('0000')`);
  assert.notEqual(JSON.parse(s1.get('moze-prefs-v1')).lockHash, JSON.parse(s2.get('moze-prefs-v1')).lockHash);
});
