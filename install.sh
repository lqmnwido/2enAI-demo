#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f /etc/arch-release ]]; then
  echo 'This one-command installer currently targets EndeavourOS/Arch Linux.' >&2
  echo 'For other Linux systems, install Node.js 20+, Python 3.11 and FFmpeg, then run bash scripts/setup-linux.sh.' >&2
  exit 1
fi

echo 'Installing system prerequisites through pacman...'
sudo pacman -Syu --needed nodejs npm git curl uv ffmpeg
uv python install 3.11
export PYTHON_BIN="$(uv python find 3.11)"

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo 'NVIDIA driver/nvidia-smi is required for local vLLM. Install the EndeavourOS NVIDIA driver and reboot.' >&2
  exit 1
fi
gpu_info="$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits | head -n 1)"
echo "Detected GPU: $gpu_info"
if [[ "$gpu_info" == *"RTX 5070"* ]]; then
  gpu_memory="${gpu_info##*, }"
  [[ "$gpu_memory" =~ ^[0-9]+$ && "$gpu_memory" -ge 7800 ]] || {
    echo 'This RTX 5070 profile expects approximately 8 GB VRAM or more.' >&2
    exit 1
  }
  export AIMAN_BLACKWELL=1
fi

if [[ -f .env ]]; then set -a; source .env; set +a; fi
if [[ -z "${VLLM_BIN:-}" ]]; then VLLM_BIN="$(command -v vllm || true)"; fi
if [[ -z "$VLLM_BIN" ]]; then
  echo 'No existing vLLM executable found; installing local CUDA vLLM in .venv-vllm.'
  uv python install 3.12
  uv venv --python 3.12 --seed .venv-vllm
  uv pip install --python .venv-vllm/bin/python vllm
  VLLM_BIN="$PWD/.venv-vllm/bin/vllm"
  ASR_PYTHON="$PWD/.venv-vllm/bin/python"
fi
export VLLM_BIN
export ASR_PYTHON="${ASR_PYTHON:-$(dirname "$VLLM_BIN")/python}"

if [[ "${AIMAN_BLACKWELL:-0}" == 1 ]]; then
  "$ASR_PYTHON" - <<'PY'
import torch
assert torch.cuda.is_available(), 'vLLM PyTorch cannot use CUDA on this GPU; update your NVIDIA driver and vLLM environment.'
assert torch.cuda.get_device_capability(0) >= (12, 0), 'Expected RTX 5070 (Blackwell) CUDA capability.'
assert int(torch.version.cuda.split('.')[0]) >= 12 and tuple(map(int, torch.version.cuda.split('.'))) >= (12, 8), 'RTX 5070 needs a PyTorch CUDA 12.8+ wheel.'
torch.ones(1, device='cuda').add_(1)
print('vLLM CUDA smoke test passed:', torch.__version__, torch.version.cuda)
PY
fi

bash scripts/setup-linux.sh

if [[ "${AIMAN_BLACKWELL:-0}" == 1 ]]; then
  # Keep explicit user settings. Replace only the stock 6 GB defaults.
  sed -i 's/^ASR_GPU_MEMORY=0\.35$/ASR_GPU_MEMORY=0.38/; s/^CHAT_GPU_MEMORY=0\.32$/CHAT_GPU_MEMORY=0.34/' .env
  .venv-tts/bin/python - <<'PY'
import torch
assert torch.cuda.is_available(), 'Chatterbox PyTorch cannot use CUDA on this GPU.'
assert tuple(map(int, torch.version.cuda.split('.'))) >= (12, 8), 'Chatterbox requires CUDA 12.8+ for RTX 5070.'
torch.ones(1, device='cuda').add_(1)
print('Chatterbox CUDA smoke test passed:', torch.__version__, torch.version.cuda)
PY
fi

mkdir -p inference/voice
if [[ -n "${AIMAN_VOICE_FILE:-}" || ! -s inference/voice/aiman-voice-prompt.wav ]]; then
  voice_source="${AIMAN_VOICE_FILE:-}"
  if [[ -z "$voice_source" ]]; then
    voice_source="$PWD/inference/voice/aiman-dialogue-reference.mp3"
    if [[ ! -s "$voice_source" ]]; then
      echo 'Bundled voice reference is missing; downloading Dialogue 1 directly from Haikyo...'
      curl --fail --location --retry 3 \
        --output "$voice_source.tmp" 'https://haikyo.co.jp/audio/13195_1-B.mp3'
      [[ $(wc -c < "$voice_source.tmp") -gt 100000 ]] || { echo 'Voice sample download was incomplete.' >&2; exit 1; }
      mv "$voice_source.tmp" "$voice_source"
    fi
  fi
  [[ -s "$voice_source" ]] || { echo "Voice sample not found: $voice_source" >&2; exit 1; }
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$voice_source" \
    -t 8 -ar 24000 -ac 1 -c:a pcm_s16le inference/voice/aiman-voice-prompt.wav
  [[ $(wc -c < inference/voice/aiman-voice-prompt.wav) -gt 50000 ]] || { echo 'Voice prompt conversion failed.' >&2; exit 1; }
fi

echo 'Downloading Qwen model weights into the local Hugging Face cache...'
"$ASR_PYTHON" - <<'PY'
from huggingface_hub import snapshot_download
for model in ('Qwen/Qwen3-ASR-0.6B', 'Qwen/Qwen3-0.6B'):
    print(f'Caching {model}', flush=True)
    snapshot_download(model)
PY

echo 'Downloading Chatterbox model weights into the local cache...'
.venv-tts/bin/python - <<'PY'
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
model = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
print(f'Chatterbox cached at {model.sr} Hz', flush=True)
PY

echo 'Mirroring indexed public Arkib media to local storage (resumable; this may take a while)...'
node scripts/mirror-arkib.mjs
node -e 'const s=require("./data/media-state.json");if(s.phase!=="complete"){console.error("Arkib mirror paused (likely disk reserve). Free space and rerun ./install.sh to resume.");process.exit(1)};if(s.failures?.length)console.warn(`Arkib mirror completed with ${s.failures.length} download/discovery errors; inspect data/media-state.json.`)'

bash scripts/check-local.sh
echo 'Installation complete. Run ./serve.sh and open http://127.0.0.1:5173'
