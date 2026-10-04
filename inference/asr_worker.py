"""Local Qwen ASR streaming worker. Inference exclusively uses vLLM.
Wire format: binary signed little-endian PCM16, mono 16 kHz; JSON finish/reset.
"""
import asyncio, os, json, logging, wave
from pathlib import Path
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from qwen_asr import Qwen3ASRModel

executor=ThreadPoolExecutor(max_workers=1)
model=None
sleeping=False
log=logging.getLogger('aiman-asr')
def warmup():
    sample=Path(__file__).resolve().parents[1]/'renders/aiman-voice-sample.wav'
    if not sample.exists():return
    with wave.open(str(sample),'rb') as wav:
        rate=wav.getframerate()
        raw=wav.readframes(min(wav.getnframes(),rate))
    pcm=np.frombuffer(raw,dtype='<i2').astype(np.float32)/32768
    if rate!=16000:
        pcm=np.interp(np.arange(int(len(pcm)*16000/rate))*rate/16000,np.arange(len(pcm)),pcm).astype(np.float32)
    state=model.init_streaming_state(language=os.getenv('ASR_LANGUAGE','Malay'),chunk_size_sec=.5,unfixed_chunk_num=2,unfixed_token_num=5)
    model.streaming_transcribe(pcm[:9600],state)
    model.finish_streaming_transcribe(state)
async def infer(fn,*args):
    return await asyncio.get_running_loop().run_in_executor(executor,fn,*args)
@asynccontextmanager
async def lifespan(app):
    global model
    model=await infer(lambda:Qwen3ASRModel.LLM(model=os.getenv('ASR_MODEL','Qwen/Qwen3-ASR-0.6B'),dtype='float16',gpu_memory_utilization=float(os.getenv('ASR_GPU_MEMORY','0.35')),max_model_len=int(os.getenv('ASR_MAX_MODEL_LEN','1024')),max_num_batched_tokens=int(os.getenv('ASR_MAX_BATCHED_TOKENS','512')),max_num_seqs=1,swap_space=0,max_new_tokens=64,enforce_eager=True,enable_sleep_mode=True))
    try:await infer(warmup)
    except Exception:log.exception('ASR warmup failed; live transcription remains available')
    yield
    executor.shutdown(wait=False)
app=FastAPI(lifespan=lifespan)
@app.get('/health')
def health():return {'ready':model is not None and not sleeping,'sleeping':sleeping,'engine':'vllm','model':os.getenv('ASR_MODEL','Qwen/Qwen3-ASR-0.6B')}
@app.post('/sleep')
async def sleep():
    global sleeping
    if model is None:return {'ready':False}
    if not sleeping:
        await infer(model.model.sleep,1)
        sleeping=True
    return {'sleeping':True}
@app.post('/wake_up')
async def wake_up():
    global sleeping
    if model is None:return {'ready':False}
    if sleeping:
        await infer(model.model.wake_up)
        sleeping=False
    return {'ready':True}
@app.websocket('/stream')
async def stream(ws:WebSocket):
    if sleeping:
        await ws.close(code=1013,reason='ASR sedang menyediakan suara')
        return
    await ws.accept()
    def fresh():return model.init_streaming_state(language=os.getenv('ASR_LANGUAGE','Malay'),chunk_size_sec=.5,unfixed_chunk_num=2,unfixed_token_num=5)
    state=fresh();spoken=False;silence=0;duration=0;last='';pending=[];buffered=0;started=False
    await ws.send_json({'type':'ready'})
    async def final():
        nonlocal state,spoken,silence,duration,last,pending,buffered,started
        if spoken:
            if pending: await infer(model.streaming_transcribe,np.concatenate(pending),state)
            await infer(model.finish_streaming_transcribe,state)
            if state.text.strip():await ws.send_json({'type':'final','text':state.text.strip()})
        state=fresh();spoken=False;silence=0;duration=0;last='';pending=[];buffered=0;started=False
    try:
        while True:
            packet=await ws.receive()
            if packet['type']=='websocket.disconnect':break
            if packet.get('bytes') is not None:
                raw=packet['bytes']
                # Exactly 1,600 PCM16 samples: one 100 ms frame at 16 kHz.
                if len(raw)!=3200:await ws.close(code=1003);break
                audio=np.frombuffer(raw,dtype='<i2').astype(np.float32)/32768
                if not len(audio):continue
                rms=float(np.sqrt(np.mean(audio*audio)));secs=len(audio)/16000
                if rms>float(os.getenv('ASR_VAD_RMS','0.012')):
                    if not spoken:await ws.send_json({'type':'speech_start'})
                    spoken=True;silence=0
                elif spoken:silence+=secs
                if spoken:
                    duration+=secs
                    pending.append(audio);buffered+=secs
                    # Transport stays at 100 ms; vLLM receives its preferred
                    # 500 ms streaming blocks after the initial 600 ms gate.
                    target=.5 if started else .6
                    if buffered>=target-1e-6:
                        await infer(model.streaming_transcribe,np.concatenate(pending),state)
                        pending=[];buffered=0;started=True
                    if state.text!=last:
                        last=state.text;await ws.send_json({'type':'partial','text':last})
                    if silence>=.4-1e-6 or duration>=25:await final()
            elif packet.get('text'):
                event=json.loads(packet['text'])
                if event.get('type')=='finish':await final();await ws.close();break
                if event.get('type')=='reset':state=fresh();spoken=False;silence=0;duration=0;last='';pending=[];buffered=0;started=False
    except WebSocketDisconnect:pass
    except Exception:
        try:await ws.send_json({'type':'error','message':'ASR inference failed. Check the worker logs.'});await ws.close(code=1011)
        except Exception:pass

if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=int(os.getenv('ASR_PORT','8001')),ws_max_size=65536,ws_max_queue=8)
