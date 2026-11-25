// 帳戶圖片改用預設 tests (V26.61).
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
const IMG = 'data:image/webp;base64,AAAA';
test('只清除「有自訂圖片且名稱對得到預設圖示」的帳戶', () => {
  const { J, run } = bundle({ accounts: [{ id: 'a', name: 'Richart', image: IMG }, { id: 'b', name: '我的私房錢', image: IMG }, { id: 'c', name: '玉山', type: 'bank' }] });
  assert.equal(J('acctResettableImages(state.accounts).length'), 1);
  assert.equal(run('acctResetImages(state.accounts)'), 1);
  assert.equal(run('state.accounts[0].image'), undefined);
  assert.equal(run('state.accounts[1].image'), IMG);
});
test('沒有可清除的帳戶時回傳 0', () => {
  const { run } = bundle({ accounts: [{ id: 'b', name: '我的私房錢', image: IMG }] });
  assert.equal(run('acctResetImages(state.accounts)'), 0);
  assert.equal(run('state.accounts[0].image'), IMG);
});
