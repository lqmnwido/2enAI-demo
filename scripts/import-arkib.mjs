// Resumable public-site import. Run again to continue the saved frontier.
import {load} from 'cheerio';
import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'), dir=path.join(root,'data');
await mkdir(path.join(dir,'source'),{recursive:true});
const host='https://www.arkib.gov.my';
const stateFile=path.join(dir,'crawl-state.json'),corpusFile=path.join(dir,'corpus.json');
const read=async(file,fallback)=>JSON.parse(await readFile(file,'utf8').catch(()=>JSON.stringify(fallback)));
const state=await read(stateFile,{queue:[host+'/ms/',host+'/ms/component/osmap/?view=html&id=1'],visited:[],failures:[],discovered:[],skipped:[]});
const documents=await read(corpusFile,[]),visited=new Set(state.visited),queued=new Set(state.queue);
const max=Number(process.env.ARKIB_MAX_PAGES||0),started=Date.now();let processed=0,stopping=false;
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
let rules=[];
try {
 const r=await fetch(host+'/robots.txt',{signal:AbortSignal.timeout(20000)});
 if(r.ok){const content=await r.text();await writeFile(path.join(dir,'source','robots.txt'),content);let applies=false;
  for(const line of content.split('\n')){const [key,...parts]=line.split(':');const value=parts.join(':').split('#')[0].trim();if(key.trim().toLowerCase()==='user-agent')applies=value==='*';if(applies&&key.trim().toLowerCase()==='disallow'&&value)rules.push(value);}
 }else if(r.status!==404)throw new Error('robots.txt returned '+r.status);
}catch(e){console.error('Cannot verify crawl rules:',e.message);process.exit(1);}
function canonical(link,base){try{const u=new URL(link,base);u.hash='';if(u.origin!==host)return null;
 if(!u.pathname.startsWith('/ms/')&&!/\.pdf$/i.test(u.pathname))return null;
 if(/\/search|\/carian|\/login|\/logout|\/warga-arkib|format=|tmpl=|task=/i.test(u.href))return null;
 if(rules.some(rule=>u.pathname.startsWith(rule)))return null;
 if(/\.(jpg|jpeg|png|zip|docx?|xlsx?|pptx?|mp[34]|css|js)$/i.test(u.pathname))return null;
 for(const key of [...u.searchParams.keys()])if(!['start','limitstart','view','id','Itemid'].includes(key))u.searchParams.delete(key);
 return u.href;
}catch{return null;}}
async function save(status='running'){
 state.visited=[...visited];
 for(const [file,data]of[[stateFile,state],[corpusFile,documents],[path.join(dir,'import-status.json'),{status,source:host+'/ms/',updatedAt:new Date().toISOString(),pagesVisited:visited.size,documents:documents.length,pending:state.queue.length,failures:state.failures.length,skipped:state.skipped.length,scope:'Halaman awam Bahasa Melayu dan PDF yang dipautkan pada www.arkib.gov.my. Koleksi di portal lain atau di sebalik log masuk tidak termasuk.'}]]){
  await writeFile(file+'.tmp',JSON.stringify(data,null,2));await rename(file+'.tmp',file);
 }
}
function addDocument(url,title,text,extra={}){
 text=text.replace(/[\t ]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();if(text.length<120)return;
 const id=createHash('sha256').update(url+(extra.page||'')).digest('hex').slice(0,16);
 const item={id,url,title,text,fetchedAt:new Date().toISOString(),publisher:'Arkib Negara Malaysia',...extra};
 const old=documents.findIndex(d=>d.id===id);if(old>=0)documents[old]=item;else documents.push(item);
}
await save();
while(state.queue.length&&!stopping&&(!max||processed<max)){
 const url=state.queue.shift();queued.delete(url);if(visited.has(url))continue;
 try{
  const response=await fetch(url,{headers:{'User-Agent':'AIMAN-ArchiveResearch/1.0 (public research index)'},signal:AbortSignal.timeout(25000),redirect:'follow'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  if(new URL(response.url).origin!==host)throw new Error('Redirect outside approved source');
  const type=response.headers.get('content-type')||'';
  if(type.includes('pdf')||/\.pdf$/i.test(new URL(url).pathname)){
   if(Number(response.headers.get('content-length'))>25000000){state.skipped.push({url,reason:'PDF exceeds 25 MB; requires separate import'});}
   else {
    const buffer=new Uint8Array(await response.arrayBuffer());
    if(buffer.length>25000000)throw new Error('PDF exceeds 25 MB');
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf=await getDocument({data:buffer,useSystemFonts:true,isEvalSupported:false}).promise;let chars=0;
    for(let page=1;page<=pdf.numPages;page++){
     const data=await(await pdf.getPage(page)).getTextContent();const text=data.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('');chars+=text.length;
     addDocument(url,decodeURIComponent(new URL(url).pathname.split('/').pop()),text,{type:'pdf',page});
    }
    if(chars<120)state.skipped.push({url,reason:'Scanned PDF needs handwriting/vision recognition'});
    await pdf.cleanup();
   }
  }else if(type.includes('html')){
   const html=await response.text();const $=load(html);
   for(const el of $('a[href]').toArray()){
    const link=canonical($(el).attr('href'),url);
    if(link&&!visited.has(link)&&!queued.has(link)){state.queue.push(link);queued.add(link);}
   }
   const title=($('h1').first().text()||$('title').text()).trim();
   $('script,style,nav,header,footer,form,.sp-module,.breadcrumb,.article-info,.article-ratings-social-share').remove();
   const content=$('.article-details,.com-content-article__body,.item-page,#sp-main-body').first();
   const selected=content.length?content:$('main');
   selected.find('p,div,li,h1,h2,h3,h4,br,tr').each((_,el)=>$(el).append('\n'));
   const text=selected.text();
   if(text.trim().length>120){
    const image=$('meta[property="og:image"]').attr('content');
    addDocument(url,title,text,{type:'web',image:image?new URL(image,url).href:null});
   }
  }else state.skipped.push({url,reason:'Unsupported type '+type});
  visited.add(url);
 }catch(e){state.failures.push({url,error:e.message});visited.add(url);}
 processed++;if(processed%5===0){await save();console.log(JSON.stringify({visited:visited.size,documents:documents.length,pending:state.queue.length,seconds:Math.round((Date.now()-started)/1000)}));}
 await new Promise(resolve=>setTimeout(resolve,400));
}
await save(state.queue.length?'paused':'complete');
console.log('Import checkpoint saved:',documents.length,'documents;',state.queue.length,'URLs pending.');
