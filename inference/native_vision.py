"""Qwen3-VL handwriting and Jawi inference through local Transformers."""
import base64
import ctypes
import gc
import io
import json
import logging
import os
import re
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from PIL import Image

MODEL_ID = os.getenv("VISION_MODEL", "Qwen/Qwen3-VL-2B-Instruct")
MODEL = None
PROCESSOR = None
ERROR = ""
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("aiman-vision")
Image.MAX_IMAGE_PIXELS = 12_000_000


def load_model():
    global MODEL, PROCESSOR, ERROR
    try:
        from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration
        torch.set_num_threads(min(4, os.cpu_count() or 1))
        PROCESSOR = AutoProcessor.from_pretrained(MODEL_ID)
        device = os.getenv("VISION_DEVICE", "auto")
        kwargs = {"device_map": device, "attn_implementation": "sdpa", "dtype": torch.float16}
        if os.getenv("VISION_4BIT", "1") == "1":
            kwargs["quantization_config"] = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16)
            if device == "auto" and torch.cuda.is_available():
                kwargs["max_memory"] = {0: os.getenv("VISION_GPU_LIMIT", "2300MiB"), "cpu": os.getenv("VISION_CPU_LIMIT", "3GiB")}
        else:
            kwargs["device_map"] = "cpu"
            kwargs["dtype"] = torch.float32
        MODEL = Qwen3VLForConditionalGeneration.from_pretrained(MODEL_ID, **kwargs).eval()
        gc.collect()
        if os.name == "posix":
            ctypes.CDLL("libc.so.6").malloc_trim(0)
        log.info("Qwen3-VL loaded locally, device=%s", MODEL.device)
    except Exception as exc:
        ERROR = str(exc)
        MODEL = None
        log.exception("Qwen3-VL gagal dimuatkan")


@asynccontextmanager
async def lifespan(_app):
    import asyncio
    await asyncio.to_thread(load_model)
    yield


app = FastAPI(lifespan=lifespan)


class DocumentInput(BaseModel):
    image: str = Field(max_length=14_000_000)
    prompt: str = Field(min_length=1, max_length=4000)


@app.get("/health")
def health():
    return {"ready": MODEL is not None, "engine": "transformers", "model": MODEL_ID, "error": ERROR}


def infer(image, prompt):
    messages = [{"role": "user", "content": [{"type": "image", "image": image}, {"type": "text", "text": prompt}]}]
    inputs = PROCESSOR.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, return_dict=True, return_tensors="pt")
    inputs.pop("token_type_ids", None)
    inputs = inputs.to(MODEL.device)
    with torch.inference_mode():
        generated = MODEL.generate(**inputs, max_new_tokens=int(os.getenv("VISION_MAX_NEW_TOKENS", "384")), do_sample=False)
    text = PROCESSOR.batch_decode(generated[:, inputs["input_ids"].shape[-1]:], skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    return json.loads(text)


@app.post("/analyze")
async def analyze(request: DocumentInput):
    if MODEL is None:
        raise HTTPException(503, "Qwen3-VL setempat belum sedia: " + ERROR)
    if not re.fullmatch(r"data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+", request.image):
        raise HTTPException(400, "Format imej tidak sah")
    try:
        payload = base64.b64decode(request.image.split(",", 1)[1], validate=True)
        image = Image.open(io.BytesIO(payload)).convert("RGB")
        if image.width * image.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError("Imej melebihi 12 megapiksel")
        image.thumbnail((640, 640), Image.Resampling.LANCZOS)
        import asyncio
        return await asyncio.to_thread(infer, image, request.prompt)
    except Exception as exc:
        log.exception("Pengecaman dokumen gagal")
        raise HTTPException(503, str(exc)) from exc
