// Live answer/audio alignment through the app's WebSocket and GPU handoff.
import WebSocket from 'ws';

const ws=new WebSocket('ws://127.0.0.1:3001/assistant-stream');
const events=[];const frames=[];const started=Date.now();let firstAudioMs=null,answerMs=null;
ws.on('open',()=>ws.send(JSON.stringify({type:'ask',text:process.argv[2]||'Buka e-Aduan',voice:true})));
ws.on('message',(raw,binary)=>{
 if(binary){firstAudioMs??=Date.now()-started;frames.push({seq:raw.readUInt32LE(0),rate:raw.readUInt32LE(4),bytes:raw.length-8});return;}
 const event=JSON.parse(String(raw));if(event.type==='answer')answerMs=Date.now()-started;events.push(event);
});
await new Promise((resolve,reject)=>{
 ws.once('close',resolve);ws.once('error',reject);
 setTimeout(()=>reject(new Error('Timed out waiting for local voice answer')),120000);
});
const answer=events.find(event=>event.type==='answer');
const spoken=events.filter(event=>event.type==='speech_segment');
const errors=events.filter(event=>event.type==='error');
const result={elapsedSeconds:Math.round((Date.now()-started)/1000),answerSeconds:answerMs/1000,firstAudioSeconds:firstAudioMs/1000,answer:answer?.text,segments:spoken.length,frames,errors,done:events.some(event=>event.type==='done')};
console.log(JSON.stringify(result));
if(!answer||!spoken.length||!result.done||errors.length||frames.length!==spoken.length||frames.some((frame,index)=>frame.seq!==spoken[index].seq||frame.rate!==24000||frame.bytes<1000))process.exitCode=1;
