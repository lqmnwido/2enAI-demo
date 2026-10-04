"""Generate a local Jawi image with a known transcription for OCR smoke tests."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "inference/.jawi-smoke.png"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
image = Image.new("RGB", (1000, 340), "#f9f5e9")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype(FONT, 70)
draw.text((880, 90), "سلام سجهترا", font=font, fill="#151515", anchor="ra", direction="rtl")
draw.text((880, 195), "تاريخ ١٩٤٨", font=font, fill="#151515", anchor="ra", direction="rtl")
image.save(OUT)
print(OUT)
