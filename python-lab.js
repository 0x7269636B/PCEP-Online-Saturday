/* Buildless Python workbench. No accounts, API tokens, or remote code storage. */
'use strict';
window.PythonLab = (() => {
  const MAX_CODE = 100000;
  const DB_NAME = 'robotonio-python-workbench-v1';
  const JOURNAL = DB_NAME + '-pending';
  const records = new Map();
  let db, durable = true, queue = Promise.resolve(), activeRun = null;
  let mounts = [], renderToken = 0;
  const welcome = '# Γράψε το πρώτο σου πρόγραμμα εδώ.\nprint("Γεια σου, Python!")\n';
  const keywords = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
  function programName(value, fallback='my_program') {
    const original=String(value||'').replace(/\.py$/i,'');
    let name=original.replace(/[^A-Za-z0-9_]+/g,'_').slice(0,100);
    if(!name || (/^_+$/.test(name) && name!==original))name=fallback;
    if(/^[0-9]/.test(name))name='_'+name.slice(0,99);
    if(keywords.has(name))name+='_';
    return name;
  }
  const defaultName = id => id.startsWith('draft:lab/')?'lab_'+id.slice(10).replace(/[^A-Za-z0-9_]/g,'_'):id.startsWith('example:')?'lesson_example':'my_program';
  const uid = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  const valid = r => r && typeof r.id === 'string' && /^(draft:|program:|example:)/.test(r.id) && typeof r.code === 'string' && r.code.length <= MAX_CODE && typeof r.name === 'string' && r.name.length <= 100 && typeof r.stdin === 'string' && r.stdin.length <= MAX_CODE;
  const readJournal = () => {try {const value=JSON.parse(localStorage.getItem(JOURNAL) || '{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};} catch {return {};}};
  function journal(record) {
    try {const pending=readJournal();pending[record.id]=record;localStorage.setItem(JOURNAL,JSON.stringify(pending));return true;} catch {return false;}
  }
  function clearJournal(record) {
    try {const pending=readJournal();if(pending[record.id]?.revision===record.revision){delete pending[record.id];localStorage.setItem(JOURNAL,JSON.stringify(pending));}} catch {}
  }
  const ready = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('programs', {keyPath:'id'});
      req.onerror = () => {durable=false;resolve();};
      req.onblocked = () => {durable=false;resolve();};
      req.onsuccess = () => {
        db=req.result;db.onversionchange=()=>{db.close();durable=false;};
        const read=db.transaction('programs').objectStore('programs').getAll();
        read.onsuccess=()=>{read.result.filter(valid).forEach(r=>records.set(r.id,r));resolve();};
        read.onerror=()=>{durable=false;resolve();};
      };
    } catch {durable=false;resolve();}
  }).then(async()=>{
    const pending=Object.values(readJournal()).filter(valid);
    for(const r of pending){const old=records.get(r.id);if(!old||old.updated<=r.updated){records.set(r.id,r);await persist(r);}}
    // Keep existing programs and IDs; update only names that need the ASCII convention.
    for(const r of records.values()){
      const name=programName(r.name,defaultName(r.id));
      if(name!==r.name){const updated={...r,name,revision:uid()};journal(updated);await persist(updated);}
    }
  });
  function persist(record) {
    records.set(record.id,record);
    queue=queue.catch(()=>false).then(()=>new Promise(resolve=>{
      if(!db){durable=false;resolve(false);return;}
      try {
        const tx=db.transaction('programs','readwrite');tx.objectStore('programs').put(record);
        tx.oncomplete=()=>{clearJournal(record);resolve(true);};
        tx.onerror=tx.onabort=()=>{durable=false;resolve(false);};
      } catch {durable=false;resolve(false);}
    }));
    return queue;
  }
  function persistMessage(node, ok) {
    node.textContent=ok?'Αποθηκεύτηκε σε αυτόν τον browser.':'Η αποθήκευση δεν είναι διαθέσιμη. Κατέβασε το .py πριν κλείσεις.';
    node.classList.toggle('save-warning',!ok);
  }
  function makeRecord(id,name,code=welcome,stdin='',starter=code) {return {id,name:programName(name,defaultName(id)),code,stdin,starter,revision:uid(),updated:new Date().toISOString()};}
  function renderPanel(id, name, starter=welcome) {
    return `<section class="python-panel" data-python-id="${esc(id)}" data-name="${esc(name)}" data-starter="${esc(starter)}" aria-label="Εργαστήριο Python"><div class="python-panel-head"><div><span class="eyebrow">PYTHON LAB</span><h3>${esc(name)}</h3></div><span class="runtime-badge">Python 3 · δωρεάν</span></div><p class="python-help">Γράψε, δοκίμασε και κράτησε τη δουλειά σου. Κάθε εκτέλεση ξεκινά από καθαρό περιβάλλον.</p><div class="python-layout"><div class="python-editor-column"><label class="field-title">Όνομα προγράμματος<input class="program-name" maxlength="100" value="${esc(programName(name,defaultName(id)))}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="name-help-${esc(id)}" pattern="[A-Za-z_][A-Za-z0-9_]*" title="Λατινικά γράμματα, αριθμοί και _. Πρώτος χαρακτήρας: γράμμα ή _."></label><p class="program-name-help" id="name-help-${esc(id)}">Λατινικά γράμματα, αριθμοί και _. Ξεκίνα με γράμμα ή _. Παράδειγμα: my_program_1. Τα μη έγκυρα ονόματα προσαρμόζονται αυτόματα.</p><div class="editor-shell"><pre class="line-numbers" aria-hidden="true">1</pre><div class="editor-layer"><pre class="code-colors" aria-hidden="true"><code></code></pre><textarea class="python-editor" aria-label="Κώδικας Python" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" maxlength="${MAX_CODE}"></textarea></div></div><p class="keyboard-help">Tab: 4 κενά · Ctrl/⌘ + Enter: εκτέλεση · Esc και Tab: έξοδος από τον editor</p><div class="python-toolbar"><button class="button primary run-python" disabled>▶ Εκτέλεση</button><button class="button stop-python" disabled>■ Διακοπή</button><button class="button save-program" disabled>Αποθήκευση προγράμματος</button><button class="button download-python" disabled>↓ Λήψη .py</button></div><div class="python-secondary"><label class="file-import">↑ Άνοιγμα .py<input type="file" accept=".py,text/x-python,text/plain" class="import-python" disabled></label><button class="text-button restore-python" disabled>Αρχικό παράδειγμα</button></div><div class="restore-confirm hidden"><p>Να αντικατασταθεί ο κώδικας; Κατέβασε πρώτα το .py αν θέλεις να κρατήσεις αντίγραφο.</p><button class="button cancel-restore">Ακύρωση</button> <button class="button confirm-restore">Επαναφορά</button></div><p class="python-save-status" role="status">Άνοιγμα του πρόχειρου…</p></div><div class="python-console-column"><label class="field-title">Δεδομένα εισόδου — input()<textarea class="python-stdin" rows="4" maxlength="${MAX_CODE}" placeholder="Μία απάντηση ανά γραμμή, πριν πατήσεις Εκτέλεση.\nπ.χ. Μαρία\n14"></textarea></label><p class="python-input-help">Κάθε input() διαβάζει την επόμενη γραμμή. Για μία κενή απάντηση, βάλε μια κενή γραμμή. Σε αυτή την έκδοση οι απαντήσεις δίνονται πριν τρέξει το πρόγραμμα.</p><div class="console-heading"><strong>Αποτελέσματα</strong><button class="text-button clear-output">Καθαρισμός</button></div><pre class="python-output" tabindex="0" aria-label="Αποτελέσματα Python"></pre><p class="python-run-status" role="status">Έτοιμο για δοκιμή. Η πρώτη φόρτωση της Python χρειάζεται σύνδεση και λίγο χρόνο.</p></div></div><p class="python-privacy">Η δουλειά σου αποθηκεύεται εδώ, σε αυτόν τον browser. Για άλλον υπολογιστή ή αντίγραφο ασφαλείας, κατέβασε το .py. <a href="#programs">Τα προγράμματά μου →</a></p></section>`;
  }
  function page(id='draft:free') {
    return `<div class="content"><div class="page-heading"><div class="eyebrow">ΧΩΡΟΣ ΓΙΑ ΠΕΙΡΑΜΑΤΙΣΜΟ</div><h1>Γράψε Python.</h1><p>Ξεκίνα με μια ιδέα ή άνοιξε ένα παράδειγμα από το μάθημα. Κάνε αλλαγές και δες τι συμβαίνει.</p></div>${renderPanel(id,'my_program')}</div>`;
  }
  function library(){return `<div class="content"><div class="page-heading"><div class="eyebrow">ΤΟ ΤΕΤΡΑΔΙΟ ΣΟΥ</div><h1>Τα προγράμματά μου.</h1><p>Εδώ βρίσκεις τα αποθηκευμένα προγράμματα και τα πρόχειρα των ασκήσεών σου, στον browser που χρησιμοποιείς τώρα.</p><button class="button primary" id="new-program">Νέο πρόγραμμα +</button></div><div id="program-list" aria-live="polite">Φόρτωση…</div></div>`;}
  function download(record) {
    const base=programName(record.name,defaultName(record.id));
    const url=URL.createObjectURL(new Blob([record.code],{type:'text/x-python;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=base+'.py';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function stop(message='Η εκτέλεση σταμάτησε. Ο κώδικάς σου παραμένει στον editor.') {
    if(!activeRun)return;
    const run=activeRun;activeRun=null;run.worker.terminate();clearTimeout(run.timer);
    run.stop.disabled=true;run.start.disabled=false;run.status.textContent=message;
  }
  function execute(panel) {
    stop('Η εκτέλεση σταμάτησε για να τρέξει άλλο πρόγραμμα.');
    const editor=$('.python-editor',panel),out=$('.python-output',panel),status=$('.python-run-status',panel);
    if(!editor.value.trim()){status.textContent='Γράψε πρώτα λίγο κώδικα.';return;}
    out.textContent='';
    let worker;
    try {worker=new Worker(new URL('python-worker.js',document.baseURI),{type:'module'});} catch {status.textContent='Το εργαστήριο χρειάζεται HTTP/HTTPS. Άνοιξε την ιστοσελίδα στο GitHub Pages.';return;}
    const run={worker,start:$('.run-python',panel),stop:$('.stop-python',panel),status,timer:null,chars:0};
    activeRun=run;run.start.disabled=true;run.stop.disabled=false;status.textContent='Φορτώνει η Python… Την πρώτη φορά μπορεί να πάρει λίγο χρόνο.';
    run.timer=setTimeout(()=>stop('Δεν ολοκληρώθηκε η φόρτωση. Έλεγξε τη σύνδεση και δοκίμασε ξανά.'),60000);
    worker.onmessage=({data})=>{
      if(activeRun!==run)return;
      if(data.type==='running'){clearTimeout(run.timer);run.timer=setTimeout(()=>stop('Σταμάτησε μετά από 30 δευτερόλεπτα. Έλεγξε μήπως μια επανάληψη δεν τερματίζει.'),30000);status.textContent='Το πρόγραμμα εκτελείται…';}
      if(data.type==='output'){const text=String(data.text||'');out.textContent+=text.slice(0,Math.max(0,65536-run.chars));run.chars+=text.length;out.scrollTop=out.scrollHeight;if(run.chars>=65536)stop('Η έξοδος έφτασε το όριο. Έλεγξε μήπως εκτυπώνεις μέσα σε ατέρμονη επανάληψη.');}
      if(data.type==='input-exhausted')run.missingInput=true;
      if(data.type==='limit')stop('Η έξοδος έφτασε το όριο. Ο κώδικάς σου παραμένει στον editor.');
      if(data.type==='done')stop(run.missingInput?'Ολοκληρώθηκε, αλλά ζητήθηκαν περισσότερες γραμμές εισόδου από όσες έδωσες.':'Ολοκληρώθηκε.'+(out.textContent?'':' Δεν υπήρξε έξοδος. Χρησιμοποίησε print() για να εμφανίσεις τιμές.'));
      if(data.type==='error'){
        out.textContent+='\n'+String(data.message||'Άγνωστο σφάλμα.');
        stop(data.loading?'Δεν φορτώθηκε η Python. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.':run.missingInput?'Λείπει απάντηση για input(). Πρόσθεσε τις απαντήσεις στα Δεδομένα εισόδου και ξανατρέξε.':'Η Python βρήκε σφάλμα. Δες την τελευταία γραμμή στα αποτελέσματα.');
      }
    };
    worker.onerror=e=>{e.preventDefault();if(activeRun===run)stop('Δεν μπόρεσε να ξεκινήσει η Python. Έλεγξε τη σύνδεση και ξαναδοκίμασε.');};
    worker.postMessage({type:'run',code:editor.value,stdin:$('.python-stdin',panel).value});
  }
  async function mount(panel, token) {
    const editor=$('.python-editor',panel),stdin=$('.python-stdin',panel),name=$('.program-name',panel),status=$('.python-save-status',panel);
    await ready;if(token!==renderToken||!panel.isConnected)return;
    let id=panel.dataset.pythonId;
    const labDraft=id.startsWith('draft:lab/')?id:null;
    let initial=panel.dataset.starter;
    const stored=records.get(id);
    if(!stored&&id.startsWith('program:')){status.textContent='Αυτό το πρόγραμμα δεν βρέθηκε σε αυτόν τον browser. Μπορείς να γράψεις ένα νέο.';id='draft:free';}
    const record=stored||records.get(id)||makeRecord(id,panel.dataset.name,initial);
    initial=typeof record.starter==='string'?record.starter:initial;
    editor.value=record.code;stdin.value=record.stdin;name.value=record.name;
    let timer, revision=0, escapeTab=false;
    const paint=()=>{
      $('code',panel).innerHTML=highlight(editor.value)+'\n';
      $('.line-numbers',panel).textContent=Array.from({length:editor.value.split('\n').length},(_,i)=>i+1).join('\n');
      $('.code-colors',panel).scrollTop=editor.scrollTop;$('.code-colors',panel).scrollLeft=editor.scrollLeft;
      $('.line-numbers',panel).scrollTop=editor.scrollTop;
    };
    const snapshot=()=>makeRecord(id,name.value.trim()||'Το πρόγραμμά μου',editor.value,stdin.value,initial);
    const flush=async()=>{clearTimeout(timer);const r=snapshot(),n=revision;records.set(id,r);let ok=await persist(r);if(labDraft&&labDraft!==id)ok=(await persist({...r,id:labDraft}))&&ok;if(panel.isConnected&&n===revision)persistMessage(status,ok);return r;};
    const changed=()=>{revision++;paint();const r=snapshot();records.set(id,r);let backed=journal(r);if(labDraft&&labDraft!==id){const draft={...r,id:labDraft};records.set(labDraft,draft);backed=journal(draft)&&backed;}status.textContent=backed?'Αποθήκευση…':'Η αυτόματη αποθήκευση μπορεί να μην είναι διαθέσιμη. Κράτησε και ένα .py.';clearTimeout(timer);timer=setTimeout(flush,350);};
    editor.addEventListener('input',changed);stdin.addEventListener('input',changed);name.addEventListener('input',changed);
    name.addEventListener('blur',()=>{
      const normalized=programName(name.value,defaultName(id));
      if(normalized!==name.value){name.value=normalized;changed();toast('Το όνομα προσαρμόστηκε: '+normalized);}
    });
    editor.addEventListener('scroll',paint);
    editor.addEventListener('keydown',e=>{
      if(e.key==='Escape'){escapeTab=true;return;}
      if(e.key==='Tab'&&escapeTab){escapeTab=false;return;}
      escapeTab=false;
      if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();execute(panel);return;}
      if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();editor.setRangeText('    ',editor.selectionStart,editor.selectionEnd,'end');changed();}
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const before=editor.value.slice(0,editor.selectionStart).split('\n').pop();let indent=before.match(/^ */)[0];if(before.trimEnd().endsWith(':'))indent+='    ';editor.setRangeText('\n'+indent,editor.selectionStart,editor.selectionEnd,'end');changed();}
    });
    $('.run-python',panel).addEventListener('click',()=>{flush();execute(panel);});
    $('.stop-python',panel).addEventListener('click',()=>stop());
    $('.clear-output',panel).addEventListener('click',()=>{$('.python-output',panel).textContent='';});
    $('.download-python',panel).addEventListener('click',()=>download(snapshot()));
    $('.save-program',panel).addEventListener('click',async()=>{
      await flush();if(!id.startsWith('program:'))id='program:'+uid();
      const saved=snapshot();journal(saved);const ok=await persist(saved);persistMessage(status,ok);
      if(ok){
        if(location.hash.startsWith('#python'))history.replaceState(null,'','#python/'+encodeURIComponent(id));
        toast('Το πρόγραμμα αποθηκεύτηκε στα «Προγράμματά μου».');
      }
    });
    $('.import-python',panel).addEventListener('change',async e=>{
      const file=e.target.files[0];e.target.value='';if(!file)return;
      if(!/\.py$/i.test(file.name)||file.size>MAX_CODE){toast('Διάλεξε ένα αρχείο .py έως 100 KB.');return;}
      try {
        const code=await file.text();if(code.includes('\0'))throw Error('binary');
        await flush(); // Import creates a separate record, never overwrites the current program.
        const imported=makeRecord('program:'+uid(),file.name.replace(/\.py$/i,'').slice(0,100),code);
        journal(imported);await persist(imported);location.hash='python/'+encodeURIComponent(imported.id);
      } catch {toast('Δεν μπόρεσα να ανοίξω το αρχείο ως κείμενο Python.');}
    });
    $('.restore-python',panel).addEventListener('click',()=>$('.restore-confirm',panel).classList.remove('hidden'));
    $('.cancel-restore',panel).addEventListener('click',()=>$('.restore-confirm',panel).classList.add('hidden'));
    $('.confirm-restore',panel).addEventListener('click',()=>{editor.value=initial;stdin.value='';changed();$('.restore-confirm',panel).classList.add('hidden');});
    // Record listeners for navigation: flush captured values before removing the DOM.
    mounts.push({flush,changed,editor,stdin,name});
    paint();panel.querySelectorAll('.run-python,.save-program,.download-python,.import-python,.restore-python').forEach(b=>b.disabled=false);
    if(!durable)persistMessage(status,false);else status.textContent=stored?'Το πρόχειρό σου είναι έτοιμο. Οι αλλαγές αποθηκεύονται αυτόματα.':'Οι αλλαγές σου αποθηκεύονται αυτόματα σε αυτόν τον browser.';
  }
  async function mountLibrary(token){
    await ready;if(token!==renderToken)return;const target=$('#program-list');if(!target)return;
    const all=[...records.values()].sort((a,b)=>b.updated.localeCompare(a.updated));
    const group=(title,items)=>`<h2 class="group-title">${title}</h2><div class="course-grid">${items.map(r=>`<article class="course-card"><h3>${esc(r.name)}</h3><p>${r.id.startsWith('program:')?'Αποθηκευμένο πρόγραμμα':'Πρόχειρο εργαστηρίου'} · ${esc(new Date(r.updated).toLocaleString('el-GR'))}</p><div class="program-actions"><a class="button primary" href="#python/${encodeURIComponent(r.id)}">Άνοιγμα</a><button class="button export-record" data-id="${esc(r.id)}">Λήψη .py</button></div></article>`).join('')}</div>`;
    target.innerHTML=all.length?group('Αποθηκευμένα',all.filter(r=>r.id.startsWith('program:')))+group('Πρόχειρα',all.filter(r=>!r.id.startsWith('program:'))):'<div class="empty">Δεν έχεις αποθηκεύσει κάποιο πρόγραμμα ακόμη. Άνοιξε το εργαστήριο και δοκίμασε την πρώτη σου ιδέα.</div>';
    if(!durable)target.insertAdjacentHTML('afterbegin','<p class="notice">Η μόνιμη αποθήκευση δεν είναι διαθέσιμη. Κατέβασε τα αρχεία που χρειάζεσαι πριν κλείσεις τη σελίδα.</p>');
    target.querySelectorAll('.export-record').forEach(b=>b.addEventListener('click',()=>download(records.get(b.dataset.id))));
  }
  function bind(){
    const token=++renderToken;document.querySelectorAll('.python-panel').forEach(p=>mount(p,token));mountLibrary(token);
    $('#new-program')?.addEventListener('click',async()=>{
      await ready;const record=makeRecord('program:'+uid(),'new_program');journal(record);await persist(record);
      location.hash='python/'+encodeURIComponent(record.id);
    });
  }
  function dispose(){renderToken++;stop('Η εκτέλεση σταμάτησε καθώς άλλαξες σελίδα.');for(const m of mounts)m.flush();mounts=[];}
  async function openExample(code){
    await ready;
    // Stable key based on the full code: revisiting an example restores its draft.
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
    const id='example:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    if(!records.has(id)){const r=makeRecord(id,'lesson_example',code);journal(r);await persist(r);}
    location.hash='python/'+encodeURIComponent(id);
  }
  window.addEventListener('pagehide',()=>{for(const m of mounts)m.flush();});
  return {page,library,renderPanel,bind,dispose,openExample};
})();
