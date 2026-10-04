"""HarfBuzz-backed single-line layout using MuPDF Story's bundled shaper."""
from dataclasses import dataclass
from functools import lru_cache
import html
import json
import math
import re
import unicodedata

import pymupdf as fitz


def requires_shaping(text: str) -> bool:
    ranges = ((0x0900, 0x109F), (0x1780, 0x18AF), (0x1A00, 0x1CFF),
              (0xA800, 0xABFF), (0xFB1D, 0xFDFF), (0xFE70, 0xFEFF), (0x11000, 0x11FFF))
    return any(unicodedata.bidirectional(c) in ("R", "AL", "AN") or
               unicodedata.category(c).startswith("M") or
               any(start <= ord(c) <= end for start, end in ranges) for c in text)


def is_rtl(text: str) -> bool:
    for char in text:
        direction = unicodedata.bidirectional(char)
        if direction in ("R", "AL"):
            return True
        if direction == "L":
            return False
    return False


@dataclass
class ShapedLine:
    pdf: bytes
    bbox: tuple
    baseline: float
    clip: tuple
    size: float
    color: str
    opacity: float
    font_names: tuple[str, ...]

    @property
    def width(self):
        return self.bbox[2] - self.bbox[0]


@lru_cache(maxsize=24)
def shape_line(text: str, buffer: bytes, size: float, color: str, opacity: float, fallbacks: tuple[bytes, ...] = ()) -> ShapedLine:
    # A wide temporary page prevents automatic wrapping; only its measured
    # text region is transplanted into the real document.
    width = max(2000, min(1_000_000, len(text) * size * 2 + 600))
    height = max(600, size * 6)
    with fitz.open() as doc:
        page = doc.new_page(width=width, height=height)
        archive = fitz.Archive([(buffer, "reage.otf"), *((extra, f"fallback{index}.otf") for index, extra in enumerate(fallbacks))])
        direction = "rtl" if is_rtl(text) else "ltr"
        faces = "".join(f"@font-face {{font-family:Fallback{index};src:url(fallback{index}.otf);}}" for index in range(len(fallbacks)))
        families = ",".join(["ReageText", *(f"Fallback{index}" for index in range(len(fallbacks)))])
        css = f"""@font-face {{font-family:ReageText;src:url(reage.otf);}} {faces}
        * {{font-family:{families};font-size:{size}pt;line-height:1.5;margin:0;padding:0;color:{color};}}
        div {{white-space:nowrap;}}"""
        spare, _ = page.insert_htmlbox(fitz.Rect(100, 100, width - 100, height - 100),
                                      f'<div dir="{direction}">{html.escape(text)}</div>',
                                      css=css, archive=archive, scale_low=1, opacity=opacity)
        if spare < 0:
            raise ValueError("This text could not be laid out on one line. Shorten the selection.")
        spans = [span for block in page.get_text("dict")["blocks"] for line in block.get("lines", []) for span in line["spans"]]
        if not spans:
            raise ValueError("The shaping engine did not produce visible text.")
        baseline = spans[0]["origin"][1]
        if any(abs(span["origin"][1] - baseline) > size * 0.3 for span in spans):
            raise ValueError("The replacement requires multiple lines. Edit a shorter run.")
        bbox = fitz.Rect(spans[0]["bbox"])
        for span in spans[1:]:
            bbox |= fitz.Rect(span["bbox"])
        clip = (bbox + (-size, -size, size, size)) & page.rect
        return ShapedLine(doc.tobytes(garbage=4, deflate=True), tuple(bbox), baseline, tuple(clip),
                          size, color, opacity, tuple(dict.fromkeys(span["font"] for span in spans)))


def insert_shaped(page: fitz.Page, shaped: ShapedLine, x: float, baseline: float, text: str, rotation: int = 0):
    clip = fitz.Rect(shaped.clip)
    dx, dy = x - shaped.bbox[0], baseline - shaped.baseline
    target = clip + (dx, dy, dx, dy)
    with fitz.open(stream=shaped.pdf, filetype="pdf") as source:
        page.show_pdf_page(target, source, 0, clip=clip, keep_proportion=False, overlay=True)
    # A shaped cluster can paint more glyphs than there are Unicode characters.
    # Wrapping those glyphs directly in ActualText leaves duplicate marks in
    # some extractors. Group the rendered line as one colorized Type3 glyph,
    # retaining its vector artwork and embedded fonts, then attach one logical
    # Unicode string to that glyph. Reage's font metadata enables native re-edit.
    doc = page.parent
    contents = page.get_contents()[-1]
    name = re.search(rb"/([^ /]+)\s+Do", doc.xref_stream(contents)).group(1).decode()
    form = next(ref for ref, resource, *_ in page.get_xobjects() if resource == name)
    point = fitz.Point(x, baseline) * ~page.transformation_matrix
    rect = (fitz.Rect(shaped.bbox) + (dx, dy, dx, dy)) * ~page.transformation_matrix
    bbox = [rect.x0 - point.x, rect.y0 - point.y, rect.x1 - point.x, rect.y1 - point.y]
    glyph = doc.get_new_xref()
    doc.update_object(glyph, "<<>>")
    doc.update_stream(glyph, f"{rect.width} 0 d0\nq 1 0 0 1 {-point.x} {-point.y} cm /PlacedForm Do Q".encode())
    font = doc.get_new_xref()
    font_name = f"ReageShaped{font}"
    names = fitz.get_pdf_str(json.dumps(shaped.font_names))
    doc.update_object(font, f"""<< /Type /Font /Subtype /Type3 /Name /{font_name}
      /FontBBox [{' '.join(map(str, bbox))}] /FontMatrix [{1 / shaped.size} 0 0 {1 / shaped.size} 0 0]
      /CharProcs << /line {glyph} 0 R >> /Encoding << /Type /Encoding /Differences [1 /line] >>
      /FirstChar 1 /LastChar 1 /Widths [{rect.width}]
      /ReageFonts {names} /ReageOpacity {shaped.opacity}
      /Resources << /XObject << /PlacedForm {form} 0 R >> >> >>""")
    kind, resources = doc.xref_get_key(page.xref, "Resources")
    if kind == "xref":
        doc.xref_set_key(int(resources.split()[0]), f"Font/{font_name}", f"{font} 0 R")
    else:
        doc.xref_set_key(page.xref, f"Resources/Font/{font_name}", f"{font} 0 R")
    actual_text = (b"\xfe\xff" + text.encode("utf-16-be")).hex()
    color = " ".join(str(int(shaped.color[i:i + 2], 16) / 255) for i in (1, 3, 5))
    cosine, sine = round(math.cos(math.radians(rotation))), round(math.sin(math.radians(rotation)))
    doc.update_stream(contents, f"q {color} rg\n/Span << /ActualText <{actual_text}> >> BDC\nBT /{font_name} {shaped.size} Tf {cosine} {sine} {-sine} {cosine} {point.x} {point.y} Tm <01> Tj ET\nEMC\nQ".encode())
