// Live protocol check against the local Qwen3ASRModel.LLM WebSocket worker.
import {readFile} from 'node:fs/promises';
import WebSocket from 'ws';
const wav=await readFile(process.argv[2]||new URL('../renders/aiman-voice-sample.wav',import.meta.url));
let offset=12,rate=0,pcm=null;
while(offset+8<=wav.length){
 const tag=wav.toString('ascii',offset,offset+4),size=wav.readUInt32LE(offset+4);
 if(tag==='fmt ')rate=wav.readUInt32LE(offset+12);
 if(tag==='data')pcm=wav.subarray(offset+8,offset+8+size);
 offset+=8+size+(size%2);
}
if(rate!==24000||!pcm)throw new Error('Expected 24 kHz PCM WAV sample.');
const ws=new WebSocket('ws://127.0.0.1:3001/asr');
const events=[];const start=Date.now();
ws.on('message',async raw=>{
 const event=JSON.parse(raw);events.push({type:event.type,text:event.text,ms:Date.now()-start});
 if(event.type==='ready'){
  for(let chunk=0;chunk<Math.ceil(pcm.length/4800);chunk++){
   const bytes=Buffer.alloc(3200);
   for(let i=0;i<1600;i++){
    const src=Math.floor((chunk*1600+i)*1.5)*2;
    if(src+2<=pcm.length)bytes.writeInt16LE(pcm.readInt16LE(src),i*2);
   }
   ws.send(bytes);await new Promise(resolve=>setTimeout(resolve,100));
  }
  for(let i=0;i<5;i++){ws.send(Buffer.alloc(3200));await new Promise(resolve=>setTimeout(resolve,100));}
  await new Promise(resolve=>setTimeout(resolve,1500));ws.send(JSON.stringify({type:'finish'}));
 }
});
ws.on('close',()=>{console.log(JSON.stringify(events));if(!events.some(e=>e.type==='ready')||!events.some(e=>e.type==='speech_start'))process.exitCode=1;});
setTimeout(()=>{if(ws.readyState===WebSocket.OPEN)ws.close();},30000);
