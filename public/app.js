import {localDate,addDays,reviewInfo,parseIntervals,dictionaryUrl,safeUrl,blankSense,newEntry,newRelatedWord,validateBook,toCsv,datePage} from './model.js';
import {createSynonymsUI} from './synonyms.js';
import {createMaterialsUI} from './materials.js';
import {lookupVocabulary} from './lookup.js';
import {createNotebookNavigation} from './notebook-nav.js';
const $=s=>document.querySelector(s);let book,filter='all',activeDate=null,ready=false,dirty=false,saving=false,saveTimer,saveFailure=false,saveConflict=false;let today=localDate(),toastTimer;const requests=new Map(),targetRequestKeys=new WeakMap();const undo=[];const RECOVERY='ciye-unsaved-v1';
const h=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const columnNames={date:'日期',number:'序号',word:'单词',ipa:'英式音标',meaning:'词性与中文释义',link:'链接'};
const columnPreference='ciye-hidden-columns-v1';
let hiddenColumns=new Set();const revealedEntries=new Set();
try{const saved=JSON.parse(localStorage.getItem(columnPreference)||'[]');if(Array.isArray(saved))hiddenColumns=new Set(saved.filter(key=>Object.hasOwn(columnNames,key)));}catch{}
function setHiddenColumns(columns){
  hiddenColumns=new Set(columns);revealedEntries.clear();
  try{localStorage.setItem(columnPreference,JSON.stringify([...hiddenColumns]));}catch{}
  applyConcealment();
}
function applyConcealment(){
  const keys=Object.keys(columnNames);const entries=new Map((book?.entries||[]).map(e=>[e.id,e]));const controlsAdded=new Set();
  document.querySelectorAll('[data-hide-column]').forEach(input=>input.checked=hiddenColumns.has(input.dataset.hideColumn));
  const presets={meaning:['meaning'],word:['word','ipa','link']};
  document.querySelectorAll('[data-check-mode]').forEach(button=>{const preset=presets[button.dataset.checkMode];button.setAttribute('aria-pressed',String(hiddenColumns.size===preset.length&&preset.every(key=>hiddenColumns.has(key))));});
  $('#show-columns').hidden=!hiddenColumns.size;$('#conceal-again').hidden=!hiddenColumns.size;
  $('#conceal-status').textContent=hiddenColumns.size?`已遮挡：${keys.filter(key=>hiddenColumns.has(key)).map(key=>columnNames[key]).join('、')}。点「揭晓」核对这一词；复习完成后再标记。`:'先回忆，再点「揭晓」核对这一词的答案。';
  document.querySelectorAll('#wordbook-page thead th').forEach((th,i)=>{th.classList.toggle('concealed-heading',hiddenColumns.has(keys[i]));th.setAttribute('aria-label',columnNames[keys[i]]+(hiddenColumns.has(keys[i])?'（内容已遮挡）':''));});
  document.querySelectorAll('#word-rows td').forEach(cell=>{
    const id=cell.closest('tr').dataset.entry;const entry=entries.get(id);if(!entry)return;
    let content=cell.querySelector(':scope > .cell-content');
    if(!content){content=document.createElement('div');content.className='cell-content';content.append(...cell.childNodes);cell.append(content);const field=content.querySelector('[data-field]')?.dataset.field;cell.dataset.column=cell.dataset.column||(field==='pos'?'meaning':field||'link');}
    cell.querySelectorAll(':scope > .answer-cover,:scope > .conceal-word').forEach(el=>el.remove());
    const selected=hiddenColumns.has(cell.dataset.column),concealed=selected&&!revealedEntries.has(id);
    cell.classList.toggle('is-concealed',concealed);content.inert=concealed;
    if(concealed)content.setAttribute('aria-hidden','true');else content.removeAttribute('aria-hidden');
    content.querySelectorAll('[data-field]').forEach(input=>{
      const fieldName=columnNames[input.dataset.field]||({pos:'词性',meaning:'中文释义',relation:'与主词的关系'})[input.dataset.field];
      const related=entry.relatedWords.find(r=>r.id===input.dataset.related);
      const sense=(related||entry).senses.findIndex(s=>s.id===input.dataset.sense);
      const identity=hiddenColumns.has('word')&&!revealedEntries.has(id)?'本词':related?.word||entry.word||'空白单词';
      input.setAttribute('aria-label',`${identity} ${sense>=0?'第 '+(sense+1)+' 个词性 ':''}${fieldName}`);
    });
    if(!selected)return;
    const first=!controlsAdded.has(id);controlsAdded.add(id);
    if(concealed){const cover=document.createElement(first?'button':'span');cover.className='answer-cover';cover.textContent=first?'揭晓':'已遮挡';if(first){cover.type='button';cover.dataset.concealAction='reveal';cover.setAttribute('aria-label','揭晓本词的答案');}cell.append(cover);}
    else if(first){const button=document.createElement('button');button.type='button';button.className='conceal-word';button.dataset.concealAction='conceal';button.textContent='重新遮挡本词';cell.append(button);}
  });
}
document.querySelectorAll('[data-check-mode]').forEach(button=>button.onclick=()=>setHiddenColumns(button.dataset.checkMode==='word'?['word','ipa','link']:['meaning']));
document.querySelectorAll('[data-hide-column]').forEach(input=>input.onchange=()=>{const next=new Set(hiddenColumns);if(input.checked)next.add(input.dataset.hideColumn);else next.delete(input.dataset.hideColumn);setHiddenColumns(next);});
$('#show-columns').onclick=()=>setHiddenColumns([]);
$('#conceal-again').onclick=()=>{revealedEntries.clear();applyConcealment();};
$('#word-rows').addEventListener('click',event=>{const button=event.target.closest('[data-conceal-action]');if(!button)return;const id=button.closest('tr').dataset.entry;if(button.dataset.concealAction==='reveal')revealedEntries.add(id);else revealedEntries.delete(id);applyConcealment();const next=[...document.querySelectorAll('[data-conceal-action]')].find(el=>el.closest('tr').dataset.entry===id);next?.focus({preventScroll:true});});
applyConcealment();
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
function savedLabel(text,error=false){$('#save-state').textContent=text;$('#save-state').classList.toggle('error',error);}
function localRecovery(){try{localStorage.setItem(RECOVERY,JSON.stringify(book));}catch{}}
function change(){if(!ready)return;dirty=true;saveFailure=false;localRecovery();savedLabel(saveConflict?'存在冲突 · 请导出备份':'正在保存…',saveConflict);clearTimeout(saveTimer);if(!saveConflict)saveTimer=setTimeout(flush,350);}
async function flush(){
  if(!ready||saving||!dirty||saveConflict)return;saving=true;dirty=false;const snapshot=JSON.stringify(book);
  try{const res=await fetch('/api/book',{method:'PUT',headers:{'Content-Type':'application/json','X-Wordbook':'1'},body:snapshot});const result=await res.json();if(!res.ok){saveConflict=res.status===409;throw new Error(result.error);}book.revision=result.revision;saveFailure=false;if(dirty)localRecovery();else{try{localStorage.removeItem(RECOVERY);}catch{}savedLabel('已保存到电脑');}}
  catch(e){dirty=true;saveFailure=true;localRecovery();savedLabel(saveConflict?'保存冲突 · 请导出备份':'未保存 · 点击重试',true);toast(e.message||'保存失败；请保持页面打开并导出备份。');}
  finally{saving=false;if(dirty&&!saveFailure&&!saveConflict)void flush();}
}
function updateSummary(){
  const count=book.entries.filter(e=>e.word.trim()).length;const due=book.entries.filter(e=>reviewInfo(e,book.settings.intervals,today).due.length).length;const done=book.entries.filter(e=>reviewInfo(e,book.settings.intervals,today).doneToday).length;
  $('#all-count').textContent=count;$('#due-count').textContent=due;$('#review-summary').innerHTML=due?`今天有 <strong>${due}</strong> 个单词待复习${done?`，已完成 ${done} 个`:''}。`:(done?`今天已复习 <strong>${done}</strong> 个单词，继续保持。`:'今天没有待复习单词。收录新词，就从今天开始。');
  $('#interval-label').textContent=book.settings.intervals.join(' / ')+' 天';$('#all-tab').classList.toggle('active',filter==='all');$('#due-tab').classList.toggle('active',filter==='due');$('#all-tab').setAttribute('aria-pressed',String(filter==='all'));$('#due-tab').setAttribute('aria-pressed',String(filter==='due'));
}
function statusHtml(e){const info=reviewInfo(e,book.settings.intervals,today);if(!e.word.trim())return '';if(info.due.length)return `<span class="review-badge">● ${info.overdue?'待补复习':'今日复习'}</span><button class="review-toggle" data-action="review">标记已复习</button>`;if(info.doneToday)return '<span class="review-badge done">✓ 本次已复习</span><button class="review-toggle" data-action="undo-review">撤销本次复习</button>';if(info.next)return `<span class="review-badge future">${info.next.date.slice(5).replace('-','/')} 再复习</span>`;return '<span class="review-badge done">✓ 计划已完成</span>';}
function field(e,s,key,value,classes='',type='input'){const label=`${e.word||'空白单词'} ${s?'第 '+(e.senses.indexOf(s)+1)+' 个词性 ':''}${({date:'日期',number:'序号',word:'单词',ipa:'英式音标',pos:'词性',meaning:'中文释义'})[key]}`;const attrs=`class="cell-input ${classes}" data-field="${key}" ${s?`data-sense="${h(s.id)}"`:''} aria-label="${h(label)}"`;return type==='textarea'?`<textarea ${attrs} rows="1" maxlength="30000" placeholder="填写中文释义">${h(value)}</textarea>`:`<input ${attrs} value="${h(value)}" type="${key==='date'?'date':'text'}" ${key==='date'?'min="1900-01-01" max="9990-12-31"':''} maxlength="${({word:100,number:50,pos:200,ipa:2000})[key]||100}" ${key==='word'?'spellcheck="false"':''} placeholder="${({word:'输入单词',ipa:'填写音标',pos:'填写词性'})[key]||''}">`;}
function relatedField(related,sense,key,type='input'){
  const label=({word:'相关单词',relation:'与主词的关系',ipa:'英式音标',pos:'词性',meaning:'中文释义'})[key];
  const attrs=`class="cell-input ${h(key)}" data-field="${key}" data-related="${h(related.id)}" ${sense?`data-sense="${h(sense.id)}"`:''} aria-label="${label}" maxlength="${({word:100,relation:200,ipa:2000,pos:200,meaning:30000})[key]}"`;
  const value=(sense||related)[key];return type==='textarea'?`<textarea ${attrs} rows="1" placeholder="填写中文释义">${h(value)}</textarea>`:`<input ${attrs} value="${h(value)}" spellcheck="false" placeholder="${key==='relation'?'如 派生名词':label}">`;
}
function wordLink(url){return safeUrl(url)?`<a class="dict-link" href="${h(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${new URL(url).hostname==='dictionary.cambridge.org'?'Cambridge':'打开链接'}</a>`:'<span class="lookup-status">尚未设置链接</span>';}
function importanceHtml(target){return `<div class="importance-controls" role="group" aria-label="重点标记"><button type="button" data-action="importance-down" aria-label="减少重点标记"${target.importance===0?' disabled':''}>−</button><span class="importance-count${target.importance?' marked':''}" aria-label="${target.importance} 个重点标记"><span aria-hidden="true">${target.importance?'★':'☆'}</span> ${target.importance}<small>/10</small></span><button type="button" data-action="importance-up" aria-label="增加重点标记，最多10个"${target.importance===10?' disabled':''}>＋</button></div>`;}
function lookupStatusHtml(target){return `<div class="lookup-status ${target.lookupStatus==='loading'?'loading':''}">${h(target.lookupStatus==='loading'?'正在查询剑桥词典…':target.lookupMessage)}</div>`;}
function render(){
  const active=document.activeElement;const focus=active?.dataset?.field?{entry:active.closest('tr')?.dataset.entry,field:active.dataset.field,sense:active.dataset.sense,related:active.dataset.related,start:active.selectionStart,end:active.selectionEnd}:null;
  const buttonFocus=active?.dataset?.action?{entry:active.closest('tr')?.dataset.entry,related:active.closest('tr')?.dataset.related,action:active.dataset.action}:null;
  if(!book)return;updateSummary();const page=datePage(book.entries.filter(e=>filter!=='due'||reviewInfo(e,book.settings.intervals,today).due.length),activeDate);activeDate=page.date;notebookNavigation.render(page);const entries=page.entries;let html='';
  for(const e of entries){
    const info=reviewInfo(e,book.settings.intervals,today);const state=info.due.length?'due-row':info.doneToday?'done-row':'';
    const totalRows=e.senses.length+e.relatedWords.reduce((sum,r)=>sum+r.senses.length,0);
    e.senses.forEach((s,i)=>{
      html+=`<tr data-entry="${h(e.id)}" class="${i===0?'word-group-start ':''}${state}">`;
      if(i===0)html+=`<td data-column="date" rowspan="${totalRows}">${field(e,null,'date',e.date,'date')}<div data-review>${statusHtml(e)}</div></td><td data-column="number" rowspan="${totalRows}">${field(e,null,'number',e.number,'number')}</td><td data-column="word" rowspan="${e.senses.length}">${field(e,null,'word',e.word,'word')}${importanceHtml(e)}${lookupStatusHtml(e)}<button class="add-related" data-action="add-related">＋ 添加相关词</button></td>`;
      html+=`<td data-column="ipa">${field(e,s,'ipa',s.ipa,'ipa')}</td><td data-column="meaning">${field(e,s,'pos',s.pos,'pos')}${field(e,s,'meaning',s.meaning,'meaning','textarea')}${e.senses.length>1?`<button class="remove-sense" data-action="remove-sense" data-sense="${h(s.id)}">移除此词性</button>`:''}</td>`;
      if(i===0)html+=`<td data-column="link" rowspan="${e.senses.length}">${wordLink(e.url)}<button class="options-button" data-action="options">编辑链接 · 更多</button>${e.lookupStatus==='error'?'<button class="options-button" data-action="retry">重试查词</button>':''}</td>`;
      html+='</tr>';
    });
    for(const r of e.relatedWords)r.senses.forEach((s,i)=>{
      html+=`<tr data-entry="${h(e.id)}" data-related="${h(r.id)}" class="related-row ${state}">`;
      if(i===0)html+=`<td data-column="word" rowspan="${r.senses.length}"><div class="related-word-content"><span class="related-marker" aria-hidden="true">↳</span><div>${relatedField(r,null,'word')}${importanceHtml(r)}${relatedField(r,null,'relation')}${lookupStatusHtml(r)}</div></div></td>`;
      html+=`<td data-column="ipa">${relatedField(r,s,'ipa')}</td><td data-column="meaning">${relatedField(r,s,'pos')}${relatedField(r,s,'meaning','textarea')}${r.senses.length>1?`<button class="remove-sense" data-action="remove-related-sense" data-sense="${h(s.id)}">移除此词性</button>`:''}</td>`;
      if(i===0)html+=`<td data-column="link" rowspan="${r.senses.length}">${wordLink(r.url)}<button class="options-button" data-action="edit-related">编辑相关词</button>${r.lookupStatus==='error'?'<button class="options-button" data-action="retry-related">重试查词</button>':''}<button class="options-button danger" data-action="remove-related">删除相关词</button></td>`;
      html+='</tr>';
    });
  }
  $('#word-rows').innerHTML=html;$('#empty-state').hidden=entries.length>0;if(!entries.length){$('#empty-state h2').textContent=filter==='due'?'本次复习已完成':'从今天遇见的第一个词开始';$('#empty-state p').innerHTML=filter==='due'?'下次到期时，会在这里为你标记。':'在上方输入单词并按 Enter，音标和释义会自动填入。<br>也可以添加空白行，在表格中直接输入。';$('.empty-hint').hidden=filter==='due';}resizeAll();
  applyConcealment();
  synonymsUI.render();materialsUI.render();resizeAll();
  if(focus){const restored=[...document.querySelectorAll('[data-field]')].find(el=>el.closest('tr')?.dataset.entry===focus.entry&&el.dataset.field===focus.field&&el.dataset.sense===focus.sense&&el.dataset.related===focus.related);if(restored&&!restored.closest('.is-concealed')){restored.focus({preventScroll:true});if(focus.start!==null)try{restored.setSelectionRange(focus.start,focus.end);}catch{}}}
  else if(buttonFocus){const restored=[...document.querySelectorAll('#word-rows [data-action]')].find(el=>el.closest('tr').dataset.entry===buttonFocus.entry&&el.closest('tr').dataset.related===buttonFocus.related&&el.dataset.action===buttonFocus.action);if(restored&&!restored.disabled&&!restored.closest('.is-concealed'))restored.focus({preventScroll:true});}
}
function resize(el){if(!el.getClientRects().length)return;el.style.height='auto';el.style.height=el.scrollHeight+'px';}function resizeAll(){document.querySelectorAll('textarea').forEach(resize);}
function recordUndo(){undo.push(JSON.stringify(book));if(undo.length>20)undo.shift();document.querySelectorAll('[data-undo]').forEach(button=>button.hidden=false);}
function lookupKey(entry,related=null){return related?entry.id+'/'+related.id:entry.id;}
function lookupEntry(entry,replace=false,related=null){const target=related||entry,key=lookupKey(entry,related);targetRequestKeys.set(target,key);return lookupVocabulary(target,{requests,key,replace,isPresent:()=>book.entries.includes(entry)&&(!related||entry.relatedWords.includes(related)),update:()=>{change();render();}});}
function invalidateWord(target,key){requests.delete(targetRequestKeys.get(target)||key);if(target.lookedUpWord&&target.word.trim()!==target.lookedUpWord){target.lookupStatus='manual';target.lookupMessage='单词已修改，可选择重新查词。';}else if(target.lookupStatus==='loading'){target.lookupStatus='';target.lookupMessage='';}}
function addWord(word){if(!ready)return;if(word.trim().length>100)throw new Error('单词长度不能超过 100 个字符。');const max=Math.max(0,...book.entries.map(e=>Number(e.number)||0));const e=newEntry(word,max+1);book.entries.unshift(e);filter='all';activeDate=e.date;change();render();if(word.trim())void lookupEntry(e);else{$(`tr[data-entry="${e.id}"] [data-field="word"]`).focus();}return e;}
$('#add-form').addEventListener('submit',event=>{event.preventDefault();const value=$('#new-word').value.trim();if(value){addWord(value);$('#new-word').value='';$('#new-word').focus();}});
$('#blank-button').onclick=()=>addWord('');$('#all-tab').onclick=()=>{filter='all';activeDate=null;render();};$('#due-tab').onclick=()=>{filter='due';activeDate=null;render();};
$('#word-rows').addEventListener('input',event=>{
  const el=event.target,key=el.dataset.field;if(!key||key==='date'||!ready)return;const e=book.entries.find(e=>e.id===el.closest('tr').dataset.entry);const related=el.dataset.related?e.relatedWords.find(r=>r.id===el.dataset.related):null;const vocabulary=related||e;const target=el.dataset.sense?vocabulary.senses.find(s=>s.id===el.dataset.sense):vocabulary;const old=target[key];target[key]=el.value;
  if(key==='word'){if(!vocabulary.url||vocabulary.url===dictionaryUrl(old))vocabulary.url=vocabulary.word.trim()?dictionaryUrl(vocabulary.word):'';invalidateWord(vocabulary,lookupKey(e,related));if(!related)updateSummary();}if(el.tagName==='TEXTAREA')resize(el);change();
});
$('#word-rows').addEventListener('change',event=>{const el=event.target;if(el.dataset.field!=='date')return;const e=book.entries.find(e=>e.id===el.closest('tr').dataset.entry);if(!el.value||!el.validity.valid){el.value=e.date;toast('请输入有效日期。');return;}if(Object.keys(e.reviews).length&&!confirm('修改收录日期会重新安排这个单词的复习，并清除它的复习记录。继续吗？')){el.value=e.date;return;}recordUndo();e.date=el.value;activeDate=e.date;e.reviews={};change();render();});
$('#word-rows').addEventListener('focusout',event=>{
  const el=event.target;if(el.dataset.field!=='word')return;const row=el.closest('tr');const entry=book.entries.find(e=>e.id===row?.dataset.entry);if(!entry)return;
  const related=el.dataset.related?entry.relatedWords.find(r=>r.id===el.dataset.related):null;const target=related||entry;if(!target)return;
  const trimmed=target.word.trim();if(trimmed!==target.word){el.value=target.word=trimmed;change();}
  if(target.word&&!target.lookedUpWord&&target.lookupStatus!=='loading'){void lookupEntry(entry,false,related);return;}
  const review=row.querySelector('[data-review]');if(review)review.innerHTML=statusHtml(entry);
  const status=row.querySelector('[data-column="word"] .lookup-status');if(status)status.textContent=target.lookupMessage;
  const link=row.querySelector('[data-column="link"] .dict-link,[data-column="link"] .lookup-status');if(link){const holder=document.createElement('div');holder.innerHTML=wordLink(target.url);link.replaceWith(holder.firstChild);}
});
$('#word-rows').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();event.target.blur();}});
$('#word-rows').addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(!b)return;const e=book.entries.find(e=>e.id===b.closest('tr').dataset.entry);const action=b.dataset.action;
  const related=e.relatedWords.find(r=>r.id===b.closest('tr').dataset.related);
  if(action==='importance-up'||action==='importance-down'){const target=related||e;const next=target.importance+(action==='importance-up'?1:-1);if(next<0||next>10)return;target.importance=next;change();render();return;}
  if(action==='review'){const due=reviewInfo(e,book.settings.intervals,today).due;for(const r of due)e.reviews[r.day]=today;change();render();toast(due.length>1?'已完成本次复习，并补记此前错过的轮次。':'已标记本次复习。');}
  if(action==='undo-review'){for(const [k,v]of Object.entries(e.reviews))if(v===today)delete e.reviews[k];change();render();}
  if(action==='options')openEntry(e);if(action==='retry')void lookupEntry(e);
  if(action==='add-related')openRelated(e);
  if(action==='edit-related')openRelated(e,related);
  if(action==='retry-related')void lookupEntry(e,false,related);
  if(action==='remove-related'){recordUndo();requests.delete(targetRequestKeys.get(related)||lookupKey(e,related));e.relatedWords=e.relatedWords.filter(r=>r!==related);change();render();toast('已删除相关词，可在底部撤销。');}
  if(action==='remove-related-sense'&&related.senses.length>1){recordUndo();related.senses=related.senses.filter(s=>s.id!==b.dataset.sense);change();render();toast('已移除此词性，可在底部撤销。');}
  if(action==='remove-sense'){recordUndo();e.senses=e.senses.filter(s=>s.id!==b.dataset.sense);change();render();toast('已移除此词性，可在底部撤销。');}
});
function openEntry(e){
  $('#entry-dialog-title').textContent=e.word||'空白单词';const info=reviewInfo(e,book.settings.intervals,today);
  $('#entry-options').innerHTML=`<label for="edit-url">词典链接（可自由修改）</label><input id="edit-url" type="url" maxlength="4000" value="${h(e.url)}" placeholder="https://dictionary.cambridge.org/…"><div class="entry-actions"><button id="save-url" class="primary">保存链接</button><button id="add-sense">＋ 添加词性行</button><button id="relookup">重新查词</button><button id="remove-word" class="danger">删除单词</button></div><h3>复习安排</h3>${info.schedule.map(r=>`<div class="schedule-row"><span>第 ${r.day} 天 · ${r.date}</span><span>${r.done?'✓ '+r.done+' 已复习':r.date<=today?'● 待复习':'未到期'}</span></div>`).join('')}<p class="muted">词条来源：Cambridge English–Chinese (Simplified) Dictionary。允许按你的学习需要修改；重新查词会替换音标和释义。</p>`;
  const relatedButton=document.createElement('button');relatedButton.textContent='＋ 添加相关词';relatedButton.onclick=()=>{$('#entry-dialog').close();openRelated(e);};$('.entry-actions').append(relatedButton);
  $('#save-url').onclick=()=>{const url=$('#edit-url').value.trim();if(url&&!safeUrl(url)){toast('请输入以 http:// 或 https:// 开头的完整链接。');return;}e.url=url;change();render();$('#entry-dialog').close();};
  $('#add-sense').onclick=()=>{if(e.senses.length>=100)return toast('每个单词最多 100 行。');e.senses.push(blankSense());change();render();$('#entry-dialog').close();};
  $('#relookup').onclick=()=>{if(!e.word.trim())return toast('请先输入单词。');if(e.senses.some(s=>s.ipa||s.pos||s.meaning)&&!confirm('重新查词会替换当前音标、词性和释义，继续吗？'))return;recordUndo();$('#entry-dialog').close();void lookupEntry(e,true);};
  $('#remove-word').onclick=()=>{recordUndo();for(const target of [e,...e.relatedWords])requests.delete(targetRequestKeys.get(target)||target.id);book.entries=book.entries.filter(x=>x!==e);change();render();$('#entry-dialog').close();toast('已删除单词，可在底部撤销。');};$('#entry-dialog').showModal();
}
let relatedContext;
function openRelated(entry,related=null){
  if(!related&&entry.relatedWords.length>=100)return toast('每个主词最多添加 100 个相关词。');
  const draft=related?structuredClone(related):newRelatedWord();if(draft.lookupStatus==='loading'){draft.lookupStatus='';draft.lookupMessage='可点击查询剑桥，或手动修改内容。';}
  relatedContext={entry,related,draft,key:'draft/'+crypto.randomUUID()};$('#related-title').textContent=related?'编辑相关词':'添加相关词';
  $('#related-parent').textContent=`主词：${entry.word||'空白单词'} · 随主词一起复习`;
  for(const key of ['word','relation','url'])$(`#related-${key}`).value=draft[key];
  $('#related-dialog').showModal();renderDraftSenses();$('#related-word').focus();
}
function renderDraftSenses(){
  if(!relatedContext)return;const {draft}=relatedContext;const active=document.activeElement;
  const focus=active?.dataset?.draftField?{field:active.dataset.draftField,sense:active.dataset.sense,start:active.selectionStart,end:active.selectionEnd}:null;
  $('#related-senses').innerHTML=draft.senses.map((sense,index)=>`<section class="draft-sense"><h3>第 ${index+1} 个词性</h3><div class="related-form-grid"><div><label for="draft-ipa-${index}">英式音标</label><input id="draft-ipa-${index}" data-draft-field="ipa" data-sense="${h(sense.id)}" maxlength="2000" value="${h(sense.ipa)}"></div><div><label for="draft-pos-${index}">词性</label><input id="draft-pos-${index}" data-draft-field="pos" data-sense="${h(sense.id)}" maxlength="200" value="${h(sense.pos)}"></div></div><label for="draft-meaning-${index}">中文释义</label><textarea id="draft-meaning-${index}" rows="2" data-draft-field="meaning" data-sense="${h(sense.id)}" maxlength="30000">${h(sense.meaning)}</textarea>${draft.senses.length>1?`<button type="button" class="remove-sense" data-draft-remove="${h(sense.id)}">移除此词性</button>`:''}</section>`).join('');
  $('#related-lookup-status').textContent=draft.lookupStatus==='loading'?'正在查询 Cambridge 英式音标和中文释义…':draft.lookupMessage||(draft.lookedUpWord?'已填入 Cambridge 释义，可继续编辑。':'输入单词并移开焦点，即可自动查询。');
  $('#related-lookup').disabled=draft.lookupStatus==='loading';$('#related-lookup').textContent=draft.lookedUpWord?'重新查词':'查询剑桥';
  if(document.activeElement!==$('#related-url'))$('#related-url').value=draft.url;
  if(focus){const input=[...$('#related-senses').querySelectorAll('[data-draft-field]')].find(el=>el.dataset.draftField===focus.field&&el.dataset.sense===focus.sense);if(input){input.focus({preventScroll:true});if(focus.start!==null)input.setSelectionRange(focus.start,focus.end);}}
  resizeAll();
}
function lookupRelatedDraft(context,replace=false){
  const {entry,draft,key}=context;targetRequestKeys.set(draft,key);
  return lookupVocabulary(draft,{requests,key,replace,isPresent:()=>book.entries.includes(entry)&&(entry.relatedWords.includes(draft)||(relatedContext===context&&$('#related-dialog').open)),update:()=>{if(entry.relatedWords.includes(draft)){change();render();}else if(relatedContext===context)renderDraftSenses();}});
}
for(const key of ['word','relation','url'])$(`#related-${key}`).addEventListener('input',event=>{
  if(!relatedContext)return;const {draft,key:requestKey}=relatedContext;const old=draft[key];draft[key]=event.target.value;
  if(key==='word'){if(!draft.url||draft.url===dictionaryUrl(old))draft.url=draft.word.trim()?dictionaryUrl(draft.word):'';invalidateWord(draft,requestKey);$('#related-lookup').disabled=false;$('#related-lookup-status').textContent=draft.lookupMessage||'移开焦点后自动查询。';$('#related-url').value=draft.url;}
});
$('#related-word').addEventListener('blur',()=>{if(!relatedContext)return;const {draft}=relatedContext;draft.word=$('#related-word').value.trim();if(draft.word&&!draft.lookedUpWord&&draft.lookupStatus!=='loading')void lookupRelatedDraft(relatedContext);});
$('#related-senses').addEventListener('input',event=>{if(!relatedContext||!event.target.dataset.draftField)return;const sense=relatedContext.draft.senses.find(s=>s.id===event.target.dataset.sense);sense[event.target.dataset.draftField]=event.target.value;if(event.target.tagName==='TEXTAREA')resize(event.target);});
$('#related-senses').addEventListener('click',event=>{const button=event.target.closest('[data-draft-remove]');if(!button||!relatedContext||relatedContext.draft.senses.length===1)return;relatedContext.draft.senses=relatedContext.draft.senses.filter(s=>s.id!==button.dataset.draftRemove);renderDraftSenses();});
$('#related-add-sense').onclick=()=>{if(!relatedContext)return;if(relatedContext.draft.senses.length>=100)return toast('每个单词最多 100 个词性行。');relatedContext.draft.senses.push(blankSense());renderDraftSenses();};
$('#related-lookup').onclick=()=>{if(!relatedContext)return;const {draft}=relatedContext;if(!draft.word.trim())return toast('请先输入相关单词。');const manual=draft.senses.some(s=>s.ipa||s.pos||s.meaning);if(manual&&!confirm('重新查词会替换当前音标、词性和释义，继续吗？'))return;void lookupRelatedDraft(relatedContext,true);};
$('#related-dialog').addEventListener('close',()=>{if(relatedContext&&!relatedContext.entry.relatedWords.includes(relatedContext.draft))requests.delete(relatedContext.key);relatedContext=null;});
$('#related-form').onsubmit=event=>{
  event.preventDefault();if(!ready||!relatedContext)return;
  const context=relatedContext,{entry,related,draft}=context;if(!book.entries.includes(entry))return;
  for(const key of ['word','relation','url'])draft[key]=$(`#related-${key}`).value.trim();
  if(!draft.word)return toast('请输入相关单词。');if(draft.url&&!safeUrl(draft.url))return toast('请输入以 http:// 或 https:// 开头的完整链接。');
  recordUndo();if(related){requests.delete(targetRequestKeys.get(related)||lookupKey(entry,related));entry.relatedWords.splice(entry.relatedWords.indexOf(related),1,draft);}else entry.relatedWords.push(draft);
  change();$('#related-dialog').close();render();toast(related?'相关词已更新。':'已添加相关词，随主词一起复习。');
  if(!draft.lookedUpWord&&draft.lookupStatus!=='loading')void lookupRelatedDraft(context);
};
function updateSchedule(){try{const intervals=parseIntervals($('#intervals').value);$('#schedule-example').innerHTML=`今天收录的单词将在：<br>${intervals.map(n=>`${addDays(today,n)}（第 ${n} 天）`).join('<br>')}`;}catch(e){$('#schedule-example').textContent=e.message;}}
$('#settings-button').onclick=()=>{if(!ready)return;$('#intervals').value=book.settings.intervals.join(', ');updateSchedule();$('#settings-dialog').showModal();};$('#intervals').oninput=updateSchedule;
$('#settings-form').onsubmit=event=>{event.preventDefault();try{const intervals=parseIntervals($('#intervals').value);recordUndo();book.settings.intervals=intervals;change();render();$('#settings-dialog').close();toast('复习安排已更新。');}catch(e){toast(e.message);}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function interruptLookups(){let interrupted=false;for(const entry of book.entries)for(const target of [entry,...entry.relatedWords])if(target.lookupStatus==='loading'){target.lookupStatus='error';target.lookupMessage='上次查询未完成；请重试查词。';interrupted=true;}return interrupted;}
$('#export-button').onclick=()=>{if(book)download(JSON.stringify(book,null,2),`词页备份-${today}.json`,'application/json');};$('#csv-button').onclick=()=>{if(book)download(toCsv(book),`英语单词本-${today}.csv`,'text/csv;charset=utf-8');};
$('#import-button').onclick=()=>{if(ready)$('#import-file').click();};
$('#import-file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>20*1024*1024)throw new Error('备份文件不能超过 20 MB。');const imported=validateBook(JSON.parse(await file.text()));if(!confirm(`将用备份中的 ${imported.entries.length} 个主词、${imported.synonymGroups.length} 个同义词组和 ${imported.materials.length} 条语料替换当前全部内容。当前内容会自动导出一份备份，也可以撤销。继续吗？`))return;download(JSON.stringify(book,null,2),`导入前备份-${today}.json`,'application/json');recordUndo();requests.clear();const rev=book.revision;book=imported;book.revision=rev;interruptLookups();activeDate=null;notebookNavigation.close();change();render();toast('备份已导入。');}catch(e){toast(e.message||'无法读取备份。');}finally{event.target.value='';}};
$('#save-state').onclick=()=>{if(dirty&&!saveConflict){saveFailure=false;void flush();}};
const undoButton=document.createElement('button');undoButton.id='undo-button';undoButton.dataset.undo='';undoButton.textContent='撤销上一步操作';undoButton.hidden=true;$('#wordbook-page .table-footer').append(undoButton);
document.querySelectorAll('[data-undo]').forEach(button=>button.onclick=()=>{if(!undo.length)return;requests.clear();const rev=book.revision;book=JSON.parse(undo.pop());book.revision=rev;interruptLookups();document.querySelectorAll('[data-undo]').forEach(el=>el.hidden=!undo.length);change();render();toast('已撤销。');});
const synonymsUI=createSynonymsUI({getBook:()=>book,isReady:()=>ready,change,renderBook:render,recordUndo,toast,download,getToday:()=>today});
const materialsUI=createMaterialsUI({getBook:()=>book,isReady:()=>ready,change,renderBook:render,recordUndo,toast,download,getToday:()=>today});
const notebookNavigation=createNotebookNavigation({getBook:()=>book,onDate:date=>{activeDate=date;render();$('#wordbook-page .table-scroll').scrollIntoView({block:'start'});},onResult:result=>{
  filter='all';activeDate=result.date;revealedEntries.add(result.parentId);if(location.hash!=='#wordbook')location.hash='#wordbook';showPage();render();
  const row=[...$('#word-rows').rows].find(row=>row.dataset.entry===result.parentId&&(row.dataset.related||null)===result.relatedId);
  if(row){row.scrollIntoView({block:'center'});row.classList.add('search-target');row.querySelector('[data-field="word"]')?.focus({preventScroll:true});setTimeout(()=>row.classList.remove('search-target'),2400);}
}});
function showPage(){const page=['synonyms','materials'].includes(location.hash.slice(1))?location.hash.slice(1):'wordbook';for(const name of ['wordbook','synonyms','materials']){const selected=name===page;$('#'+name+'-page').hidden=!selected;const link=$('#'+name+'-nav');link.classList.toggle('active',selected);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}resizeAll();}
window.addEventListener('hashchange',showPage);showPage();
window.addEventListener('beforeunload',event=>{if(dirty||saving||requests.size){localRecovery();event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){void flush();}else rollover();});function rollover(){const now=localDate();if(now!==today){today=now;showDate();render();}}setInterval(rollover,30000);window.addEventListener('resize',resizeAll);
function showDate(){$('#today-date').textContent=new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});$('#today-week').textContent=new Date().toLocaleDateString('zh-CN',{weekday:'long'});}showDate();
async function boot(){
  try{const health=await(await fetch('/api/health')).json();if(health.version!==4)throw new Error('本地服务需要更新。请重新启动单词本，再刷新页面。');const response=await fetch('/api/book');const result=await response.json();if(!response.ok)throw new Error(result.error);book=validateBook(result);ready=true;let recovery;try{const text=localStorage.getItem(RECOVERY);if(text)recovery=validateBook(JSON.parse(text));}catch{}if(recovery){if(confirm('检测到上次未保存的编辑。是否恢复？选择取消会先下载这份编辑的备份。')){const rev=book.revision;book=recovery;book.revision=rev;change();}else{download(JSON.stringify(recovery,null,2),`未保存编辑-${today}.json`,'application/json');localStorage.removeItem(RECOVERY);}}if(interruptLookups())change();if(!dirty)savedLabel('已保存到电脑');render();registerTools();}
  catch(e){savedLabel('无法读取单词本',true);$('#empty-state h2').textContent='暂时无法读取单词本';$('#empty-state p').textContent=e.message;toast(e.message);document.querySelectorAll('#add-form button,#add-form input,#blank-button,#synonym-add-form button,#synonym-add-form input,#material-add').forEach(el=>el.disabled=true);}
}
function registerTools(){const context=document.modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});const tool={name:'read_wordbook',description:'Read the vocabulary and review status shown in this local notebook.',inputSchema:{type:'object',properties:{dueOnly:{type:'boolean'}},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).some(k=>k!=='dueOnly')||('dueOnly'in input&&typeof input.dueOnly!=='boolean'))throw new Error('Invalid input');return book.entries.filter(e=>!input.dueOnly||reviewInfo(e,book.settings.intervals,today).due.length).map(e=>({word:e.word,date:e.date,senses:e.senses,due:reviewInfo(e,book.settings.intervals,today).due.map(r=>r.date)}));}};try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
void boot();
