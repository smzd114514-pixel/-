import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {newEntry,newRelatedWord,newSynonymGroup,newMaterial} from '../public/model.js';
test('HTTP migration, feature persistence after restart, backups, and overwrite protection',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wordbook-test-'));
  const legacyEntry=newEntry('decide',1);delete legacyEntry.relatedWords;
  const legacyText=JSON.stringify({schema:1,revision:0,settings:{intervals:[0,1,2]},entries:[legacyEntry]});
  fs.writeFileSync(path.join(dir,'wordbook.json'),legacyText);
  let server;
  async function start(){
    server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,WORDBOOK_PORT:'17867',WORDBOOK_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
    await Promise.race([once(server.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server startup timed out')),8000).unref())]);
  }
  async function stop(){const exited=once(server,'exit');server.kill();await exited;}
  const url='http://127.0.0.1:17867';
  const put=book=>fetch(url+'/api/book',{method:'PUT',headers:{'Content-Type':'application/json','X-Wordbook':'1'},body:JSON.stringify(book)});
  const read=async()=>await(await fetch(url+'/api/book')).json();
  try{
    await start();assert.equal((await(await fetch(url+'/api/health')).json()).version,4);
    let book=await read();assert.equal(book.schema,4);assert.deepEqual(book.entries[0].relatedWords,[]);assert.deepEqual(book.synonymGroups,[]);assert.deepEqual(book.materials,[]);
    assert.equal(fs.readFileSync(path.join(dir,'wordbook.json'),'utf8'),legacyText);
    assert.equal((await put(JSON.parse(legacyText))).status,409);
    assert.equal(fs.readFileSync(path.join(dir,'wordbook.json'),'utf8'),legacyText);
    assert.equal((await put({...book,schema:2})).status,409);
    assert.equal((await put({...book,schema:3})).status,409);
    const related={...newRelatedWord('decision'),relation:'派生名词',importance:10};related.senses[0].meaning='决定';book.entries[0].importance=10;book.entries[0].relatedWords.push(related);
    book.synonymGroups.push({...newSynonymGroup(['important','significant'],1),meaning:'重要的'});
    book.materials.push(newMaterial('A useful expression.\n中文笔记',1));
    let response=await put(book);assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
    assert.equal((await put(book)).status,409);
    assert.equal(fs.readFileSync(path.join(dir,'wordbook.previous.json'),'utf8'),legacyText);
    book=await read();book.entries[0].relatedWords[0].senses[0].meaning='决定；决策';book.synonymGroups[0].note='不同搭配';book.materials[0].content+='\n自由修改';
    response=await put(book);assert.equal(response.status,200);
    const previous=JSON.parse(fs.readFileSync(path.join(dir,'wordbook.previous.json'),'utf8'));
    assert.equal(previous.entries[0].relatedWords[0].word,'decision');assert.equal(previous.synonymGroups[0].words[1],'significant');
    assert.equal(previous.materials[0].content,'A useful expression.\n中文笔记');
    assert.equal(fs.readdirSync(path.join(dir,'backups')).length,1);
    await stop();await start();book=await read();assert.equal(book.revision,2);
    assert.equal(book.entries[0].relatedWords[0].senses[0].meaning,'决定；决策');assert.equal(book.entries[0].relatedWords[0].importance,10);assert.equal(book.entries[0].importance,10);assert.equal(book.synonymGroups[0].note,'不同搭配');
    assert.equal(book.materials[0].content,'A useful expression.\n中文笔记\n自由修改');
    response=await fetch(url+'/api/book',{method:'PUT',headers:{'Origin':'https://example.com','X-Wordbook':'1'},body:JSON.stringify(book)});assert.equal(response.status,403);
    assert.equal((await put({schema:4})).status,400);for(const file of ['/synonyms.js','/materials.js','/lookup.js','/notebook-nav.js'])assert.equal((await fetch(url+file)).status,200);
    assert.equal((await fetch(url+'/data/wordbook.json')).status,404);assert.equal((await fetch(url+'/api/lookup?word=123')).status,400);
    fs.writeFileSync(path.join(dir,'wordbook.json'),'broken');assert.equal((await fetch(url+'/api/book')).status,500);
    assert.notEqual((await put(book)).status,200);assert.equal(fs.readFileSync(path.join(dir,'wordbook.json'),'utf8'),'broken');
  }finally{if(server?.exitCode===null)await stop();}
});
