import {load} from 'cheerio';
import {normalizeWord,dictionaryUrl} from './public/model.js';
const posNames={noun:'n. 名词',verb:'v. 动词',adjective:'adj. 形容词',adverb:'adv. 副词',preposition:'prep. 介词',conjunction:'conj. 连词',pronoun:'pron. 代词',determiner:'det. 限定词',exclamation:'exclam. 感叹词','modal verb':'modal v. 情态动词','auxiliary verb':'aux. 助动词','phrasal verb':'phr. v. 短语动词',prefix:'prefix 前缀',suffix:'suffix 后缀',number:'num. 数词',idiom:'idiom 习语'};
const clean=s=>s.replace(/\s+/g,' ').trim();const headKey=s=>normalizeWord(s).replace(/[-‐‑]/g,' ');
export function parseCambridge(html,word){
  const $=load(html);const groups=new Map();let matched='';
  $('.entry-body__el').each((_,el)=>{
    const entry=$(el);const header=entry.children('.pos-header').first();const head=clean(header.find('.hw').first().text());if(headKey(head)!==headKey(word))return;
    const pos=clean(header.find('.pos').first().text());if(!pos)return;matched=head;
    const ipas=[...new Set(header.find('.uk .ipa').map((_,x)=>clean($(x).text())).get().filter(Boolean))];const translations=[];
    entry.find('.def-body').each((_,body)=>{if($(body).closest('.entry-body__el')[0]!==el||$(body).closest('.phrase-block,.idiom-block').length)return;$(body).children('.trans[lang="zh-Hans"]').each((_,x)=>{const text=clean($(x).text());if(text&&!translations.includes(text))translations.push(text);});});
    if(!translations.length)return;if(!groups.has(pos))groups.set(pos,{pos:posNames[pos]||pos,ipas:[],meanings:[]});const group=groups.get(pos);group.ipas.push(...ipas);group.meanings.push(...translations);
  });
  const senses=[...groups.values()].map(g=>({pos:g.pos,ipa:[...new Set(g.ipas)].map(s=>'/'+s+'/').join('；'),meaning:[...new Set(g.meanings)].join('；')}));
  if(!senses.length){const err=new Error('剑桥未返回这个单词的中文词条。请检查拼写，或打开词典后手动填写。');err.status=404;throw err;}
  return {word:matched,senses,url:dictionaryUrl(word),source:'Cambridge English–Chinese (Simplified) Dictionary',warning:senses.some(s=>!s.ipa)?'部分词性没有标注英式音标，已留空，未使用美式音标。':''};
}
const inflight=new Map();const cache=new Map();let lastRequest=0;let queue=Promise.resolve();
export async function lookup(word){
  const key=normalizeWord(word);if(!/^[a-zA-Z][a-zA-Z\s'’.-]{0,99}$/.test(word.trim())){const e=new Error('请输入英文单词或短语；其他内容仍可手动记录。');e.status=400;throw e;}
  if(cache.has(key))return cache.get(key);if(inflight.has(key))return inflight.get(key);
  const task=queue.catch(()=>{}).then(async()=>{
    const gap=800-(Date.now()-lastRequest);if(gap>0)await new Promise(r=>setTimeout(r,gap));lastRequest=Date.now();
    let response;try{response=await fetch(dictionaryUrl(key),{headers:{'Accept':'text/html','User-Agent':'UIBEWordbook/1.0 (personal vocabulary notebook)'},signal:AbortSignal.timeout(20000)});}catch{const e=new Error('暂时无法连接剑桥词典。已保留单词，可以稍后重试或手动填写。');e.status=502;throw e;}
    if(!response.ok){const e=new Error(response.status===429||response.status===403?'剑桥暂时限制了自动查询。请稍后重试，或点击词典链接手动查看。':'剑桥暂时无法返回词条，请稍后重试。');e.status=502;throw e;}
    const result=parseCambridge(await response.text(),key);if(cache.size>=500)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
  });queue=task;inflight.set(key,task);try{return await task;}finally{inflight.delete(key);}
}
