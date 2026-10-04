"""Check browser-exported benchmark PDFs against the untouched local source."""
from collections import Counter
from hashlib import sha256
from pathlib import Path
import json
import sys

import pymupdf as fitz
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from server.engine import inspect_document


def pixels(page):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def main():
    source = (ROOT / "demo/demo.pdf").read_bytes()
    original = inspect_document(source, "demo.pdf")
    exports = sorted((ROOT / "test-results").rglob("benchmark-*-edited.pdf"))
    if len(exports) < 3:
        sys.exit("Run npm run test:benchmark first to create all three browser exports.")
    report = {"source_sha256": sha256(source).hexdigest(), "native_runs": len(original.spans),
              "font_status": dict(Counter(s["font_status"] for s in original.spans.values())), "exports": []}
    for path in exports:
        output = path.read_bytes()
        reopened = inspect_document(output, path.name)
        if "ocr" in path.name:
            boxes = json.loads((path.parent / "edited-regions.json").read_text())
            assert any(s["text"] == "Address" for s in reopened.spans.values())
            assert any(s["text"] == "Document text is editable." for s in reopened.spans.values())
        else:
            old, new = ("पता", "नाम") if "hindi" in path.name else ("Address", "Details")
            boxes = [next(s["bbox"] for s in original.spans.values() if s["text"] == old),
                     next(s["bbox"] for s in reopened.spans.values() if s["text"] == new)]
        with fitz.open(stream=source, filetype="pdf") as before, fitz.open(stream=output, filetype="pdf") as after:
            assert len(after) == len(before) and after[0].rect == before[0].rect
            difference = ImageChops.difference(pixels(before[0]), pixels(after[0]))
            draw = ImageDraw.Draw(difference)
            for box in boxes:
                draw.rectangle(tuple((fitz.Rect(box) + (-2, -2, 2, 2)) * 2), fill=(0, 0, 0))
            assert difference.getbbox() is None, f"Unexpected changes outside the selected region: {path.name}"
        report["exports"].append({"file": path.name, "outside_region_pixels_changed": 0,
                                  "searchable": True, "page_geometry_preserved": True})
    assert (ROOT / "demo/demo.pdf").read_bytes() == source
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
