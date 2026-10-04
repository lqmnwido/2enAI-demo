#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then set -a; source .env; set +a; fi
export VLLM_ATTENTION_BACKEND=TRITON_ATTN
export ASR_GPU_MEMORY="${ASR_GPU_MEMORY:-0.35}"
export ASR_MAX_MODEL_LEN="${ASR_MAX_MODEL_LEN:-1024}"
export ASR_MAX_BATCHED_TOKENS="${ASR_MAX_BATCHED_TOKENS:-512}"
if [[ -z "${ASR_PYTHON:-}" && -x /opt/aina-asr/bin/python ]]; then ASR_PYTHON=/opt/aina-asr/bin/python; fi
ASR_PYTHON="${ASR_PYTHON:-$(command -v python3 || true)}"
[[ -n "$ASR_PYTHON" ]] || { echo 'Python with qwen-asr[vllm] is required.' >&2; exit 1; }
exec "$ASR_PYTHON" inference/asr_worker.py
