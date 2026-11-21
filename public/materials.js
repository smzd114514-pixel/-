import {newMaterial,noteReviewInfo,parseIntervals,toMaterialsCsv} from './model.js';

const $=selector=>document.querySelector(selector);
const dateFormat=new Intl.DateTimeFormat('zh-CN',{
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
});

function creationLabel(note){
  return note.createdAt?'创建于 '+dateFormat.format(new Date(note.createdAt)):'创建时间未知';
}

function reviewLabel(note,info){
  if(!note.intervals.length)return '未设置复习';
  if(info.due.length)return info.overdue?'待补复习':'今日待复习';
  if(info.doneToday)return '本次已复习';
  if(info.next)return info.next.date+' 再复习';
  return '复习计划已完成';
}

export function createMaterialsUI({getBook,isReady,change,renderBook,recordUndo,toast,download,getToday}){
  const rows=$('#material-rows');
  const editor=$('#note-editor');
  const content=$('#note-content');
  const number=$('#note-number');
  const intervalsInput=$('#note-intervals');
  const reviewError=$('#note-review-error');
  const markDone=$('#note-review-done');
  const undoReview=$('#note-review-undo');
  let currentNote=null;

  function renderReview(info=noteReviewInfo(currentNote,getToday())){
    const state=$('#note-review-state');
    state.textContent=reviewLabel(currentNote,info);
    if(currentNote.reviewStart)state.textContent+=' · 起始日期 '+currentNote.reviewStart;
    state.classList.toggle('is-due',Boolean(info.due.length));
    markDone.hidden=!info.due.length;
    undoReview.hidden=!info.doneToday;
  }

  function render(){
    const book=getBook();if(!book)return;
    const notes=book.materials.map(note=>({note,info:noteReviewInfo(note,getToday())}));
    const dueCount=notes.filter(({info})=>info.due.length).length;
    const badge=$('#note-nav-due');
    badge.hidden=!dueCount;
    badge.textContent=String(dueCount);
    badge.setAttribute('aria-label',dueCount+' 条笔记待复习');
    if(editor.open&&currentNote){
      if(book.materials.includes(currentNote))renderReview();
      else editor.close();
    }
    if($('#materials-page').hidden)return;
    $('#note-list-summary').textContent=notes.length+' 条笔记'+(dueCount?' · '+dueCount+' 条待复习':'');
    $('#material-empty').hidden=notes.length>0;
    const focusedId=rows.contains(document.activeElement)?document.activeElement.dataset.noteId:null;
    rows.replaceChildren(...notes.map(({note,info})=>{
      const item=document.createElement('li');
      const button=document.createElement('button');
      button.type='button';
      button.className='note-card';
      button.dataset.noteId=note.id;
      button.setAttribute('aria-haspopup','dialog');
      const title=document.createElement('span');
      title.className='note-card-title';
      title.textContent=note.content.trim().split(/\r?\n/,1)[0].slice(0,180)||'空白笔记';
      const meta=document.createElement('span');
      meta.className='note-card-meta';
      const created=document.createElement(note.createdAt?'time':'span');
      if(note.createdAt)created.dateTime=note.createdAt;
      created.textContent=creationLabel(note);
      meta.append(created);
      if(note.intervals.length){
        const review=document.createElement('span');
        review.className='note-card-review';
        review.classList.toggle('is-due',Boolean(info.due.length));
        review.textContent=reviewLabel(note,info);
        meta.append(review);
      }
      button.append(title,meta);
      item.append(button);
      return item;
    }));
    if(focusedId)[...rows.querySelectorAll('button')].find(button=>button.dataset.noteId===focusedId)?.focus({preventScroll:true});
  }

  function open(note){
    currentNote=note;
    content.value=note.content;
    number.value=note.number;
    intervalsInput.value=note.intervals.join(', ');
    reviewError.hidden=true;
    $('#note-created').textContent=creationLabel(note);
    renderReview();
    editor.showModal();
    content.focus();
  }

  $('#material-add').onclick=()=>{
    if(!isReady())return;
    const book=getBook();
    if(book.materials.length>=10000)return toast('最多保存 10000 条笔记。');
    const nextNumber=Math.max(0,...book.materials.map(note=>Number(note.number)||0))+1;
    const note=newMaterial('',nextNumber);
    recordUndo();
    book.materials.unshift(note);
    change();
    renderBook();
    open(note);
  };
  rows.addEventListener('click',event=>{
    const button=event.target.closest('[data-note-id]');
    if(!button||!isReady())return;
    const note=getBook().materials.find(item=>item.id===button.dataset.noteId);
    if(note)open(note);
  });
  for(const [field,input] of [['content',content],['number',number]]){
    input.addEventListener('input',()=>{
      if(!currentNote)return;
      currentNote[field]=input.value;
      change();
    });
  }
  editor.addEventListener('close',()=>{
    currentNote=null;
    render();
  });
  intervalsInput.oninput=()=>{reviewError.hidden=true;};
  $('#note-review-form').onsubmit=event=>{
    event.preventDefault();
    if(!currentNote)return;
    let intervals;
    try{
      intervals=intervalsInput.value.trim()?parseIntervals(intervalsInput.value):[];
    }catch(error){
      reviewError.textContent=error.message;
      reviewError.hidden=false;
      intervalsInput.focus();
      return;
    }
    recordUndo();
    currentNote.intervals=intervals;
    currentNote.reviewStart=intervals.length?(currentNote.reviewStart||getToday()):null;
    currentNote.reviews=Object.fromEntries(Object.entries(currentNote.reviews).filter(([day])=>intervals.includes(Number(day))));
    intervalsInput.value=intervals.join(', ');
    reviewError.hidden=true;
    change();
    render();
  };
  markDone.onclick=()=>{
    if(!currentNote)return;
    const today=getToday();
    for(const round of noteReviewInfo(currentNote,today).due)currentNote.reviews[round.day]=today;
    change();
    render();
  };
  undoReview.onclick=()=>{
    if(!currentNote)return;
    for(const [day,completed] of Object.entries(currentNote.reviews))if(completed===getToday())delete currentNote.reviews[day];
    change();
    render();
  };
  $('#note-delete').onclick=()=>{
    if(!currentNote)return;
    recordUndo();
    getBook().materials=getBook().materials.filter(note=>note!==currentNote);
    editor.close();
    change();
    renderBook();
    toast('已删除笔记，可在底部撤销。');
  };
  $('#note-save-state').onclick=()=>$('#save-state').click();
  $('#material-export').onclick=()=>$('#export-button').click();
  $('#material-import').onclick=()=>$('#import-button').click();
  $('#material-csv').onclick=()=>{
    if(getBook())download(toMaterialsCsv(getBook()),'自由笔记-'+getToday()+'.csv','text/csv;charset=utf-8');
  };
  return {render};
}
