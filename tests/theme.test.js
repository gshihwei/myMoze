// Light theme tests (V26.18). Run: node --test   (from repo root)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');

test('css/light.css 與產生器同步（tools/gen-light-theme.js --check）', () => {
  execFileSync(process.execPath, [path.join(root, 'tools', 'gen-light-theme.js'), '--check'], { stdio: 'pipe' });
});

test('淺色主題的每條規則都只在 data-theme="light" 時生效', () => {
  const css = fs.readFileSync(path.join(root, 'css', 'light.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  const walk = s => { let i = 0; while (i < s.length) { const o = s.indexOf('{', i); if (o < 0) break; const head = s.slice(i, o).trim(); let d = 1, j = o + 1; while (j < s.length && d) { if (s[j] === '{') d++; else if (s[j] === '}') d--; j++; } if (head.startsWith('@')) walk(s.slice(o + 1, j - 1)); else selectors.push(...head.split(',').map(x => x.trim())); i = j; } };
  walk(css);
  assert.ok(selectors.length > 100);
  const bad = selectors.filter(sel => !/^(:root|html)\[data-theme="light"\]/.test(sel));
  assert.deepEqual(bad, []);
});

test('顏色換算：深色背景變淺、淺色文字變深、強調色保留色相、半透明白線改為深色', () => {
  const { mapColor } = require(path.join(root, 'tools', 'gen-light-theme.js'));
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114) / 255; };
  assert.ok(lum(mapColor('#101d2b', 'background')) > 0.9);
  assert.ok(lum(mapColor('#eef4fa', 'color')) < 0.25);
  const accent = mapColor('#b8a6ff', 'color');
  assert.ok(lum(accent) < 0.5, 'accent text darkened for a light surface');
  assert.match(mapColor('rgba(255,255,255,.06)', 'border-color'), /^rgba\(15,23,32,/);
});
