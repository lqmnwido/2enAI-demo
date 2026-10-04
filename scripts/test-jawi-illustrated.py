"""Test an illustrated Jawi crop through the browser's local OCR route."""
import base64
import io
import json
import os
import sys
import urllib.request
from pathlib import Path

from PIL import Image

image = Image.open(Path(sys.argv[1])).convert("RGB")
if len(sys.argv) == 6:
    image = image.crop(tuple(map(int, sys.argv[2:])))
buffer = io.BytesIO()
image.save(buffer, format="PNG")
body = json.dumps({"image": "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")}).encode()
request = urllib.request.Request(os.environ.get("JAWI_TEST_URL", "http://127.0.0.1:8002/analyze"), data=body, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(request, timeout=60) as response:
    result = json.load(response)
if os.environ.get("JAWI_TEST_MODE") == "inspect":
    print(json.dumps({"lines": [[(word["text"], word["confidence"]) for word in result["words"] if word["line"] == line] for line in sorted({word["line"] for word in result["words"]})], "segments": result["segments"], "lineTranslations": result.get("lineTranslations", [])}, ensure_ascii=False))
elif os.environ.get("JAWI_TEST_MODE") == "historical":
    lines = {word["line"] for word in result["words"]}
    assert len(lines) >= 16, f"Only {len(lines)} historical print lines were found"
    assert len(result["words"]) >= 100, f"Only {len(result['words'])} source-aligned words were found"
    assert not result.get("lineTranslations"), "A blurry historical page acquired an unsupported translation"
    print(json.dumps({"lines": len(lines), "words": len(result["words"]), "verified": sum(bool(segment["rumi"]) for segment in result["segments"])}, ensure_ascii=False))
elif os.environ.get("JAWI_TEST_MODE") == "multiline":
    lines = {word["line"] for word in result["words"]}
    assert len(lines) >= 5, f"Only {len(lines)} printed lines were recognized"
    if any(word["text"] == "مانيس" for word in result["words"]):
        assert any(segment["rumi"] == "manis" and segment["en"] == "sweet" for segment in result["segments"])
        assert all(segment["rumi"] and segment["bm"] and segment["en"] for segment in result["segments"]), "A poster word has no reading or gloss"
        assert not result.get("lineTranslations"), "An unrelated poster matched the anthem translation"
    if any(segment["rumi"] == "negaraku" for segment in result["segments"]):
        assert len(result["lineTranslations"]) == 6, "The anthem needs six verified line translations"
        assert all(segment["rumi"] and segment["bm"] and segment["en"] for segment in result["segments"]), "An anthem word has no reading or gloss"
    print(json.dumps({"lines": len(lines), "words": len(result["words"]), "transcription": [[(word["text"], word["confidence"]) for word in result["words"] if word["line"] == line] for line in sorted(lines)]}, ensure_ascii=False))
else:
    print(json.dumps({"words": result["words"], "segments": result["segments"]}, ensure_ascii=False))
    assert [word["text"] for word in result["words"]] == ["باجو", "باجو", "ساي", "باجو", "ساي", "بارو"]
    assert [segment["en"] for segment in result["segments"]] == ["clothes", "my clothes", "My clothes are new"]
assert all(word["box"][2] > word["box"][0] and word["box"][3] > word["box"][1] for word in result["words"])
