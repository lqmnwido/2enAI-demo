"""Exercise OCR through the same HTTP route used by the browser."""
import base64
import json
import urllib.error
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
image = base64.b64encode((root / "inference/.jawi-smoke.png").read_bytes()).decode("ascii")
request = urllib.request.Request(
    "http://127.0.0.1:3001/api/handwriting",
    data=json.dumps({"image": "data:image/png;base64," + image}).encode(),
    headers={"Content-Type": "application/json"},
)
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)
except urllib.error.HTTPError as error:
    raise SystemExit(f"HTTP {error.code}: {error.read().decode('utf-8', 'replace')}") from error
words = result.get("words", [])
print(json.dumps({"words": words, "segments": result.get("segments", []), "reviewRequired": result.get("reviewRequired")}, ensure_ascii=True))
if not {"سلام", "سجهترا"}.issubset({word["text"] for word in words}):
    raise SystemExit("Jawi OCR missed a verified first-line word")
if not result.get("reviewRequired"):
    raise SystemExit("Jawi OCR must require review")
digits = [word for word in words if any(char.isdigit() for char in word["text"])]
if any(word["confidence"] >= .5 for word in digits):
    raise SystemExit("Uncertain numeric text must be marked low confidence")
if not digits and "angka" not in result.get("metadata", {}).get("notes", ""):
    raise SystemExit("Omitted numbers must remain explicitly subject to review")
