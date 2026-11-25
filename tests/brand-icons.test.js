'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/icons.js'), 'utf8');
const m = src.match(/const ACCT_BRANDS[\s\S]*?function acctDefaultBrand[^\n]*\n/)[0];
const brand = vm.runInNewContext(m + ';acctDefaultBrand');
test('名稱關鍵字對應品牌', () => {
  assert.equal(brand('玉山 Pi'), 'esun'); assert.equal(brand('國泰 Koko'), 'cathay'); assert.equal(brand('Line Bank'), 'linebank');
  assert.equal(brand('飛狗'), 'flygo'); assert.equal(brand('台新 gogo'), 'taishin'); assert.equal(brand('聯邦全國聯名卡'), 'ubot'); assert.equal(brand('Open  Possible'), 'twm');
});
test('比對不到回傳空字串', () => { assert.equal(brand('錢包'), ''); assert.equal(brand(''), ''); });
test('每個品牌都有對應圖檔，且列入 sw.js 快取', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const names = [...m.matchAll(/\['(\w+)',\[/g)].map(x => x[1]);
  assert.ok(names.length >= 20);
  for (const n of names) { assert.ok(fs.existsSync(path.join(root, 'icons/banks', n + '.webp')), n); assert.ok(sw.includes(`./icons/banks/${n}.webp`), n); }
});
test('自己的圖片優先', () => { assert.ok(/acct-img" src="\$\{im\}"[\s\S]*acctDefaultBrand\(a\.name\)/.test(src)); });
