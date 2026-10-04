#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for program in node npm; do
  command -v "$program" >/dev/null || { echo "Missing $program; install it with your OS package manager." >&2; exit 1; }
done
node -e 'if(Number(process.versions.node.split(".")[0])<20){console.error("Node.js 20+ is required");process.exit(1)}'
if [[ -z "${PYTHON_BIN:-}" ]]; then
  for candidate in python3.11 python3.12 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then PYTHON_BIN="$candidate"; break; fi
  done
fi
[[ -n "${PYTHON_BIN:-}" ]] || { echo 'Python 3.11 or 3.12 is required.' >&2; exit 1; }
"$PYTHON_BIN" -c 'import sys; assert (3,11)<=sys.version_info[:2]<=(3,12), "Use Python 3.11/3.12 for these pinned audio packages"'

if [[ ! -f .env ]]; then cp .env.example .env; echo 'Created .env; review local model and executable paths.'; fi
npm ci

"$PYTHON_BIN" -m venv .venv-ocr
.venv-ocr/bin/python -m pip install --upgrade pip
.venv-ocr/bin/python -m pip install -r inference/requirements-ocr.txt

"$PYTHON_BIN" -m venv .venv-tts
.venv-tts/bin/python -m pip install --upgrade pip
.venv-tts/bin/python -m pip install -r inference/requirements-tts.txt

npm run build
if [[ ! -s inference/models/real_plus_synth_200_best_250326.mlmodel && "${SKIP_MODEL_DOWNLOAD:-0}" != 1 ]]; then
  command -v curl >/dev/null || { echo 'Install curl or set SKIP_MODEL_DOWNLOAD=1 and download the OCR checkpoint manually.' >&2; exit 1; }
  mkdir -p inference/models
  curl --fail --location --retry 3 --output inference/models/real_plus_synth_200_best_250326.mlmodel.tmp \
    https://huggingface.co/culturalheritagenus/Jawi-OCR-Kraken-v1/resolve/main/real_plus_synth_200_best_250326.mlmodel
  bytes=$(wc -c < inference/models/real_plus_synth_200_best_250326.mlmodel.tmp)
  [[ "$bytes" -gt 10000000 ]] || { echo 'OCR checkpoint download was incomplete.' >&2; exit 1; }
  mv inference/models/real_plus_synth_200_best_250326.mlmodel.tmp inference/models/real_plus_synth_200_best_250326.mlmodel
fi
echo 'Web, OCR and TTS Python dependencies installed.'
echo 'Install qwen-asr[vllm] into your existing vLLM environment and set VLLM_BIN/ASR_PYTHON in .env.'
echo 'Place a licensed voice prompt at inference/voice/aiman-voice-prompt.wav.'
echo 'The Apache-2.0 Jawi Kraken checkpoint is saved under inference/models/.'
echo 'Then run bash scripts/check-local.sh and start the four inference services.'
