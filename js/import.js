/* MOZE CSV Import V25.2 — based on MOZE_CHT.xlsx */
(() => {
  const HEADERS = ['帳戶','幣種','記錄類型＊','主類別＊','子類別＊','金額＊','手續費','折扣','名稱','商家','日期＊','時間','專案','描述','標籤','對象'];
  const TYPES = new Set(['支出','收入','轉出','轉入','應收款項','應付款項','餘額調整','退款']);
  const $ = id => document.getElementById(id);
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s ?? '').replace(/^\uFEFF/, '').trim();
  const cleanName = (s, max) => norm(s).slice(0, max);

  function parseCSV(text) {
    text = String(text ?? '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i=0; i<text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i+1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += ch;
      } else {
        if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(field); field=''; }
        else if (ch === '\n') { row.push(field); rows.push(row); row=[]; field=''; }
        else if (ch === '\r') { if (text[i+1] !== '\n') { row.push(field); rows.push(row); row=[]; field=''; } }
        else field += ch;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(v => norm(v) !== ''));
  }

  async function readText(file) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8', {fatal:false}).decode(buf);
    if (text.includes('\uFFFD')) {
      try { text = new TextDecoder('big5', {fatal:false}).decode(buf); } catch {}
    }
    return text;
  }

  function parseAmount(raw) {
    let s = norm(raw).replace(/[$€£¥,\s]/g, '');
    if (!s) return null;
    let negative = false;
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1,-1); }
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return negative ? -Math.abs(n) : n;
  }

  function parseDate(raw) {
    const s = norm(raw);
    if (!s) return null;
    if (/^\d+(?:\.\d+)?$/.test(s)) {
      const serial = Number(s);
      if (serial > 20000 && serial < 100000) {
        const d = new Date(Date.UTC(1899,11,30) + Math.round(serial * 86400000));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      }
    }
    const m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (m) {
      const y=Number(m[1]), mo=Number(m[2]), d=Number(m[3]);
      const dt=new Date(y,mo-1,d);
      if (dt.getFullYear()===y && dt.getMonth()===mo-1 && dt.getDate()===d) return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    return null;
  }

  function parseTime(raw) {
    const s = norm(raw);
    if (!s) return '09:00';
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return null;
    const h=Number(m[1]), min=Number(m[2]);
    if(h>23||min>59)return null;
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }

  function signExpected(type) {
    if (['支出','轉出','應收款項'].includes(type)) return -1;
    if (['收入','轉入','應付款項','退款'].includes(type)) return 1;
    return 0;
  }

  function slug(s) { return norm(s).toLowerCase().replace(/\s+/g,'-').replace(/[^\w\u4e00-\u9fff-]/g,'').slice(0,50) || 'item'; }
  function makeId(prefix, seed) {
    const str = `${prefix}:${seed}`;
    let h=2166136261;
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
    return `${prefix}-${(h>>>0).toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  }
  function fingerprint(row) { return row.map(norm).join('\u001f'); }

  function categoryKind(type) {
    return ['收入','轉入','應付款項','退款'].includes(type) ? 'income' : 'expense';
  }

  function ensureAccount(st, name, currency, created) {
    let a = st.accounts.find(x => x.name === name);
    if (a) return {account:a, created:false};
    a = {id:makeId('acct',`${name}:${currency||''}`), name, type:'cash', balance:0, currency:currency||'TWD', imported:true};
    st.accounts.push(a); created.accounts.push(a);
    return {account:a, created:true};
  }

  function ensureCategory(st, mainName, subName, type, created) {
    const kind=categoryKind(type);
    let main=st.categories.find(x => x.name===mainName && !x.parentId);
    if(!main){ main={id:makeId('cat',`${kind}:${mainName}`),name:mainName,icon:kind==='income'?'＄':'•',kind,imported:true};st.categories.push(main);created.categories.push(main); }
    const sub=cleanName(subName,30) || mainName;
    if(!sub || sub===mainName) return {category:main, main};
    let child=st.categories.find(x=>x.parentId===main.id && x.name===sub);
    if(!child){child={id:makeId('subcat',`${main.id}:${sub}`),name:sub,icon:main.icon,kind,parentId:main.id,imported:true};st.categories.push(child);created.categories.push(child);}
    return {category:child,main};
  }

  function ensureProject(st, name, created) {
    name=cleanName(name,30); if(!name)return null;
    let p=st.projects.find(x=>x.name===name); if(p)return p;
    p={id:makeId('project',name),name,budget:0,imported:true};st.projects.push(p);created.projects.push(p);return p;
  }

  function rowToTransaction(row, st, created, index, warnings) {
    const accountName=cleanName(row[0],60), currency=norm(row[1]), type=norm(row[2]), mainName=cleanName(row[3],30), subName=cleanName(row[4],30);
    const amountRaw=parseAmount(row[5]);
    if(!accountName) throw new Error('帳戶不可空白');
    if(!TYPES.has(type)) throw new Error(`不支援的記錄類型「${type}」`);
    if(!mainName) throw new Error('主類別不可空白');
    if(!subName) throw new Error('子類別不可空白');
    if(amountRaw===null || amountRaw===0) throw new Error('金額必須是非 0 數字');
    const expected=signExpected(type);
    if(expected && Math.sign(amountRaw)!==expected) warnings.push({row:index+1,message:`「${type}」金額符號與規範不同，已依記錄類型自動正規化。`});
    const date=parseDate(row[10]); if(!date) throw new Error('日期格式錯誤');
    const time=parseTime(row[11]); if(!time) throw new Error('時間格式錯誤');
    const fee=parseAmount(row[6])||0, discount=parseAmount(row[7])||0;
    const {account,newAccount}=(()=>{const r=ensureAccount(st,accountName,currency,created);return {account:r.account,newAccount:r.created}})();
    const cat=ensureCategory(st,mainName,subName,type,created).category;
    const project=ensureProject(st,row[12],created);
    const abs=Math.abs(amountRaw);
    let kind = type==='轉出'||type==='轉入' ? 'transfer' : (['支出','應收款項'].includes(type) ? 'expense' : 'income');
    if(type==='餘額調整') kind='balance_adjustment';
    const tx={
      id:makeId('tx',`${date}|${time}|${fingerprint(row)}|${index}`),
      date,time,name:cleanName(row[8],30)||type,merchant:cleanName(row[9],30),amount:abs,kind,
      recordType:type,category:cat.id,mainCategory:mainName,subcategory:subName,account:account.id,
      project:project?.id||'',note:norm(row[13]).slice(0,300),tags:norm(row[14])?norm(row[14]).split(';').map(x=>x.trim()).filter(Boolean):[],person:norm(row[15])||'不限定對象',currency:currency||account.currency||'TWD',fee:Math.abs(fee),discount:Math.abs(discount),_importKey:fingerprint(row)
    };
    return {tx, amountRaw, type, account, newAccount};
  }

  function buildImport(st, rows) {
    const created={accounts:[],categories:[],projects:[]}, imported=[], errors=[], warnings=[];
    const existingKeys=new Set(); (st.transactions||[]).forEach(t=>{if(t._importKey)String(t._importKey).split('\u001e').forEach(k=>existingKeys.add(k));});
    for(let i=1;i<rows.length;i++){
      const row=rows[i].map(v=>String(v??''));
      if(row.length!==HEADERS.length){errors.push({row:i+1,message:`欄位數量 ${row.length}，必須為 ${HEADERS.length}`});continue;}
      const key=fingerprint(row); if(existingKeys.has(key)){imported.push({row:i+1,skipped:true});continue;}
      try{
        const result=rowToTransaction(row,st,created,i,warnings);
        imported.push({row:i+1,...result}); existingKeys.add(key);
      }catch(err){errors.push({row:i+1,message:err.message||String(err)});}
    }
    // Convert adjacent transfer rows into one transfer transaction.
    const final=[]; const used=new Set();
    for(let i=0;i<imported.length;i++){
      const a=imported[i]; if(a.skipped||!a.tx) continue;
      if(a.type==='轉出'){
        const next=imported[i+1];
        if(next?.tx && next.type==='轉入' && !next.skipped && a.tx.date===next.tx.date && a.tx.time===next.tx.time){
          a.tx.kind='transfer'; a.tx.account=a.tx.account; a.tx.toAccount=next.tx.account; a.tx.amount=Math.abs(a.amountRaw); a.tx.transferPair=true; a.tx._importKey=`${a.tx._importKey}\u001e${next.tx._importKey}`;
          final.push(a.tx); used.add(i+1); continue;
        }
        errors.push({row:a.row,message:'轉出找不到相鄰、日期時間相同的轉入紀錄'}); continue;
      }
      if(a.type==='轉入' && used.has(i)) continue;
      if(a.type==='轉入') { errors.push({row:a.row,message:'轉入必須緊接在轉出紀錄之後'}); continue; }
      final.push(a.tx);
    }
    // Apply balances only to accounts newly created by this import.
    const newIds=new Set(created.accounts.map(a=>String(a.id)));
    for(const tx of final){
      const a=st.accounts.find(x=>String(x.id)===String(tx.account));
      if(!a||!newIds.has(String(a.id))) continue;
      if(tx.kind==='expense') a.balance-=tx.amount;
      else if(tx.kind==='income') a.balance+=tx.amount;
      else if(tx.kind==='transfer'){a.balance-=tx.amount;const b=st.accounts.find(x=>String(x.id)===String(tx.toAccount));if(b&&newIds.has(String(b.id)))b.balance+=tx.amount;}
      else if(tx.kind==='balance_adjustment') a.balance+=Number(tx.amount)*(tx.recordType==='餘額調整'&&tx._importKey? (parseAmount(rows.find(r=>fingerprint(r)===tx._importKey)?.[5])<0?-1:1):1);
    }
    st.transactions.push(...final);
    return {state:st,transactions:final,errors,warnings,created,skipped:imported.filter(x=>x.skipped).length,totalDataRows:rows.length-1};
  }

  function downloadBackup(state, filename='moze-before-csv-overwrite.json') {
    const a=document.createElement('a');
    const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'}));
    a.href=url; a.download=filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function makeOverwriteState(current) {
    const next=JSON.parse(JSON.stringify(current||{}));
    // CSV cannot represent these entities, so a true "完整覆蓋" clears them too.
    ['accounts','categories','projects','transactions','budgets','recurring','loans'].forEach(k=>{next[k]=[]});
    return next;
  }

  function showModal(result, currentState, rows) {
    const bg=$('csvImportBg'), body=$('csvImportBody'); if(!bg||!body)return;
    let mode='append';
    const renderBody=()=>{
      const previewState=mode==='overwrite'?makeOverwriteState(currentState):JSON.parse(JSON.stringify(currentState));
      const previewResult=mode==='overwrite'?buildImport(previewState,rows):result;
      const warn=previewResult.warnings?.length ? `<div class="import-warnings"><b>有 ${previewResult.warnings.length} 筆格式提醒</b>${previewResult.warnings.slice(0,20).map(e=>`<div>第 ${e.row} 列：${escapeHtml(e.message)}</div>`).join('')}${previewResult.warnings.length>20?`<div>…另有 ${previewResult.warnings.length-20} 筆</div>`:''}</div>` : '';
      const errs=previewResult.errors.length ? `<div class="import-errors"><b>需要修正 ${previewResult.errors.length} 筆</b>${previewResult.errors.slice(0,20).map(e=>`<div>第 ${e.row} 列：${escapeHtml(e.message)}</div>`).join('')}${previewResult.errors.length>20?`<div>…另有 ${previewResult.errors.length-20} 筆</div>`:''}</div>` : '';
      const overwriteNotice=mode==='overwrite'?`<div class="import-overwrite-warning"><b>⚠️ 完整覆蓋</b><p>會清除目前的交易、帳戶、分類、專案、預算、週期交易與借還款，再用這份 CSV 重建可匯入的資料。</p><p>確認前會自動下載目前資料的 JSON 備份。</p></div>`:'';
      const appendNotice=`<div class="import-append-note"><b>追加紀錄</b><p>保留目前所有資料，只加入 CSV 中的新資料。相同匯入資料會自動略過。</p></div>`;
      body.innerHTML=`
        <div class="import-mode">
          <label class="import-mode-option ${mode==='append'?'active':''}"><input type="radio" name="csvImportMode" value="append" ${mode==='append'?'checked':''}><span><b>追加紀錄</b><small>保留現有資料，只新增 CSV 的內容</small></span></label>
          <label class="import-mode-option ${mode==='overwrite'?'active':''}"><input type="radio" name="csvImportMode" value="overwrite" ${mode==='overwrite'?'checked':''}><span><b>完整覆蓋</b><small>清除現有帳務資料後重新匯入</small></span></label>
        </div>
        ${mode==='overwrite'?overwriteNotice:appendNotice}
        <div class="import-summary"><div><b>${previewResult.transactions.length}</b><span>筆可匯入交易</span></div><div><b>${previewResult.skipped}</b><span>筆重複略過</span></div><div><b>${previewResult.errors.length}</b><span>筆錯誤</span></div></div>
        ${errs}${warn}
        <div class="import-created"><b>本次自動建立</b><span>帳戶 ${previewResult.created.accounts.length} · 分類 ${previewResult.created.categories.length} · 專案 ${previewResult.created.projects.length}</span></div>
        <p class="hint">帳戶與分類不存在時會自動建立；新建立帳戶會依匯入資料計算餘額。轉帳需符合「轉出＋下一列轉入」且日期、時間一致的格式。</p>
        <div class="import-preview"><b>預覽前 10 筆</b>${previewResult.transactions.slice(0,10).map(t=>`<div><span>${escapeHtml(t.date)} ${escapeHtml(t.time)} · ${escapeHtml(t.name)}</span><b>${t.kind==='expense'?'−':'+'}${Number(t.amount).toLocaleString()}</b></div>`).join('')||'<div class="empty">沒有可匯入的交易</div>'}</div>`;
      body.querySelectorAll('input[name=csvImportMode]').forEach(r=>r.addEventListener('change',()=>{mode=r.value;renderBody()}));
      const active=mode==='overwrite'?previewResult:result;
      $('csvImportConfirm').disabled = active.transactions.length===0;
      $('csvImportConfirm').textContent = mode==='overwrite'?'完整覆蓋並匯入':'追加匯入';
      $('csvImportConfirm').onclick = async()=>{
        if(!active.transactions.length){bg.classList.remove('open');return;}
        try {
          if(mode==='overwrite') {
            downloadBackup(currentState);
            if(!confirm('確定要完整覆蓋目前資料嗎？\n\n目前帳務資料會先自動下載 JSON 備份，接著清除並改用這份 CSV 建立新資料。')) return;
          }
          await window.MozeApp.setState(active.state,{persist:true,markDirty:true});
          bg.classList.remove('open');
          alert(`${mode==='overwrite'?'完整覆蓋':'追加匯入'}完成：${active.transactions.length} 筆交易。${active.errors.length?`\n有 ${active.errors.length} 筆資料未匯入，請修正 CSV 後再試。`:''}`);
        } catch(err){ alert('匯入儲存失敗：'+(err.message||err)); }
      };
    };
    bg.classList.add('open');
    $('csvImportCancel').onclick=()=>bg.classList.remove('open'); $('csvImportCancel2').onclick=()=>bg.classList.remove('open');
    renderBody();
    bg.onclick=(e)=>{if(e.target===bg)bg.classList.remove('open')};
  }

  async function handleFile(file){
    if(!file)return;
    if(!/\.csv$/i.test(file.name)){alert('MOZE 匯入只支援 CSV 檔案。');return;}
    try{
      const text=await readText(file), rows=parseCSV(text);
      if(!rows.length)throw new Error('CSV 沒有資料。');
      const header=rows[0].map(norm);
      if(header.length!==HEADERS.length || header.some((v,i)=>v!==HEADERS[i])) throw new Error(`CSV 欄位格式不符合 MOZE 匯入格式。\n需要：${HEADERS.join(',')}`);
      const current=window.MozeApp.getState();
      const draft=JSON.parse(JSON.stringify(current));
      const result=buildImport(draft,rows);
      result.fileName=file.name;
      showModal(result,current,rows);
    }catch(err){alert('CSV 讀取失敗：'+(err.message||err));}
  }

  function downloadTemplate(){
    const sample=[HEADERS,['錢包','TWD','支出','飲食','點心','-90','5','','起司蛋糕','三皇三家','2019/3/11','13:12','','','','']];
    const csv='\uFEFF'+sample.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}).join(',')).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='MOZE.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function init(){
    const btn=$('importCsv'), file=$('importCsvFile'), tpl=$('downloadImportTemplate');
    btn?.addEventListener('click',()=>file?.click());
    file?.addEventListener('change',e=>{const f=e.target.files?.[0];e.target.value='';handleFile(f)});
    tpl?.addEventListener('click',downloadTemplate);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
