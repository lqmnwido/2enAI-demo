// A single local user shares one 6 GB GPU. Keep the handoff serialized so
// speech synthesis cannot race with a Qwen request or another speech turn.
let previous=Promise.resolve();
const endpoint={
 chat:new URL(process.env.LLM_BASE_URL||'http://127.0.0.1:8000/v1').origin,
 asr:new URL(process.env.ASR_HEALTH_URL||'http://127.0.0.1:8001/health').origin,
 tts:new URL(process.env.TTS_BASE_URL||'http://127.0.0.1:8091').origin,
};
async function post(url){
 const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error(`GPU handoff failed (${response.status}): ${url}`);
 const body=await response.text();
 return body?JSON.parse(body):{};
}
async function reachable(url){
 try{const response=await fetch(url,{signal:AbortSignal.timeout(1500)});return response.ok;}catch{return false;}
}
export async function ensureAsrReady(){
 // A microphone request may arrive while TTS owns the GPU. Wait for that
 // handoff, then recover an ASR worker whose automatic wake did not stick.
 await previous;
 const health=async()=>{
  const response=await fetch(endpoint.asr+'/health',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error(`Qwen ASR health returned ${response.status}`);
  return response.json();
 };
 let state=await health();
 if(state.sleeping){await post(endpoint.asr+'/wake_up');state=await health();}
 if(!state.ready)throw new Error('Qwen ASR tempatan belum sedia.');
 return state;
}
export async function withSpeechGpu(work){
 const wait=previous;let release;
 previous=new Promise(resolve=>{release=resolve;});
 await wait;
 const started=Date.now();
 const sleeping=[];
 try{
  // Chat is no longer needed after its answer has been returned. ASR has
  // finished the user's turn before TTS starts.
  for(const [name,health] of [['chat','/v1/models'],['asr','/health']]){
   if(!await reachable(endpoint[name]+health))continue;
   await post(endpoint[name]+'/sleep'+(name==='chat'?'?level=1':''));
   sleeping.push(name);
  }
  await post(endpoint.tts+'/activate');
  console.log(`GPU handoff active in ${Date.now()-started} ms`);
  return await work();
 }finally{
  const elapsed=Date.now()-started;
  await post(endpoint.tts+'/deactivate').catch(()=>{});
  const wakeResults=await Promise.allSettled(sleeping.reverse().map(name=>post(endpoint[name]+'/wake_up')));
  wakeResults.forEach((result,index)=>{if(result.status==='rejected')console.error(`GPU wake failed for ${sleeping[index]}:`,result.reason);});
  console.log(`GPU handoff finished: work=${elapsed} ms, total=${Date.now()-started} ms`);
  release();
 }
}
