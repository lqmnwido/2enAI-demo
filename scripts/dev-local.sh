#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for program in curl npm; do
  command -v "$program" >/dev/null || { echo "Missing $program." >&2; exit 1; }
done
[[ -f .env ]] || { echo 'Run npm run local:install first.' >&2; exit 1; }
[[ -d node_modules ]] || { echo 'Node dependencies are missing. Run npm run local:install.' >&2; exit 1; }
set -a; source .env; set +a
bash scripts/check-local.sh
mkdir -p data/logs

pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ready_asr() { curl -fsS --max-time 2 http://127.0.0.1:8001/health 2>/dev/null | grep -Eq '"ready"[[:space:]]*:[[:space:]]*true'; }
ready_chat() { curl -fsS --max-time 2 http://127.0.0.1:8000/v1/models >/dev/null 2>&1; }
ready_tts() { curl -fsS --max-time 2 http://127.0.0.1:8091/health 2>/dev/null | grep -Eq '"ready"[[:space:]]*:[[:space:]]*true'; }
ready_vision() { curl -fsS --max-time 2 http://127.0.0.1:8002/health 2>/dev/null | grep -Eq '"ready"[[:space:]]*:[[:space:]]*true'; }

start_service() {
  local name="$1" check="$2" script="$3" port="$4" pid elapsed
  if "$check"; then echo "$name is already ready on port $port."; return; fi
  echo "Starting $name; log: data/logs/$name.log"
  bash "$script" >"data/logs/$name.log" 2>&1 &
  pid=$!; pids+=("$pid")
  for ((elapsed=0; elapsed<240; elapsed+=2)); do
    if "$check"; then echo "$name is ready."; return; fi
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 2
  done
  echo "$name did not become ready. Last log lines:" >&2
  tail -n 20 "data/logs/$name.log" >&2 || true
  exit 1
}

# ASR must initialize before chat on the 6 GB GPU profile.
start_service ASR ready_asr inference/start-asr.sh 8001
start_service chat ready_chat inference/start-chat.sh 8000
start_service TTS ready_tts inference/start-tts.sh 8091
start_service OCR ready_vision inference/start-vision.sh 8002

echo 'Frontend: http://127.0.0.1:5173  |  Backend/API: http://127.0.0.1:3001'
echo 'Ctrl+C stops services started by this command.'
if [[ ! -s public/audio/aiman-greeting.wav || ! -s public/audio/aiman-analysis-ready.wav ]]; then
  (
    for ((i=0;i<60;i++)); do
      if curl -fsS --max-time 2 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then break; fi
      sleep 1
    done
    [[ -s public/audio/aiman-greeting.wav ]] || node scripts/generate-greeting.mjs
    [[ -s public/audio/aiman-analysis-ready.wav ]] || node scripts/generate-analysis-cue.mjs
  ) >data/logs/voice-cues.log 2>&1 &
  pids+=("$!")
  echo 'Generating the two fixed voice cues in the background.'
fi
npm run dev
