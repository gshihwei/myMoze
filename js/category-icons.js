// 帳小簿 V26.28 — 依分類名稱決定預設圖示.
// Bundled after js/categories.js (tools/build-bundle.js). Function declarations / var only (hoisted).
// Icons are single code points (or one code point + U+FE0F) so they fit the 4-character icon field.
// Order of lookup: exact name → keyword in name → parent (main) exact name → keyword in parent → ''.

function catIconTable() {
  return {
    // main categories
    '飲食': '🍜', '交通': '🚗', '購物': '🛍️', '居家': '🏠', '家居': '🏠', '娛樂': '🎮', '個人': '👤', '醫療': '💊', '生活': '🧴',
    '家庭': '👪', '學習': '📚', '利息支出': '🏦', '電子發票': '🧾', '折扣': '🏷️', '收入': '💰', '薪資': '💰', '其他': '📦', '旅遊': '🧳', '寵物': '🐾',
    // 飲食
    '早餐': '🍳', '午餐': '🍱', '晚餐': '🍽️', '宵夜': '🌙', '飲料': '🥤', '點心': '🍰', '水果': '🍎', '酒類': '🍺', '咖啡': '☕',
    // 個人
    '保險': '🛡️', '通話費': '📱', '手續費': '💳', '投資': '📈', '稅金': '🧾', '信用卡帳單': '💳', '捐款': '💝', '社交': '🤝', '借款': '💸', '彩券': '🎰',
    // 醫療
    '醫療用品': '🩹', '門診': '🏥', '藥品': '💊', '牙齒保健': '🦷', '健康檢查': '🩺', '打針': '💉',
    // 家居
    '日常用品': '🧻', '修繕費': '🔧', '燃料費': '🔥', '網路費': '🌐', '洗衣費': '🧺', '家電': '📺', '家具': '🛋️', '房租': '🏠', '水電費': '💡', '水費': '💧', '電費': '💡', '瓦斯': '🔥',
    // 娛樂
    '影音': '🎬', '展覽': '🖼️', '電影': '🎥', '音樂': '🎵', '遊樂園': '🎡', '遊戲': '🎮', '消遣': '🎲', '運動': '🏃',
    // 交通
    '加油費': '⛽', '停車費': '🅿️', '摩托車': '🛵', '汽車': '🚗', '捷運': '🚇', '計程車': '🚕', '火車': '🚆', '公車': '🚌', '高鐵': '🚄', '機票': '✈️', '單車': '🚲',
    // 購物
    '市場': '🛒', '電子產品': '💻', '衣物': '👕', '禮物': '🎁', '玩具': '🧸', '配件': '🎧', '鞋子': '👟', '應用軟體': '📲', '美妝保養': '💄', '包包': '👜', '精品': '💎', '伴手禮': '🎁',
    // 電子發票／生活／家庭／學習
    '手機條碼': '🧾', '美容美髮': '💇', '悠遊卡儲值': '💳', '按摩': '💆', '住宿': '🏨', '旅行': '🧳', '看護': '🧓', '孝親費': '👵', '紅包': '🧧', '文具': '✏️', '課程': '🎓',
    // 收入
    '信用卡回饋': '💳', '利息': '💹', '收款': '🤝', '薪水': '💵', '獎金': '🏆', '退稅': '🧾',
  };
}
// Keyword fallbacks for names that are not in the table (first match wins).
function catIconKeywords() {
  return [['早餐', '🍳'], ['午餐', '🍱'], ['晚餐', '🍽️'], ['餐', '🍱'], ['飲', '🥤'], ['茶', '🥤'], ['咖啡', '☕'], ['酒', '🍺'], ['果', '🍎'], ['油', '⛽'], ['停車', '🅿️'], ['車', '🚗'], ['機', '✈️'],
    ['醫', '🏥'], ['藥', '💊'], ['牙', '🦷'], ['薪', '💵'], ['獎金', '🏆'], ['保險', '🛡️'], ['電', '💡'], ['水', '💧'], ['網', '🌐'], ['房', '🏠'], ['租', '🏠'], ['衣', '👕'], ['鞋', '👟'], ['書', '📚'], ['學', '🎓'],
    ['課', '🎓'], ['旅', '🧳'], ['寵', '🐾'], ['貓', '🐾'], ['狗', '🐾'], ['稅', '🧾'], ['利息', '🏦'], ['卡', '💳'], ['投資', '📈'], ['禮', '🎁'], ['電影', '🎥'], ['遊戲', '🎮'], ['音樂', '🎵'], ['運動', '🏃'], ['美容', '💇'], ['按摩', '💆']];
}
function catIconLookup(name) {
  const n = String(name || '').trim(); if (!n) return '';
  const t = catIconTable(); if (Object.prototype.hasOwnProperty.call(t, n)) return t[n];
  const k = catIconKeywords().find(([w]) => n.includes(w)); return k ? k[1] : '';
}
// Default icon for a category. parentName is the main category's name for a subcategory.
// Unknown names fall back to the parent's icon, then to the old placeholders ('＄' income, '•' expense).
function catDefaultIcon(name, parentName, kind) {
  return catIconLookup(name) || (parentName ? catIconLookup(parentName) : '') || (kind === 'income' ? '＄' : '•');
}
// Icons that were never chosen by the user (empty, or the placeholders / seed glyphs) and may be replaced.
function catIconIsPlaceholder(icon) { return ['', '•', '＄', '⌂', '◉'].includes(String(icon || '').trim()); }

// Categories whose icon is a placeholder and for which a real default exists → [{ category, icon }].
function catIconPlan() {
  const cats = state.categories || [], plan = [];
  for (const c of cats) {
    if (!catIconIsPlaceholder(c.icon)) continue;
    const parent = c.parentId ? cats.find(x => String(x.id) === String(c.parentId)) : null;
    const icon = catIconLookup(c.name) || (parent ? (catIconLookup(parent.name) || '') : '');
    if (icon && icon !== c.icon) plan.push({ category: c, icon });
  }
  return plan;
}
async function catApplyDefaultIcons() {
  const plan = catIconPlan();
  if (!plan.length) { alert('沒有需要補圖示的分類（已有自訂圖示的不會被更動）。'); return; }
  if (!confirm(`將為 ${plan.length} 個分類套用依名稱決定的預設圖示？\n只會更動圖示是空白或預設符號（•、＄）的分類，你自選的圖示不會被覆蓋。`)) return;
  for (const p of plan) p.category.icon = p.icon;
  await save(); render();
  alert(`已更新 ${plan.length} 個分類的圖示。`);
}
document.addEventListener('click', e => { if (e.target.closest?.('#catApplyIcons')) catApplyDefaultIcons(); });
