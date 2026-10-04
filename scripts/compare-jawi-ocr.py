"""Compare local Tesseract modes on the reproducible Jawi sample."""
from pathlib import Path
from subprocess import run

image = Path(__file__).resolve().parents[1] / "inference/.jawi-smoke.png"
for lang in ("ara", "Arabic"):
    for psm in (3, 6, 11):
        result = run(
            ["tesseract", str(image), "stdout", "-l", lang, "--psm", str(psm), "tsv"],
            capture_output=True,
            text=True,
            check=True,
        )
        words = [line.split("\t") for line in result.stdout.splitlines()[1:]]
        words = [(cols[11], cols[10]) for cols in words if len(cols) >= 12 and cols[0] == "5" and cols[11].strip()]
        print(lang, psm, words)
