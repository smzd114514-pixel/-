import {newSynonymGroup,parseSynonymWords,toSynonymsCsv} from './model.js';

const $=selector=>document.querySelector(selector);
const h=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createSynonymsUI({getBook,isReady,change,renderBook,recordUndo,toast,download,getToday}){
  const rows=$('#synonym-rows');
  function findGroup(element){return getBook()?.synonymGroups.find(group=>group.id===element.closest('tr')?.dataset.group);}
  function render(){
    const book=getBook();if(!book)return;
    const active=document.activeElement;
    const focus=rows.contains(active)&&active.dataset.synonymField?{group:active.closest('tr').dataset.group,field:active.dataset.synonymField,index:active.dataset.index,start:active.selectionStart,end:active.selectionEnd}:null;
    $('#synonym-count').textContent=book.synonymGroups.length;
    $('#synonym-empty').hidden=book.synonymGroups.length>0;
    rows.innerHTML=book.synonymGroups.map(group=>`<tr data-group="${h(group.id)}">
      <td><input class="cell-input number" data-synonym-field="number" maxlength="50" value="${h(group.number)}" aria-label="词组序号"></td>
      <td><div class="synonym-words">${group.words.map((word,index)=>`<div class="synonym-word"><input class="cell-input" data-synonym-field="word" data-index="${index}" value="${h(word)}" maxlength="100" spellcheck="false" placeholder="填写单词或短语" aria-label="第 ${index+1} 个同义词"><button type="button" data-synonym-action="remove-word" data-index="${index}" aria-label="移除第 ${index+1} 个同义词">×</button></div>`).join('')}</div><button type="button" class="add-synonym" data-synonym-action="add-word">＋ 添加单词</button></td>
      <td><textarea class="cell-input" data-synonym-field="meaning" maxlength="30000" rows="2" placeholder="如 重要的" aria-label="词组共同含义">${h(group.meaning)}</textarea></td>
      <td><textarea class="cell-input" data-synonym-field="note" maxlength="30000" rows="2" placeholder="记录语气、搭配或用法差异" aria-label="词组辨析与备注">${h(group.note)}</textarea></td>
      <td><button type="button" class="remove-group danger" data-synonym-action="remove-group">删除此组</button></td>
    </tr>`).join('');
    if(focus){const element=[...rows.querySelectorAll('[data-synonym-field]')].find(el=>el.closest('tr').dataset.group===focus.group&&el.dataset.synonymField===focus.field&&el.dataset.index===focus.index);if(element){element.focus({preventScroll:true});if(focus.start!==null)try{element.setSelectionRange(focus.start,focus.end);}catch{}}}
  }
  function focusWord(group,index=0){rows.querySelector(`tr[data-group="${group.id}"] [data-synonym-field="word"][data-index="${index}"]`)?.focus();}
  function addGroup(words){
    if(!isReady())return;
    const book=getBook();if(book.synonymGroups.length>=10000)return toast('最多保存 10000 个词组。');
    if(words.length>100||words.some(word=>word.length>100))return toast('每组最多 100 个词，每个词或短语最多 100 个字符。');
    const number=Math.max(0,...book.synonymGroups.map(group=>Number(group.number)||0))+1;
    const group=newSynonymGroup(words,number);book.synonymGroups.unshift(group);change();renderBook();return group;
  }
  $('#synonym-add-form').onsubmit=event=>{event.preventDefault();const words=parseSynonymWords($('#new-synonyms').value);if(!words.length)return toast('请至少输入一个单词或短语。');if(addGroup(words)){$('#new-synonyms').value='';$('#new-synonyms').focus();}};
  $('#synonym-blank').onclick=()=>{const group=addGroup(['']);if(group)focusWord(group);};
  rows.addEventListener('input',event=>{const element=event.target,key=element.dataset.synonymField;if(!key||!isReady())return;const group=findGroup(element);if(!group)return;if(key==='word')group.words[Number(element.dataset.index)]=element.value;else group[key]=element.value;change();if(element.tagName==='TEXTAREA'){element.style.height='auto';element.style.height=element.scrollHeight+'px';}});
  rows.addEventListener('focusout',event=>{const element=event.target;if(element.dataset.synonymField!=='word')return;const group=findGroup(element);if(!group)return;const trimmed=element.value.trim();if(trimmed!==element.value){group.words[Number(element.dataset.index)]=element.value=trimmed;change();}});
  rows.addEventListener('click',event=>{
    const button=event.target.closest('[data-synonym-action]');if(!button||!isReady())return;const group=findGroup(button);if(!group)return;
    const action=button.dataset.synonymAction;
    if(action==='add-word'){if(group.words.length>=100)return toast('每组最多 100 个词。');group.words.push('');change();renderBook();focusWord(group,group.words.length-1);}
    if(action==='remove-word'){recordUndo();const index=Number(button.dataset.index);if(group.words.length===1)group.words[0]='';else group.words.splice(index,1);change();renderBook();focusWord(group,Math.min(index,group.words.length-1));toast('已移除，可在底部撤销。');}
    if(action==='remove-group'){recordUndo();getBook().synonymGroups=getBook().synonymGroups.filter(item=>item!==group);change();renderBook();toast('已删除词组，可在底部撤销。');}
  });
  $('#synonym-export').onclick=()=>$('#export-button').click();
  $('#synonym-import').onclick=()=>$('#import-button').click();
  $('#synonym-csv').onclick=()=>{if(getBook())download(toSynonymsCsv(getBook()),`同义替换-${getToday()}.csv`,'text/csv;charset=utf-8');};
  return {render};
}
