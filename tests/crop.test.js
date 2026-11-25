'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js/accounts.js'), 'utf8');
const m = src.match(/function acctCropRect[\s\S]*?\n}\n/)[0];
const acctCropRect = vm.runInNewContext(m + ';acctCropRect');
test('crop: 1x zoom frames the centre square of a wide image', () => {
  const r = acctCropRect(400, 200, 100, 1, 0, 0);
  assert.equal(r.side, 200); assert.equal(r.sx, 100); assert.equal(r.sy, 0);
});
test('crop: zoom shrinks the source square', () => {
  assert.equal(acctCropRect(200, 200, 100, 2, 0, 0).side, 100);
});
test('crop: offsets are clamped so the circle stays covered', () => {
  const r = acctCropRect(400, 200, 100, 1, 9999, 9999);
  assert.ok(r.sx >= 0 && r.sx + r.side <= 400 && r.sy >= 0 && r.sy + r.side <= 200);
});
