import pymupdf as fitz
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageChops

from server.app import app, store
from server.demo import create_scanned_demo
from server.engine import EditError, export_pdf, inspect_document
from server.models import OCRLine, OCRRequest, TextEdit
from server.recovery import register_ocr, register_region


def request():
    return OCRRequest(language="eng", lines=[OCRLine(text="This text started as pixels.", bbox=(45, 160, 250, 178), baseline=175, confidence=97)])


def test_image_only_page_gets_selectable_regions_and_searchable_replacement():
    data = inspect_document(create_scanned_demo(), "scan.pdf")
    assert not data.spans
    assert data.pages[0]["needs_ocr"]
    assert register_ocr(data, 0, request()) == 1
    assert register_ocr(data, 0, request()) == 0  # No duplicate text boxes.
    span = next(iter(data.spans.values()))
    assert span["source"] == "ocr" and span["font_status"] == "estimated"
    assert span["background"].startswith("#") and span["confidence"] == 97
    output = export_pdf(data, [TextEdit(span_id=span["id"], text="Now editable.", font="auto", fit=True)])
    with fitz.open(stream=output, filetype="pdf") as after, fitz.open(stream=data.source, filetype="pdf") as before:
        assert "Now editable." in after[0].get_text()
        # The old image object was removed rather than hidden under a patch.
        assert len(after[0].get_images()) == 1
        assert before.extract_image(before[0].get_images()[0][0])["image"] != after.extract_image(after[0].get_images()[0][0])["image"]
        # Local pixel replacement must leave the original resolution and all
        # rendered pixels outside the selected region unchanged.
        clip = fitz.Rect(10, 260, 580, 400)
        matrix = fitz.Matrix(3, 3)
        pixels = [page.get_pixmap(matrix=matrix, clip=clip) for page in (before[0], after[0])]
        images = [Image.frombytes("RGB", (pix.width, pix.height), pix.samples) for pix in pixels]
        difference = ImageChops.difference(*images)
        assert difference.getbbox() is None


def test_manual_region_works_without_ocr_or_embedded_fonts():
    data = inspect_document(create_scanned_demo(), "scan.pdf")
    span = register_region(data, 0, (45, 285, 510, 345))
    edit = TextEdit(span_id=span["id"], text="A replacement without OCR.", font="auto", fit=True)
    with fitz.open(stream=export_pdf(data, [edit]), filetype="pdf") as doc:
        assert "A replacement without OCR." in doc[0].get_text()
    # A region can also be erased without inserting replacement text.
    with fitz.open(stream=export_pdf(data, [edit.model_copy(update={"text": ""})]), filetype="pdf") as doc:
        assert not doc[0].get_text().strip()


def test_ocr_registration_is_transactional_for_invalid_geometry():
    data = inspect_document(create_scanned_demo(), "scan.pdf")
    bad = OCRLine(text="Outside", bbox=(-10, 20, 200, 50), confidence=90)
    with pytest.raises(EditError):
        register_ocr(data, 0, OCRRequest(language="eng", lines=[*request().lines, bad]))
    assert not data.spans and data.revision == 0


@pytest.mark.parametrize("text", ["New text", "नमस्ते"])
def test_region_recovery_preserves_rotated_page_geometry(text):
    with fitz.open(stream=create_scanned_demo(), filetype="pdf") as doc:
        doc[0].set_rotation(90)
        data = inspect_document(doc.tobytes(), "rotated-scan.pdf")
    span = register_region(data, 0, (30, 40, 190, 70))
    edit = TextEdit(span_id=span["id"], text=text, font="auto", fit=True)
    with fitz.open(stream=export_pdf(data, [edit]), filetype="pdf") as result:
        assert result[0].rotation == 90
        assert result[0].rect.width == data.pages[0]["width"]
        assert text in result[0].get_text()


def test_font_upload_and_ocr_endpoints(tmp_path, monkeypatch):
    from server import fonts
    monkeypatch.setattr(fonts, "cache_root", lambda: tmp_path)
    store.clear()
    with TestClient(app) as client:
        invalid = client.post("/api/fonts/upload", files={"file": ("bad.ttf", b"not a font")})
        assert invalid.status_code == 422
        uploaded = client.post("/api/fonts/upload", files={"file": ("fira.ttf", fitz.Font("figo").buffer)})
        assert uploaded.status_code == 200
        data = client.post("/api/demo/scanned").json()
        base = f"/api/documents/{data['id']}"
        response = client.post(f"{base}/pages/0/ocr", json=request().model_dump())
        assert response.status_code == 200
        assert response.json()["recognized"] == 1
        span = response.json()["document"]["pages"][0]["spans"][0]
        probe = client.post(f"{base}/font-probe", json={"span_id": span["id"], "text": "New text", "font": uploaded.json()["id"]})
        assert probe.status_code == 200
        assert probe.json()["name"]
        assert client.post(f"{base}/pages/99/ocr", json=request().model_dump()).status_code == 404
        assert client.get("/api/ocr-data/not-a-language.traineddata").status_code == 422
        assert any(language["code"] == "eng" for language in client.get("/api/ocr/languages").json()["languages"])
    store.clear()
