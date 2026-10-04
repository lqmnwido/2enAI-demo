import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const dataDir=path.resolve(import.meta.dirname,'../data');
let cache={mtime:0,files:{}};
export async function mediaManifest(){
 const file=path.join(dataDir,'media-manifest.json');
 const info=await stat(file).catch(()=>null);
 if(!info)return cache;
 if(info.mtimeMs!==cache.mtime){
  const data=JSON.parse(await readFile(file,'utf8'));
  cache={mtime:info.mtimeMs,files:data.files||{}};
 }
 return cache;
}
export async function localSource(doc){
 if(doc.type!=='pdf')return '/api/archive/document/'+encodeURIComponent(doc.id);
 const manifest=await mediaManifest();
 const asset=manifest.files[doc.url];
 return asset?.status==='saved'?'/api/archive/media/'+asset.id+(doc.page?'#page='+doc.page:''):null;
}
export function mediaFile(asset){
 if(!asset||!/^[a-f0-9]{24}\.[a-z0-9]+$/i.test(asset.filename))return null;
 return path.join(dataDir,'media',asset.filename);
}
