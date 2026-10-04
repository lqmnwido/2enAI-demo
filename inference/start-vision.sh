#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then set -a; source .env; set +a; fi
if [[ -z "${VISION_PYTHON:-}" && -x /opt/aina-asr/bin/python ]]; then VISION_PYTHON=/opt/aina-asr/bin/python; fi
VISION_PYTHON="${VISION_PYTHON:-$PWD/.venv-ocr/bin/python}"
[[ -x "$VISION_PYTHON" ]] || { echo 'Run bash scripts/setup-linux.sh or set VISION_PYTHON.' >&2; exit 1; }
exec "$VISION_PYTHON" -m uvicorn inference.native_jawi:app --host 127.0.0.1 --port 8002
