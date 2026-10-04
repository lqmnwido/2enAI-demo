"""Local, CPU-only Jawi OCR with source-aligned, reviewable output."""
import base64
import io
import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "inference/models/real_plus_synth_200_best_250326.mlmodel"
MODEL = None
ERROR = ""
Image.MAX_IMAGE_PIXELS = 12_000_000
log = logging.getLogger("aiman-jawi")


@asynccontextmanager
async def lifespan(_app):
    global MODEL, ERROR
    try:
        from kraken.lib import models
        MODEL = models.load_any(str(MODEL_PATH))
        log.info("Jawi OCR model loaded: %s", MODEL_PATH)
    except Exception as exc:
        ERROR = str(exc)
        log.exception("Jawi OCR model failed")
    yield


app = FastAPI(lifespan=lifespan)


class DocumentInput(BaseModel):
    image: str = Field(max_length=14_000_000)
    prompt: str = Field(default="", max_length=4000)


@app.get("/health")
def health():
    return {"ready": MODEL is not None, "engine": "kraken", "model": MODEL_PATH.name, "error": ERROR}


def line_boxes(image):
    """Find ink rows without depending on OCR text, which can omit faint lines."""
    gray = np.asarray(ImageOps.grayscale(image))
    height, width = gray.shape
    ink = gray < min(190, int(np.percentile(gray, 30)) - 18)
    counts = ink.sum(axis=1)
    active = np.flatnonzero(counts > max(3, int(width * 0.006)))
    groups = []
    for row in active:
        if not groups or row - groups[-1][-1] > max(8, int(height * 0.008)):
            groups.append([int(row)])
        else:
            groups[-1].append(int(row))
    boxes = []
    for group in groups:
        y0, y1 = group[0], group[-1] + 1
        if y1 - y0 < 12:
            continue
        pad = max(5, int((y1 - y0) * 0.12))
        y0, y1 = max(0, y0 - pad), min(height, y1 + pad)
        xs = np.flatnonzero(ink[y0:y1].sum(axis=0) > 1)
        if len(xs) < 8:
            continue
        x0, x1 = max(0, int(xs[0]) - pad), min(width, int(xs[-1]) + pad + 1)
        boxes.append((x0, y0, x1, y1))
    return boxes[:80]


def color_line_boxes(image):
    """Isolate dark and red printed ink from colourful page illustrations."""
    rgb = np.asarray(image).astype(np.int16)
    height, width = rgb.shape[:2]
    dark = rgb.max(axis=2) < 125
    red = (
        (rgb[:, :, 0] > 140)
        & (rgb[:, :, 1] < 110)
        & (rgb[:, :, 2] < 130)
        & (rgb[:, :, 0] > 1.7 * rgb[:, :, 1])
    )
    ink = dark | red
    counts = ink.sum(axis=1)
    active = np.flatnonzero(counts > max(4, int(width * .008)))
    groups = []
    for row in active:
        if not groups or row - groups[-1][-1] > max(8, int(height * .025)):
            groups.append([int(row)])
        else:
            groups[-1].append(int(row))
    boxes = []
    for group in groups:
        y0, y1 = group[0], group[-1] + 1
        if y1 - y0 < max(10, int(height * .025)):
            continue
        xcounts = ink[y0:y1].sum(axis=0)
        xactive = np.flatnonzero(xcounts > 1)
        xgroups = []
        for x in xactive:
            if not xgroups or x - xgroups[-1][-1] > max(16, int(width * .04)):
                xgroups.append([int(x)])
            else:
                xgroups[-1].append(int(x))
        if not xgroups:
            continue
        masses = [int(xcounts[g[0]:g[-1] + 1].sum()) for g in xgroups]
        minimum = max(12, max(masses) * .12)
        text_groups = [g for g, mass in zip(xgroups, masses) if mass >= minimum]
        if not text_groups:
            continue
        pad = max(5, int((y1 - y0) * .16))
        x0 = max(0, text_groups[0][0] - pad)
        x1 = min(width, text_groups[-1][-1] + pad + 1)
        boxes.append((x0, max(0, y0 - pad), x1, min(height, y1 + pad)))
    return boxes[:80]


def projection_line_boxes(image):
    """Split touching printed lines at the valleys between ink-density peaks."""
    from scipy.signal import find_peaks

    rgb = np.asarray(image).astype(np.int16)
    height, width = rgb.shape[:2]
    dark = rgb.max(axis=2) < 125
    inset = max(2, int(width * .035))
    counts = dark[:, inset:width - inset].sum(axis=1)
    smooth_counts = np.convolve(counts, np.ones(9) / 9, mode="same")
    peaks, _ = find_peaks(
        smooth_counts,
        prominence=max(4, smooth_counts.max() * .08),
        distance=max(18, int(height * .09)),
    )
    if len(peaks) < 2:
        return []
    cuts = [0]
    cuts += [int(left + np.argmin(smooth_counts[left:right + 1])) for left, right in zip(peaks[:-1], peaks[1:])]
    cuts.append(height)
    boxes = []
    for start, end in zip(cuts[:-1], cuts[1:]):
        rows = np.flatnonzero(counts[start:end] > max(3, width * .012)) + start
        if len(rows) < 8:
            continue
        y0, y1 = max(0, int(rows[0]) - 6), min(height, int(rows[-1]) + 7)
        xcounts = dark[y0:y1].sum(axis=0)
        xs = np.flatnonzero(xcounts > 1)
        if len(xs) < 8:
            continue
        boxes.append((max(0, int(xs[0]) - 6), y0, min(width, int(xs[-1]) + 7), y1))
    return boxes[:80]


def dense_page_line_boxes(image):
    """Separate tightly set historical print using each line's ink-density peak."""
    from scipy.signal import find_peaks

    gray = np.asarray(ImageOps.grayscale(image))
    height, width = gray.shape
    if width / height > .8:
        return []
    inset = max(3, int(width * .1))
    counts = (gray[:, inset:width - inset] < 140).sum(axis=1)
    kernel = max(3, height // 150)
    smoothed = np.convolve(counts, np.ones(kernel) / kernel, mode="same")
    peaks, _ = find_peaks(
        smoothed,
        prominence=max(3, smoothed.max() * .055),
        distance=max(12, int(height * .035)),
    )
    # The title and page border have different spacing; retain the ordinary
    # projection boxes there, and split only the dense text block below them.
    body = [int(peak) for peak in peaks if .24 * height < peak < .975 * height]
    if len(body) < 12:
        return []
    boundaries = [int(height * .22)]
    boundaries.extend(int(left + np.argmin(smoothed[left:right + 1])) for left, right in zip(body[:-1], body[1:]))
    boundaries.append(height)
    margin = max(2, int(width * .065))
    return [(margin, max(0, top - kernel), width - margin, min(height, bottom + kernel))
            for top, bottom in zip(boundaries[:-1], boundaries[1:])]


def recognize_line(image, box):
    from kraken import rpred
    from kraken.containers import BaselineLine, Segmentation

    x0, y0, x1, y1 = box
    crop = image.crop(box)
    w, h = crop.size
    line = BaselineLine(
        id="line", baseline=[(1, int(h * .75)), (w - 1, int(h * .75))],
        boundary=[(1, 1), (w - 1, 1), (w - 1, h - 1), (1, h - 1), (1, 1)],
        text=None, base_dir="R",
    )
    segmentation = Segmentation(
        type="baselines", imagename="", text_direction="horizontal-rl",
        script_detection=False, lines=[line], regions={}, line_orders=[],
    )
    return next(iter(rpred.rpred(MODEL, crop, segmentation, bidi_reordering="L")))


LEXICON = {
    "باجو": ("baju", "baju", "clothes"),
    "ساي": ("saya", "saya", "I"),
    "بارو": ("baru", "baru", "new"),
    "سلام": ("salam", "salam", "peace"),
    "سجهترا": ("sejahtera", "sejahtera", "well-being"),
    "تاريخ": ("tarikh", "tarikh", "date"),
    "مانيس": ("manis", "manis", "sweet"),
    "دارا": ("dara", "dara", "maiden"),
    "برباجو": ("berbaju", "berbaju", "wearing clothes"),
    "کروڠسڠ": ("kerongsang", "kerongsang", "brooch"),
    "امس": ("emas", "emas", "gold"),
    "منجادي": ("menjadi", "menjadi", "becomes"),
    "هياسن": ("hiasan", "hiasan", "decoration"),
    "کڤد": ("kepada", "kepada", "to"),
    "سموا": ("semua", "semua", "all"),
    "رعيت": ("rakyat", "rakyat", "people"),
    "مرديک": ("merdeka", "merdeka", "independence"),
    "همبا": ("hamba", "hamba", "I"),
    "هولورکن": ("hulurkan", "hulurkan", "offer"),
    "کالاو": ("kalau", "kalau", "if"),
    "باچ": ("baca", "baca", "read"),
    "ني": ("ni", "ini", "this"),
    "ليميتد": ("limited", "limited", "limited"),
    "ايديشن": ("edition", "edisi", "edition"),
    "کباي": ("kebaya", "kebaya", "kebaya"),
    "مليسيا": ("Malaysia", "Malaysia", "Malaysia"),
    "اوق": ("awak", "awak", "you"),
    "بوليه": ("boleh", "boleh", "can"),
    "نکاراکو": ("negaraku", "negaraku", "my country"),
    "تانه": ("tanah", "tanah", "land"),
    "تومڤهڽ": ("tumpahnya", "tumpahnya", "where it was shed"),
    "دارهکو": ("darahku", "darahku", "my blood"),
    "هيدوڤ": ("hidup", "hidup", "live"),
    "برساتودان": ("bersatu dan", "bersatu dan", "united and"),
    "ماجو": ("maju", "maju", "advance"),
    "رحمةهاکيا": ("rahmat bahagia", "rahmat bahagia", "blessings and happiness"),
    "رحةماکيا": ("rahmat bahagia", "rahmat bahagia", "blessings and happiness"),
    "توهن": ("Tuhan", "Tuhan", "God"),
    "کورنياکن": ("kurniakan", "kurniakan", "bestow"),
    "کونياکن": ("kurniakan", "kurniakan", "bestow"),
    "راج": ("raja", "raja", "king"),
    "کيت": ("kita", "kita", "our"),
    "راجکيت": ("raja kita", "raja kita", "our king"),
    "سلامت": ("selamat", "selamat", "safely"),
    "برتجتا": ("bertakhta", "bertakhta", "reign"),
    "برتختا": ("bertakhta", "bertakhta", "reign"),
    "هيدوف": ("hidup", "hidup", "live"),
    "بساتودان": ("bersatu dan", "bersatu dan", "united and"),
    "رحة": ("rahmat", "rahmat", "blessings"),
    "هاݢيا": ("bahagia", "bahagia", "happiness"),
    "رحمة": ("rahmat", "rahmat", "blessings"),
    "باکيا": ("bahagia", "bahagia", "happiness"),
}
PHRASES = {
    ("باجو",): ("baju", "baju", "clothes"),
    ("باجو", "ساي"): ("baju saya", "baju saya", "my clothes"),
    ("باجو", "ساي", "بارو"): ("baju saya baru", "baju saya baru", "My clothes are new"),
}
SUPPORTED_LINES = {
    ("نکاراکو", "تانه", "تومڤهڽ", "دارهکو"): "My country, the land where my blood was shed.",
    ("رعيت", "هيدوڤ", "برساتودان", "ماجو"): "The people live united and advance.",
    ("رحمةهاکيا", "توهن", "کورنياکن"): "May God bestow blessings and happiness.",
    ("رحةماکيا", "توهن", "کونياکن"): "May God bestow blessings and happiness.",
    ("راج", "کيت", "سلامت", "برتجتا"): "May our King reign in safety.",
    ("راجکيت", "سلامت", "برتختا"): "May our King reign in safety.",
    ("رعيت", "هيدوف", "بساتودان", "ماجو"): "The people live united and advance.",
    ("رعيت", "هيدوف", "برساتودان", "ماجو"): "The people live united and advance.",
    ("رحة", "هاݢيا", "توهن", "کورنياکن"): "May God bestow blessings and happiness.",
    ("رحمة", "باکيا", "توهن", "کورنياکن"): "May God bestow blessings and happiness.",
}


def bounded_distance(left, right, limit=2):
    """Small edit-distance bound for one noisy token in an otherwise exact line."""
    if abs(len(left) - len(right)) > limit:
        return limit + 1
    previous = list(range(len(right) + 1))
    for i, letter in enumerate(left, 1):
        current = [i]
        for j, other in enumerate(right, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (letter != other)))
        previous = current
        if min(previous) > limit:
            return limit + 1
    return previous[-1]


def supported_line(words):
    if not words or min(word["confidence"] for word in words) < .45:
        return None
    source = tuple(word["text"] for word in words)
    if source in SUPPORTED_LINES:
        return source, SUPPORTED_LINES[source]
    candidates = []
    for spelling, translation in SUPPORTED_LINES.items():
        if len(spelling) != len(source):
            continue
        distances = [bounded_distance(actual, expected) for actual, expected in zip(source, spelling)]
        # Only one token may be corrected, with every other source token exact.
        if sum(distance > 0 for distance in distances) == 1 and max(distances) <= 2:
            candidates.append((sum(distances), spelling, translation))
    candidates.sort(key=lambda item: item[0])
    if not candidates or len(candidates) > 1 and candidates[0][0] == candidates[1][0]:
        return None
    return candidates[0][1], candidates[0][2]


def analyze_image(image):
    words, segments, line_translations = [], [], []
    width, height = image.size
    boxes = line_boxes(image)
    if not boxes or any((box[3] - box[1]) > height * .48 and (box[2] - box[0]) > width * .7 for box in boxes):
        color_boxes = color_line_boxes(image)
        if color_boxes and not any((box[3] - box[1]) > height * .48 for box in color_boxes):
            boxes = color_boxes
        else:
            projected = projection_line_boxes(image)
            boxes = projected or color_boxes or boxes
    dense = dense_page_line_boxes(image)
    if dense:
        title_boxes = [box for box in projection_line_boxes(image) if box[3] <= height * .235]
        boxes = title_boxes + dense
    for line_number, box in enumerate(boxes):
        try:
            result = recognize_line(image, box)
        except Exception:
            log.exception("Jawi line recognition failed at %s", box)
            continue
        prediction = result.prediction
        if not prediction.strip():
            continue
        line_start = len(words)
        # Kraken emits one polygon and confidence per character. Whitespace
        # separates words; polygon bounds preserve the original image position.
        for match in re.finditer(r"[^\W_]+", prediction):
            start, end = match.span()
            chars = [result.cuts[i] for i in range(start, min(end, len(result.cuts)))]
            confidences = [float(result.confidences[i]) for i in range(start, min(end, len(result.confidences)))]
            if not chars:
                continue
            xs = [float(point[0]) for polygon in chars for point in polygon]
            ys = [float(point[1]) for polygon in chars for point in polygon]
            left = max(0, min(999, round((box[0] + min(xs)) * 1000 / width)))
            right = max(left + 1, min(1000, round((box[0] + max(xs)) * 1000 / width)))
            top = max(0, min(999, round((box[1] + min(ys)) * 1000 / height)))
            bottom = max(top + 1, min(1000, round((box[1] + max(ys)) * 1000 / height)))
            word = match.group()
            if not re.search(r"[\u0600-\u08FF]", word) and not word.isdigit():
                continue
            confidence = round(min(confidences), 3)
            # The printed-Jawi model can overstate certainty for digits.
            if any(char.isdigit() for char in word):
                confidence = min(confidence, .49)
            identifier = f"l{line_number}w{len(words)}"
            words.append({"id": identifier, "line": line_number, "text": word, "box": [left, top, right, bottom], "confidence": confidence})
        line_words = words[line_start:]
        line_key = tuple(word["text"] for word in line_words)
        matched = supported_line(line_words)
        if matched:
            line_translations.append({"line": line_number, "wordIds": [word["id"] for word in line_words], "en": matched[1]})
        phrase = PHRASES.get(line_key)
        if phrase and min(word["confidence"] for word in line_words) >= .85:
            segments.append({"wordIds": [word["id"] for word in line_words], "rumi": phrase[0], "bm": phrase[1], "en": phrase[2]})
        else:
            for index, word in enumerate(line_words):
                # An exact local spelling match can supply a candidate at lower
                # OCR confidence; the source word and confidence remain visible.
                verified_spelling = matched[0][index] if matched else word["text"]
                threshold = .45 if matched else .5 if verified_spelling in LEXICON else .85
                rumi, bm, en = LEXICON.get(verified_spelling, ("", "", "")) if word["confidence"] >= threshold else ("", "", "")
                segments.append({"wordIds": [word["id"]], "rumi": rumi, "bm": bm, "en": en})
    if not words:
        raise ValueError("Tiada tulisan Jawi yang dapat dikesan. Cuba imej lebih jelas atau potong kawasan teks.")
    return {
        "words": words, "segments": segments, "lineTranslations": line_translations, "entities": [],
        "metadata": {
            "language": "Bahasa Melayu (semakan diperlukan)",
            "script": "Jawi / Arab",
            "notes": "OCR setempat untuk Jawi bercetak sejarah. Transliterasi atau terjemahan hanya dipaparkan bagi perkataan yang disahkan dalam kamus kecil; semak semua hasil, khususnya angka dan tulisan tangan.",
        },
    }


@app.post("/analyze")
async def analyze(request: DocumentInput):
    if MODEL is None:
        raise HTTPException(503, "Jawi OCR tempatan belum sedia: " + ERROR)
    if not re.fullmatch(r"data:image/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+", request.image):
        raise HTTPException(400, "Format imej tidak sah")
    try:
        payload = base64.b64decode(request.image.split(",", 1)[1], validate=True)
        image = Image.open(io.BytesIO(payload)).convert("RGB")
        if image.width * image.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError("Imej melebihi 12 megapiksel")
        import asyncio
        return await asyncio.to_thread(analyze_image, image)
    except Exception as exc:
        log.exception("Jawi OCR failed")
        raise HTTPException(422, str(exc)) from exc
