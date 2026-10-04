"""Local Malay Chatterbox TTS. No browser or hosted speech fallback."""
import logging
import os
import re
import gc
import ctypes
import threading
import time
from pathlib import Path
from contextlib import asynccontextmanager

import numpy as np
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
VOICE = ROOT / "inference/voice/aiman-voice-prompt.wav"
MODEL = None
SAMPLE_RATE = 24000
ERROR = ""
DEVICE = "cpu"
IDLE_FP16 = os.getenv("CHATTERBOX_IDLE_FP16", "1") == "1"
GENERATE_LOCK = threading.Lock()
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("aiman-tts")


def load_model():
    global MODEL, SAMPLE_RATE, ERROR, DEVICE
    try:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        device = os.getenv("CHATTERBOX_DEVICE", "cpu")
        if device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("CUDA tidak tersedia")
        MODEL = ChatterboxMultilingualTTS.from_pretrained(device=device)
        DEVICE = device
        gc.collect()
        if os.name == "posix":
            ctypes.CDLL("libc.so.6").malloc_trim(0)
        SAMPLE_RATE = int(MODEL.sr)
        if "ms" not in MODEL.get_supported_languages():
            raise RuntimeError("Model Chatterbox yang dipasang tidak menyokong Bahasa Melayu")
        if not VOICE.is_file():
            raise FileNotFoundError(f"Sampel suara tidak ditemui: {VOICE}")
        with torch.inference_mode():
            MODEL.prepare_conditionals(str(VOICE), exaggeration=0.5)
        # Voice embedding is fixed for this single-user demo; the encoder is
        # unused after prepare_conditionals and can release GPU allocation.
        MODEL.ve = None
        if device == "cpu" and IDLE_FP16:
            MODEL.t3.half()
            MODEL.s3gen.half()
        gc.collect()
        if os.name == "posix":
            ctypes.CDLL("libc.so.6").malloc_trim(0)
        if device.startswith("cuda"):
            torch.cuda.empty_cache()
        log.info("Chatterbox Multilingual sedia: device=%s, language=ms, sample_rate=%s", device, SAMPLE_RATE)
    except Exception as exc:
        ERROR = str(exc)
        MODEL = None
        log.exception("Chatterbox gagal dimuatkan")


@asynccontextmanager
async def lifespan(_app):
    import asyncio
    await asyncio.to_thread(load_model)
    yield


app = FastAPI(lifespan=lifespan)


class SpeechInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@app.get("/health")
def health():
    return {"ready": MODEL is not None, "device": DEVICE, "engine": "chatterbox", "language": "ms", "reference": VOICE.name, "error": ERROR}


@app.post("/activate")
def activate():
    global DEVICE
    if MODEL is None:
        raise HTTPException(503, "Chatterbox tidak tersedia: " + ERROR)
    with GENERATE_LOCK:
        if DEVICE != "cuda":
            if not torch.cuda.is_available():
                raise HTTPException(503, "CUDA tidak tersedia")
            started = time.perf_counter()
            MODEL.t3.to(device="cuda", dtype=torch.float32)
            MODEL.s3gen.to(device="cuda", dtype=torch.float32)
            MODEL.conds.to("cuda")
            MODEL.device = DEVICE = "cuda"
            log.info("TTS GPU activation: %.2fs", time.perf_counter()-started)
    return {"device": DEVICE}


@app.post("/deactivate")
def deactivate():
    global DEVICE
    if MODEL is None:
        raise HTTPException(503, "Chatterbox tidak tersedia")
    with GENERATE_LOCK:
        if DEVICE == "cuda":
            started = time.perf_counter()
            MODEL.t3.to(device="cpu", dtype=torch.float16 if IDLE_FP16 else torch.float32)
            MODEL.s3gen.to(device="cpu", dtype=torch.float16 if IDLE_FP16 else torch.float32)
            MODEL.conds.to("cpu")
            MODEL.device = DEVICE = "cpu"
            torch.cuda.empty_cache()
            log.info("TTS CPU deactivation: %.2fs", time.perf_counter()-started)
    return {"device": DEVICE}


def chunks(text):
    remaining = re.sub(r"\s+", " ", text).strip()
    while remaining:
        if len(remaining) <= 280:
            yield remaining
            break
        cut = max(remaining.rfind(mark, 0, 280) for mark in (". ", "? ", "! ", "; ", ", "))
        if cut < 80:
            cut = remaining.rfind(" ", 0, 280)
        if cut < 1:
            cut = 280
        boundary = cut + 1 if remaining[cut:cut + 1] in ".?!;," else cut
        yield remaining[:boundary].strip()
        remaining = remaining[boundary:].strip()


def synthesize(text):
    with GENERATE_LOCK, torch.inference_mode():
        started=time.perf_counter()
        clips = []
        for part in chunks(text):
            audio = MODEL.generate(part, language_id="ms", cfg_weight=0.3)
            clips.append(audio.detach().float().cpu().numpy().reshape(-1))
            clips.append(np.zeros(int(SAMPLE_RATE * 0.11), dtype=np.float32))
        pcm = np.clip(np.concatenate(clips), -1, 1)
        log.info("TTS generation: %.2fs, text=%d chars", time.perf_counter()-started, len(text))
        return (pcm * 32767).astype("<i2").tobytes()


@app.post("/speech")
async def speech(request: SpeechInput):
    if MODEL is None:
        raise HTTPException(503, "Chatterbox tempatan belum sedia: " + ERROR)
    import asyncio
    try:
        audio = await asyncio.to_thread(synthesize, request.text)
    except Exception as exc:
        log.exception("Penjanaan suara gagal")
        raise HTTPException(503, str(exc)) from exc
    return Response(audio, media_type="application/octet-stream", headers={"X-Audio-Sample-Rate": str(SAMPLE_RATE), "Cache-Control": "no-store"})
