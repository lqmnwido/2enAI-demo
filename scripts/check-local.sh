#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then set -a; source .env; set +a; fi
fail=0
check() { if [[ -e "$2" ]]; then printf 'OK  %s\n' "$1"; else printf 'MISSING  %s: %s\n' "$1" "$2"; fail=1; fi; }
check 'built React app' dist/index.html
check '3D robot' public/models/aiman.glb
check 'archive corpus' data/corpus.json
check 'Jawi OCR checkpoint' inference/models/real_plus_synth_200_best_250326.mlmodel
check 'licensed voice prompt' inference/voice/aiman-voice-prompt.wav
check 'OCR Python' "${VISION_PYTHON:-$(if [[ -x /opt/aina-asr/bin/python ]]; then echo /opt/aina-asr/bin/python; else echo "$PWD/.venv-ocr/bin/python"; fi)}"
check 'TTS Python' "${CHATTERBOX_PYTHON:-$(if [[ -x /opt/aiman-chatterbox/bin/python ]]; then echo /opt/aiman-chatterbox/bin/python; else echo "$PWD/.venv-tts/bin/python"; fi)}"
vllm_bin="${VLLM_BIN:-$(if [[ -x /opt/aina-asr/bin/vllm ]]; then echo /opt/aina-asr/bin/vllm; else command -v vllm || true; fi)}"
asr_python="${ASR_PYTHON:-$(if [[ -x /opt/aina-asr/bin/python ]]; then echo /opt/aina-asr/bin/python; else command -v python3 || true; fi)}"
if [[ -n "$vllm_bin" ]]; then printf 'OK  vLLM: %s\n' "$vllm_bin"; else echo 'MISSING  vLLM executable'; fail=1; fi
if [[ -n "$asr_python" ]] && "$asr_python" -c 'import qwen_asr' 2>/dev/null; then echo 'OK  Qwen ASR in selected Python'; else echo 'MISSING  qwen-asr[vllm] in ASR_PYTHON'; fail=1; fi
exit "$fail"
