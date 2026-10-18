import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {addDays,reviewInfo,parseIntervals,newEntry,newRelatedWord,newSynonymGroup,newMaterial,parseSynonymWords,validateBook,toCsv,toSynonymsCsv,toMaterialsCsv,datePage,searchWords,blankSense} from '../public/model.js';
import {parseCambridge} from '../dictionary.mjs';
test('September 30 schedule handles month boundary',()=>assert.deepEqual([0,1,2,6,14,30].map(n=>addDays('2026-09-30',n)),['2026-09-30','2026-10-01','2026-10-02','2026-10-06','2026-10-14','2026-10-30']));
test('leap and year boundaries',()=>{assert.equal(addDays('2028-02-28',1),'2028-02-29');assert.equal(addDays('2026-12-31',1),'2027-01-01');});
test('overdue reviews persist, completion does not erase future schedule',()=>{const e={...newEntry('trade',1),date:'2026-09-30'};let r=reviewInfo(e,[0,1,2,6,14,30],'2026-10-03');assert.equal(r.due.length,3);assert.equal(r.overdue,true);for(const d of r.due)e.reviews[d.day]='2026-10-03';r=reviewInfo(e,[0,1,2,6,14,30],'2026-10-03');assert.equal(r.due.length,0);assert.equal(r.next.date,'2026-10-06');assert.equal(r.doneToday,true);});
test('empty words and future words do not become due',()=>{const e=newEntry('',1);e.date='2026-09-30';assert.equal(reviewInfo(e,[0,1],'2026-10-01').due.length,0);e.word='hello';assert.equal(reviewInfo(e,[0,1],'2026-09-29').due.length,0);});
test('custom intervals validate and deduplicate',()=>{assert.deepEqual(parseIntervals('30，0, 1 1、6'),[0,1,6,30]);for(const s of ['','-1,2','1.5','10000','abc'])assert.throws(()=>parseIntervals(s));});
test('Cambridge separates UK record verb noun adjective',()=>{const r=parseCambridge(fs.readFileSync(new URL('./fixtures/record.html',import.meta.url),'utf8'),'record');assert.equal(r.senses.length,3);assert.equal(r.senses[0].ipa,'/rɪˈkɔːd/');assert.equal(r.senses[1].ipa,'/ˈrek.ɔːd/');assert.ok(r.senses[0].meaning.includes('录制'));assert.ok(!r.senses[0].meaning.includes('克利夫'));assert.throws(()=>parseCambridge('<h1>Not found</h1>','record'));});
test('never silently uses US IPA or unrelated headwords',()=>{const html='<div class="entry-body__el"><div class="pos-header"><span class="hw">test</span><span class="pos">noun</span><span class="us"><span class="ipa">US</span></span></div><div class="def-body"><span class="trans" lang="zh-Hans">测试</span><span class="eg"><span class="trans" lang="zh-Hans">例句</span></span></div></div>';const r=parseCambridge(html,'test');assert.equal(r.senses[0].ipa,'');assert.equal(r.senses[0].meaning,'测试');assert.throws(()=>parseCambridge(html,'other'));});
test('backup roundtrip and unsafe data rejection',()=>{const book={schema:4,revision:0,settings:{intervals:[0,1,2]},entries:[newEntry('test',1)],synonymGroups:[],materials:[]};assert.deepEqual(validateBook(JSON.parse(JSON.stringify(book))),book);book.entries[0].url='javascript:alert(1)';assert.throws(()=>validateBook(book));book.entries[0].url='';book.entries[0].date='2026-02-30';assert.throws(()=>validateBook(book));});
test('CSV preserves six columns, Unicode, and guards spreadsheet formulas',()=>{const e=newEntry('=1+1',1);e.senses[0].meaning='中文，释义';const csv=toCsv({entries:[e]});assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("\"'=1+1\""));assert.ok(csv.includes('中文，释义'));});
test('legacy backups migrate without changing words or review records',()=>{
  const entry=newEntry('decide',4);delete entry.relatedWords;entry.reviews={'0':'2026-10-12'};
  const legacy={schema:1,revision:77,settings:{intervals:[0,1,2]},entries:[entry]};const migrated=validateBook(legacy);
  assert.equal(migrated.schema,4);assert.equal(migrated.revision,77);assert.deepEqual(migrated.entries,[{...entry,relatedWords:[]}]);assert.deepEqual(migrated.synonymGroups,[]);assert.deepEqual(migrated.materials,[]);
});
test('related words and synonym groups survive JSON backup and remain separate',()=>{
  const entry=newEntry('decide',1);const child={...newRelatedWord('decision'),relation:'派生名词',importance:10};Object.assign(child.senses[0],{ipa:'/dɪˈsɪʒ.ən/',pos:'n.',meaning:'决定'});child.senses.push({...blankSense(),pos:'v.',meaning:'作出决定'});entry.relatedWords.push(child);
  const group={...newSynonymGroup(['important','of great importance'],1),meaning:'重要的',note:'搭配与语气'};
  const book={schema:4,revision:5,settings:{intervals:[0,1]},entries:[entry],synonymGroups:[group],materials:[]};assert.deepEqual(validateBook(JSON.parse(JSON.stringify(book))),book);
  const csv=toCsv(book);assert.equal(csv.split('\r\n').length,4);assert.ok(csv.includes('"1.1","decision"'));assert.ok(csv.includes('作出决定'));assert.ok(!csv.includes('of great importance'));
  const synonymsCsv=toSynonymsCsv(book);assert.ok(synonymsCsv.includes('important / of great importance'));assert.ok(!synonymsCsv.includes('decision'));
});
test('manual synonym input supports Chinese separators and multiword phrases',()=>{
  assert.deepEqual(parseSynonymWords('important，significant; crucial；of great importance、essential\n key'),['important','significant','crucial','of great importance','essential','key']);
  assert.deepEqual(parseSynonymWords(' ,，; '),[]);
  const group=newSynonymGroup(['=1+1','word'],1);group.note='@malicious';assert.ok(toSynonymsCsv({synonymGroups:[group]}).includes("\"'=1+1 / word\""));assert.ok(toSynonymsCsv({synonymGroups:[group]}).includes("\"'@malicious\""));
});
test('invalid child and synonym data is rejected before saving',()=>{
  const book={schema:4,revision:0,settings:{intervals:[0]},entries:[newEntry('test',1)],synonymGroups:[newSynonymGroup(['test'],1)],materials:[]};
  book.entries[0].relatedWords=[{...newRelatedWord('tests'),url:'javascript:alert(1)'}];assert.throws(()=>validateBook(book));
  book.entries[0].relatedWords=[newRelatedWord('tests')];book.entries[0].relatedWords.push({...book.entries[0].relatedWords[0]});assert.throws(()=>validateBook(book));
  book.entries[0].relatedWords=[];book.synonymGroups[0].words=[];assert.throws(()=>validateBook(book));
  book.synonymGroups[0].words=['x'.repeat(101)];assert.throws(()=>validateBook(book));
  book.synonymGroups[0].words=['test'];book.synonymGroups.push({...book.synonymGroups[0]});assert.throws(()=>validateBook(book));
});

test('schema 2 flat related words retain all manual content and review records',()=>{
  const entry=newEntry('decide',1);delete entry.importance;entry.reviews={'0':'2026-10-12'};
  const child={id:'child',word:'decision',relation:'派生名词',ipa:'/manual/',pos:'n.',meaning:'我的释义',url:'https://example.com/decision'};entry.relatedWords=[child];
  const book=validateBook({schema:2,revision:279,settings:{intervals:[0,1]},entries:[entry],synonymGroups:[]});
  const migrated=book.entries[0].relatedWords[0];assert.deepEqual(migrated.senses,[{id:child.id,ipa:child.ipa,pos:child.pos,meaning:child.meaning}]);
  for(const key of ['id','word','relation','url'])assert.equal(migrated[key],child[key]);assert.equal(migrated.importance,0);assert.equal(book.entries[0].importance,0);assert.deepEqual(book.entries[0].reviews,entry.reviews);assert.equal(book.revision,279);
});

test('importance is independently limited to 0 through 10 per main or related word',()=>{
  const entry=newEntry('decide',1);entry.relatedWords=[newRelatedWord('decision'),newRelatedWord('decisive')];
  const book={schema:4,revision:0,settings:{intervals:[0]},entries:[entry],synonymGroups:[],materials:[]};
  entry.importance=10;entry.relatedWords[0].importance=10;assert.equal(validateBook(book).entries[0].relatedWords[1].importance,0);
  for(const target of [entry,entry.relatedWords[0]]){for(const value of [-1,11,1.5,'10']){target.importance=value;assert.throws(()=>validateBook(book));}target.importance=10;}
});

test('date pages keep every word from the same date together with their related words',()=>{
  const entries=Array.from({length:150},(_,i)=>({...newEntry('word'+i,i),date:i<120?'2026-10-14':i<140?'2026-10-11':'2026-10-12'}));entries[0].relatedWords.push(newRelatedWord('related'));
  const latest=datePage(entries);assert.deepEqual(latest.dates,['2026-10-14','2026-10-12','2026-10-11']);assert.equal(latest.entries.length,120);assert.equal(latest.entries[0].relatedWords[0].word,'related');
  assert.equal(datePage(entries,'2026-10-12').entries.length,10);assert.equal(datePage(entries,'2026-10-11').index,2);assert.equal(datePage(entries,'2020-01-01').date,'2026-10-14');
  assert.deepEqual(datePage([]),{dates:[],date:null,index:-1,entries:[]});
});

test('stored search ranks exact and prefix matches, covers all dates and related senses',()=>{
  const entries=['opportunity','opposite','opponent','oppose','opposition','shopper'].map((word,i)=>({...newEntry(word,i+1),date:i%2?'2026-10-14':'2026-10-11'}));
  const related=newRelatedWord('opposing');related.importance=7;related.senses[0].pos='adj.';related.senses[0].meaning='反对的';related.senses.push({...blankSense(),pos:'v.',meaning:'反对；阻碍'});entries[0].relatedWords.push(related);
  entries[2].senses[0].pos='n.';entries[2].senses[0].meaning='对手';
  const result=searchWords(entries,' OPP ');assert.equal(result.total,7);assert.equal(result.items.at(-1).word,'shopper');
  assert.equal(searchWords(entries,'opponent').items[0].word,'opponent');assert.equal(searchWords(entries,'对手').items[0].date,'2026-10-11');
  const child=searchWords(entries,'反对').items;assert.equal(child.length,1);assert.equal(child[0].relatedId,related.id);assert.equal(child[0].date,entries[0].date);assert.equal(child[0].senses.length,2);assert.equal(child[0].importance,7);
  assert.equal(searchWords(entries,'opp',2).total,7);assert.equal(searchWords(entries,'opp',2).items.length,2);assert.deepEqual(searchWords(entries,'  '),{items:[],total:0});assert.deepEqual(searchWords(entries,'未收录'),{items:[],total:0});
});

test('schema 3 backup gains materials without changing vocabulary, marks or synonyms',()=>{
  const entry=newEntry('record',1);entry.importance=10;entry.relatedWords.push(newRelatedWord('recording'));entry.reviews={'0':'2026-10-15'};
  const previous={schema:3,revision:293,settings:{intervals:[0,1]},entries:[entry],synonymGroups:[newSynonymGroup(['record','note'],1)]};
  assert.deepEqual(validateBook(previous),{...previous,schema:4,materials:[]});
});

test('materials roundtrip preserves free multiline text and stays separate from other tables',()=>{
  const content='\n  This is an expression.\n中文笔记，含逗号、"引号"\n</textarea><img src=x onerror=alert(1)>';
  const book={schema:4,revision:0,settings:{intervals:[0]},entries:[],synonymGroups:[],materials:[newMaterial(content,1),newMaterial('',2)]};
  assert.deepEqual(validateBook(JSON.parse(JSON.stringify(book))),book);const csv=toMaterialsCsv(book);assert.ok(csv.includes('This is an expression.'));assert.ok(csv.includes('""引号""'));assert.ok(!toCsv(book).includes('This is'));assert.ok(!toSynonymsCsv(book).includes('This is'));
  book.materials[0].content='=1+1';assert.ok(toMaterialsCsv(book).includes("\"'=1+1\""));
});

test('invalid materials cannot silently replace stored content',()=>{
  const book={schema:4,revision:0,settings:{intervals:[0]},entries:[],synonymGroups:[],materials:[newMaterial('笔记',1)]};
  for(const materials of [undefined,null,{},[{...book.materials[0],content:1}],[{...book.materials[0],content:'x'.repeat(100001)}],[book.materials[0],book.materials[0]]])assert.throws(()=>validateBook({...book,materials}));
});
