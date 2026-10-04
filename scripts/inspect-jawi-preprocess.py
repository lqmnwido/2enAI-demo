"""Inspect segmentation on the historical Jawi smoke fixture."""
from PIL import Image, ImageFilter
import numpy as np
from scipy.signal import find_peaks

from inference import native_jawi
from inference.native_jawi import color_line_boxes, line_boxes, projection_line_boxes

image = Image.open("tests/fixtures/jawi-archive-blurry.png").convert("RGB")
upscaled = image.resize((image.width * 3, image.height * 3), Image.Resampling.BICUBIC)
variants = {
    "original": image,
    "upscaled": upscaled,
    "sharpened": upscaled.filter(ImageFilter.UnsharpMask(radius=2, percent=180, threshold=2)),
}
for name, candidate in variants.items():
    print(name, candidate.size)
    for detector in (line_boxes, projection_line_boxes, color_line_boxes):
        boxes = detector(candidate)
        print(" ", detector.__name__, len(boxes), [(round(y0 / candidate.height, 2), round(y1 / candidate.height, 2)) for _, y0, _, y1 in boxes])
    gray = np.asarray(candidate.convert("L"))
    for inset_fraction in (.1, .2):
        inset = int(candidate.width * inset_fraction)
        counts = (gray[:, inset:-inset] < 140).sum(axis=1)
        smoothed = np.convolve(counts, np.ones(max(3, candidate.height // 150)) / max(3, candidate.height // 150), mode="same")
        for distance_fraction in (.035, .045):
            peaks, _ = find_peaks(smoothed, prominence=max(3, smoothed.max() * .055), distance=max(12, int(candidate.height * distance_fraction)))
            print("  peaks", inset_fraction, distance_fraction, [round(peak / candidate.height, 3) for peak in peaks])

if __name__ == "__main__":
    from kraken.lib import models
    native_jawi.MODEL = models.load_any(str(native_jawi.MODEL_PATH))
    for name in ("original", "upscaled", "sharpened"):
        candidate = variants[name]
        gray = np.asarray(candidate.convert("L"))
        inset = int(candidate.width * .1)
        counts = (gray[:, inset:-inset] < 140).sum(axis=1)
        kernel = max(3, candidate.height // 150)
        smoothed = np.convolve(counts, np.ones(kernel) / kernel, mode="same")
        peaks, _ = find_peaks(smoothed, prominence=max(3, smoothed.max() * .055), distance=max(12, int(candidate.height * .035)))
        peaks = [int(peak) for peak in peaks if .24 * candidate.height < peak < .975 * candidate.height]
        boundaries = [int(candidate.height * .22)] + [int(left + np.argmin(smoothed[left:right + 1])) for left, right in zip(peaks[:-1], peaks[1:])] + [candidate.height]
        print("OCR", name, len(peaks), flush=True)
        for index, (top, bottom) in enumerate(zip(boundaries[:-1], boundaries[1:])):
            box = (inset, max(0, top - kernel), candidate.width - inset, min(candidate.height, bottom + kernel))
            try:
                result = native_jawi.recognize_line(candidate, box)
                print(index, round(peaks[index] / candidate.height, 3), result.prediction, round(float(np.mean(result.confidences)), 3), flush=True)
            except Exception as exc:
                print(index, str(exc), flush=True)
