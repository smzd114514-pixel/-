import {searchWords,localDate} from './model.js';
const $=selector=>document.querySelector(selector);
const h=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createNotebookNavigation({getBook,onDate,onResult}){
  let dates=[],index=-1,results=[],timer,active=-1;
  const input=$('#search-word'),panel=$('#search-panel'),list=$('#search-results');
  const calendar=$('#date-calendar'),dateButton=$('#page-date');let selectedDate=null,month='';
  const isCalendarOpen=()=>calendar.matches(':popover-open');
  function closeCalendar(){if(isCalendarOpen())calendar.hidePopover();dateButton.setAttribute('aria-expanded','false');}
  function positionCalendar(){
    if(!isCalendarOpen())return;const anchor=dateButton.getBoundingClientRect(),width=calendar.offsetWidth,height=calendar.offsetHeight;
    calendar.style.left=Math.max(12,Math.min(anchor.left,document.documentElement.clientWidth-width-12))+'px';
    calendar.style.top=Math.max(12,Math.min(anchor.top>=height+20?anchor.top-height-8:anchor.bottom+8,window.innerHeight-height-12))+'px';
  }
  function renderCalendar(){
    if(!month)return;const [year,m]=month.split('-').map(Number),count=new Date(Date.UTC(year,m,0)).getUTCDate(),offset=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7;
    const available=new Set(dates),today=localDate();$('#calendar-month').textContent=`${year} 年 ${m} 月`;$('#calendar-days').setAttribute('aria-label',`${year} 年 ${m} 月的收录日期`);
    $('#calendar-previous').disabled=!dates.length||month<=dates.at(-1).slice(0,7);$('#calendar-next').disabled=!dates.length||month>=dates[0].slice(0,7);
    $('#calendar-days').innerHTML='<span aria-hidden="true"></span>'.repeat(offset)+Array.from({length:count},(_,i)=>{
      const day=i+1,date=month+'-'+String(day).padStart(2,'0'),recorded=available.has(date),selected=date===selectedDate;
      return `<button type="button" data-calendar-date="${date}" class="calendar-day${recorded?' has-words':''}${selected?' selected':''}${date===today?' is-today':''}" aria-label="${year}年${m}月${day}日，${recorded?'有单词':'无可查看的单词'}" aria-pressed="${selected}"${date===today?' aria-current="date"':''}${recorded?'':' disabled'}><span>${day}</span>${recorded?'<i aria-hidden="true"></i>':''}</button>`;
    }).join('');
    $('#calendar-empty').hidden=dates.some(date=>date.startsWith(month));
  }
  function changeMonth(delta){const [year,m]=month.split('-').map(Number),date=new Date(Date.UTC(year,m-1+delta,1));month=date.toISOString().slice(0,7);renderCalendar();positionCalendar();}
  calendar.addEventListener('beforetoggle',event=>{if(event.newState!=='open')return;if(!selectedDate){event.preventDefault();return;}month=selectedDate.slice(0,7);renderCalendar();requestAnimationFrame(()=>{if(isCalendarOpen()){positionCalendar();calendar.querySelector('.calendar-day.selected')?.focus({preventScroll:true});}});});
  calendar.addEventListener('toggle',()=>dateButton.setAttribute('aria-expanded',String(isCalendarOpen())));
  $('#calendar-previous').onclick=()=>changeMonth(-1);$('#calendar-next').onclick=()=>changeMonth(1);
  $('#calendar-close').onclick=()=>{closeCalendar();dateButton.focus({preventScroll:true});};
  $('#calendar-days').addEventListener('click',event=>{const button=event.target.closest('[data-calendar-date]');if(!button||button.disabled)return;closeCalendar();dateButton.focus({preventScroll:true});onDate(button.dataset.calendarDate);});
  calendar.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeCalendar();dateButton.focus({preventScroll:true});}});
  window.addEventListener('resize',positionCalendar);document.addEventListener('scroll',positionCalendar,{capture:true,passive:true});
  function close(){panel.hidden=true;active=-1;input.setAttribute('aria-expanded','false');}
  function showResults(){
    clearTimeout(timer);const book=getBook(),query=input.value.trim();if(!book||!query){close();return;}
    const found=searchWords(book.entries,query);results=found.items;active=-1;
    $('#search-summary').textContent=found.total?`找到 ${found.total} 个已收录单词${found.total>results.length?'，显示前 '+results.length+' 个，请缩小关键词':''}`:'没有找到已收录的单词';
    list.innerHTML=results.map((result,i)=>`<li><button type="button" data-search-index="${i}"><span class="search-word">${h(result.word)}${result.importance?`<small>★ × ${result.importance}</small>`:''}${result.relatedId?`<small class="related-search">相关词 · ${h(result.parentWord)}</small>`:''}</span><span class="search-meaning">${result.senses.map(s=>h([s.pos,s.meaning].filter(Boolean).join(' '))).join('<br>')}</span><time datetime="${h(result.date)}">收录于 ${h(result.date)}</time></button></li>`).join('');
    panel.hidden=false;input.setAttribute('aria-expanded','true');
  }
  function choose(i){const result=results[i];if(!result)return;close();onResult(result);}
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(showResults,80);});
  input.addEventListener('focus',showResults);
  $('#search-form').onsubmit=event=>{event.preventDefault();showResults();};
  $('#search-clear').onclick=()=>{input.value='';close();input.focus();};
  list.addEventListener('click',event=>{const button=event.target.closest('[data-search-index]');if(button)choose(Number(button.dataset.searchIndex));});
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){close();return;}if(panel.hidden)return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();active=Math.max(0,Math.min(results.length-1,active+(event.key==='ArrowDown'?1:-1)));list.querySelectorAll('button').forEach((button,i)=>button.classList.toggle('selected',i===active));}else if(event.key==='Enter'&&active>=0){event.preventDefault();choose(active);}});
  document.addEventListener('click',event=>{if(!event.target.closest('.stored-search'))close();});
  $('#page-previous').onclick=()=>{if(index>0)onDate(dates[index-1]);};$('#page-next').onclick=()=>{if(index>=0&&index<dates.length-1)onDate(dates[index+1]);};
  function render(page){
    dates=page.dates;index=page.index;selectedDate=page.date;$('#date-pagination').hidden=!dates.length;
    $('#page-previous').disabled=index<=0;$('#page-next').disabled=index<0||index===dates.length-1;
    $('#page-date-value').textContent=selectedDate||'';
    if(!dates.length)closeCalendar();else if(isCalendarOpen()){renderCalendar();positionCalendar();}
    $('#page-summary').textContent=dates.length?`第 ${index+1} / ${dates.length} 页 · 本日 ${page.entries.length} 个主词`:'';
    if(!panel.hidden)showResults();
  }
  return {render,close};
}
