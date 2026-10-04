#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then set -a; source .env; set +a; fi
export VLLM_SERVER_DEV_MODE=1
if [[ -z "${VLLM_BIN:-}" && -x /opt/aina-asr/bin/vllm ]]; then VLLM_BIN=/opt/aina-asr/bin/vllm; fi
VLLM_BIN="${VLLM_BIN:-$(command -v vllm || true)}"
[[ -n "$VLLM_BIN" ]] || { echo 'Activate the local vLLM environment or set VLLM_BIN.' >&2; exit 1; }
exec "$VLLM_BIN" serve "${LLM_MODEL:-Qwen/Qwen3-0.6B}" --host 127.0.0.1 --port 8000 --dtype half --max-model-len "${CHAT_MAX_MODEL_LEN:-1536}" --max-num-batched-tokens "${CHAT_MAX_BATCHED_TOKENS:-512}" --max-num-seqs 1 --swap-space 0 --gpu-memory-utilization "${CHAT_GPU_MEMORY:-0.32}" --attention-config.backend TRITON_ATTN --enforce-eager --enable-sleep-mode
