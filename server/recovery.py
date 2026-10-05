"""Visual recovery for scans/outlines and user-drawn replacement regions.

OCR supplies text and geometry, not original font files. Font/color estimates
are labeled as estimates. Recovery edits replace pixels only in the selected
region while keeping the surrounding PDF's text, images, and vectors native.
"""
from functools import lru_cache
import math

from PIL import Image, ImageChops, ImageOps, ImageStat
import pymupdf as fitz

from .engine import DocumentData, EditError, requires_shaping
from .fonts import library, script_font
from .models import OCRRequest


def checked_box(box, page: dict) -> fitz.Rect:
    if not all(math.isfinite(value) for value in box):
        raise EditError("The selected region has invalid coordinates.")
    rect = fitz.Rect(box)
    if rect.width < 2 or rect.height < 2 or rect.x0 < 0 or rect.y0 < 0 or rect.x1 > page["width"] + 0.5 or rect.y1 > page["height"] + 0.5:
        raise EditError("Draw a region inside the page that is at least 2 points wide and high.")
    return rect


def page_image(page: fitz.Page, maximum_scale: float = 3):
    scale = min(maximum_scale, math.sqrt(16_000_000 / page.rect.get_area()))
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples), scale


def crop_region(image: Image.Image, box: fitz.Rect, scale: float):
    return image.crop((max(0, math.floor(box.x0 * scale)), max(0, math.floor(box.y0 * scale)),
                       min(image.width, math.ceil(box.x1 * scale)), min(image.height, math.ceil(box.y1 * scale))))


def colors(image: Image.Image) -> tuple[str, str]:
    small = image.copy()
    small.thumbnail((240, 80))
    pixels = list(small.get_flattened_data())
    # Most page backgrounds are close to a flat color. Quantization makes the
    # mode robust to JPEG noise; the user can override the estimate in the UI.
    quantized = small.quantize(colors=8).convert("RGB")
    counts = quantized.getcolors(small.width * small.height) or []
    background = max(counts, key=lambda item: item[0])[1] if counts else (255, 255, 255)
    ranked = sorted(pixels, key=lambda pixel: sum((pixel[i] - background[i]) ** 2 for i in range(3)), reverse=True)
    foreground = ranked[min(len(ranked) - 1, max(0, len(ranked) // 25))] if ranked else (0, 0, 0)
    if sum(abs(foreground[i] - background[i]) for i in range(3)) < 40:
        foreground = (0, 0, 0) if sum(background) > 384 else (255, 255, 255)
    hex_color = lambda color: "#" + "".join(f"{value:02x}" for value in color)
    return hex_color(background), hex_color(foreground)


def ink_image(image: Image.Image):
    gray = image.convert("L")
    if ImageStat.Stat(gray).mean[0] < 128:
        gray = ImageOps.invert(gray)
    gray = ImageOps.autocontrast(gray)
    ink = ImageOps.invert(gray).point(lambda value: 255 if value > 100 else 0)
    return ink, ink.getbbox()


@lru_cache(maxsize=128)
def font_sample(text: str, code: str):
    font = library.load(f"builtin:{code}")
    width = min(12000, max(100, math.ceil(font.font.text_length(text, fontsize=32)) + 40))
    with fitz.open() as doc:
        page = doc.new_page(width=width, height=120)
        page.insert_text((20, 70), text, fontsize=32, fontname=code)
        pix = page.get_pixmap(alpha=False)
        ink, box = ink_image(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
        if not box:
            return None
        return ink.crop(box).resize((240, 48)), box[2] - box[0], box[3] - box[1], 70 - box[1]


def estimate_font(text: str, box: fitz.Rect, image: Image.Image):
    if requires_shaping(text) or any(ord(char) > 255 for char in text):
        key = script_font(text) or "builtin:notos"
        return key, max(4, min(200, box.height)), box.y1, None
    ink, ink_box = ink_image(image)
    if not ink_box:
        return "builtin:helv", max(4, min(200, box.height)), box.y1, None
    normalized = ink.crop(ink_box).resize((240, 48))
    best = None
    for code in ("helv", "hebo", "heit", "hebi", "tiro", "tibo", "tiit", "tibi", "cour", "cobo"):
        sample = font_sample(text, code)
        if not sample:
            continue
        mask, width, height, baseline = sample
        difference = ImageStat.Stat(ImageChops.difference(normalized, mask)).mean[0] / 255
        aspect_penalty = abs(math.log((box.width / box.height) / (width / height))) * 0.15
        score = difference + aspect_penalty
        if best is None or score < best[0]:
            size = max(4, min(200, 32 * box.height / height))
            best = (score, f"builtin:{code}", size, box.y0 + baseline * size / 32)
    if best:
        return best[1], best[2], best[3], round(max(0, 1 - best[0]) * 100)
    return "builtin:helv", max(4, min(200, box.height)), box.y1, None


def register_ocr(data: DocumentData, page_number: int, request: OCRRequest) -> int:
    page_info = data.pages[page_number]
    # Validate the complete request before mutating any document state.
    boxes = [checked_box(line.bbox, page_info) for line in request.lines]
    if len(data.spans) + len(boxes) > 40000:
        raise EditError("This document has reached the 40,000 text-run limit.")
    pending = []
    with fitz.open(stream=data.source, filetype="pdf") as doc:
        page = doc[page_number]
        if any(annot.type[0] == fitz.PDF_ANNOT_REDACT for annot in page.annots() or ()):
            raise EditError("Resolve this page's pending redactions before using OCR recovery.")
        image, scale = page_image(page)
        for line, box in zip(request.lines, boxes):
            text = line.text.strip()
            if not text:
                continue
            # Preserve existing native edits, and make repeated recognition
            # idempotent rather than stacking duplicate OCR regions.
            covered = [box & fitz.Rect(span["bbox"]) for span in page_info["spans"] if span["editable"] and span.get("source") != "added"]
            if union_area([rect for rect in covered if not rect.is_empty]) > box.get_area() * 0.55:
                continue
            crop = crop_region(image, box, scale)
            background, color = colors(crop)
            key, size, baseline, match_score = estimate_font(text, box, crop)
            source = library.load(key)
            if source.missing(text):
                key = script_font(text) or "builtin:figo"
                source = library.load(key)
            # OCR baselines are useful for complex scripts; for Latin text the
            # visual font estimate also estimates the baseline from the ink.
            if requires_shaping(text) and line.baseline is not None and box.y0 <= line.baseline <= box.y1 + box.height:
                baseline = line.baseline
            sid = f"p{page_number}-ocr-{data.revision + 1}-{len(pending)}"
            span = {"id": sid, "page": page_number, "text": text, "bbox": list(box), "origin": [box.x0, baseline],
                    "font": "Unknown (scanned text)", "font_key": sid, "size": size, "color": color,
                    "opacity": 1.0, "bold": "Bold" in source.font.name, "italic": "Italic" in source.font.name,
                    "font_status": "estimated", "editable": True, "reason": None, "source": "ocr",
                    "confidence": line.confidence, "background": background, "suggested_font": key,
                    "font_match_score": match_score, "estimated_font": source.font.name}
            pending.append((span, source))
    for span, source in pending:
        # Invisible/damaged native text under the recognized region should not
        # compete with the new selection. Its source stream is removed on edit.
        box = fitz.Rect(span["bbox"])
        page_info["spans"] = [old for old in page_info["spans"] if old["editable"] or not box.intersects(fitz.Rect(old["bbox"]))]
        data.spans[span["id"]] = span
        data.fonts[span["id"]] = source
        page_info["spans"].append(span)
    if pending:
        data.revision += 1
        page_info["needs_ocr"] = False
        page_info["ocr_applied"] = True
        page_info["text_kind"] = "recovered"
        data.warnings = [warning for warning in data.warnings if not warning.startswith("No text layer")]
    return len(pending)


def register_region(data: DocumentData, page_number: int, coordinates) -> dict:
    page_info = data.pages[page_number]
    box = checked_box(coordinates, page_info)
    if len(data.spans) >= 40000:
        raise EditError("This document has reached the text-run limit.")
    # Avoid drawing over an already editable selection accidentally.
    if any(span["editable"] and span.get("source") != "added" and fitz.Rect(span["bbox"]).intersects(box) for span in page_info["spans"]):
        raise EditError("This region overlaps editable text. Select that text directly, or draw a region around an unrecognized area.")
    with fitz.open(stream=data.source, filetype="pdf") as doc:
        image, scale = page_image(doc[page_number])
        background, color = colors(crop_region(image, box, scale))
    size = max(4, min(24, box.height * 0.7))
    sid = f"p{page_number}-region-{data.revision + 1}"
    span = {"id": sid, "page": page_number, "text": "", "bbox": list(box),
            "origin": [box.x0, box.y0 + box.height * 0.8], "font": "Unknown (selected region)", "font_key": sid,
            "size": size, "color": color, "opacity": 1.0, "bold": False, "italic": False,
            "font_status": "estimated", "editable": True, "reason": None, "source": "region", "confidence": None,
            "background": background, "suggested_font": "builtin:helv", "estimated_font": "Helvetica"}
    data.spans[sid] = span
    data.fonts[sid] = library.load("builtin:helv")
    page_info["spans"].append(span)
    data.revision += 1
    return span


def register_text(data: DocumentData, page_number: int, coordinates, template: str | None = None) -> dict:
    """A new text object is independent of source artwork and never redacts it."""
    page_info = data.pages[page_number]
    box = checked_box(coordinates, page_info)
    if len(data.spans) >= 40000:
        raise EditError("This document has reached the text-run limit.")
    reference = data.spans.get(template) if template else None
    if template and not reference:
        raise EditError("The text to duplicate was not found.")
    size = reference["size"] if reference else max(4, min(24, box.height * 0.7))
    sid = f"p{page_number}-added-{data.revision + 1}"
    span = {"id": sid, "page": page_number, "text": "", "bbox": list(box),
            "origin": [box.x0, box.y0 + size * 0.8], "font": "Helvetica", "font_key": sid,
            "size": size, "color": "#242424", "opacity": 1.0, "bold": False, "italic": False,
            "font_status": "standard", "editable": True, "reason": None, "source": "added", "confidence": None,
            "background": None, "suggested_font": "builtin:helv", "rotation": 0}
    if reference:
        for key in ("font", "size", "color", "opacity", "bold", "italic", "font_status", "subset", "rotation"):
            if key in reference:
                span[key] = reference[key]
        span["origin"] = [box.x0 + reference["origin"][0] - reference["bbox"][0],
                          box.y0 + reference["origin"][1] - reference["bbox"][1]]
    data.spans[sid] = span
    data.fonts[sid] = data.fonts.get(reference["font_key"]) if reference else library.load("builtin:helv")
    if data.fonts[sid] is None:
        del data.fonts[sid]
    page_info["spans"].append(span)
    data.revision += 1
    return span


def union_area(rectangles: list[fitz.Rect]) -> float:
    """Combined coverage: fragmented native words must not receive duplicate OCR."""
    edges = sorted({x for rect in rectangles for x in (rect.x0, rect.x1)})
    area = 0.0
    for left, right in zip(edges, edges[1:]):
        intervals = sorted((rect.y0, rect.y1) for rect in rectangles if rect.x0 < right and rect.x1 > left)
        end, height = -math.inf, 0.0
        for bottom, top in intervals:
            height += max(0, top - max(bottom, end))
            end = max(end, top)
        area += (right - left) * height
    return area


def replace_region_background(page: fitz.Page, items: list[dict]):
    # Image-pixel redaction preserves original resolution and untouched native
    # content. Solid fills also cover outline artwork in the chosen rectangle.
    # Vector artwork beneath a fill is not a security redaction of that artwork.
    links = page.get_links()
    for item in items:
        box = fitz.Rect(item["span"]["bbox"])
        background = item["edit"].background or item["span"].get("background") or "#ffffff"
        box = (box + (-0.3, -0.3, 0.3, 0.3)) & page.rect
        color = tuple(int(background[i:i + 2], 16) / 255 for i in (1, 3, 5))
        page.add_redact_annot(box * page.derotation_matrix, fill=color, cross_out=False)
    page.apply_redactions(images=2, graphics=0, text=0)
    remaining = {link["xref"] for link in page.get_links()}
    for link in links:
        if link["xref"] not in remaining:
            page.insert_link(link)
