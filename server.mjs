import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lookup} from './dictionary.mjs';
import {validateBook,DEFAULT_INTERVALS,localDate} from './public/model.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.WORDBOOK_PORT||17865);
const dataDir=process.env.WORDBOOK_DATA_DIR||path.join(root,'data');fs.mkdirSync(dataDir,{recursive:true});
const dataFile=path.join(dataDir,'wordbook.json');const backupDir=path.join(dataDir,'backups');const origin=`http://127.0.0.1:${port}`;
const empty=()=>({schema:4,revision:0,settings:{intervals:DEFAULT_INTERVALS},entries:[],synonymGroups:[],materials:[]});
function readBook(){return fs.existsSync(dataFile)?validateBook(JSON.parse(fs.readFileSync(dataFile,'utf8'))):empty();}
function saveBook(book){if(fs.existsSync(dataFile)){fs.mkdirSync(backupDir,{recursive:true});fs.copyFileSync(dataFile,path.join(dataDir,'wordbook.previous.json'));const daily=path.join(backupDir,localDate()+'.json');if(!fs.existsSync(daily))fs.copyFileSync(dataFile,daily);}const temp=dataFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(book,null,2),'utf8');fs.renameSync(temp,dataFile);}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let s='';for await(const part of req){s+=part;if(Buffer.byteLength(s)>20*1024*1024){const e=new Error('文件过大，请控制在 20 MB 以内。');e.status=413;throw e;}}return JSON.parse(s);}
const publicFiles=new Map([['/','index.html'],['/app.js','app.js'],['/synonyms.js','synonyms.js'],['/materials.js','materials.js'],['/lookup.js','lookup.js'],['/notebook-nav.js','notebook-nav.js'],['/style.css','style.css'],['/model.js','model.js']]);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return json(res,403,{error:'不允许的访问地址。'});
  const requestOrigin=req.headers.origin;if(requestOrigin&&requestOrigin!==origin&&requestOrigin!==`http://localhost:${port}`)return json(res,403,{error:'请在本地单词本中进行操作。'});const url=new URL(req.url,origin);
  try{
    if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{app:'uibe-wordbook',version:4});
    if(req.method==='GET'&&url.pathname==='/api/book'){try{return json(res,200,readBook());}catch{return json(res,500,{error:'本地数据文件读取失败。为保护已有单词，已停止写入。请从 data/backups 恢复备份。'});}}
    if(req.method==='PUT'&&url.pathname==='/api/book'){if(req.headers['x-wordbook']!=='1')return json(res,403,{error:'无效的保存请求。'});const raw=await body(req);if([1,2,3].includes(raw?.schema))return json(res,409,{error:'这个窗口使用旧版页面。请先导出未保存的编辑，再刷新页面使用新版，避免覆盖语料积累等新增内容。'});const incoming=validateBook(raw);const current=readBook();if(incoming.revision!==current.revision)return json(res,409,{error:'另一个窗口已修改单词本。请先导出当前备份，再刷新页面查看最新内容。'});incoming.revision++;saveBook(incoming);return json(res,200,{revision:incoming.revision});}
    if(req.method==='GET'&&url.pathname==='/api/lookup')return json(res,200,await lookup(url.searchParams.get('word')||''));
    if(req.method==='GET'&&publicFiles.has(url.pathname)){const file=path.join(root,'public',publicFiles.get(url.pathname));res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-cache'});return res.end(fs.readFileSync(file));}return json(res,404,{error:'没有找到这个页面。'});
  }catch(e){return json(res,e.status||400,{error:e.message||'操作失败，请重试。'});}
});server.listen(port,'127.0.0.1',()=>console.log(`Wordbook: ${origin}`));server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口已被占用；请使用启动入口打开已有单词本。':e.message);process.exitCode=1;});
