"""Measure local Chatterbox latency and validate nonempty PCM output."""
import json
import time
import urllib.request

text = "Hai, saya Aiman."
request = urllib.request.Request(
    "http://127.0.0.1:8091/speech",
    data=json.dumps({"text": text}).encode(),
    headers={"Content-Type": "application/json"},
)
start = time.perf_counter()
with urllib.request.urlopen(request, timeout=180) as response:
    audio = response.read()
    rate = int(response.headers["X-Audio-Sample-Rate"])
elapsed = time.perf_counter() - start
duration = len(audio) / (2 * rate)
print(json.dumps({"text": text, "latencySeconds": round(elapsed, 2), "audioSeconds": round(duration, 2), "bytes": len(audio)}))
if not audio or len(audio) % 2:
    raise SystemExit("Invalid PCM output")
