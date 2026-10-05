from fastapi.testclient import TestClient
from io import BytesIO
from base64 import b64decode
import json
import pymupdf as fitz
import pytest
from PIL import Image
from zipfile import ZipFile

from server.app import app, store
from server.demo import create_demo


@pytest.fixture
def client():
    store.clear()
    with TestClient(app) as client:
        yield client
    store.clear()


def test_complete_document_lifecycle(client):
    response = client.post("/api/documents", files={"file": ("test.pdf", create_demo(), "application/pdf")})
    assert response.status_code == 200
    data = response.json()
    assert data["page_count"] == 2
    base = f"/api/documents/{data['id']}"
    span = next(s for s in data["pages"][0]["spans"] if s["text"] == "Good spaces.")
    payload = {"edits": [{"span_id": span["id"], "text": "Great places."}]}
    assert client.post(f"{base}/validate", json=payload).status_code == 200
    preview = client.post(f"{base}/pages/0/render", json={**payload, "scale": 0.5})
    assert preview.status_code == 200 and preview.content.startswith(b"\x89PNG")
    exported = client.post(f"{base}/export", json=payload)
    assert exported.status_code == 200
    with fitz.open(stream=exported.content, filetype="pdf") as doc:
        assert "Great places." in doc[0].get_text()
        assert "Good spaces." not in doc[0].get_text()
    assert client.delete(base).status_code == 200
    assert client.post(f"{base}/export", json={"edits": []}).status_code == 404


def test_errors_are_actionable(client):
    assert client.post("/api/documents", files={"file": ("bad.pdf", b"not a PDF")}).status_code == 415
    data = client.post("/api/demo").json()
    base = f"/api/documents/{data['id']}"
    response = client.post(f"{base}/validate", json={"edits": [{"span_id": "fake", "text": "test"}]})
    assert response.status_code == 422 and response.json()["span_id"] == "fake"
    assert client.post(f"{base}/pages/99/render", json={}).status_code == 404
    assert client.post(f"{base}/pages/0/render", json={"scale": 100}).status_code == 422
    assert client.post("/api/demo", headers={"Origin": "https://unrelated.example"}).status_code == 403


def test_inline_font_and_glyph_geometry_are_local_and_validated(client):
    data = client.post("/api/demo").json()
    base = f"/api/documents/{data['id']}"
    span = next(s for s in data["pages"][0]["spans"] if s["text"] == "Good spaces.")
    assert "".join(glyph["text"] for glyph in span["glyphs"]) == span["text"]
    widths = [glyph["bbox"][2] - glyph["bbox"][0] for glyph in span["glyphs"]]
    assert max(widths) > min(widths) * 1.5
    style = client.get(f"{base}/inline-style/{span['id']}")
    assert style.status_code == 200 and 0 < style.json()["ascent"] < 1
    font = client.get(f"{base}/inline-font/{span['id']}")
    assert font.status_code == (200 if style.json()["web_font"] else 204)
    combined = client.get(f"{base}/inline-style/{span['id']}?include_font=true").json()
    assert combined["font_id"] == "original"
    assert b64decode(combined["font_data"]) == font.content
    # A live replacement font may not cover the old source text. Its browser
    # resource can still load; new-text coverage is validated by the transaction.
    assert client.get(f"{base}/inline-style/{span['id']}?font=script:DEVANAGARI&include_font=true").status_code == 200
    assert client.get(f"{base}/inline-style/missing").status_code == 404
    assert client.get(f"{base}/inline-font/{span['id']}?font=font:missing").status_code == 422
    original = client.get(f"{base}/original")
    assert original.content == client.post(f"{base}/export", json={}).content


@pytest.mark.parametrize("origin", ["http://127.0.0.1:5174", "http://localhost:5180", "http://[::1]:5174"])
def test_alternate_local_frontend_ports_can_upload(client, origin):
    response = client.post("/api/documents", headers={"Origin": origin},
                           files={"file": ("test.pdf", create_demo(), "application/pdf")})
    assert response.status_code == 200
    assert response.json()["page_count"] == 2


@pytest.mark.parametrize("origin", ["null", "http://localhost.example:5174", "http://127.0.0.1@unrelated.example", "http://localhost:invalid"])
def test_nonlocal_or_malformed_origins_remain_blocked(client, origin):
    assert client.post("/api/demo", headers={"Origin": origin}).status_code == 403


def test_password_protected_pdf(client):
    with fitz.open() as doc:
        doc.new_page()
        source = doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="user")
    response = client.post("/api/documents", files={"file": ("locked.pdf", source)})
    assert response.status_code == 422
    assert response.json()["code"] == "encrypted_pdf"


def test_source_archive_contains_build_inputs_and_excludes_documents(client):
    client.post("/api/documents", files={"file": ("private.pdf", create_demo())})
    response = client.get("/api/source")
    assert response.status_code == 200
    with ZipFile(BytesIO(response.content)) as archive:
        names = archive.namelist()
        assert "reage/src/App.tsx" in names
        assert "reage/server/engine.py" in names
        assert "reage/package-lock.json" in names
        assert "reage/LICENSE" in names
        assert "reage/README.md" in names
        assert "reage/docs/GUIDE.md" in names
        assert "reage/server/cloud.py" in names
        assert "reage/api/index.py" in names
        assert "reage/vercel.json" in names
        assert "reage/.python-version" in names
        assert "reage/src/cloud.ts" in names
        for private_note in ("plan.md", "BENCHMARK.md", "PERFORMANCE.md"):
            assert f"reage/{private_note}" not in names
        assert "reage/public/font-licenses.txt" in names
        assert "reage/scripts/dev.mjs" in names
        assert "reage/scripts/export-brand.mjs" in names
        assert "reage/src/components/Welcome.tsx" in names
        assert "reage/public/brand/BRAND-GUIDE.md" in names
        assert "reage/public/brand/tokens.json" in names
        assert "reage/public/brand/reage-social-card.png" in names
        assert "reage/public/brand/manrope-latin-wght-normal.woff2" in names
        assert len(names) == len(set(names))
        assert not any(name.startswith(("reage/demo/", "reage/test-results/")) for name in names)
        assert not any(name.endswith((".pdf", ".pyc", ".env")) or "node_modules" in name for name in names)
    assert "GNU AFFERO GENERAL PUBLIC LICENSE" in client.get("/api/license").text


def test_brand_kit_download_contains_usable_assets_and_licenses(client):
    response = client.get("/api/brand-kit")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "filename=reage-brand-kit.zip" in response.headers["content-disposition"]
    with ZipFile(BytesIO(response.content)) as archive:
        assert archive.testzip() is None
        prefix = "reage-brand-kit/"
        names = archive.namelist()
        assert len(names) == len(set(names))
        assert all(name.startswith(prefix) and ".." not in name for name in names)
        for name in ("reage-logo.svg", "reage-logo-inverse.svg", "reage-wordmark.svg",
                     "reage-mark.svg", "reage-mark-inverse.svg", "reage-mark-mono.svg",
                     "reage-pattern.svg", "reage-social-card.svg", "reage-brand-board.svg",
                     "BRAND-GUIDE.md"):
            assert archive.read(prefix + name)
        assert "GNU AFFERO GENERAL PUBLIC LICENSE" in archive.read(prefix + "LICENSE").decode()
        assert "SIL OPEN FONT LICENSE" in archive.read(prefix + "font-licenses.txt").decode()
        tokens = json.loads(archive.read(prefix + "tokens.json"))
        assert tokens["colors"] and tokens["typography"]
        for font in ("manrope-latin-wght-normal.woff2", "dm-sans-latin-wght-normal.woff2"):
            assert archive.read(prefix + font).startswith(b"wOF2")
        sizes = {
            "reage-logo.png": (2160, 640),
            "reage-logo-inverse.png": (2160, 640),
            "reage-app-icon-512.png": (512, 512),
            "reage-avatar-inverse.png": (512, 512),
            "reage-mark.png": (1024, 1024),
            "reage-mark-4k.png": (4096, 4096),
            "reage-mark-inverse-4k.png": (4096, 4096),
            "reage-mark-mono.png": (512, 512),
            "reage-wordmark.png": (1584, 528),
            "reage-social-card.png": (1200, 630),
            "reage-brand-board.png": (1600, 1120),
            "reage-social-card@2x.png": (2400, 1260),
            "reage-brand-board@2x.png": (3200, 2240),
        }
        for name, size in sizes.items():
            with Image.open(BytesIO(archive.read(prefix + name))) as image:
                image.load()
                assert image.format == "PNG" and image.size == size
                if "social-card" not in name and "brand-board" not in name:
                    assert image.mode == "RGBA" and image.getpixel((0, 0))[3] == 0
                    assert image.getpixel((size[0] - 1, size[1] - 1))[3] == 0
                if name in ("reage-app-icon-512.png", "reage-avatar-inverse.png", "reage-mark.png", "reage-mark-mono.png"):
                    # The space between the r stem and the dot must be clear,
                    # not just the corners of an opaque rounded background tile.
                    assert image.getpixel((size[0] // 2, size[1] * 3 // 4))[3] == 0
        with fitz.open(stream=archive.read(prefix + "reage-brand-board.pdf"), filetype="pdf") as board:
            assert len(board) == 1
        assert len(json.loads(archive.read(prefix + "exports.json"))) == len(sizes)
