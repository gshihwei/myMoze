// 分類預設圖示 tests (V26.28). Run: node --test   (from repo root)
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
  if (state) vm.runInContext(`state=${JSON.stringify(state)}`, ctx);
  return { ctx, J: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, ctx)) };
}

test('名稱對照：CSV 內所有常見主／子分類都有預設圖示（不是 • ）', () => {
  const { J } = bundle();
  const names = ['飲食', '午餐', '晚餐', '早餐', '飲料', '點心', '水果', '酒類', '個人', '保險', '通話費', '寵物', '手續費', '投資', '稅金', '信用卡帳單', '捐款', '社交', '借款', '彩券',
    '醫療', '醫療用品', '門診', '藥品', '牙齒保健', '健康檢查', '打針', '家居', '日常用品', '修繕費', '燃料費', '網路費', '洗衣費', '家電', '家具', '房租', '娛樂', '影音', '展覽', '電影', '音樂', '遊樂園', '遊戲', '消遣', '運動',
    '交通', '加油費', '停車費', '摩托車', '汽車', '捷運', '計程車', '火車', '公車', '高鐵', '機票', '單車', '購物', '市場', '電子產品', '衣物', '禮物', '玩具', '配件', '鞋子', '應用軟體', '美妝保養', '包包', '精品', '伴手禮',
    '電子發票', '手機條碼', '生活', '美容美髮', '悠遊卡儲值', '按摩', '住宿', '旅行', '家庭', '看護', '孝親費', '紅包', '學習', '文具', '課程', '利息支出', '折扣',
    '信用卡回饋', '利息', '收款', '薪水', '獎金', '退稅'];
  const missing = names.filter(n => !J(`catIconLookup(${JSON.stringify(n)})`));
  assert.deepEqual(missing, []);
});

test('所有圖示都放得進 4 字元的圖示欄位，且不含零寬連接符', () => {
  const { J } = bundle();
  const all = [...Object.values(J('catIconTable()')), ...J('catIconKeywords()').map(x => x[1])];
  for (const i of all) { assert.ok(i.length <= 4, i); assert.ok(!i.includes('‍'), i); }
});

test('catDefaultIcon：精確名稱 > 關鍵字 > 上層分類 > 舊預設符號', () => {
  const { J } = bundle();
  assert.equal(J(`catDefaultIcon('午餐','飲食','expense')`), '🍱');
  assert.equal(J(`catDefaultIcon('韓式料理餐廳','飲食','expense')`), '🍱');   // 關鍵字「餐」
  assert.equal(J(`catDefaultIcon('完全沒聽過','交通','expense')`), '🚗');       // 退回上層
  assert.equal(J(`catDefaultIcon('完全沒聽過','','expense')`), '•');
  assert.equal(J(`catDefaultIcon('完全沒聽過','','income')`), '＄');
});

test('套用預設圖示：只補空白／預設符號，不覆蓋使用者自選的圖示', () => {
  const { J } = bundle({ accounts: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [], categories: [
    { id: 'a', name: '交通', icon: '•', kind: 'expense' }, { id: 'b', name: '加油費', icon: '•', kind: 'expense', parentId: 'a' },
    { id: 'c', name: '飲食', icon: '🍕', kind: 'expense' },            // 使用者自選
    { id: 'd', name: '居家', icon: '⌂', kind: 'expense' }, { id: 'e', name: '怪名稱', icon: '', kind: 'expense', parentId: 'a' },
    { id: 'f', name: '不認識的分類', icon: '•', kind: 'expense' } ] });
  const plan = J('catIconPlan().map(p=>[p.category.id,p.icon])');
  assert.deepEqual(plan, [['a', '🚗'], ['b', '⛽'], ['d', '🏠'], ['e', '🚗']]);
});

test('匯入：新建的主／子分類依名稱帶預設圖示；未知名稱沿用上層圖示', () => {
  const { ctx } = bundle();
  const src = fs.readFileSync(path.join(root, 'js', 'import.js'), 'utf8');
  const window = { catDefaultIcon: vm.runInContext('catDefaultIcon', ctx) };
  vm.runInContext(src, vm.createContext({ window, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} }, console, TextDecoder, Blob: class {}, URL, setTimeout }));
  const M = window.MozeImportInternals;
  const H = '帳戶,幣種,記錄類型＊,主類別＊,子類別＊,金額＊,手續費,折扣,名稱,商家,日期＊,時間,專案,描述,標籤,對象';
  const st = { accounts: [], categories: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [] };
  const res = M.buildImport(st, M.parseCSV([H, '錢包,TWD,初始金額,,,0,,,,,,,,,,', '錢包,TWD,支出,飲食,午餐,-100,,,,,2024/1/1,10:00,,,,', '錢包,TWD,支出,飲食,神秘料理,-50,,,,,2024/1/1,10:01,,,,',
    '錢包,TWD,收入,收入,薪水,500,,,,,2024/1/2,10:00,,,,'].join('\n')));
  assert.equal(res.errors.length, 0);
  const ic = n => st.categories.find(c => c.name === n)?.icon;
  assert.equal(ic('飲食'), '🍜'); assert.equal(ic('午餐'), '🍱'); assert.equal(ic('神秘料理'), '🍜'); assert.equal(ic('薪水'), '💵'); assert.equal(ic('收入'), '💰');
});

test('快選圖示分群（V26.29）：每個都放得進 4 字元、無零寬連接符、無重複、表單有分群標題', () => {
  const { J, ctx } = bundle({ accounts: [], projects: [], transactions: [], budgets: [], recurring: [], loans: [], categories: [] });
  const groups = J('catIconGroups()');
  assert.ok(groups.length >= 8);
  const all = groups.flatMap(g => g[1]);
  for (const i of all) { assert.ok(i.length <= 4, i); assert.ok(!i.includes('\u200d'), i); }
  assert.equal(new Set(all).size, all.length, '圖示不重複');
  assert.ok(all.includes('•') && all.includes('🍜') && all.includes('🐶'));
  assert.deepEqual(J('catIcons()'), all);
  const html = vm.runInContext(`catFormHTML({kind:'expense',icon:'•',__new:true})`, ctx);
  for (const [label] of groups) assert.ok(html.includes(`<small>${label}</small>`), label);
  assert.equal((html.match(/data-cat-icon=/g) || []).length, all.length);
});
