import 'dotenv/config';
import express from 'express';
import {createServer} from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {researchRoutes} from './research-routes.js';
import {handleAssistantSocket} from './assistant-stream.js';
import {withSpeechGpu,ensureAsrReady} from './gpu-handoff.js';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app=express();app.use(express.json({limit:'15mb'}));
const cfg={asr:process.env.ASR_WS_URL||'ws://127.0.0.1:8001/stream',asrHealth:process.env.ASR_HEALTH_URL||'http://127.0.0.1:8001/health',llm:process.env.LLM_BASE_URL||'http://127.0.0.1:8000/v1',tts:process.env.TTS_BASE_URL||'http://127.0.0.1:8091',chatModel:process.env.LLM_MODEL||'Qwen/Qwen3-0.6B',ttsModel:'ResembleAI/Chatterbox-Multilingual'};
const headers={'Content-Type':'application/json',...(process.env.VLLM_API_KEY?{Authorization:`Bearer ${process.env.VLLM_API_KEY}`}:{})};
cfg.vision=process.env.VISION_BASE_URL||'http://127.0.0.1:8002';cfg.visionModel=process.env.VISION_MODEL||'culturalheritagenus/Jawi-OCR-Kraken-v1';
for(const [name,url] of Object.entries({asr:cfg.asr,asrHealth:cfg.asrHealth,llm:cfg.llm,tts:cfg.tts,vision:cfg.vision})){
 const endpoint=new URL(url);
 if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw new Error(`${name} must use a local Qwen/vLLM endpoint; received ${endpoint.hostname}`);
}
app.use((req,res,next)=>{const origin=req.headers.origin;if(origin&&!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return res.status(403).json({error:'Only local app origins are allowed.'});next();});
app.get('/api/health',async(req,res)=>{
 const checks=await Promise.all(Object.entries({asr:cfg.asrHealth,chat:cfg.llm+'/models',tts:cfg.tts+'/health',vision:cfg.vision+'/health'}).map(async([name,url])=>{
  try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(2500)});const state=await r.json();return[name,{ready:r.ok&&state.ready!==false,status:state.sleeping?'busy':r.ok&&state.ready!==false?'ready':'offline'}];}catch{return[name,{ready:false,status:'offline'}];}
 }));res.json({engine:'vLLM',services:Object.fromEntries(checks.map(([name,state])=>[name,state.ready])),states:Object.fromEntries(checks.map(([name,state])=>[name,state.status])),models:{chat:cfg.chatModel,tts:cfg.ttsModel}});
});
app.post('/api/asr/ready',async(req,res)=>{
 try{await ensureAsrReady();res.json({ready:true});}
 catch(error){res.status(503).json({ready:false,error:error.message});}
});
app.post('/api/speech',async(req,res)=>{
 const text=req.body.text;
 if(typeof text!=='string'||!text.trim()||text.length>2000)return res.status(400).json({error:'Speech text must contain 1–2000 characters.'});
 const controller=new AbortController();res.on('close',()=>controller.abort());
 try{
  await withSpeechGpu(async()=>{
   const r=await fetch(cfg.tts+'/speech',{method:'POST',headers,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)]),body:JSON.stringify({text})});
   if(!r.ok)throw new Error(`Local Chatterbox service returned ${r.status}: ${(await r.text()).slice(0,240)}`);
   res.set({'Content-Type':'application/octet-stream','X-Audio-Sample-Rate':r.headers.get('x-audio-sample-rate')||'24000','Cache-Control':'no-store'});
   for await(const chunk of r.body){if(res.destroyed)break;if(!res.write(chunk))await once(res,'drain',{signal:controller.signal});}res.end();
  });
 }catch(e){if(!res.headersSent&&!res.destroyed)res.status(503).json({error:`${e.message}. Semak servis Chatterbox tempatan.`});else res.destroy();}
});
researchRoutes(app,cfg,headers);
app.use(express.static(path.join(root,'dist')));
app.get('/{*path}',(req,res)=>res.sendFile(path.join(root,'dist','index.html')));
const server=createServer(app);
const wss=new WebSocketServer({noServer:true,maxPayload:65536});
const answerWss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
 if((req.url!=='/asr'&&req.url!=='/assistant-stream')||(req.headers.origin&&!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin))){socket.destroy();return;}
 const target=req.url==='/asr'?wss:answerWss;
 target.handleUpgrade(req,socket,head,ws=>target.emit('connection',ws));
});
answerWss.on('connection',ws=>handleAssistantSocket(ws,{port:Number(process.env.PORT||3001),tts:cfg.tts}));
wss.on('connection',client=>{
 const upstream=new WebSocket(cfg.asr,{handshakeTimeout:8000,maxPayload:65536});
 const send=data=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(data));};
 upstream.on('message',(data,binary)=>{if(client.readyState===WebSocket.OPEN)client.send(data,{binary});});
 upstream.on('error',()=>{send({type:'error',message:'Local Qwen ASR is unavailable. Start the vLLM ASR worker.'});client.close(1011);});
 upstream.on('close',()=>client.close());
 client.on('message',(data,binary)=>{
  if(upstream.readyState!==WebSocket.OPEN)return;
  if(upstream.bufferedAmount>256000){send({type:'error',message:'ASR is falling behind. Please restart the microphone.'});client.close(1013);return;}
  if(binary){if(data.length%2===0)upstream.send(data,{binary:true});return;}
  try{const message=JSON.parse(data);if(['finish','reset'].includes(message.type))upstream.send(JSON.stringify(message));}catch{client.close(1003);}
 });
 client.on('error',()=>upstream.close());client.on('close',()=>upstream.close());
});
const port=Number(process.env.PORT||3001);server.listen(port,'127.0.0.1',()=>console.log(`AIMAN local gateway: http://127.0.0.1:${port}`));
