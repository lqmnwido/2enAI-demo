import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {speechSegments,handleAssistantSocket} from '../server/assistant-stream.js';

test('speech segments preserve the answer in playback order',()=>{
 const answer='Aiman membuka halaman aduan. Sila semak sumber [1] sebelum membuat keputusan. '+
  'Arkib Negara menyatakan bahawa dokumen asal perlu dirujuk untuk menentukan peristiwa sebenar.';
 const parts=speechSegments(answer);
 assert.ok(parts.length>1);
 assert.equal(parts.join(' '),answer);
 assert.ok(parts.every(part=>part.length<=210));
});

test('answer socket keeps speech frames paired with the grounded answer',async()=>{
 const answer='Petikan Arkib: peristiwa ini direkodkan pada tahun 1948.';
 const pcm=Buffer.from([1,0,2,0,3,0,4,0]);
 const server=createServer(async(req,res)=>{
  if(req.url==='/api/assistant'){
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({text:answer,sources:[{id:'arkib-1'}],kind:'grounded'}));
  }else if(req.url==='/speech'){
   res.setHeader('Content-Type','application/octet-stream');res.setHeader('X-Audio-Sample-Rate','24000');res.end(pcm);
  }else res.writeHead(404).end();
 });
 const wss=new WebSocketServer({noServer:true});
 server.on('upgrade',(req,socket,head)=>wss.handleUpgrade(req,socket,head,ws=>handleAssistantSocket(ws,{port:server.address().port,tts:`http://127.0.0.1:${server.address().port}`,gpuHandoff:fn=>fn()})));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const client=new WebSocket(`ws://127.0.0.1:${server.address().port}`);
 const events=[];
 try{
  await once(client,'open');
  client.on('message',(data,binary)=>events.push(binary?{binary:Buffer.from(data)}:JSON.parse(String(data))));
  client.send(JSON.stringify({type:'ask',text:'Soalan Arkib',voice:true}));
  await once(client,'close');
  assert.equal(events[0].type,'answer');
  assert.equal(events[0].text,answer);
  assert.deepEqual(events[0].sources,[{id:'arkib-1'}]);
  const segment=events.find(event=>event.type==='speech_segment');
  assert.equal(segment.seq,0);
  assert.equal(segment.text,answer);
  const frame=events.find(event=>event.binary)?.binary;
  assert.ok(frame);
  assert.equal(frame.readUInt32LE(0),segment.seq);
  assert.equal(frame.readUInt32LE(4),24000);
  assert.deepEqual(frame.subarray(8),pcm);
  assert.equal(events.at(-1).type,'done');
 }finally{client.close();wss.close();server.close();}
});
