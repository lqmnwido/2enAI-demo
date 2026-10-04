// Resumable local mirror of public Arkib Negara media found in the indexed pages.
import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,rm,statfs} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import https from 'node:https';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..'),data=path.join(root,'data');
const mediaDir=path.join(data,'media'),host='https://www.arkib.gov.my';
const manifestFile=path.join(data,'media-manifest.json'),stateFile=path.join(data,'media-state.json');
await mkdir(mediaDir,{recursive:true});
const read=async(file,fallback)=>JSON.parse(await readFile(file,'utf8').catch(()=>JSON.stringify(fallback)));
const corpus=await read(path.join(data,'corpus.json'),[]);
const crawl=await read(path.join(data,'crawl-state.json'),{visited:[]});
const manifest=await read(manifestFile,{source:host+'/ms/',files:{},updatedAt:null});
const state=await read(stateFile,{phase:'pdf',pageIndex:0,pending:[],seen:[],failures:[]});
const seen=new Set(state.seen);
let stopping=false,completed=0,lastLogged=0;
process.on('SIGINT',()=>stopping=true);process.on('SIGTERM',()=>stopping=true);
const extensions=/\.(pdf|epub|mobi|azw3?|djvu|jpe?g|png|webp|gif|tiff?|bmp|svg|docx?|xlsx?|pptx?|zip|rar|7z|mp3|mp4|m4a|wav|ogg|webm)$/i;
const typeExt={'application/pdf':'.pdf','application/epub+zip':'.epub','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','image/tiff':'.tif','image/svg+xml':'.svg','audio/mpeg':'.mp3','audio/mp4':'.m4a','video/mp4':'.mp4','application/zip':'.zip'};
const category=ext=>/pdf|epub|mobi|azw|djvu/.test(ext)?'ebook / dokumen':/jpg|jpeg|png|webp|gif|tif|bmp|svg/.test(ext)?'imej':/mp3|m4a|wav|ogg/.test(ext)?'audio':/mp4|webm/.test(ext)?'video':'fail';
function request(url,redirects=0){
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{'User-Agent':'AIMAN-ArchiveResearch/1.0 (public local mirror)'}},response=>{
   const target=response.headers.location?new URL(response.headers.location,url).href:null;
   if(response.statusCode>=300&&response.statusCode<400&&target){
    response.resume();
    if(redirects>=5||new URL(target).origin!==host)return reject(new Error('redirect outside approved source'));
    return resolve(request(target,redirects+1));
   }
   resolve({response,url,status:response.statusCode,headers:response.headers});
  });
  req.setTimeout(60000,()=>req.destroy(new Error('request timed out')));
  req.on('error',reject);
 });
}
function canonical(input,base){
 try{const url=new URL(input,base);url.hash='';
  if(url.origin!==host||!['https:','http:'].includes(url.protocol))return null;
  if(/\/(?:login|logout|search|carian)(?:\/|$)/i.test(url.pathname))return null;
  if(extensions.test(url.pathname))url.search='';
  return url.href;
 }catch{return null;}
}
function add(input,base,from){
 const url=canonical(input,base);if(!url||!extensions.test(new URL(url).pathname)||seen.has(url))return;
 seen.add(url);state.pending.push({url,from});
}
for(const doc of corpus)if(doc.type==='pdf')add(doc.url,host,'indexed PDF');
async function save(){
 state.seen=[...seen];manifest.updatedAt=new Date().toISOString();
 for(const [file,obj] of [[manifestFile,manifest],[stateFile,state]]){
  await writeFile(file+'.tmp',JSON.stringify(obj));await rename(file+'.tmp',file);
 }
}
async function freeBytes(){const info=await statfs(data);return Number(info.bavail)*Number(info.bsize);}
async function download(job){
 if(manifest.files[job.url]?.status==='saved')return;
 const id=createHash('sha256').update(job.url).digest('hex').slice(0,24);
 const {response,headers,status}=await request(job.url);
 if(status<200||status>=300){response.resume();throw new Error('HTTP '+status);}
 const mime=(headers['content-type']||'application/octet-stream').split(';')[0].toLowerCase();
 const ext=path.extname(new URL(job.url).pathname).toLowerCase()||typeExt[mime]||'.bin';
 const size=Number(headers['content-length']||0);
 if(size>500_000_000){response.destroy();throw new Error('file over 500 MB; requires manual review');}
 if(await freeBytes()<5_000_000_000+size){response.destroy();throw new Error('local disk reserve reached');}
 let count=0;const sha=createHash('sha256'),temp=path.join(mediaDir,id+'.part');
 const meter=new Transform({transform(chunk,encoding,next){count+=chunk.length;if(count>500_000_000)return next(new Error('file over 500 MB'));sha.update(chunk);next(null,chunk);}});
 try{await pipeline(response,meter,createWriteStream(temp));}
 catch(error){await rm(temp,{force:true});throw error;}
 const filename=id+ext;await rename(temp,path.join(mediaDir,filename));
 manifest.files[job.url]={id,url:job.url,filename,mime,category:category(ext),bytes:count,sha256:sha.digest('hex'),from:job.from,status:'saved',savedAt:new Date().toISOString()};
}
async function discover(page){
 if(extensions.test(new URL(page).pathname))return;
 const {response,headers,status}=await request(page);
 if(status<200||status>=300){response.resume();return;}
 const type=headers['content-type']||'';if(!type.includes('html')){response.resume();return;}
 let bytes=0;const parts=[];
 for await(const chunk of response){bytes+=chunk.length;if(bytes>10_000_000){response.destroy();throw new Error('HTML page over 10 MB');}parts.push(chunk);}
 const html=Buffer.concat(parts).toString('utf8'),$=load(html);
 $('a[href],img[src],source[src],video[src],audio[src],iframe[src],object[data]').each((_,element)=>{
  const node=$(element);for(const attr of ['href','src','data-src','data','poster']){
   const value=node.attr(attr);if(value)add(value,page,page);
  }
  for(const attr of ['srcset','data-srcset'])for(const entry of (node.attr(attr)||'').split(',')){
   const value=entry.trim().split(/\s+/)[0];if(value)add(value,page,page);
  }
 });
 const og=$('meta[property="og:image"]').attr('content');if(og)add(og,page,page);
}
await save();
let batches=0;
while(!stopping){
 if(state.pending.length){
  const jobs=state.pending.splice(0,Math.min(4,state.pending.length));
  await Promise.all(jobs.map(async job=>{
   try{await download(job);completed++;}
   catch(error){state.failures.push({url:job.url,error:error.message});if(/disk reserve/.test(error.message)){state.pending.unshift(job);stopping=true;}}
  }));
 }else if(state.pageIndex<crawl.visited.length){
  state.phase='discover';
  const pages=crawl.visited.slice(state.pageIndex,state.pageIndex+4);
  state.pageIndex+=pages.length;
  await Promise.all(pages.map(async page=>{
   try{await discover(page);}catch(error){state.failures.push({url:page,error:error.message});}
  }));
 }else{state.phase='complete';break;}
 if(++batches%5===0||stopping)await save();
 if(completed>=lastLogged+50){lastLogged=completed;console.log(JSON.stringify({saved:Object.keys(manifest.files).length,pages:state.pageIndex,totalPages:crawl.visited.length,pending:state.pending.length,failures:state.failures.length}));}
 await new Promise(resolve=>setTimeout(resolve,100));
}
await save();
console.log(JSON.stringify({phase:state.phase,saved:Object.keys(manifest.files).length,pages:state.pageIndex,totalPages:crawl.visited.length,pending:state.pending.length,failures:state.failures.length}));
