export const DEFAULT_INTERVALS=[0,1,2,6,14,30];
export function localDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function addDays(s,n){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function reviewInfo(entry,intervals,today=localDate()){
  const schedule=intervals.map(day=>({day,date:addDays(entry.date,day),done:entry.reviews[String(day)]||null}));
  const due=entry.word.trim()?schedule.filter(x=>x.date<=today&&!x.done):[];
  return {schedule,due,overdue:due.some(x=>x.date<today),doneToday:schedule.some(x=>x.done===today),next:schedule.find(x=>x.date>today&&!x.done)};
}
export function parseIntervals(s){const values=String(s).split(/[,，、\s]+/).filter(Boolean);if(!values.length||values.length>30||values.some(x=>!/^\d+$/.test(x)||Number(x)>3650))throw new Error('请输入 0–3650 之间的整数，最多 30 个间隔。');return [...new Set(values.map(Number))].sort((a,b)=>a-b);}
export function dictionaryUrl(word){return 'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/'+encodeURIComponent(word.trim().toLowerCase().replace(/\s+/g,'-'));}
export function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
export function normalizeWord(word){return word.trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');}
export function blankSense(){return {id:crypto.randomUUID(),ipa:'',pos:'',meaning:''};}
export function newRelatedWord(word=''){return {id:crypto.randomUUID(),word:word.trim(),relation:'',senses:[blankSense()],importance:0,url:word.trim()?dictionaryUrl(word):'',lookedUpWord:'',lookupStatus:'',lookupMessage:''};}
export function newSynonymGroup(words=[''],number=1){return {id:crypto.randomUUID(),number:String(number),words:[...words],meaning:'',note:''};}
export function newMaterial(content='',number=1){return {id:crypto.randomUUID(),number:String(number),content};}
export function parseSynonymWords(value){return String(value).split(/[,，;；、\n]+/).map(word=>word.trim()).filter(Boolean);}
export function newEntry(word,number){return {id:crypto.randomUUID(),date:localDate(),number:String(number),word:word.trim(),senses:[blankSense()],relatedWords:[],importance:0,url:word.trim()?dictionaryUrl(word):'',reviews:{},lookedUpWord:'',lookupStatus:'',lookupMessage:''};}
export function validateBook(raw){
  const fail=()=>{throw new Error('备份格式不正确；请使用词页导出的 JSON 备份。')};
  if(!raw||![1,2,3,4].includes(raw.schema)||!Number.isInteger(raw.revision)||raw.revision<0||!Array.isArray(raw.entries)||raw.entries.length>10000||!raw.settings||!Array.isArray(raw.settings.intervals))fail();
  const ints=raw.settings.intervals;if(!ints.length||ints.length>30||ints.some(x=>!Number.isInteger(x)||x<0||x>3650)||new Set(ints).size!==ints.length)fail();
  const str=(v,max)=>{if(typeof v!=='string'||v.length>max)fail();return v;};const ids=new Set();
  const importance=value=>{const count=value??0;if(!Number.isInteger(count)||count<0||count>10)fail();return count;};
  const sensesOf=list=>{if(!Array.isArray(list)||!list.length||list.length>100)fail();const seen=new Set();return list.map(s=>{if(!s)fail();const id=str(s.id,100);if(!id||seen.has(id))fail();seen.add(id);return {id,ipa:str(s.ipa,2000),pos:str(s.pos,200),meaning:str(s.meaning,30000)};});};
  const entries=raw.entries.map(e=>{
    if(!e||!validDate(e.date)||e.date<'1900-01-01'||e.date>'9990-12-31'||!Array.isArray(e.senses)||!e.senses.length||e.senses.length>100||!e.reviews||typeof e.reviews!=='object'||Array.isArray(e.reviews))fail();
    const id=str(e.id,100);if(!id||ids.has(id))fail();ids.add(id);const reviews={};for(const [k,v]of Object.entries(e.reviews)){if(!/^\d{1,4}$/.test(k)||Number(k)>3650||!validDate(v))fail();reviews[k]=v;}
    const senses=sensesOf(e.senses);
    const url=str(e.url,4000);if(url&&!safeUrl(url))fail();
    const related=e.relatedWords===undefined?[]:e.relatedWords;
    if(!Array.isArray(related)||related.length>100)fail();
    const relatedIds=new Set();const relatedWords=related.map(r=>{
      if(!r||typeof r!=='object')fail();const rid=str(r.id,100);if(!rid||relatedIds.has(rid))fail();relatedIds.add(rid);
      const relatedUrl=str(r.url,4000);if(relatedUrl&&!safeUrl(relatedUrl))fail();
      const relatedSenses=r.senses===undefined&&raw.schema<3?[{id:rid,ipa:str(r.ipa,2000),pos:str(r.pos,200),meaning:str(r.meaning,30000)}]:r.senses;
      return {id:rid,word:str(r.word,100),relation:str(r.relation,200),senses:sensesOf(relatedSenses),importance:importance(r.importance),url:relatedUrl,lookedUpWord:str(r.lookedUpWord||'',100),lookupStatus:str(r.lookupStatus||'',30),lookupMessage:str(r.lookupMessage||'',2000)};
    });
    return {id,date:e.date,number:str(e.number,50),word:str(e.word,100),senses,relatedWords,importance:importance(e.importance),url,reviews,lookedUpWord:str(e.lookedUpWord||'',100),lookupStatus:str(e.lookupStatus||'',30),lookupMessage:str(e.lookupMessage||'',2000)};
  });
  const groups=raw.synonymGroups===undefined?[]:raw.synonymGroups;
  if(!Array.isArray(groups)||groups.length>10000)fail();
  const groupIds=new Set();const synonymGroups=groups.map(group=>{
    if(!group||typeof group!=='object'||!Array.isArray(group.words)||!group.words.length||group.words.length>100)fail();
    const id=str(group.id,100);if(!id||groupIds.has(id))fail();groupIds.add(id);
    return {id,number:str(group.number,50),words:group.words.map(word=>str(word,100)),meaning:str(group.meaning,30000),note:str(group.note,30000)};
  });
  const rawMaterials=raw.materials===undefined&&raw.schema<4?[]:raw.materials;
  if(!Array.isArray(rawMaterials)||rawMaterials.length>10000)fail();
  const materialIds=new Set();const materials=rawMaterials.map(item=>{if(!item||typeof item!=='object')fail();const id=str(item.id,100);if(!id||materialIds.has(id))fail();materialIds.add(id);return {id,number:str(item.number,50),content:str(item.content,100000)};});
  return {schema:4,revision:raw.revision,settings:{intervals:[...ints].sort((a,b)=>a-b)},entries,synonymGroups,materials};
}
export function datePage(entries,selectedDate=null){const dates=[...new Set(entries.map(entry=>entry.date))].sort().reverse();const date=dates.includes(selectedDate)?selectedDate:dates[0]||null;return {dates,date,index:dates.indexOf(date),entries:entries.filter(entry=>entry.date===date)};}
export function searchWords(entries,query,limit=50){
  const needle=normalizeWord(query);if(!needle)return {items:[],total:0};const matches=[];
  for(const entry of entries)for(const [index,target]of [entry,...entry.relatedWords].entries()){
    if(!target.word.trim())continue;const word=normalizeWord(target.word);const rank=word===needle?0:word.startsWith(needle)?1:word.includes(needle)?2:target.senses.some(s=>normalizeWord(s.pos+' '+s.meaning).includes(needle))?3:-1;
    if(rank>=0)matches.push({parentId:entry.id,relatedId:index?target.id:null,word:target.word,date:entry.date,senses:target.senses,importance:target.importance,parentWord:index?entry.word:'',rank});
  }
  matches.sort((a,b)=>a.rank-b.rank||b.date.localeCompare(a.date)||a.word.localeCompare(b.word,'en'));
  return {items:matches.slice(0,limit),total:matches.length};
}
function csvRows(rows){const esc=x=>'"'+(/^[=+@\-\t\r]/.test(String(x))?"'":'')+String(x).replaceAll('"','""')+'"';return '\uFEFF'+rows.map(row=>row.map(esc).join(',')).join('\r\n');}
export function toCsv(book){const rows=[['日期','序号','单词','英式音标','词性与中文释义','链接']];for(const e of book.entries){for(const s of e.senses)rows.push([e.date,e.number,e.word,s.ipa,[s.pos,s.meaning].filter(Boolean).join(' '),e.url]);for(const [i,r]of (e.relatedWords||[]).entries())for(const s of r.senses)rows.push([e.date,e.number+'.'+(i+1),r.word,s.ipa,[r.relation,s.pos,s.meaning].filter(Boolean).join(' '),r.url]);}return csvRows(rows);}
export function toSynonymsCsv(book){return csvRows([['序号','同义词','共同含义','辨析与备注'],...(book.synonymGroups||[]).map(group=>[group.number,group.words.join(' / '),group.meaning,group.note])]);}
export function toMaterialsCsv(book){return csvRows([['序号','语料内容'],...(book.materials||[]).map(item=>[item.number,item.content])]);}
