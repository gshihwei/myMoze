'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const m = read('js/icons.js').match(/function acctDefaultIcon[^\n]*\n/)[0];
const ctx = vm.createContext({}); vm.runInContext(read('js/icon-manifest.js') + m, ctx);
const icon = n => vm.runInContext(`acctDefaultIcon(${JSON.stringify(n)})`, ctx);
const key = n => { const d = icon(n); return d ? `${d.b}/${d.n}` : ''; };
test('名稱關鍵字對應圖示（最長關鍵字優先、卡片優先於銀行）', () => {
  assert.equal(key('玉山 Pi'), 'esun/esun'); assert.equal(key('國泰 Koko'), 'cathay/cathay'); assert.equal(key('Line Bank'), 'linebank/linebank');
  assert.equal(key('飛狗'), 'taishin/flygo'); assert.equal(key('台新 gogo'), 'taishin/taishin'); assert.equal(key('Open  Possible'), 'twm/openpossible');
  assert.equal(key('聯邦全國聯名卡'), 'ubot/ubot');
});
test('比對不到回傳 null', () => { assert.equal(icon('錢包'), null); assert.equal(icon(''), null); });
test('manifest 的每張圖都存在並列入 sw.js 快取；source 與輸出一致', () => {
  const sw = read('sw.js'), man = vm.runInContext('ACCT_ICON_MANIFEST', ctx);
  assert.ok(man.length >= 20);
  for (const e of man) {
    assert.ok(fs.existsSync(path.join(root, 'icons/banks', e.b, e.n + '.webp')), e.n);
    assert.ok(sw.includes(`./icons/banks/${e.b}/${e.n}.webp`), e.n);
    assert.ok(fs.readdirSync(path.join(root, 'images', e.b)).some(f => f.replace(/\.[^.]+$/, '') === e.n), 'source ' + e.n);
  }
});
test('自己的圖片優先', () => { const s = read('js/icons.js'); assert.ok(s.indexOf('acct-img" src="${im}"') < s.indexOf('acctDefaultIcon(a.name)')); });
