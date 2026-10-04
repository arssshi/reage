"""Conservative, font-aware text replacement on an immutable PDF source.

Edits are validated as a transaction, removed with text-only redactions, then
reinserted at the original baseline. Preview and export use this same pipeline.
"""

from dataclasses import dataclass, field
import math
import json
import unicodedata

import pymupdf as fitz

from .models import TextEdit
from .fonts import BASE_FONTS, FontSource, choose_font, embedded_candidates, normalize_font, repair_unicode_map, resolve_embedded
from .shaping import insert_shaped, is_rtl, requires_shaping, shape_line

fitz.TOOLS.set_small_glyph_heights(True)

class EditError(ValueError):
    def __init__(self, message: str, span_id: str | None = None, code: str = "invalid_edit"):
        super().__init__(message)
        self.message, self.span_id, self.code = message, span_id, code


@dataclass
class DocumentData:
    source: bytes
    name: str
    pages: list[dict] = field(default_factory=list)
    spans: dict[str, dict] = field(default_factory=dict)
    fonts: dict[str, FontSource] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    revision: int = 0


def inspect_document(source: bytes, name: str) -> DocumentData:
    data = DocumentData(source=source, name=name)
    try:
        doc = fitz.open(stream=source, filetype="pdf")
    except Exception as exc:
        raise EditError("This file could not be opened as a PDF.", code="invalid_pdf") from exc
    with doc:
        extracted_fonts: dict[int, FontSource] = {}
        if doc.needs_pass:
            raise EditError("This PDF is password protected. Open an unlocked copy to edit it.", code="encrypted_pdf")
        if not 0 < len(doc) <= 300:
            raise EditError("Please use a PDF with 1–300 pages.", code="page_limit")
        if doc.get_sigflags() > 0:
            data.warnings.append("This PDF has signature fields. Exporting an edited copy invalidates existing digital signatures.")
        total_spans = 0
        total_glyphs = 0
        for page in doc:
            candidates = embedded_candidates(doc, page, extracted_fonts)
            shaped_fonts = {}
            for xref, _, font_type, base, resource, *_ in page.get_fonts(full=True):
                if font_type != "Type3":
                    continue
                try:
                    _, encoded_names = doc.xref_get_key(xref, "ReageFonts")
                    names = json.loads(encoded_names)
                    if not isinstance(names, list) or not names or not all(isinstance(name, str) for name in names):
                        continue
                    sources = [resolve_embedded(name, candidates) for name in names]
                    if not all(sources):
                        continue
                    primary, *fallbacks = sources
                    source = FontSource(primary.font, buffer=primary.buffer, kind="embedded", aliases=primary.aliases,
                                        subset_characters=primary.subset_characters, fallbacks=tuple(fallbacks))
                    _, alpha = doc.xref_get_key(xref, "ReageOpacity")
                    opacity = max(0, min(1, float(alpha)))
                    shaped_fonts[base] = shaped_fonts[resource] = (source, opacity)
                except (ValueError, TypeError):
                    continue
            has_redactions = any(annot.type[0] == fitz.PDF_ANNOT_REDACT for annot in page.annots() or ())
            traces = page.get_texttrace()
            special_text = [fitz.Rect(trace["bbox"]) for trace in traces if trace["type"] != 0 or trace.get("layer")]
            # Renderer glyph IDs plus the PDF's ToUnicode mapping can repair a
            # damaged/missing Unicode cmap without replacing the font outlines.
            for candidate in candidates:
                mapping = {}
                for trace in traces:
                    if resolve_embedded(trace["font"], candidates, [(char[0], char[1]) for char in trace["chars"]]) is candidate:
                        mapping.update({char[0]: char[1] for char in trace["chars"]})
                if candidate.buffer and not candidate.repaired:
                    repaired = repair_unicode_map(candidate.buffer, mapping)
                    if repaired:
                        try:
                            candidate.font = fitz.Font(fontbuffer=repaired)
                            candidate.buffer = repaired
                            candidate.repaired = True
                        except Exception:
                            pass
            # Text extraction uses unrotated coordinates. Rotated pages remain
            # viewable, but are explicitly excluded from this editing pipeline.
            page_info = {"index": page.number, "width": page.rect.width,
                         "height": page.rect.height, "rotation": page.rotation, "spans": []}
            if page.rect.width <= 0 or page.rect.height <= 0 or page.rect.width > 4000 or page.rect.height > 4000:
                raise EditError("A page exceeds the supported 4,000-point dimension limit.")
            text = page.get_text("rawdict", flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)
            for bi, block in enumerate(text["blocks"]):
                for li, line in enumerate(block.get("lines", [])):
                    for si, raw in enumerate(line["spans"]):
                        raw["text"] = "".join(char["c"] for char in raw["chars"])
                        if not raw["text"].strip():
                            continue
                        sid = f"p{page.number}-b{bi}-l{li}-s{si}"
                        font_key = f"{page.number}:{raw['font']}"
                        reason = None
                        angle = (round(math.degrees(math.atan2(-line["dir"][1], line["dir"][0]))) + 360) % 360
                        orthogonal = angle in (0, 90, 180, 270) and abs(line["dir"][0] - math.cos(math.radians(angle))) < 0.001 and abs(line["dir"][1] + math.sin(math.radians(angle))) < 0.001
                        if has_redactions:
                            reason = "This page has pending redactions. Apply or remove those in the source document before editing."
                        elif raw["size"] < 1 or raw.get("alpha", 255) == 0:
                            reason = "Invisible or extremely small text is currently view-only."
                        elif page.rotation or not orthogonal or line.get("wmode"):
                            reason = "Rotated pages, angled text, and vertical writing modes are currently view-only."
                        elif any(region.intersects(fitz.Rect(raw["bbox"])) for region in special_text):
                            reason = "Outlined, invisible, or optional-layer text is currently view-only."
                        elif raw["text"].count("\ufffd") > max(1, len(raw["text"]) // 4):
                            reason = "The PDF text encoding is damaged. Use Scan text (OCR) or Replace region."
                        normalized = normalize_font(raw["font"])
                        matched = shaped_fonts[raw["font"]][0] if raw["font"] in shaped_fonts else resolve_embedded(raw["font"], candidates)
                        if matched is None:
                            box = fitz.Rect(raw["bbox"])
                            observed = [(char[0], char[1]) for trace in traces
                                        if normalize_font(trace["font"]).startswith(normalized)
                                        for char in trace["chars"] if box.contains(fitz.Point(char[2]))]
                            matched = resolve_embedded(raw["font"], candidates, observed)
                        if matched and matched.pdf_xref is not None:
                            font_key += f":{matched.pdf_xref}"
                        if font_key not in data.fonts:
                            if matched:
                                data.fonts[font_key] = matched
                            # Only actual PDF Base-14 faces get a built-in font.
                            # Arial / Calibri / lookalikes are never silently substituted.
                            if font_key not in data.fonts and normalized in BASE_FONTS:
                                base = BASE_FONTS[normalized]
                                data.fonts[font_key] = FontSource(fitz.Font(base), base_name=base, kind="standard")
                        font_source = data.fonts.get(font_key)
                        if font_source and font_source.subset_characters is not None:
                            font_source.subset_characters.update(raw["text"])
                        bbox = list(raw["bbox"])
                        if page.rotation:
                            bbox = list(fitz.Rect(bbox) * page.rotation_matrix)
                        geometry = raw["chars"][:min(4000, max(0, 200_000 - total_glyphs))]
                        total_glyphs += len(geometry)
                        span = {
                            "id": sid, "page": page.number, "text": raw["text"],
                            "bbox": bbox, "origin": list(raw["origin"]),
                            "font": raw["font"], "font_key": font_key,
                            "size": raw["size"], "color": f"#{raw['color']:06x}",
                            "opacity": raw.get("alpha", 255) / 255,
                            "bold": bool(raw["flags"] & 16), "italic": bool(raw["flags"] & 2),
                            "font_status": "repaired" if font_source and font_source.repaired else "embedded" if font_source and font_source.buffer else "standard" if font_source else "unavailable",
                            "editable": reason is None, "reason": reason,
                            "source": "native", "confidence": None, "background": None,
                            "rotation": angle,
                            "suggested_font": None,
                            "anchor": {"page": page.number, "block": bi, "line": li, "run": si,
                                       "font_xref": font_source.pdf_xref if font_source else None,
                                       "structure": "inferred"},
                            "subset": bool(font_source and font_source.subset_characters is not None),
                            "glyphs": [{"text": char["c"], "bbox": list(fitz.Rect(char["bbox"]) * page.rotation_matrix)} for char in geometry],
                        }
                        if raw["font"] in shaped_fonts:
                            source, opacity = shaped_fonts[raw["font"]]
                            span["font"] = source.display_name
                            span["opacity"] = opacity
                            span["bold"] = bool(source.font.flags.get("bold"))
                            span["italic"] = bool(source.font.flags.get("italic"))
                        data.spans[sid] = span
                        page_info["spans"].append(span)
                        total_spans += 1
                        if total_spans > 40000:
                            raise EditError("This PDF contains too many text runs. Please split it into smaller documents.")
            page_info["needs_ocr"] = not any(span["editable"] for span in page_info["spans"])
            page_info["text_kind"] = "text" if page_info["spans"] else "image" if page.get_images() else "no-text"
            page_info["ocr_applied"] = False
            data.pages.append(page_info)
    if not data.spans:
        data.warnings.append("No text layer was found. Use Scan text (OCR) to recognize words, or Replace region to edit any visible area.")
    return data


def redaction_rect(span: dict) -> fitz.Rect:
    if span.get("rotation", 0):
        x, y = span["origin"]
        box = (fitz.Rect(span["bbox"]) + (-x, -y, -x, -y)) * fitz.Matrix(span["rotation"])
        strip = fitz.Rect(box.x0 + 0.02, -span["size"] * 0.3, box.x1 - 0.02, -span["size"] * 0.15)
        return strip * fitz.Matrix(-span["rotation"]) + (x, y, x, y)
    x0, _, x1, _ = span["bbox"]
    baseline = span["origin"][1]
    # A narrow strip through the glyphs avoids touching adjacent text lines.
    return fitz.Rect(x0 + 0.02, baseline - span["size"] * 0.3,
                     max(x0 + 0.03, x1 - 0.02), baseline - span["size"] * 0.15)


def prepare_edits(data: DocumentData, edits: list[TextEdit]) -> list[dict]:
    prepared: list[dict] = []
    ids: set[str] = set()
    for edit in edits:
        span = data.spans.get(edit.span_id)
        if not span:
            raise EditError("The selected text no longer belongs to this document.", edit.span_id)
        if edit.span_id in ids:
            raise EditError("A text run may only be edited once per transaction.", edit.span_id)
        ids.add(edit.span_id)
        if not span["editable"]:
            raise EditError(span["reason"], edit.span_id)
        edit = edit.model_copy(update={"text": unicodedata.normalize("NFC", edit.text)})
        if any(unicodedata.category(c) in ("Cc", "Cs") or c in "\n\r\t\u2028\u2029" for c in edit.text):
            raise EditError("Edit one text run at a time. Line breaks, tabs, and control characters are not supported.", edit.span_id)
        font, resolution = None, "Text removed"
        if edit.text:
            try:
                font, resolution = choose_font(span, edit.text, edit.font, data.fonts.get(span["font_key"]))
            except ValueError as exc:
                raise EditError(str(exc), edit.span_id, "font_unavailable") from exc
        size = edit.size if edit.size is not None else span["size"]
        width = font.font.text_length(edit.text, fontsize=size) if font and edit.text else 0
        shaped = None
        if font and edit.text and (requires_shaping(edit.text) or font.fallbacks):
            try:
                shaped = shape_line(edit.text, font.buffer or font.font.buffer, size, edit.color or span["color"], span["opacity"],
                                    tuple(extra.buffer or extra.font.buffer for extra in font.fallbacks))
                width = shaped.width
            except ValueError as exc:
                raise EditError(str(exc), edit.span_id, "shaping_failed") from exc
        rotation = span.get("rotation", 0)
        original_width = span["bbox"][3] - span["bbox"][1] if rotation in (90, 270) else span["bbox"][2] - span["bbox"][0]
        if edit.fit and width > original_width:
            size *= original_width / width
            width = original_width
            if size < 1:
                raise EditError("The text is too long to fit at a readable size.", edit.span_id)
            if shaped:
                shaped = shape_line(edit.text, font.buffer or font.font.buffer, size, edit.color or span["color"], span["opacity"],
                                    tuple(extra.buffer or extra.font.buffer for extra in font.fallbacks))
                width = shaped.width
        x, y = span["origin"]
        if shaped and not rotation:
            x = span["bbox"][2] - width if is_rtl(span["text"]) else span["bbox"][0]
        # Keep the original baseline and proportional selection-box metrics.
        ratio = size / span["size"]
        old_local = (fitz.Rect(span["bbox"]) + (-x, -y, -x, -y)) * fitz.Matrix(rotation)
        local = fitz.Rect(0, old_local.y0 * ratio, width, old_local.y1 * ratio)
        if font and edit.font != "original":
            height = font.font.ascender - font.font.descender
            local.y0 = -size * font.font.ascender / height
            local.y1 = -size * font.font.descender / height
        if shaped:
            local = fitz.Rect(0, shaped.bbox[1] - shaped.baseline, width, shaped.bbox[3] - shaped.baseline)
        bbox = list(local * fitz.Matrix(-rotation) + (x, y, x, y))
        page = data.pages[span["page"]]
        if edit.text and (bbox[0] < -0.5 or bbox[1] < -0.5 or bbox[2] > page["width"] + 0.5 or bbox[3] > page["height"] + 0.5):
            raise EditError("The replacement would extend outside the page. Enable fit to original width, shorten the text, or reduce its size.", edit.span_id, "overflow")
        prepared.append({"edit": edit, "span": span, "font": font, "size": size, "shaped": shaped,
                          "bbox": bbox, "origin": (x, y), "color": edit.color or span["color"], "resolution": resolution})

    changed = {item["span"]["id"]: item for item in prepared}
    for item in prepared:
        span, edit = item["span"], item["edit"]
        strip = redaction_rect(span)
        for other in data.pages[span["page"]]["spans"]:
            if other["id"] == span["id"]:
                continue
            if span.get("source", "native") == "native" and other.get("source", "native") == "native" and strip.intersects(fitz.Rect(other["bbox"])) and other["id"] not in changed:
                raise EditError("This text overlaps another text run. Editing it could remove neighboring text, so it is currently view-only.", edit.span_id, "overlapping_source")
            other_item = changed.get(other["id"])
            if other_item and not other_item["edit"].text:
                continue
            other_bbox = other_item["bbox"] if other_item else other["bbox"]
            overlap = fitz.Rect(item["bbox"]) & fitz.Rect(other_bbox)
            old_overlap = fitz.Rect(span["bbox"]) & fitz.Rect(other["bbox"])
            if edit.text and not overlap.is_empty and overlap.width > 0.8 and overlap.height > min(item["size"], other["size"]) * 0.35 and overlap.get_area() > old_overlap.get_area() + 1:
                raise EditError("The replacement would overlap nearby text. Enable fit to original width, shorten the text, or reduce its size.", edit.span_id, "text_collision")
    return prepared


def public_changes(prepared: list[dict]) -> list[dict]:
    return [{"span_id": p["span"]["id"], "bbox": p["bbox"], "size": p["size"],
             "text": p["edit"].text, "color": p["color"], "font_name": p["font"].display_name if p["font"] else "",
             "font_resolution": p["resolution"], "font_id": p["font"].id if p["font"] else ""} for p in prepared]


def apply_edits(data: DocumentData, edits: list[TextEdit], page_only: int | None = None) -> tuple[fitz.Document, list[dict]]:
    prepared = prepare_edits(data, edits)
    doc = fitz.open(stream=data.source, filetype="pdf")
    try:
        page_numbers = {p["span"]["page"] for p in prepared}
        if page_only is not None:
            page_numbers &= {page_only}
        for page_number in page_numbers:
            page = doc[page_number]
            page_edits = [p for p in prepared if p["span"]["page"] == page_number]
            links = page.get_links()
            native_edits = [item for item in page_edits if item["span"].get("source", "native") == "native"]
            recovery_edits = [item for item in page_edits if item["span"].get("source", "native") != "native"]
            for item in native_edits:
                page.add_redact_annot(redaction_rect(item["span"]), fill=False, cross_out=False)
            # Never remove images or vector art behind text.
            if native_edits:
                page.apply_redactions(images=0, graphics=0, text=0)
            # MuPDF removes intersecting links during redaction; restore them.
            remaining = {link["xref"] for link in page.get_links()}
            for link in links:
                if link["xref"] not in remaining:
                    page.insert_link(link)
            if recovery_edits:
                from .recovery import replace_region_background
                replace_region_background(page, recovery_edits)
            for index, item in enumerate(page_edits):
                edit, font, span = item["edit"], item["font"], item["span"]
                if not edit.text:
                    continue
                origin = fitz.Point(item["origin"])
                rotation = span.get("rotation", 0)
                if span.get("source") != "native" and page.rotation:
                    origin = origin * page.derotation_matrix
                    rotation = page.rotation
                if item["shaped"]:
                    insert_shaped(page, item["shaped"], origin.x, origin.y, edit.text, rotation)
                    continue
                # Base-14 simple fonts cannot encode Unicode above Latin-1.
                # Embed the same built-in face in that case, without changing
                # its glyphs or metrics (e.g. curly quotes, bullets, and euros).
                buffer = font.buffer or (font.font.buffer if any(ord(c) > 255 for c in edit.text) else None)
                font_name = font.base_name
                if buffer:
                    used_names = {entry[4] for entry in page.get_fonts()}
                    font_name = f"ReageEdit{index}"
                    while font_name in used_names:
                        font_name += "x"
                    page.insert_font(fontname=font_name, fontbuffer=buffer)
                color = tuple(int(item["color"][i:i + 2], 16) / 255 for i in (1, 3, 5))
                page.insert_text(origin, edit.text, fontname=font_name, rotate=rotation,
                                 fontsize=item["size"], color=color, fill_opacity=span["opacity"])
        return doc, public_changes(prepared)
    except Exception:
        doc.close()
        raise


def render_page(data: DocumentData, page_number: int, edits: list[TextEdit], scale: float) -> bytes:
    if not 0 <= page_number < len(data.pages):
        raise EditError("That page does not exist.")
    doc, _ = apply_edits(data, edits, page_only=page_number)
    with doc:
        page = doc[page_number]
        # Bound memory even for unusually large pages at high zoom.
        scale = min(scale, math.sqrt(16_000_000 / (page.rect.width * page.rect.height)))
        return page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).tobytes("png")


def export_pdf(data: DocumentData, edits: list[TextEdit]) -> bytes:
    if not edits:
        return data.source
    doc, _ = apply_edits(data, edits)
    with doc:
        # Garbage collection removes obsolete text streams from the edited copy.
        return doc.tobytes(garbage=4, deflate=True)
