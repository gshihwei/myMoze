/* MOZE CSV Import V25.9 — based on MOZE_CHT.xlsx */
(() => {
  const HEADERS = ['帳戶','幣種','記錄類型＊','主類別＊','子類別＊','金額＊','手續費','折扣','名稱','商家','日期＊','時間','專案','描述','標籤','對象'];
  const TYPES = new Set(['支出','收入','轉出','轉入','應收款項','應付款項','餘額調整','退款','初始金額']);
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

  // Accounts are identified by (name, currency): MOZE allows e.g. 玉山 TWD and 玉山 USD.
  // Existing accounts without a currency are treated as TWD. A row with a blank
  // currency prefers the same-name TWD account, else a unique same-name account.
  function ensureAccount(st, name, currency, created) {
    const cur = norm(currency);
    const sameName = st.accounts.filter(x => x.name === name);
    let a = cur
      ? sameName.find(x => (x.currency || 'TWD') === cur)
      : (sameName.find(x => (x.currency || 'TWD') === 'TWD') || (sameName.length === 1 ? sameName[0] : null));
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

  function isLoanType(type){ return type==='應收款項' || type==='應付款項'; }

  function loanDirectionFromType(type){ return type==='應付款項' ? 'payable' : 'receivable'; }

  function loanOperationFromAmount(type, amountRaw){
    const dir=loanDirectionFromType(type);
    if(dir==='receivable') return amountRaw<0 ? 'lend' : 'collect';
    return amountRaw>0 ? 'borrow' : 'repay';
  }

  function loanCandidateSort(a,b){
    const ad=`${a.date||''} ${a.time||''}`;
    const bd=`${b.date||''} ${b.time||''}`;
    return ad.localeCompare(bd) || String(a.id).localeCompare(String(b.id));
  }

  // Manual loans carry only `direction`; imported ones also carry `recordType`.
  function loanDirectionOf(l){
    if(l?.direction==='payable' || l?.direction==='receivable') return l.direction;
    return loanDirectionFromType(l?.recordType || '應收款項');
  }

  // Only active, same-direction, same-person, same-currency loans with an outstanding
  // balance may be matched. Stopped loans are never auto-matched; there is no
  // cross-currency fallback (unmatched amounts become historical records instead).
  function findLoanCandidates(st, direction, person, currency, subcategory){
    const cur=String(currency||'TWD');
    const pool=(st.loans||[]).filter(l=>loanDirectionOf(l)===direction && loanStatusForImport(l)==='active' && loanOutstandingForImport(l)>0 && String(l.person||'')===String(person||'') && String(l.currency||'TWD')===cur);
    const exactSub=pool.filter(l=>!subcategory || String(l.subcategory||'')===String(subcategory));
    return (exactSub.length ? exactSub : pool).sort(loanCandidateSort);
  }

  function loanOutstandingForImport(l){ return Math.max(0,Number(l?.amount||0)-Number(l?.paid||0)); }
  function loanStatusForImport(l){ return l?.status==='stopped' ? 'stopped' : (loanOutstandingForImport(l)<=0 ? 'completed' : 'active'); }

  function rowToLoanRecords(row, st, created, index, warnings) {
    const accountName=cleanName(row[0],60), currency=norm(row[1]), type=norm(row[2]), subcategory=cleanName(row[4],30);
    const amountRaw=parseAmount(row[5]);
    if(!accountName) throw new Error('帳戶不可空白');
    if(!isLoanType(type)) throw new Error(`不是借還款記錄：${type}`);
    if(amountRaw===null || amountRaw===0) throw new Error('借還款金額必須是非 0 數字');
    const date=parseDate(row[10]); if(!date) throw new Error('日期格式錯誤');
    const time=parseTime(row[11]); if(!time) throw new Error('時間格式錯誤');
    const accountInfo=ensureAccount(st,accountName,currency,created), account=accountInfo.account;
    const person=norm(row[15])||'不限定對象';
    const operation=loanOperationFromAmount(type,amountRaw), direction=loanDirectionFromType(type);
    const loanCurrency=currency||account.currency||'TWD';
    const fee=parseAmount(row[6])||0, discount=parseAmount(row[7])||0;
    const baseKey=fingerprint(row);
    const txs=[];
    const changedLoans=[];
    const abs=Math.abs(amountRaw);

    if(operation==='lend' || operation==='borrow'){
      const loan={
        id:makeId('loan',`${date}|${time}|${baseKey}|${index}`),
        person, direction, amount:abs, paid:0, account:account.id, currency:loanCurrency,
        date, dueDate:'', name:cleanName(row[8],30)||(operation==='lend'?'借出':'借入'), note:norm(row[13]).slice(0,300),
        payments:[], status:'active', subcategory:subcategory||'', recordType:type, sourceImportKey:baseKey, imported:true
      };
      st.loans=Array.isArray(st.loans)?st.loans:[]; st.loans.push(loan); created.loans.push(loan); changedLoans.push(loan);
      txs.push({
        id:makeId('tx',`${date}|${time}|${baseKey}|${index}|loan`), date,time,
        name:loan.name, merchant:cleanName(row[9],30), amount:abs, kind:'loan', loanId:loan.id,
        loanAction:operation, loanDirection:direction, recordType:type, category:'', mainCategory:'', subcategory:subcategory,
        account:account.id, project:'', note:loan.note, tags:norm(row[14])?norm(row[14]).split(';').map(x=>x.trim()).filter(Boolean):[],
        person, currency:currency||account.currency||'TWD', fee:Math.abs(fee), discount:Math.abs(discount),
        _importKey:baseKey, imported:true, balanceEffect:amountRaw-Math.abs(fee)+Math.abs(discount)
      });
      return {tx:null, transactions:txs, type, amountRaw, account, newAccount:accountInfo.created, loanRecords:true, changedLoans, accountOnly:false};
    }

    let remaining=abs;
    const candidates=findLoanCandidates(st,direction,person,loanCurrency,subcategory);
    // The row's fee/discount hit the real account once: carry them on the first payment tx.
    const feeEffect=-Math.abs(fee)+Math.abs(discount);
    let feeApplied=false;
    const takeFee=()=>{ if(feeApplied) return {fee:0,discount:0,effect:0}; feeApplied=true; return {fee:Math.abs(fee),discount:Math.abs(discount),effect:feeEffect}; };
    for(const loan of candidates){
      if(remaining<=0) break;
      const apply=Math.min(remaining,loanOutstandingForImport(loan));
      if(apply<=0) continue;
      const payment={id:makeId('pay',`${loan.id}|${baseKey}|${index}|${loan.payments.length}`),date,amount:apply,account:account.id,note:norm(row[13]).slice(0,300),sourceImportKey:baseKey};
      loan.paid=Number(loan.paid||0)+apply;
      loan.payments=Array.isArray(loan.payments)?loan.payments:[]; loan.payments.push(payment);
      if(loan.status!=='stopped') loan.status=loanOutstandingForImport(loan)<=0?'completed':'active';
      changedLoans.push(loan);
      const fd=takeFee();
      txs.push({
        id:makeId('tx',`${date}|${time}|${baseKey}|${index}|loan-payment|${loan.id}|${loan.payments.length}`),date,time,
        name:cleanName(row[8],30)|| (direction==='receivable'?'收款':'還款'), merchant:cleanName(row[9],30), amount:apply,
        kind:'loanPayment', loanId:loan.id, loanDirection:direction, recordType:type, category:'', mainCategory:'', subcategory:subcategory,
        account:account.id, project:'', note:norm(row[13]).slice(0,300), tags:norm(row[14])?norm(row[14]).split(';').map(x=>x.trim()).filter(Boolean):[],
        person, currency:loanCurrency, fee:fd.fee, discount:fd.discount, _importKey:baseKey, imported:true, balanceEffect:(direction==='receivable'?1:-1)*apply+fd.effect
      });
      remaining-=apply;
    }
    if(remaining>0){
      const loan={
        id:makeId('loan-history',`${date}|${time}|${baseKey}|${index}`), person, direction, amount:remaining, paid:remaining,
        account:account.id, currency:loanCurrency, date, dueDate:'',
        name:cleanName(row[8],30)||(direction==='receivable'?'歷史收款':'歷史還款'), note:norm(row[13]).slice(0,300),
        payments:[{id:makeId('pay',`${baseKey}|orphan`),date,amount:remaining,account:account.id,note:norm(row[13]).slice(0,300),sourceImportKey:baseKey}],
        status:'completed', subcategory:subcategory||'', recordType:type, sourceImportKey:baseKey, imported:true, historicalOnly:true
      };
      st.loans.push(loan); created.loans.push(loan); changedLoans.push(loan);
      const fd=takeFee();
      txs.push({
        id:makeId('tx',`${date}|${time}|${baseKey}|${index}|loan-payment|history`),date,time,
        name:loan.name, merchant:cleanName(row[9],30), amount:remaining, kind:'loanPayment', loanId:loan.id, loanDirection:direction,
        recordType:type, category:'', mainCategory:'', subcategory:subcategory, account:account.id, project:'', note:loan.note,
        tags:norm(row[14])?norm(row[14]).split(';').map(x=>x.trim()).filter(Boolean):[], person, currency:loan.currency, fee:fd.fee, discount:fd.discount,
        _importKey:baseKey, imported:true, balanceEffect:(direction==='receivable'?1:-1)*remaining+fd.effect
      });
      warnings.push({row:index+1,message:`「${type}」找不到足夠的未結借還款（對象「${person}」、幣別 ${loanCurrency}，不含已停止追蹤），剩餘 ${remaining} 已建立為已完成的歷史${direction==='receivable'?'收款':'還款'}。`});
    }
    return {tx:null, transactions:txs, type, amountRaw, account, newAccount:accountInfo.created, loanRecords:true, changedLoans, accountOnly:false};
  }

  function rowToTransaction(row, st, created, index, warnings) {
    const accountName=cleanName(row[0],60), currency=norm(row[1]), type=norm(row[2]), mainName=cleanName(row[3],30), subName=cleanName(row[4],30);
    const amountRaw=parseAmount(row[5]);
    if(!accountName) throw new Error('帳戶不可空白');
    if(!TYPES.has(type)) throw new Error(`不支援的記錄類型「${type}」`);

    // MOZE exported "初始金額" is an account-creation marker, not a transaction.
    // Keep it as-is. When the account does not exist, create it and set its
    // opening balance. When the account already exists (append mode), do not
    // overwrite the user's current balance with the historical opening value.
    if(type==='初始金額') {
      if(amountRaw===null || !Number.isFinite(amountRaw)) throw new Error('初始金額必須是數字');
      const r=ensureAccount(st,accountName,currency,created);
      if(r.created) {
        r.account.balance=amountRaw;
        warnings.push({row:index+1,message:`保留「初始金額」：已建立帳戶「${accountName}」，初始餘額 ${amountRaw}，不建立交易。`});
        return {tx:null, amountRaw, type, account:r.account, newAccount:true, accountOnly:true, zeroOpeningAdjustment:amountRaw===0};
      }
      warnings.push({row:index+1,message:`保留「初始金額」：帳戶「${accountName}」已存在，未覆蓋目前餘額 ${Number(r.account.balance||0)}。`});
      return {tx:null, amountRaw, type, account:r.account, newAccount:false, accountOnly:false, skipped:true, zeroOpeningAdjustment:amountRaw===0};
    }

    if(!mainName) throw new Error('主類別不可空白');
    if(!subName) throw new Error('子類別不可空白');
    const zeroOpeningAdjustment = type==='餘額調整' && amountRaw===0;
    if(amountRaw===null || (amountRaw===0 && !zeroOpeningAdjustment)) throw new Error('金額必須是非 0 數字');
    const expected=signExpected(type);
    if(expected && Math.sign(amountRaw)!==expected) warnings.push({row:index+1,message:`「${type}」金額符號與規範不同，已保留原始正負號計算餘額，請確認。`});
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
      project:project?.id||'',note:norm(row[13]).slice(0,300),tags:norm(row[14])?norm(row[14]).split(';').map(x=>x.trim()).filter(Boolean):[],person:norm(row[15])||'不限定對象',currency:currency||account.currency||'TWD',fee:Math.abs(fee),discount:Math.abs(discount),_importKey:fingerprint(row),imported:true,balanceEffect:amountRaw-Math.abs(fee)+Math.abs(discount)
    };
    return {tx, amountRaw, type, account, newAccount, zeroOpeningAdjustment};
  }

  function buildImport(st, rows) {
    const created={accounts:[],categories:[],projects:[],loans:[]}, imported=[], errors=[], warnings=[];
    const existingKeys=new Set(); (st.transactions||[]).forEach(t=>{if(t._importKey)String(t._importKey).split('\u001e').forEach(k=>existingKeys.add(k));});
    for(let i=1;i<rows.length;i++){
      const row=rows[i].map(v=>String(v??''));
      if(row.length!==HEADERS.length){errors.push({row:i+1,message:`欄位數量 ${row.length}，必須為 ${HEADERS.length}`});continue;}
      const key=fingerprint(row); if(existingKeys.has(key)){imported.push({row:i+1,skipped:true});continue;}
      try{
        const type=norm(row[2]);
        if(isLoanType(type)){
          const result=rowToLoanRecords(row,st,created,i,warnings);
          imported.push({row:i+1,...result});
        } else {
          const result=rowToTransaction(row,st,created,i,warnings);
          if(result.zeroOpeningAdjustment){
            imported.push({row:i+1,...result, tx:null, accountOnly:true});
          } else {
            imported.push({row:i+1,...result});
          }
        }
      }catch(err){errors.push({row:i+1,message:err.message||String(err)});}
    }
    // Convert adjacent transfer rows into one transfer transaction.
    const final=[]; const used=new Set();
    for(let i=0;i<imported.length;i++){
      const a=imported[i]; if(a.skipped||a.accountOnly||a.loanRecords||!a.tx) continue;
      if(a.type==='轉出'){
        const next=imported[i+1];
        if(next?.tx && next.type==='轉入' && !next.skipped && a.tx.date===next.tx.date && a.tx.time===next.tx.time){
          a.tx.kind='transfer'; a.tx.account=a.tx.account; a.tx.toAccount=next.tx.account; a.tx.amount=Math.abs(a.amountRaw); a.tx.balanceEffect=a.tx.balanceEffect; a.tx.toAmount=Math.abs(next.amountRaw); a.tx.toBalanceEffect=next.tx.balanceEffect; a.tx.toCurrency=next.tx.currency; a.tx.transferPair=true; a.tx._importKey=`${a.tx._importKey}\u001e${next.tx._importKey}`;
          final.push(a.tx); used.add(i+1); continue;
        }
        errors.push({row:a.row,message:'轉出找不到相鄰、日期時間相同的轉入紀錄'}); continue;
      }
      if(a.type==='轉入' && used.has(i)) continue;
      if(a.type==='轉入') { errors.push({row:a.row,message:'轉入必須緊接在轉出紀錄之後'}); continue; }
      final.push(a.tx);
    }
    const loanTransactions=imported.filter(x=>x.loanRecords&&Array.isArray(x.transactions)).flatMap(x=>x.transactions);
    final.push(...loanTransactions);
    const changedLoans=[...new Map(imported.filter(x=>x.loanRecords&&Array.isArray(x.changedLoans)).flatMap(x=>x.changedLoans).map(l=>[String(l.id),l])).values()];
    // Apply each source row net effect (amount - fee + discount) only to accounts created in this import.
    // This preserves the semantics of 應收款項／應付款項 and 餘額調整, whose sign
    // can legitimately be positive or negative in MOZE exports. Cross-currency
    // transfers use the destination row's own amount.
    // Effects on pre-existing accounts are NOT applied here; they are collected in
    // existingDeltas so the append preview can let the user opt in explicitly.
    const newIds=new Set(created.accounts.map(a=>String(a.id)));
    const accById=new Map(st.accounts.map(a=>[String(a.id),a]));
    const existingDeltas=new Map();
    const applyEffect=(id,effect)=>{
      const a=accById.get(String(id)); if(!a||!Number.isFinite(effect)) return;
      if(newIds.has(String(a.id))) a.balance += effect;
      else existingDeltas.set(String(a.id),(existingDeltas.get(String(a.id))||0)+effect);
    };
    for(const tx of final){
      if(tx.kind==='transfer'){
        applyEffect(tx.account, Number(tx.balanceEffect??(-tx.amount)));
        if(tx.toAccount) applyEffect(tx.toAccount, Number(tx.toBalanceEffect??tx.toAmount??tx.amount));
      } else {
        applyEffect(tx.account, Number(tx.balanceEffect ?? (tx.kind==='expense'?-tx.amount:tx.kind==='income'?tx.amount:tx.kind==='balance_adjustment'?tx.amount:0)));
      }
    }
    for(const [id,d] of existingDeltas){ if(Math.abs(d)<1e-9) existingDeltas.delete(id); }
    st.transactions.push(...final);
    return {state:st,transactions:final,errors,warnings,created,changedLoans,existingDeltas,loanCount:changedLoans.length,skipped:imported.filter(x=>x.skipped).length,accountOnly:imported.filter(x=>x.accountOnly).length,totalDataRows:rows.length-1};
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
    let mode='append', applyExisting=false;
    const renderBody=()=>{
      const previewState=mode==='overwrite'?makeOverwriteState(currentState):JSON.parse(JSON.stringify(currentState));
      const previewResult=mode==='overwrite'?buildImport(previewState,rows):result;
      const warn=previewResult.warnings?.length ? `<div class="import-warnings"><b>有 ${previewResult.warnings.length} 筆格式提醒</b>${previewResult.warnings.slice(0,20).map(e=>`<div>第 ${e.row} 列：${escapeHtml(e.message)}</div>`).join('')}${previewResult.warnings.length>20?`<div>…另有 ${previewResult.warnings.length-20} 筆</div>`:''}</div>` : '';
      const errs=previewResult.errors.length ? `<div class="import-errors"><b>需要修正 ${previewResult.errors.length} 筆</b>${previewResult.errors.slice(0,20).map(e=>`<div>第 ${e.row} 列：${escapeHtml(e.message)}</div>`).join('')}${previewResult.errors.length>20?`<div>…另有 ${previewResult.errors.length-20} 筆</div>`:''}</div>` : '';
      const overwriteNotice=mode==='overwrite'?`<div class="import-overwrite-warning"><b>⚠️ 完整覆蓋</b><p>會清除目前的交易、帳戶、分類、專案、預算、週期交易與借還款，再用這份 CSV 重建可匯入的資料。</p><p>確認前會自動下載目前資料的 JSON 備份。</p></div>`:'';
      const deltaRows=[...(result.existingDeltas||new Map())].map(([id,d])=>{const a=(result.state.accounts||[]).find(x=>String(x.id)===id);return a?{a,d}:null}).filter(Boolean);
      const fmt=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2});
      const deltaList=deltaRows.length?`<label class="import-apply-existing"><input type="checkbox" id="csvApplyExisting" ${applyExisting?'checked':''}> <b>將本次新增交易套用到既有帳戶餘額</b></label><small>預設不套用：CSV 若是歷史資料，既有帳戶目前餘額通常已包含這些交易。只有確定是「之後才發生、尚未記入」的新交易才勾選。</small>${applyExisting?`<div class="import-delta-list">${deltaRows.map(({a,d})=>`<div><span>${escapeHtml(a.name)} · ${escapeHtml(a.currency||'TWD')}</span><b>${fmt(a.balance)} → ${fmt(Number(a.balance||0)+d)}（${d>0?'+':''}${fmt(d)}）</b></div>`).join('')}</div>`:''}`:'';
      const appendNotice=`<div class="import-append-note"><b>追加紀錄</b><p>保留目前所有資料，只加入 CSV 中的新資料。相同匯入資料會自動略過。</p>${deltaList}</div>`;
      body.innerHTML=`
        <div class="import-mode">
          <label class="import-mode-option ${mode==='append'?'active':''}"><input type="radio" name="csvImportMode" value="append" ${mode==='append'?'checked':''}><span><b>追加紀錄</b><small>保留現有資料，只新增 CSV 的內容</small></span></label>
          <label class="import-mode-option ${mode==='overwrite'?'active':''}"><input type="radio" name="csvImportMode" value="overwrite" ${mode==='overwrite'?'checked':''}><span><b>完整覆蓋</b><small>清除現有帳務資料後重新匯入</small></span></label>
        </div>
        ${mode==='overwrite'?overwriteNotice:appendNotice}
        <div class="import-summary"><div><b>${previewResult.transactions.length}</b><span>筆可匯入交易</span></div><div><b>${previewResult.loanCount||0}</b><span>筆借還款變更</span></div><div><b>${previewResult.accountOnly||0}</b><span>筆帳戶建立</span></div><div><b>${previewResult.skipped}</b><span>筆重複略過</span></div><div><b>${previewResult.errors.length}</b><span>筆錯誤</span></div></div>
        ${errs}${warn}
        <div class="import-created"><b>本次自動建立</b><span>帳戶 ${previewResult.created.accounts.length} · 分類 ${previewResult.created.categories.length} · 專案 ${previewResult.created.projects.length} · 借還款 ${previewResult.created.loans?.length||0}</span></div>
        <p class="hint">帳戶與分類不存在時會自動建立；新建立帳戶會依匯入資料計算餘額。轉帳需符合「轉出＋下一列轉入」且日期、時間一致的格式。</p>
        <div class="import-preview"><b>預覽前 10 筆</b>${previewResult.transactions.slice(0,10).map(t=>`<div><span>${escapeHtml(t.date)} ${escapeHtml(t.time)} · ${escapeHtml(t.name)}</span><b>${t.kind==='expense'?'−':'+'}${Number(t.amount).toLocaleString()}</b></div>`).join('')||'<div class="empty">沒有可匯入的交易</div>'}</div>`;
      body.querySelectorAll('input[name=csvImportMode]').forEach(r=>r.addEventListener('change',()=>{mode=r.value;renderBody()}));
      body.querySelector('#csvApplyExisting')?.addEventListener('change',e=>{applyExisting=!!e.target.checked;renderBody()});
      const active=mode==='overwrite'?previewResult:result;
      $('csvImportConfirm').disabled = (active.transactions.length===0 && (active.accountOnly||0)===0);
      $('csvImportConfirm').textContent = mode==='overwrite'?'完整覆蓋並匯入':'追加匯入';
      $('csvImportConfirm').onclick = async()=>{
        if(!active.transactions.length && !(active.accountOnly||0)){bg.classList.remove('open');return;}
        try {
          if(mode==='overwrite') {
            downloadBackup(currentState);
            if(!confirm('確定要完整覆蓋目前資料嗎？\n\n目前帳務資料會先自動下載 JSON 備份，接著清除並改用這份 CSV 建立新資料。')) return;
          }
          const touchedAccounts=[];
          if(mode==='append' && applyExisting){
            for(const [id,d] of active.existingDeltas||[]){
              const a=(active.state.accounts||[]).find(x=>String(x.id)===id);
              if(a){ a.balance=Number(a.balance||0)+d; touchedAccounts.push(a); }
            }
          }
          await window.MozeApp.setState(active.state,{persist:true,markDirty:false,cloneData:false,skipSyncSignature:true});
          if(mode==='overwrite') {
            const remote=await window.MozeSync?.getAllCloudRows?.();
            if(remote) await window.MozeSync.replaceCloudWithLocal(remote);
            else if(window.MozeSync?.syncNow) await window.MozeSync.syncNow('auto');
          } else {
            const changes=[];
            for(const a of [...(active.created.accounts||[]),...touchedAccounts]) changes.push({entity:'accounts',recordId:a.id,op:'upsert'});
            for(const c of active.created.categories||[]) changes.push({entity:'categories',recordId:c.id,op:'upsert'});
            for(const pr of active.created.projects||[]) changes.push({entity:'projects',recordId:pr.id,op:'upsert'});
            for(const t of active.transactions||[]) changes.push({entity:'transactions',recordId:t.id,op:'upsert'});
            for(const l of active.changedLoans||[]) changes.push({entity:'loans',recordId:l.id,op:'upsert'});
            window.MozeSync?.queueStateDiff?.(changes);
            window.MozeSync?.markDirty?.();
          }
          bg.classList.remove('open');
          alert(`${mode==='overwrite'?'完整覆蓋':'追加匯入'}完成：${active.transactions.length} 筆交易${active.accountOnly?`、${active.accountOnly} 個零餘額帳戶`:''}${touchedAccounts.length?`、更新 ${touchedAccounts.length} 個既有帳戶餘額`:''}。${active.errors.length?`\n有 ${active.errors.length} 筆資料未匯入，請修正 CSV 後再試。`:''}`);
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
      checkHeader(rows);
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

  function checkHeader(rows){
    const header=rows[0].map(norm);
    const headerKey = v => String(v ?? '').replace(/﻿/g,'').replace(/＊/g,'*').replace(/\s+/g,'').replace(/\*$/,'');
    const expectedKeys = HEADERS.map(headerKey);
    const actualKeys = header.map(headerKey);
    if(header.length!==HEADERS.length || actualKeys.some((v,i)=>v!==expectedKeys[i])) {
      throw new Error(`CSV 欄位格式不符合 MOZE 匯入格式。\n可接受必要欄位標題：${HEADERS.join(',')}\n（必要欄位的 *／＊ 可省略）`);
    }
  }

  // ---------------------------------------------------------------------------
  // V25.13 account reconciliation.
  // A correct account satisfies: balance = opening balance + Σ(effect of its transactions).
  // Effects follow exactly the rules app.js adjust() and the loan pages use, so an account
  // whose balance was corrupted by an old edit/delete bug shows up as a difference.
  // Opening balances come from the original MOZE CSV「初始金額」rows, matched by (name, currency).
  const accKey=(name,cur)=>`${norm(name)}\u001f${norm(cur)||'TWD'}`;
  const round2=n=>Math.round(Number(n||0)*100)/100;
  function txAccountEffects(t){
    const out=[]; if(!t||t.account===undefined||t.account===null||t.account==='') return out;
    const n=v=>Number(v||0), abs=v=>Math.abs(n(v));
    if(t.kind==='transfer'){
      out.push([t.account, Number(t.balanceEffect??(-n(t.amount)))]);
      if(t.toAccount!==undefined&&t.toAccount!==null&&t.toAccount!=='') out.push([t.toAccount, Number(t.toBalanceEffect??(t.toAmount??n(t.amount)))]);
      return out;
    }
    if(t.imported&&t.balanceEffect!==undefined){ out.push([t.account, n(t.balanceEffect)]); return out; }
    if(t.kind==='expense') out.push([t.account, -n(t.amount)]);
    else if(t.kind==='income'||t.kind==='balance_adjustment') out.push([t.account, n(t.amount)]);
    else if(t.kind==='loan') out.push([t.account, t.loanAction==='lend'?-abs(t.amount):abs(t.amount)]);
    else if(t.kind==='loanPayment') out.push([t.account, t.loanDirection==='receivable'?abs(t.amount):-abs(t.amount)]);
    return out;
  }
  function ledgerByAccount(state){
    const sum=new Map(), count=new Map();
    for(const t of state?.transactions||[]) for(const [id,e] of txAccountEffects(t)){
      if(!Number.isFinite(e)) continue; const k=String(id);
      sum.set(k,(sum.get(k)||0)+e); count.set(k,(count.get(k)||0)+1);
    }
    return {sum,count};
  }
  function csvOpenings(rows){
    const map=new Map();
    for(let i=1;i<rows.length;i++){
      const r=rows[i]; if(norm(r[2]).replace(/＊/g,'')!=='初始金額') continue;
      const amt=parseAmount(r[5]); if(amt===null||!Number.isFinite(amt)) continue;
      const k=accKey(r[0],r[1]); map.set(k,(map.get(k)||0)+amt);
    }
    return map;
  }
  // manual: Map(accountId → opening) typed by the user; it wins over the CSV value.
  function reconcile(state, openings, manual){
    const {sum,count}=ledgerByAccount(state);
    return (state?.accounts||[]).map(a=>{
      const id=String(a.id), balance=round2(a.balance), ledger=round2(sum.get(id)||0);
      const key=accKey(a.name,a.currency);
      const source=manual?.has(id)?'manual':openings?.has(key)?'csv':'';
      const opening=source==='manual'?round2(manual.get(id)):source==='csv'?round2(openings.get(key)):null;
      const expected=opening===null?null:round2(opening+ledger);
      const diff=expected===null?null:round2(balance-expected);
      return {id,name:a.name,currency:a.currency||'TWD',type:a.type,balance,ledger,txCount:count.get(id)||0,implied:round2(balance-ledger),opening,source,expected,diff,mismatch:diff!==null&&Math.abs(diff)>=0.01};
    });
  }

  // V25.18: initial balances typed in the reconcile window are remembered on this device.
  const MANUAL_KEY='moze-reconcile-openings-v1';
  function loadManual(){try{const o=JSON.parse(localStorage.getItem(MANUAL_KEY)||'{}');return new Map(Object.entries(o).filter(([,v])=>Number.isFinite(v)))}catch{return new Map()}}
  function saveManual(m){try{localStorage.setItem(MANUAL_KEY,JSON.stringify(Object.fromEntries(m)))}catch{}}

  function openReconcile(){
    const bg=$('reconcileBg'), body=$('reconcileBody'); if(!bg||!body) return;
    let openings=null, fileName='';
    const manual=loadManual();
    const fmt=n=>n===null||n===undefined?'—':Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
    const signed=n=>n===null?'—':`${n>0?'+':''}${fmt(n)}`;
    const render=()=>{
      const st=window.MozeApp.getState();
      for(const id of [...manual.keys()]) if(!(st.accounts||[]).some(a=>String(a.id)===id)) manual.delete(id);
      const rows=reconcile(st,openings,manual);
      const known=rows.filter(r=>r.opening!==null), bad=rows.filter(r=>r.mismatch);
      const unknown=rows.filter(r=>r.opening===null);
      const summary=!known.length
        ?`<div class="import-append-note"><b>請提供初始金額</b><p>在每個帳戶的「初始金額」欄輸入你記得的開戶金額（例如在 MOZE 設定的初始金額），或按「未填的以 0 比對」，也可以選擇原始 MOZE CSV。灰字是依目前餘額倒推的「推算初始金額」，如果它看起來不合理，代表餘額可能曾被改錯。</p></div>`
        :bad.length?`<div class="import-errors"><b>${bad.length} 個帳戶餘額和「初始金額 + 交易合計」不一致</b><div>差額＝目前餘額 − 應有餘額。修正會把餘額改成應有餘額，並同步到雲端；修正前會自動下載 JSON 備份。</div></div>`
        :`<div class="import-append-note"><b>✓ 已比對的 ${known.length} 個帳戶全部一致</b><p>${unknown.length?`另有 ${unknown.length} 個帳戶未填初始金額，尚未比對。`:'所有帳戶都沒有差額。'}</p></div>`;
      body.innerHTML=`
        <div class="reconcile-file">
          <button type="button" class="secondary" id="reconcilePick">${openings?'改選其他 CSV':'選擇原始 MOZE CSV'}</button>
          <button type="button" class="secondary" id="reconcileZero" ${unknown.length?'':'disabled'}>未填的以 0 比對</button>
          <button type="button" class="secondary" id="reconcileClearManual" ${manual.size?'':'disabled'}>清除手動輸入</button>
          <span class="hint">${fileName?escapeHtml(fileName):'CSV 只讀取「初始金額」列，不會匯入任何資料；手動輸入的初始金額會記在這台裝置'}</span>
        </div>
        ${summary}
        <div class="reconcile-table">
          <div class="reconcile-row reconcile-head"><span>帳戶</span><span>目前餘額</span><span>交易合計</span><span>初始金額</span><span>差額</span></div>
          ${rows.map(r=>`<div class="reconcile-row ${r.mismatch?'mismatch':''}"><span><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.currency)} · ${r.txCount} 筆</small></span><span>${fmt(r.balance)}</span><span>${signed(r.ledger)}</span><span class="reconcile-opening"><input type="number" step="any" inputmode="decimal" data-reconcile-opening="${escapeHtml(r.id)}" value="${r.opening===null?'':r.opening}" placeholder="${escapeHtml(fmt(r.implied))}" aria-label="${escapeHtml(r.name)} 初始金額"><small>${r.source==='csv'?'CSV':r.source==='manual'?'手動輸入':'推算 '+escapeHtml(fmt(r.implied))}</small></span><span>${r.opening===null?'—':r.mismatch?`<b class="expense-text">${signed(r.diff)}</b><button type="button" class="secondary" data-reconcile-fix="${escapeHtml(r.id)}">改為 ${fmt(r.expected)}</button>`:'✓'}</span></div>`).join('')||'<div class="empty">沒有帳戶</div>'}
        </div>
        <p class="hint">交易合計包含支出、收入、轉帳（含跨幣別與手續費）、餘額調整與借還款。帳戶建立後若曾在 App 直接修改過餘額，也會顯示為差額，這種差額不需要修正。</p>`;
      body.querySelector('#reconcilePick').onclick=()=>$('reconcileCsvFile')?.click();
      body.querySelector('#reconcileZero').onclick=()=>{for(const r of unknown) manual.set(r.id,0); saveManual(manual); render();};
      body.querySelector('#reconcileClearManual').onclick=()=>{manual.clear(); saveManual(manual); render();};
      body.querySelectorAll('[data-reconcile-opening]').forEach(inp=>inp.onchange=()=>{
        const id=inp.dataset.reconcileOpening, v=String(inp.value).trim();
        if(v==='') manual.delete(id); else { const n=Number(v); if(!Number.isFinite(n)) return; manual.set(id,n); }
        saveManual(manual); render();
      });
      body.querySelectorAll('[data-reconcile-fix]').forEach(b=>b.onclick=()=>applyFix(rows.filter(r=>r.id===b.dataset.reconcileFix)));
      const all=$('reconcileFixAll'); if(all){ all.hidden=!bad.length; all.textContent=`全部修正（${bad.length} 個帳戶）`; all.onclick=()=>applyFix(bad); }
    };
    const applyFix=async(list)=>{
      list=list.filter(r=>r.mismatch); if(!list.length) return;
      const lines=list.map(r=>`${r.name}（${r.currency}）：${fmt(r.balance)} → ${fmt(r.expected)}`).join('\n');
      if(!confirm(`將修正 ${list.length} 個帳戶餘額：\n\n${lines}\n\n修正前會先下載目前資料的 JSON 備份。確定修正？`)) return;
      try{
        const current=window.MozeApp.getState();
        downloadBackup(current,`moze-before-reconcile-${new Date().toISOString().slice(0,10)}.json`);
        const next=JSON.parse(JSON.stringify(current));
        for(const r of list){ const a=next.accounts.find(x=>String(x.id)===r.id); if(a) a.balance=r.expected; }
        await window.MozeApp.setState(next,{persist:true,markDirty:true});
        render();
      }catch(err){ alert('修正失敗：'+(err.message||err)); }
    };
    const file=$('reconcileCsvFile');
    if(file) file.onchange=async e=>{
      const f=e.target.files?.[0]; e.target.value=''; if(!f) return;
      try{ const rows=parseCSV(await readText(f)); if(!rows.length) throw new Error('CSV 沒有資料。'); checkHeader(rows); openings=csvOpenings(rows); fileName=`${f.name}（${openings.size} 個帳戶有初始金額）`; render(); }
      catch(err){ alert('CSV 讀取失敗：'+(err.message||err)); }
    };
    const close=()=>bg.classList.remove('open');
    $('reconcileClose').onclick=close; $('reconcileClose2').onclick=close; bg.onclick=e=>{if(e.target===bg)close()};
    render(); bg.classList.add('open');
  }

  function init(){
    const btn=$('importCsv'), file=$('importCsvFile'), tpl=$('downloadImportTemplate');
    btn?.addEventListener('click',()=>file?.click());
    file?.addEventListener('change',e=>{const f=e.target.files?.[0];e.target.value='';handleFile(f)});
    tpl?.addEventListener('click',downloadTemplate);
    $('reconcileAccounts')?.addEventListener('click',openReconcile);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  // Pure helpers exposed for Node regression tests (tests/import.test.js). Not used by the UI.
  window.MozeImportInternals = {parseCSV, buildImport, findLoanCandidates, ensureAccount, txAccountEffects, ledgerByAccount, csvOpenings, reconcile};
})();
