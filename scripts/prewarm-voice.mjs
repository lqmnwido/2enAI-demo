// Persist only fixed navigation lines. Complaint and research text stays in RAM.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import WebSocket from 'ws';

const directory=path.resolve(import.meta.dirname,'../data/voice-cache');
await mkdir(directory,{recursive:true});
const manifest=[];
async function capture(question){
 const ws=new WebSocket('ws://127.0.0.1:3001/assistant-stream');
 let segment=null;
 const writes=[];
 ws.on('open',()=>ws.send(JSON.stringify({type:'ask',text:question,voice:true})));
 ws.on('message',(raw,binary)=>{
  if(!binary){const event=JSON.parse(String(raw));if(event.type==='speech_segment')segment=event;if(event.type==='error')writes.push(Promise.reject(new Error(event.message)));return;}
  if(!segment)return;
  const text=segment.text,rate=raw.readUInt32LE(4),audio=raw.subarray(8);
  if(rate!==24000||audio.length<1000)return;
  const name=createHash('sha256').update(text).digest('hex')+'.pcm';
  writes.push(writeFile(path.join(directory,name),audio));
  manifest.push({text,rate});segment=null;
 });
 await new Promise((resolve,reject)=>{ws.once('close',resolve);ws.once('error',reject);setTimeout(()=>reject(new Error('Voice cache timed out')),180000);});
 await Promise.all(writes);
}
for(const question of ['Buka e-Aduan','Buka ruang Jawi','Buka carian arkib'])await capture(question);
// Cache the supplied archival demo question only after the live evidence
// route has generated its exact current text and citations.
await capture('Apa yang berlaku semasa Darurat Tanah Melayu pada tahun 1948?');
await writeFile(path.join(directory,'manifest.json'),JSON.stringify([...new Map(manifest.map(item=>[item.text,item])).values()],null,2));
console.log(`Cached ${manifest.length} verified demo speech segments.`);
