import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupVocabulary} from '../public/lookup.js';
import {newRelatedWord,dictionaryUrl} from '../public/model.js';

const result={senses:[{ipa:'/rɪˈkɔːd/',pos:'v. 动词',meaning:'录制'},{ipa:'/ˈrek.ɔːd/',pos:'n. 名词',meaning:'记录'}],url:dictionaryUrl('record')};
const response=(data=result,ok=true)=>({ok,json:async()=>data});
function context(overrides={}){return {requests:new Map(),key:'parent/child',isPresent:()=>true,update:()=>{},fetchLookup:async()=>response(),...overrides};}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('related lookup fills UK IPA and every part of speech with editable senses',async()=>{
  const child=newRelatedWord('record');await lookupVocabulary(child,context());assert.equal(child.lookupStatus,'done');assert.equal(child.lookedUpWord,'record');
  assert.deepEqual(child.senses.map(({ipa,pos,meaning})=>({ipa,pos,meaning})),result.senses);assert.equal(new Set(child.senses.map(s=>s.id)).size,2);
  child.senses[0].meaning='自行修改';assert.equal(child.senses[0].meaning,'自行修改');
});

test('manual content stays unless replacement is explicitly selected',async()=>{
  const child=newRelatedWord('record');child.senses[0].meaning='我的记录';await lookupVocabulary(child,context());assert.equal(child.senses[0].meaning,'我的记录');assert.equal(child.lookupStatus,'manual');
  await lookupVocabulary(child,context({replace:true}));assert.equal(child.senses.length,2);assert.equal(child.senses[0].meaning,'录制');
});

test('editing while lookup is pending preserves the whole manual entry',async()=>{
  const child=newRelatedWord('record'),pending=deferred();const task=lookupVocabulary(child,context({replace:true,fetchLookup:()=>pending.promise}));
  child.senses[0].meaning='查询时输入的笔记';pending.resolve(response());await task;assert.equal(child.senses.length,1);assert.equal(child.senses[0].meaning,'查询时输入的笔记');assert.equal(child.lookupStatus,'manual');
});

test('out of order responses cannot overwrite the latest queried word',async()=>{
  const child=newRelatedWord('old'),first=deferred(),second=deferred();const options=context();
  const a=lookupVocabulary(child,{...options,fetchLookup:()=>first.promise});child.word='record';const b=lookupVocabulary(child,{...options,fetchLookup:()=>second.promise});
  second.resolve(response());await b;first.resolve(response({senses:[{ipa:'/old/',pos:'adj.',meaning:'旧'}]}));await a;
  assert.equal(child.lookedUpWord,'record');assert.equal(child.senses[0].meaning,'录制');assert.equal(child.lookupStatus,'done');assert.equal(options.requests.size,0);
});

test('deleted or cancelled drafts ignore late responses; saved drafts still receive them',async()=>{
  for(const presentAfterSave of [false,true]){
    const child=newRelatedWord('record'),pending=deferred();let present=true;const options=context({isPresent:()=>present,fetchLookup:()=>pending.promise});const task=lookupVocabulary(child,options);
    present=presentAfterSave;pending.resolve(response());await task;assert.equal(child.senses[0].meaning,presentAfterSave?'录制':'');assert.equal(options.requests.size,0);
  }
});

test('failed lookup keeps the word, URL and manual content available for retry',async()=>{
  const child=newRelatedWord('record');child.senses[0].meaning='手动释义';const original=structuredClone(child);
  const options=context({fetchLookup:async()=>response({error:'网络暂时不可用'},false)});await lookupVocabulary(child,options);
  assert.equal(child.word,original.word);assert.equal(child.url,original.url);assert.deepEqual(child.senses,original.senses);assert.equal(child.lookupStatus,'error');assert.match(child.lookupMessage,/网络/);
  await lookupVocabulary(child,context({replace:true}));assert.equal(child.lookupStatus,'done');
  const completed=structuredClone(child.senses);await lookupVocabulary(child,context({fetchLookup:async()=>{throw new TypeError('Failed to fetch');}}));assert.equal(child.lookupStatus,'error');assert.match(child.lookupMessage,/网络/);assert.deepEqual(child.senses,completed);
});

test('parent and different related words can query concurrently without cancelling each other',async()=>{
  const a=newRelatedWord('record'),b=newRelatedWord('record'),one=deferred(),two=deferred(),requests=new Map();
  const first=lookupVocabulary(a,context({requests,key:'parent',fetchLookup:()=>one.promise}));const second=lookupVocabulary(b,context({requests,key:'parent/child',fetchLookup:()=>two.promise}));
  one.resolve(response());await first;assert.equal(b.lookupStatus,'loading');two.resolve(response());await second;assert.equal(a.senses.length,2);assert.equal(b.senses.length,2);assert.equal(requests.size,0);
});
