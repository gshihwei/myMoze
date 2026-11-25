// 版本資訊 tests (V26.26). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function bundle() {
  const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : any()), apply: () => any(), construct: () => any(), set: () => true });
  const document = new Proxy({}, { get: (t, k) => (k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : any()) });
  const ctx = vm.createContext({ document, window: { MozeApp: {} }, navigator: {}, localStorage: any(), indexedDB: any(), alert() {}, confirm: () => true,
    console: { ...console, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame() {},
    Intl, Date, Math, JSON, Number, String, Array, Map, Set, Promise, Object, crypto: { randomUUID: () => 'id' } });
  try { vm.runInContext(read('js/app.bundle.js'), ctx, { filename: 'app.bundle.js' }); } catch { /* UI bootstrap */ }
  return code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx));
}

test('版本號與 sw.js、index.html、manifest.json、README 一致，日期格式正確', () => {
  const J = bundle();
  const v = J('appVersion()'), date = J('appReleaseDate()');
  assert.match(v, /^V\d+\.\d+(\.\d+)?$/);
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(read('sw.js').includes(`'moze-${v.toLowerCase()}-shell-v1'`), 'sw.js CACHE');
  assert.ok(read('manifest.json').includes(v), 'manifest.json');
  assert.ok(read('README.txt').startsWith(`帳小簿 ${v}`), 'README title');
  const html = read('index.html');
  assert.ok(html.includes(`<b id="appVersion">${v}</b>`), 'settings fallback text');
  const [y, m, d] = date.split('-').map(Number);
  assert.deepEqual(J('appVersionLabel()'), { version: v, date: `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}` });
  assert.ok(html.includes(`<span id="appVersionDate">${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}</span>`), 'settings fallback date');
});

test('appCacheLatest()：依數字比較版本，忽略其他快取', () => {
  const J = bundle();
  assert.equal(J(`appCacheLatest(['moze-v26.9-shell-v1','moze-v26.26-shell-v1','other-cache'])`), 'V26.26');
  assert.equal(J(`appCacheLatest(['moze-v25.10.1-shell-v1','moze-v25.10-shell-v1'])`), 'V25.10.1');
  assert.equal(J(`appCacheLatest([])`), '');
});
