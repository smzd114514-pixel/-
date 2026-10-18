import {blankSense} from './model.js';

export async function lookupVocabulary(target,{requests,key,isPresent,update,replace=false,fetchLookup=word=>fetch('/api/lookup?word='+encodeURIComponent(word))}){
  const word=target.word.trim();if(!word||!isPresent())return;
  const ticket=crypto.randomUUID(),original=JSON.stringify(target.senses);requests.set(key,ticket);
  const current=()=>requests.get(key)===ticket&&isPresent()&&target.word.trim()===word;
  target.lookupStatus='loading';target.lookupMessage='';update();
  try{
    const response=await fetchLookup(word);const result=await response.json();if(!current())return;
    if(!response.ok)throw new Error(result.error||'查词失败。');
    if(!Array.isArray(result.senses)||!result.senses.length)throw new Error('词典未返回释义，可稍后重试。');
    if(JSON.stringify(target.senses)!==original){target.lookupStatus='manual';target.lookupMessage='查询期间已有手动修改，已保留。可选择重新查词。';}
    else if(!replace&&target.senses.some(s=>s.ipa||s.pos||s.meaning)){target.lookupStatus='manual';target.lookupMessage='已保留手动内容。需要词典释义时，可选择重新查词。';}
    else{target.senses=result.senses.map(s=>({...blankSense(),ipa:s.ipa||'',pos:s.pos||'',meaning:s.meaning||''}));target.lookupStatus='done';target.lookupMessage=result.warning||'';}
    target.lookedUpWord=word;if(!target.url)target.url=result.url;update();
  }catch(error){if(!current())return;target.lookupStatus='error';target.lookupMessage=error instanceof TypeError?'暂时无法连接词典，已保留单词。请检查网络后重试，或手动填写。':error.message||'暂时无法查词，已保留单词，可稍后重试或手动填写。';update();}
  finally{if(requests.get(key)===ticket)requests.delete(key);}
}
