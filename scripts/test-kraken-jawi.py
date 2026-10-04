"""Read two known Jawi lines with the compact historical-print model."""
from pathlib import Path

from PIL import Image
from kraken.lib import models
from kraken import rpred
from kraken.containers import BaselineLine, Segmentation

root = Path(__file__).resolve().parents[1]
model = models.load_any(str(root / "inference/models/real_plus_synth_200_best_250326.mlmodel"))
image = Image.open(root / "inference/.jawi-smoke.png").convert("RGB")

for box in ((420, 80, 930, 190), (420, 190, 930, 300)):
    line_image = image.crop(box)
    w, h = line_image.size
    line = BaselineLine(
        id="line_0",
        baseline=[(1, int(h * 0.75)), (w - 1, int(h * 0.75))],
        boundary=[(1, 1), (w - 1, 1), (w - 1, h - 1), (1, h - 1), (1, 1)],
        text=None,
        base_dir="R",
    )
    segmentation = Segmentation(
        type="baselines", imagename="", text_direction="horizontal-rl",
        script_detection=False, lines=[line], regions={}, line_orders=[],
    )
    for result in rpred.rpred(model, line_image, segmentation, bidi_reordering="L"):
        print(box, repr(result.prediction), [round(score, 2) for score in result.confidences])
