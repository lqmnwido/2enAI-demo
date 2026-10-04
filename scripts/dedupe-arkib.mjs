// Remove identical mirror copies created by source cache-busting query strings.
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
const data=path.resolve(import.meta.dirname,'../data');
const mf=path.join(data,'media-manifest.json'),sf=path.join(data,'media-state.json');
const manifest=JSON.parse(await readFile(mf,'utf8')),state=JSON.parse(await readFile(sf,'utf8'));
const canonical=url=>{const value=new URL(url);value.hash='';value.search='';return value.href;};
const result={},winners=new Map(),remove=[];
for(const [url,asset] of Object.entries(manifest.files)){
 const key=canonical(url),winner=winners.get(key);
 if(!winner){winners.set(key,asset);result[key]={...asset,url:key};continue;}
 if(winner.sha256===asset.sha256&&winner.filename!==asset.filename){
  if(!/^[a-f0-9]{24}\.[a-z0-9]+$/i.test(asset.filename))throw new Error('Unexpected filename');
  remove.push(path.join(data,'media',asset.filename));
 }else if(winner.sha256!==asset.sha256)result[url]=asset;
}
manifest.files=result;
const saved=new Set(Object.keys(result));
state.pending=[...new Map(state.pending.map(job=>{const url=canonical(job.url);return[url,{...job,url}]})).values()].filter(job=>!saved.has(job.url));
state.seen=[...new Set(state.seen.map(canonical).concat([...saved],state.pending.map(job=>job.url)))];
state.failures=[...new Map(state.failures.map(item=>{const url=canonical(item.url);return[url+'|'+item.error,{url,error:item.error}]})).values()];
for(const [file,value] of [[mf,manifest],[sf,state]]){await writeFile(file+'.tmp',JSON.stringify(value));await rename(file+'.tmp',file);}
for(const file of remove)await rm(file,{force:true});
console.log(JSON.stringify({kept:Object.keys(result).length,removed:remove.length,pending:state.pending.length,failures:state.failures.length}));
