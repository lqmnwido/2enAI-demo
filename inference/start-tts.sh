#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then set -a; source .env; set +a; fi
if [[ -z "${CHATTERBOX_PYTHON:-}" && -x /opt/aiman-chatterbox/bin/python ]]; then CHATTERBOX_PYTHON=/opt/aiman-chatterbox/bin/python; fi
CHATTERBOX_PYTHON="${CHATTERBOX_PYTHON:-$PWD/.venv-tts/bin/python}"
[[ -x "$CHATTERBOX_PYTHON" ]] || { echo 'Run bash scripts/setup-linux.sh or set CHATTERBOX_PYTHON.' >&2; exit 1; }
exec "$CHATTERBOX_PYTHON" -m uvicorn inference.native_tts:app --host 127.0.0.1 --port 8091
