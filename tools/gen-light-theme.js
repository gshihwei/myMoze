#!/usr/bin/env node
// Generates css/light.css — the light theme — from css/app.css (the dark theme).
//
//   node tools/gen-light-theme.js           write css/light.css
//   node tools/gen-light-theme.js --check   exit 1 if css/light.css is out of date
//
// Every rule in app.css that sets a colour is re-emitted under :root[data-theme="light"] with the
// colour mapped: neutral (low-saturation) colours flip lightness (dark surfaces → light, light ink →
// dark); accents keep their hue, and accents used as text are darkened to stay readable on white.
// Hand-tuned exceptions live in LIGHT_EXTRA at the bottom.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

// ---------- colour helpers ----------
function parseColor(tok) {
  let m = tok.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1]; if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1, hex: true };
  }
  m = tok.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4], hex: false };
  return null;
}
function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
function fromHsl({ h, s, l }) {
  const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return { r: f(0), g: f(8), b: f(4) };
}
function fmt(c, a) {
  const hex = v => v.toString(16).padStart(2, '0');
  return a >= 1 ? `#${hex(c.r)}${hex(c.g)}${hex(c.b)}` : `rgba(${c.r},${c.g},${c.b},${+a.toFixed(3)})`;
}
// prop: the CSS property the colour appears in (affects how accents are treated)
function mapColor(tok, prop) {
  const c = parseColor(tok); if (!c) return tok;
  const hsl = toHsl(c), chroma = (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255, isText = /^(color|fill|-webkit-text-fill-color|caret-color|outline-color|--text|--muted)$/.test(prop) && !/^(fill)$/.test(prop) || prop === 'color';
  // translucent white / black hairlines and washes: swap to the opposite ink, same alpha
  if (c.a < 1 && chroma < 0.2) { const ink = hsl.l > 0.5 ? { r: 15, g: 23, b: 32 } : { r: 255, g: 255, b: 255 }; return fmt(ink, Math.min(1, c.a * (hsl.l > 0.5 ? 1.2 : 1))); }
  if (chroma < 0.2 || (hsl.l < 0.32 && chroma < 0.3)) {
    // neutral: flip lightness. Surfaces (very dark) → near white; ink (very light) → near black.
    let l = 1 - hsl.l;
    if (hsl.l < 0.3) l = 0.93 + (0.3 - hsl.l) * 0.2;          // dark surfaces → 0.93..0.99
    else if (hsl.l > 0.75) l = 0.08 + (1 - hsl.l) * 0.6;       // light ink → 0.08..0.23
    else l = Math.min(0.62, Math.max(0.36, 1 - hsl.l));        // mid greys (muted text, borders)
    return fmt(fromHsl({ h: hsl.h, s: Math.min(hsl.s, 0.25), l }), c.a);
  }
  // accent: keep hue; as text, make sure it is dark enough for a light surface
  if (isText && hsl.l > 0.45) return fmt(fromHsl({ h: hsl.h, s: hsl.s, l: 0.4 }), c.a);
  if (c.a < 1) return fmt(fromHsl({ h: hsl.h, s: hsl.s, l: Math.min(hsl.l, 0.55) }), c.a);
  return fmt(c, c.a);
}
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
function mapValue(prop, value) { return value.replace(COLOR_RE, t => mapColor(t, prop)); }

// ---------- minimal CSS walker (rules + one level of @media / @supports) ----------
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
function blocks(css) {
  const out = []; let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break;
    const head = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    out.push({ head, body }); i = j;
  }
  return out;
}
function prefixSelector(sel) {
  return sel.split(',').map(s => {
    s = s.trim(); if (!s) return s;
    if (s.startsWith(':root')) return ':root[data-theme="light"]' + s.slice(5);
    if (/^html\b/.test(s)) return 'html[data-theme="light"]' + s.slice(4);
    return `:root[data-theme="light"] ${s}`;
  }).join(',');
}
function lightRule(head, body) {
  const decls = body.split(';').map(d => d.trim()).filter(Boolean);
  const kept = [];
  for (const d of decls) {
    const k = d.indexOf(':'); if (k < 0) continue;
    const prop = d.slice(0, k).trim(), val = d.slice(k + 1).trim();
    if (!COLOR_RE.test(val)) { COLOR_RE.lastIndex = 0; continue; }
    COLOR_RE.lastIndex = 0;
    if (/shadow/.test(prop)) { kept.push(`${prop}:${val.replace(COLOR_RE, t => { const c = parseColor(t); return c ? fmt({ r: 15, g: 23, b: 32 }, Math.min(0.16, c.a * 0.4)) : t; })}`); continue; }
    kept.push(`${prop}:${mapValue(prop, val)}`);
  }
  return kept.length ? `${prefixSelector(head)}{${kept.join(';')}}` : '';
}
function generate(css) {
  const out = [];
  for (const b of blocks(stripComments(css))) {
    if (b.head.startsWith('@media') || b.head.startsWith('@supports')) {
      const inner = blocks(b.body).map(x => lightRule(x.head, x.body)).filter(Boolean);
      if (inner.length) out.push(`${b.head}{${inner.join('')}}`);
    } else if (b.head.startsWith('@')) continue;
    else { const r = lightRule(b.head, b.body); if (r) out.push(r); }
  }
  return out.join('\n');
}

// Hand-tuned light-theme details that a mechanical mapping cannot infer.
const LIGHT_EXTRA = `
:root[data-theme="light"]{color-scheme:light}
:root[data-theme="light"] body{background:#f3f5f8!important;color:#142130}
:root[data-theme="light"] .panel,:root[data-theme="light"] .metric,:root[data-theme="light"] .budget-card2,:root[data-theme="light"] .proj-card,:root[data-theme="light"] .cat-card{background:#ffffff!important;border-color:#dde3ea!important;box-shadow:0 1px 2px rgba(15,23,32,.06)!important}
:root[data-theme="light"] .sidebar,:root[data-theme="light"] .mobile-nav{background:#ffffff!important;border-color:#dde3ea!important}
:root[data-theme="light"] .modal{background:#ffffff!important}
:root[data-theme="light"] input,:root[data-theme="light"] select,:root[data-theme="light"] textarea{background:#f6f8fa!important;color:#142130!important;border-color:#cfd7e0!important}
:root[data-theme="light"] .fab,:root[data-theme="light"] .mobile-nav .mobile-add,:root[data-theme="light"] .primary{background:#6f5bd6!important;color:#ffffff!important}
:root[data-theme="light"] .cg-out,:root[data-theme="light"] .an-svg path[fill="#d95926"],:root[data-theme="light"] .cg-swatch.out,:root[data-theme="light"] .an-legend i[style*="#d95926"]{fill:#eb6834!important;background:#eb6834!important}
:root[data-theme="light"] .cg-in,:root[data-theme="light"] .an-svg path[fill="#3987e5"],:root[data-theme="light"] .cg-swatch.in,:root[data-theme="light"] .an-legend i[style*="#3987e5"],:root[data-theme="light"] .an-rank-bar i,:root[data-theme="light"] .bmeter i{fill:#2a78d6!important;background:#2a78d6!important}
:root[data-theme="light"] .cg-line,:root[data-theme="light"] .an-svg polyline[stroke="#199e70"]{stroke:#1baf7a!important}
:root[data-theme="light"] .cg-dot,:root[data-theme="light"] .an-svg circle[fill="#199e70"],:root[data-theme="light"] .cg-swatch.nw{fill:#1baf7a!important;background:#1baf7a!important;stroke:#ffffff!important}
:root[data-theme="light"] .cg-area,:root[data-theme="light"] .an-svg polygon[fill="#199e70"]{fill:rgba(27,175,122,.12)!important}
:root[data-theme="light"] .cg-grid{stroke:#e1e0d9!important}:root[data-theme="light"] .cg-base{stroke:#c3c2b7!important}:root[data-theme="light"] .cg-axis,:root[data-theme="light"] .cg-label{fill:#6b6a65!important}
:root[data-theme="light"] .bmeter{background:#d8e6f7!important}:root[data-theme="light"] .bmeter.near i{background:#fab219!important}:root[data-theme="light"] .bmeter.over i{background:#d03b3b!important}:root[data-theme="light"] .bmeter-pace{background:#142130!important}
:root[data-theme="light"] .expense-text,:root[data-theme="light"] .expense{color:#c2334a!important}
:root[data-theme="light"] .income-text,:root[data-theme="light"] .income{color:#2f7d32!important}
:root[data-theme="light"] .an-tip,:root[data-theme="light"] #bulkBar .bulk-bar,:root[data-theme="light"] .update-banner{background:#ffffff!important;border-color:#cfd7e0!important;color:#142130!important}
`;

if (require.main === module) {
const target = path.join(root, 'css', 'light.css');
  const src = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8').replace(/\r\n/g, '\n');
  const next = `/* 帳小簿 light theme — GENERATED by tools/gen-light-theme.js from css/app.css. Do not edit by hand. */\n${generate(src)}\n${LIGHT_EXTRA.trim()}\n`;
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : '';
    if (cur !== next) { console.error('css/light.css is OUT OF DATE — run: node tools/gen-light-theme.js'); process.exit(1); }
    console.log('css/light.css is up to date');
  } else { fs.writeFileSync(target, next); console.log(`wrote css/light.css (${next.length} chars)`); }
}
module.exports = { mapColor };
