"""Local acceptance benchmark; the user-supplied PDF is never copied to public assets."""
from collections import Counter
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops, ImageDraw
import pytest

from server.engine import export_pdf, inspect_document, prepare_edits
from server.models import OCRLine, OCRRequest, TextEdit
from server.recovery import register_ocr

PDF = Path(__file__).resolve().parent.parent / "demo" / "demo.pdf"


@pytest.fixture
def benchmark():
    if not PDF.exists():
        pytest.skip("Place the local benchmark at demo/demo.pdf")
    return inspect_document(PDF.read_bytes(), "demo.pdf")


def pixels(page):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def assert_surroundings_unchanged(source, output, boxes):
    with fitz.open(stream=source, filetype="pdf") as before, fitz.open(stream=output, filetype="pdf") as after:
        difference = ImageChops.difference(pixels(before[0]), pixels(after[0]))
        draw = ImageDraw.Draw(difference)
        for box in boxes:
            rect = (fitz.Rect(box) + (-2, -2, 2, 2)) * 2
            draw.rectangle(tuple(rect), fill=(0, 0, 0))
        assert difference.getbbox() is None, "Pixels changed outside the edited region"
        assert after[0].rect == before[0].rect


def test_benchmark_embedded_faces_and_duplicate_subsets_are_resolved(benchmark):
    assert len(benchmark.pages) == 1
    assert len(benchmark.spans) == 126
    reusable = [span for span in benchmark.spans.values() if not span["font"].startswith("Type3")]
    assert all(span["font_status"] in ("embedded", "repaired", "standard") for span in reusable)
    tamil = [span for span in reusable if "Tamil" in span["font"]]
    assert tamil and all(span["font_key"].endswith(":58") for span in tamil)
    assert all(span["editable"] for span in benchmark.spans.values())


def test_benchmark_noop_export_is_byte_identical(benchmark):
    assert export_pdf(benchmark, []) == PDF.read_bytes()


def test_benchmark_native_edit_preserves_style_images_and_every_other_pixel(benchmark):
    span = next(s for s in benchmark.spans.values() if s["text"] == "Address")
    edit = TextEdit(span_id=span["id"], text="Details", font="original", fit=True)
    prepared = prepare_edits(benchmark, [edit])
    output = export_pdf(benchmark, [edit])
    reopened = inspect_document(output, "roundtrip.pdf")
    replacement = next(s for s in reopened.spans.values() if s["text"] == "Details")
    assert replacement["font"] == span["font"]
    assert replacement["size"] == pytest.approx(span["size"], abs=0.001)
    assert replacement["color"] == span["color"]
    assert replacement["origin"] == pytest.approx(span["origin"], abs=0.001)
    assert_surroundings_unchanged(benchmark.source, output, [span["bbox"], prepared[0]["bbox"]])
    with fitz.open(stream=benchmark.source, filetype="pdf") as before, fitz.open(stream=output, filetype="pdf") as after:
        images = lambda doc: Counter(item["digest"] for item in doc[0].get_image_info(hashes=True))
        assert images(before) == images(after)


def test_benchmark_hindi_replacement_is_shaped_and_searchable(benchmark):
    span = next(s for s in benchmark.spans.values() if s["text"] == "पता")
    edit = TextEdit(span_id=span["id"], text="नाम", font="auto", fit=True)
    prepared = prepare_edits(benchmark, [edit])
    assert prepared[0]["shaped"] is not None
    output = export_pdf(benchmark, [edit])
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert "नाम" in doc[0].get_text()
    assert_surroundings_unchanged(benchmark.source, output, [span["bbox"], prepared[0]["bbox"]])


def test_benchmark_quarter_turn_text_preserves_orientation(benchmark):
    span = next(s for s in benchmark.spans.values() if s.get("rotation") == 90)
    edit = TextEdit(span_id=span["id"], text="Details", font="original", fit=True)
    prepared = prepare_edits(benchmark, [edit])
    output = export_pdf(benchmark, [edit])
    reopened = inspect_document(output, "rotated-label.pdf")
    replacement = next(s for s in reopened.spans.values() if s["text"] == "Details")
    assert replacement["rotation"] == 90
    assert replacement["origin"] == pytest.approx(span["origin"], abs=0.001)
    assert_surroundings_unchanged(benchmark.source, output, [span["bbox"], prepared[0]["bbox"]])


def test_benchmark_ocr_skips_a_line_already_covered_by_native_fragments(benchmark):
    spans = [s for s in benchmark.spans.values() if 607 < s["bbox"][1] < 609 and s["bbox"][0] > 320]
    assert len(spans) == 2
    box = fitz.Rect(spans[0]["bbox"]) | fitz.Rect(spans[1]["bbox"])
    request = OCRRequest(language="eng+hin", lines=[OCRLine(text="पता:", bbox=tuple(box), confidence=98)])
    assert register_ocr(benchmark, 0, request) == 0


def test_benchmark_local_ocr_edit_preserves_native_text_and_surrounding_pixels(benchmark):
    # Measured by the real bilingual browser OCR benchmark.
    box = (344.3333, 463.6667, 429.0, 469.6667)
    request = OCRRequest(language="eng+hin", lines=[OCRLine(text="Aadhaar is unique and secure.", bbox=box, confidence=95)])
    assert register_ocr(benchmark, 0, request) == 1
    span = next(s for s in benchmark.spans.values() if s["source"] == "ocr")
    edit = TextEdit(span_id=span["id"], text="Document text is editable.", font="auto", fit=True)
    prepared = prepare_edits(benchmark, [edit])
    output = export_pdf(benchmark, [edit])
    reopened = inspect_document(output, "ocr-local.pdf")
    assert any(s["text"] == "Address" for s in reopened.spans.values())
    assert any(s["text"] == "Document text is editable." for s in reopened.spans.values())
    assert_surroundings_unchanged(benchmark.source, output, [box, prepared[0]["bbox"]])
