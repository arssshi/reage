from base64 import b64decode
from io import BytesIO
import json

from fastapi.testclient import TestClient
from PIL import Image, ImageChops
import pymupdf as fitz
import pytest

from server.app import store
from server.cloud import app, MAX_DOCUMENT, MAX_REQUEST
from server.demo import create_demo, create_scanned_demo
from server.inline import wrap_cff
from server.recovery import font_sample


def operation(client, path, source=None, payload=None, recovery=None, fonts=(), file=None, compositions=None):
    metadata = {"path": path, "id": "test-document", "name": "Generated.pdf", "payload": payload or {},
                "recovery": recovery or [], "compositions": compositions or {}}
    files = [("document", ("source.pdf", source, "application/pdf"))] if source is not None else []
    files += [("fonts", ("font.otf", font)) for font in fonts]
    if file is not None:
        files.append(("file", ("font.otf", file)))
    return client.post("/api/process", data={"operation": json.dumps(metadata)}, files=files)


def test_hosted_native_workflow_is_stateless_and_preserves_surrounding_pixels():
    source = create_demo()
    before_ids = set(store)
    with TestClient(app) as client:
        assert client.get("/api/health").json()["mode"] == "hosted"
        opened = operation(client, "/documents", source)
        assert opened.status_code == 200, opened.text
        span = next(s for s in opened.json()["pages"][0]["spans"] if s["text"] == "Good spaces.")
        edits = [{"span_id": span["id"], "text": "Great places.", "font": "original"}]
    # A new client/request contains everything required; no upload/session lookup.
    with TestClient(app) as fresh:
        validation = operation(fresh, "/documents/test-document/validate", source, {"edits": edits})
        assert validation.status_code == 200, validation.text
        rendered = operation(fresh, "/documents/test-document/pages/0/render", source, {"edits": edits, "scale": 1})
        assert rendered.status_code == 200 and rendered.content.startswith(b"\x89PNG")
        style = operation(fresh, f"/documents/test-document/inline-style/{span['id']}", source)
        assert style.status_code == 200 and style.json()["web_font"]
        font = operation(fresh, f"/documents/test-document/inline-font/{span['id']}", source)
        assert font.status_code == 200 and font.content[:4] == b"OTTO"
        exported = operation(fresh, "/documents/test-document/export", source, {"edits": edits})
        assert exported.status_code == 200, exported.text[:200]
        assert exported.headers["cache-control"] == "no-store"
        with fitz.open(stream=exported.content, filetype="pdf") as result, fitz.open(stream=source, filetype="pdf") as original:
            assert "Great places." in result[0].get_text() and "Good spaces." not in result[0].get_text()
            clip = fitz.Rect(0, 280, 595, 800)
            images = [Image.open(BytesIO(doc[0].get_pixmap(clip=clip).tobytes("png"))) for doc in (original, result)]
            assert ImageChops.difference(*images).getbbox() is None
        assert operation(fresh, "/documents/test-document/original", source).content == source
        # An ID alone can never retrieve another visitor's PDF.
        assert fresh.get("/api/documents/test-document/original").status_code == 404
        assert operation(fresh, "/documents/test-document/export").status_code == 415
    assert set(store) == before_ids
    assert wrap_cff.cache_info().currsize == font_sample.cache_info().currsize == 0


def test_uploaded_fonts_have_portable_ids_and_are_not_shared_or_written(tmp_path, monkeypatch):
    from server import fonts as module
    def no_disk():
        raise AssertionError("Hosted user fonts must never enter the persistent font cache")
    monkeypatch.setattr(module, "cache_root", no_disk)
    source = create_demo()
    with TestClient(app) as client:
        uploaded = operation(client, "/fonts/upload", file=fitz.Font("figo").buffer)
        assert uploaded.status_code == 200, uploaded.text
        entry = uploaded.json()
        buffer = b64decode(entry["data"])
        assert operation(client, "/fonts/upload", file=buffer).json()["id"] == entry["id"]
        # Fresh requests see only supplied fonts, never a previous visitor's upload.
        catalog = operation(client, "/fonts").json()
        assert entry["id"] not in {font["id"] for font in catalog["fonts"]}
        supplied = operation(client, "/fonts", fonts=[buffer]).json()
        assert entry["id"] in {font["id"] for font in supplied["fonts"]}
        span = next(s for s in operation(client, "/documents", source).json()["pages"][0]["spans"] if s["text"] == "Good spaces.")
        edits = [{"span_id": span["id"], "text": "New words.", "font": entry["id"]}]
        assert operation(client, "/documents/test-document/validate", source, {"edits": edits}).status_code == 422
        result = operation(client, "/documents/test-document/export", source, {"edits": edits}, fonts=[buffer])
        assert result.status_code == 200, result.text[:200]
        with fitz.open(stream=result.content, filetype="pdf") as doc:
            assert "New words." in doc[0].get_text()


@pytest.mark.parametrize("kind,payload,replacement", [
    ("ocr", {"language": "eng", "lines": [{"text": "This text started as pixels.", "bbox": [45, 160, 250, 178], "confidence": 97}]}, "Now editable."),
    ("region", {"bbox": [45, 285, 510, 345]}, "नमस्ते"),
])
def test_recovery_state_and_unicode_survive_independent_requests(kind, payload, replacement):
    source = create_scanned_demo()
    with TestClient(app) as client:
        route = "ocr" if kind == "ocr" else "regions"
        registered = operation(client, f"/documents/test-document/pages/0/{route}", source, payload)
        assert registered.status_code == 200, registered.text
        span = registered.json()["document"]["pages"][0]["spans"][0]
        recovery = [{"kind": kind, "page": 0, "payload": payload}]
        edits = [{"span_id": span["id"], "text": replacement, "font": "auto", "fit": True}]
        exported = operation(client, "/documents/test-document/export", source, {"edits": edits}, recovery=recovery)
        assert exported.status_code == 200, exported.text[:200]
        with fitz.open(stream=exported.content, filetype="pdf") as doc:
            assert replacement in doc[0].get_text()
        assert operation(client, "/documents/test-document/export", source, {"edits": edits}).status_code == 422


def test_hosted_limits_invalid_requests_and_origins_are_actionable():
    with TestClient(app) as client:
        assert operation(client, "/documents", b"%PDF-" + b"x" * MAX_DOCUMENT).status_code == 413
        assert client.post("/api/process", content=b"x" * (MAX_REQUEST + 1)).status_code == 413
        assert client.post("/api/process", data={"operation": "not-json"}).status_code == 422
        assert client.post("/api/process", headers={"Origin": "https://unrelated.example"}).status_code == 403
        assert operation(client, "/documents/test-document/pages/99/render", create_demo()).status_code == 404
        bad = [{"kind": "region", "page": 0, "payload": {"bbox": [-20, 0, 20, 30]}}]
        assert operation(client, "/documents", create_demo(), recovery=bad).status_code == 422
        assert operation(client, "/fonts", compositions={"mix:invalid": ["mix:recursive", "builtin:helv"]}).status_code == 422


def test_public_assets_do_not_need_a_document_or_a_shared_session():
    with TestClient(app) as client:
        for scanned in ("true", "false"):
            assert client.get(f"/api/sample?scanned={scanned}").content.startswith(b"%PDF-")
        model = client.get("/api/ocr-data/eng.traineddata", follow_redirects=False)
        assert model.status_code == 307 and "tessdata_fast" in model.headers["location"]
        assert client.get("/api/ocr-data/invalid.traineddata").status_code == 404
        assert client.get("/api/source").content.startswith(b"PK")
        assert client.get("/api/brand-kit").content.startswith(b"PK")
        assert "AFFERO" in client.get("/api/license").text
