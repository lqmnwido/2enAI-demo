import {useCallback,useEffect,useRef,useState} from 'react';
import {PCMPlayer,openMicrophone} from './audio';
export function useAiman(navigate){
 const [health,setHealth]=useState({services:{}}),[messages,setMessages]=useState([]),[mode,setMode]=useState('idle'),[mic,setMic]=useState(false),[micPending,setMicPending]=useState(false),[micLevels,setMicLevels]=useState(Array(28).fill(0)),[partial,setPartial]=useState(''),[error,setError]=useState(''),[gesture,setGesture]=useState(null),[voice,setVoice]=useState(true);
 const player=useRef(null),audio=useRef(null),controller=useRef(null),socket=useRef(null),answerSocket=useRef(null),capture=useRef(null),busy=useRef(false),epoch=useRef(0),sendRef=useRef(null),dictation=useRef(null);
 const refresh=useCallback(async()=>{try{const r=await fetch('/api/health');if(r.ok)setHealth(await r.json());}catch{setHealth({services:{}});}},[]);
 useEffect(()=>{refresh();const id=setInterval(refresh,15000);return()=>clearInterval(id);},[refresh]);
 const ensureAudio=async()=>{if(!audio.current){audio.current=new AudioContext();player.current=new PCMPlayer(audio.current);}await audio.current.resume();};
 const animate=name=>setGesture({name,id:performance.now()});
 const greet=useCallback(async()=>{
  const greeting='Hai! Saya Aiman! Ae Ai Assistant anda!';
  try{
   const recorded=await fetch('/audio/aiman-greeting.wav');
   if(recorded.ok){
    await ensureAudio();
    const blob=await recorded.blob(),url=URL.createObjectURL(blob),sound=new Audio(url);
    const source=audio.current.createMediaElementSource(sound);
    source.connect(player.current.analyser);
    let finish;
    const ended=new Promise(resolve=>{finish=resolve;});
    sound.onended=()=>{source.disconnect();URL.revokeObjectURL(url);finish(true);};
    sound.onerror=()=>{source.disconnect();URL.revokeObjectURL(url);finish(false);};
    try{await sound.play();return await ended;}
    catch(error){source.disconnect();URL.revokeObjectURL(url);throw error;}
   }
   if(health.services.tts){await ensureAudio();const response=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:greeting})});if(response.ok){await player.current.play(response,undefined,()=>{});return true;}}
  }catch{/* Offer a replay button when browser audio is blocked. */}
  return false;
 },[health.services.tts]);
 const presentComplaint=useCallback(async()=>{
  animate('Nod');
  try{
   await ensureAudio();
   const response=await fetch('/audio/aiman-analysis-ready.wav');
   if(!response.ok)throw new Error('Klip suara AIMAN tidak tersedia.');
   const buffer=await audio.current.decodeAudioData(await response.arrayBuffer());
   const source=audio.current.createBufferSource();
   source.buffer=buffer;source.connect(player.current.analyser);
   setMode('speaking');
   await new Promise(resolve=>{source.onended=resolve;source.start();});
   source.disconnect();
  }catch(error){setError(error.message);}
  finally{setMode('idle');}
 },[]);
 const stop=()=>{controller.current?.abort();answerSocket.current?.close();player.current?.stop();};
 const closeMic=useCallback((finish=false)=>{
  epoch.current++;capture.current?.();capture.current=null;const ws=socket.current;socket.current=null;
  if(ws?.readyState===WebSocket.OPEN&&finish){ws.send(JSON.stringify({type:'finish'}));setTimeout(()=>ws.close(),8000);}else ws?.close();
  setMic(false);setMicPending(false);setMicLevels(Array(28).fill(0));setPartial('');
 },[]);
 useEffect(()=>()=>{controller.current?.abort();capture.current?.();socket.current?.close();answerSocket.current?.close();player.current?.stop();audio.current?.close();},[]);
 const send=async(text)=>{
  text=text.trim();if(!text||busy.current)return;
  busy.current=true;setError('');setPartial('');setMode('thinking');
  if(socket.current?.readyState===WebSocket.OPEN)socket.current.send(JSON.stringify({type:'reset'}));
  const request=new AbortController();controller.current=request;
  setMessages(m=>[...m,{role:'user',text}]);
  try{
   const wantsAudio=voice&&!!health.services.tts;
   if(wantsAudio)await ensureAudio();
   await new Promise((resolve,reject)=>{
    const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/assistant-stream`);
    answerSocket.current=ws;ws.binaryType='arraybuffer';
    let answered=false,done=false,settled=false,playback=Promise.resolve();
    const segments=new Map();
    const finish=()=>{if(settled)return;settled=true;answerSocket.current=null;resolve();};
    const fail=error=>{if(settled)return;settled=true;answerSocket.current=null;ws.close();reject(error);};
    request.signal.addEventListener('abort',()=>fail(new DOMException('Cancelled','AbortError')),{once:true});
    ws.onopen=()=>ws.send(JSON.stringify({type:'ask',text,voice:wantsAudio}));
    ws.onerror=()=>fail(new Error('Sambungan AIMAN terputus.'));
    ws.onclose=()=>{if(!done&&!settled)fail(new Error('Sambungan AIMAN terputus sebelum jawapan lengkap.'));};
    ws.onmessage=event=>{
     if(typeof event.data!=='string'){
      const frame=event.data,view=new DataView(frame),seq=view.getUint32(0,true),rate=view.getUint32(4,true);
      if(!segments.has(seq)||!wantsAudio)return;
      segments.delete(seq);
      const response=new Response(frame.slice(8),{headers:{'X-Audio-Sample-Rate':String(rate)}});
      playback=playback.then(()=>player.current.play(response,request.signal,()=>setMode('speaking')));
      playback.catch(fail);
      return;
     }
     const message=JSON.parse(event.data);
     if(message.type==='answer'){
      answered=true;setMessages(m=>[...m,{role:'assistant',...message}]);
      if(message.action?.type==='navigate'){animate('Wave');navigate(message.action.page);}
      else animate(message.kind==='no-evidence'?'HeadShake':'Nod');
      if(wantsAudio)setMode('preparing');
     }else if(message.type==='preparing')setMode('preparing');
     else if(message.type==='speech_segment')segments.set(message.seq,message.text);
     else if(message.type==='error'){
      if(answered){setError(message.message+' Jawapan teks masih boleh dibaca.');done=true;playback.then(finish).catch(fail);}
      else fail(new Error(message.message));
     }else if(message.type==='done'){done=true;playback.then(finish).catch(fail);}
    };
   });
  }catch(e){if(e.name!=='AbortError')setError(e.message);}
  finally{busy.current=false;setMode('idle');controller.current=null;}
 };
 sendRef.current=send;
 const toggleMic=async(onTranscript=null)=>{
  if(mic||micPending){closeMic(true);return;}
  const current=++epoch.current;dictation.current=onTranscript;setMicPending(true);setError('');
  try{
   const ready=await fetch('/api/asr/ready',{method:'POST',signal:AbortSignal.timeout(120000)});
   const result=await ready.json();
   if(!ready.ok||!result.ready)throw new Error(result.error||'Qwen ASR tempatan belum sedia.');
   if(current!==epoch.current)return;
   setMicPending(false);setMic(true);refresh();
   await ensureAudio();const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/asr`);socket.current=ws;
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Sambungan ASR tamat masa.')),15000);
    ws.onerror=()=>{clearTimeout(timer);reject(new Error('Sambungan ASR gagal.'));};ws.onclose=()=>{clearTimeout(timer);reject(new Error('ASR belum bersedia.'));};
    ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.type==='ready'){clearTimeout(timer);resolve();}if(d.type==='error'){clearTimeout(timer);reject(new Error(d.message));}};
   });
   if(current!==epoch.current){ws.close();return;}
   ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.type==='error'){setError(d.message);closeMic();}if(busy.current)return;if(d.type==='partial')setPartial(d.text);if(d.type==='final'){setPartial('');if(dictation.current)dictation.current(d.text);else sendRef.current(d.text);}};
   ws.onerror=()=>{setError('Sambungan mikrofon terputus.');closeMic();};ws.onclose=()=>{if(socket.current===ws)closeMic();};
   const release=await openMicrophone(audio.current,pcm=>{if(ws.readyState!==WebSocket.OPEN||busy.current)return;if(ws.bufferedAmount>128000){setError('ASR tidak dapat memproses audio dengan cukup pantas.');closeMic();return;}
    const samples=new Int16Array(pcm);let power=0;for(let i=0;i<samples.length;i+=4){const value=samples[i]/32768;power+=value*value;}
    const level=Math.min(1,Math.sqrt(power/Math.ceil(samples.length/4))*7);
    setMicLevels(levels=>[...levels.slice(1),level]);ws.send(pcm);
   });
   if(current!==epoch.current)release();else capture.current=release;
  }catch(e){if(current===epoch.current){setError(e.message);closeMic();}}
 };
 return {health,refresh,messages,mode,mic,micPending,micLevels,partial,error,setError,gesture,player,send,stop,toggleMic,closeMic,animate,voice,setVoice,greet,presentComplaint,prepareAudio:ensureAudio};
}
