import {newMaterial,toMaterialsCsv} from './model.js';

const $=selector=>document.querySelector(selector);
const h=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createMaterialsUI({getBook,isReady,change,renderBook,recordUndo,toast,download,getToday}){
  const rows=$('#material-rows');
  function findItem(element){return getBook()?.materials.find(item=>item.id===element.closest('tr')?.dataset.material);}
  function render(){
    const book=getBook();if(!book)return;const active=document.activeElement;
    const focus=rows.contains(active)&&active.dataset.materialField?{id:active.closest('tr').dataset.material,field:active.dataset.materialField,start:active.selectionStart,end:active.selectionEnd}:null;
    $('#material-count').textContent=book.materials.length;$('#material-empty').hidden=book.materials.length>0;
    rows.innerHTML=book.materials.map(item=>`<tr data-material="${h(item.id)}"><td><input class="cell-input number" data-material-field="number" value="${h(item.number)}" maxlength="50" aria-label="语料序号"></td><td><textarea class="cell-input material-content" data-material-field="content" maxlength="100000" rows="4" spellcheck="false" placeholder="自由记录例句、表达、段落或学习笔记，支持换行…" aria-label="语料内容"></textarea></td><td><button type="button" class="remove-group danger" data-material-delete>删除条目</button></td></tr>`).join('');
    rows.querySelectorAll('[data-material-field="content"]').forEach((input,index)=>input.value=book.materials[index].content);
    if(focus){const input=[...rows.querySelectorAll('[data-material-field]')].find(el=>el.closest('tr').dataset.material===focus.id&&el.dataset.materialField===focus.field);if(input){input.focus({preventScroll:true});if(focus.start!==null)input.setSelectionRange(focus.start,focus.end);}}
  }
  $('#material-add').onclick=()=>{
    if(!isReady())return;const book=getBook();if(book.materials.length>=10000)return toast('最多保存 10000 条语料。');
    const number=Math.max(0,...book.materials.map(item=>Number(item.number)||0))+1,item=newMaterial('',number);book.materials.unshift(item);change();renderBook();
    rows.querySelector('tr:first-child [data-material-field="content"]')?.focus();
  };
  rows.addEventListener('input',event=>{const input=event.target,key=input.dataset.materialField;if(!key||!isReady())return;const item=findItem(input);if(!item)return;item[key]=input.value;change();if(input.tagName==='TEXTAREA'){input.style.height='auto';input.style.height=input.scrollHeight+'px';}});
  rows.addEventListener('click',event=>{const button=event.target.closest('[data-material-delete]');if(!button||!isReady())return;const item=findItem(button);if(!item)return;recordUndo();getBook().materials=getBook().materials.filter(other=>other!==item);change();renderBook();toast('已删除语料，可在底部撤销。');});
  $('#material-export').onclick=()=>$('#export-button').click();$('#material-import').onclick=()=>$('#import-button').click();
  $('#material-csv').onclick=()=>{if(getBook())download(toMaterialsCsv(getBook()),`语料积累-${getToday()}.csv`,'text/csv;charset=utf-8');};
  return {render};
}
