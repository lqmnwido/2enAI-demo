import {WebSocket} from 'ws';
import {withSpeechGpu} from './gpu-handoff.js';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const audioCache=new Map();
let cachedBytes=0;
const MAX_CACHE_BYTES=12*1024*1024;

export function speechSegments(text){
 let remaining=String(text||'').trim();
 const parts=[];
 while(remaining){
  const paragraph=remaining.indexOf('\n\n');
  if(!parts.length&&paragraph>=18&&paragraph<=120){
   parts.push(remaining.slice(0,paragraph).trim());
   remaining=remaining.slice(paragraph+2).trimStart();
   continue;
  }
  const limit=parts.length?160:68;
  if(remaining.length<=limit){parts.push(remaining);break;}
  const candidates=['. ','? ','! ','\n','; ',', '].map(mark=>{const index=remaining.lastIndexOf(mark,limit);return index<0?-1:index+mark.length;});
  let cut=Math.max(...candidates);
  let sentenceStart=false;
  if(!parts.length){
   const firstStop=['. ','? ','! '].map(mark=>remaining.indexOf(mark)).filter(index=>index>=18&&index<limit);
   if(firstStop.length){cut=Math.min(...firstStop)+2;sentenceStart=true;}
  }
  if(cut<28&&!sentenceStart)cut=remaining.lastIndexOf(' ',limit);
  if(cut<1)cut=limit;
  const part=remaining.slice(0,cut).trim();
  if(part)parts.push(part);
  remaining=remaining.slice(cut).trimStart();
 }
 return parts;
}

function remember(key,audio,rate){
 if(audioCache.has(key))return;
 audioCache.set(key,{audio,rate});cachedBytes+=audio.length;
 while(cachedBytes>MAX_CACHE_BYTES){
  const oldest=audioCache.keys().next().value;
  cachedBytes-=audioCache.get(oldest).audio.length;audioCache.delete(oldest);
 }
}

// Only developer-selected, non-personal phrases are stored across restarts.
try{
 const directory=path.resolve(import.meta.dirname,'../data/voice-cache');
 const manifest=JSON.parse(readFileSync(path.join(directory,'manifest.json'),'utf8'));
 for(const item of manifest){
  if(typeof item.text!=='string'||item.rate!==24000)continue;
  const name=createHash('sha256').update(item.text).digest('hex')+'.pcm';
  const audio=readFileSync(path.join(directory,name));
  if(audio.length>0&&audio.length%2===0)remember(`ms:${item.text}`,audio,item.rate);
 }
}catch{/* No pre-rendered phrases yet. */}

export function handleAssistantSocket(ws,{port,tts,gpuHandoff=withSpeechGpu}){
 const controller=new AbortController();
 let started=false;
 const send=event=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(event));};
 ws.on('close',()=>controller.abort());
 ws.on('error',()=>controller.abort());
 ws.on('message',async(raw,binary)=>{
  if(binary||started){ws.close(1003);return;}
  started=true;
  let request;
  try{request=JSON.parse(String(raw));}catch{ws.close(1003);return;}
  const question=request?.text;
  if(request?.type!=='ask'||typeof question!=='string'||!question.trim()||question.length>4000){ws.close(1003);return;}
  try{
   const response=await fetch(`http://127.0.0.1:${port}/api/assistant`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text:question.trim()}),
    signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)])
   });
   const answer=await response.json();
   if(!response.ok)throw new Error(answer.error||`Jawapan AIMAN gagal (${response.status}).`);
   send({type:'answer',...answer});
   if(!request.voice){send({type:'done'});ws.close(1000);return;}
   const parts=speechSegments(answer.text);
   const emit=(seq,text,entry)=>{
    send({type:'speech_segment',seq,text,rate:entry.rate});
    const packet=Buffer.allocUnsafe(8+entry.audio.length);
    packet.writeUInt32LE(seq,0);packet.writeUInt32LE(entry.rate,4);entry.audio.copy(packet,8);
    if(ws.readyState===WebSocket.OPEN)ws.send(packet,{binary:true});
   };
   const firstMissing=parts.findIndex(text=>!audioCache.has(`ms:${text}`));
   const cachedPrefix=firstMissing<0?parts.length:firstMissing;
   for(let seq=0;seq<cachedPrefix;seq++)emit(seq,parts[seq],audioCache.get(`ms:${parts[seq]}`));
   if(firstMissing>=0)await gpuHandoff(async()=>{for(let seq=firstMissing;seq<parts.length;seq++){
    if(controller.signal.aborted)return;
    const text=parts[seq];
    const cacheKey=`ms:${text}`;
    let entry=audioCache.get(cacheKey);
    if(!entry){
     send({type:'preparing',seq});
     const speech=await fetch(tts+'/speech',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),
      signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])
     });
     if(!speech.ok)throw new Error(`Suara Chatterbox tidak tersedia (${speech.status}).`);
     const audio=Buffer.from(await speech.arrayBuffer());
     if(!audio.length||audio.length>8*1024*1024||audio.length%2)throw new Error('Audio Chatterbox tidak sah.');
     entry={audio,rate:Number(speech.headers.get('x-audio-sample-rate')||24000)};
     remember(cacheKey,audio,entry.rate);
    }
    emit(seq,text,entry);
   }});
   send({type:'done'});ws.close(1000);
  }catch(error){
   if(controller.signal.aborted)return;
   send({type:'error',message:error.message});ws.close(1011);
  }
 });
}
