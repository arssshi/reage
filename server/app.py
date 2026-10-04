"""Local-only API. Documents live in bounded, expiring process memory."""
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import json
import threading
import time
import uuid
from urllib.parse import quote, urlsplit
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .demo import create_demo, create_scanned_demo
from .engine import DocumentData, EditError, export_pdf, inspect_document, prepare_edits, public_changes, render_page
from .models import EditRequest, RenderRequest, FontFetchRequest, FontProbeRequest, OCRRequest, RegionRequest
from .fonts import COMPATIBLE, GOOGLE_FAMILIES, choose_font, family_key, library
from .assets import OCR_LANGUAGES, language_model
from .recovery import register_ocr, register_region
from .inline import browser_font

MAX_UPLOAD = 30 * 1024 * 1024
MAX_STORE = 180 * 1024 * 1024
TTL = 2 * 60 * 60


@dataclass
class StoredDocument:
    data: DocumentData
    touched: float


APP_VERSION = json.loads((Path(__file__).resolve().parent.parent / "package.json").read_text())["version"]
app = FastAPI(title="Reage PDF editor", version=APP_VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")
store: dict[str, StoredDocument] = {}
# PyMuPDF is not thread-safe. Every engine invocation is serialized, including
# inspection and demo generation; Python worker threads may otherwise overlap.
engine_lock = threading.RLock()
asset_lock = threading.Lock()


def manifest(document_id: str, data: DocumentData):
    return {"id": document_id, "name": data.name, "page_count": len(data.pages),
            "size": len(data.source), "pages": data.pages, "warnings": data.warnings, "revision": data.revision}


@app.middleware("http")
async def local_api(request, call_next):
    if request.url.path.startswith("/api"):
        origin = request.headers.get("origin")
        # Vite can choose 5174 (or a later port) when 5173 is already occupied.
        # Accept explicit loopback origins without allowing arbitrary websites.
        loopback = False
        if origin:
            try:
                parsed = urlsplit(origin)
                loopback = (parsed.scheme in ("http", "https") and
                            parsed.hostname in ("localhost", "127.0.0.1", "::1") and
                            parsed.username is None and parsed.password is None and
                            not parsed.path and not parsed.query and not parsed.fragment and
                            (parsed.port is None or 1 <= parsed.port <= 65535))
            except ValueError:
                pass
        if origin and not loopback and origin != str(request.base_url).rstrip("/"):
            return JSONResponse({"detail": "This local API does not allow cross-origin access."}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(EditError)
async def edit_error_handler(_, exc: EditError):
    return JSONResponse(status_code=422, content={"detail": exc.message, "span_id": exc.span_id, "code": exc.code})


def prune():
    now = time.monotonic()
    for key in list(store):
        if now - store[key].touched > TTL:
            del store[key]


def get_document(document_id: str) -> DocumentData:
    prune()
    entry = store.get(document_id)
    if entry is None:
        raise HTTPException(404, "This local session has expired. Please reopen your PDF.")
    entry.touched = time.monotonic()
    return entry.data


def add_document(source: bytes, name: str):
    with engine_lock:
        prune()
        if len(store) >= 12 or sum(len(s.data.source) for s in store.values()) + len(source) > MAX_STORE:
            raise HTTPException(413, "The local workspace is full. Close an open document or restart the server.")
        data = inspect_document(source, name)
        document_id = uuid.uuid4().hex
        store[document_id] = StoredDocument(data, time.monotonic())
        return manifest(document_id, data)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "reage", "version": APP_VERSION}


@app.get("/api/fonts")
def fonts(refresh: bool = False):
    with engine_lock:
        return {"fonts": library.catalog(refresh), "google_families": GOOGLE_FAMILIES}


@app.post("/api/fonts/upload")
async def upload_font(file: UploadFile = File(...)):
    try:
        buffer = await file.read(MAX_UPLOAD + 1)
    finally:
        await file.close()
    if len(buffer) > MAX_UPLOAD:
        raise HTTPException(413, "Please choose a font smaller than 30 MB.")
    def register():
        with engine_lock:
            try:
                return library.register(buffer)
            except ValueError as exc:
                raise EditError(str(exc), code="invalid_font") from exc
    return await run_in_threadpool(register)


@app.post("/api/fonts/fetch")
def fetch_font(request: FontFetchRequest):
    with engine_lock:
        try:
            return library.fetch_google(request.family, request.weight, request.italic)
        except (ValueError, OSError) as exc:
            raise EditError(str(exc), code="font_download_failed") from exc


@app.post("/api/documents/{document_id}/font-probe")
def probe_font(document_id: str, request: FontProbeRequest):
    with engine_lock:
        data = get_document(document_id)
        span = data.spans.get(request.span_id)
        if not span:
            raise HTTPException(404, "Text selection not found.")
        try:
            font, resolution = choose_font(span, request.text, request.font, data.fonts.get(span["font_key"]))
            return {"name": font.display_name, "resolution": resolution, "id": font.id,
                    "source": font.kind, "suggested_download": COMPATIBLE.get(family_key(span["font"])),
                    "original_name": span["font"]}
        except ValueError as exc:
            raise EditError(str(exc), span["id"], "font_unavailable") from exc


@app.get("/api/ocr/languages")
def ocr_languages():
    return {"languages": [{"code": "eng+hin", "name": "English + Hindi"}, *[{"code": code, "name": name} for code, name in OCR_LANGUAGES.items()]]}


@app.get("/api/documents/{document_id}/inline-style/{span_id}")
def inline_style(document_id: str, span_id: str, font: str = "auto"):
    with engine_lock:
        data = get_document(document_id)
        span = data.spans.get(span_id)
        if not span:
            raise HTTPException(404, "Text selection not found.")
        try:
            source, resolution = choose_font(span, span["text"] or " ", font, data.fonts.get(span["font_key"]))
        except ValueError as exc:
            raise EditError(str(exc), span_id, "font_unavailable") from exc
        buffer = source.buffer or source.font.buffer
        web_font = browser_font(buffer) is not None
        return {"name": source.display_name, "resolution": resolution,
                "ascent": source.font.ascender / (source.font.ascender - source.font.descender),
                "web_font": web_font, "subset": span.get("subset", False)}


@app.get("/api/documents/{document_id}/inline-font/{span_id}")
def inline_font(document_id: str, span_id: str, font: str = "auto"):
    with engine_lock:
        data = get_document(document_id)
        span = data.spans.get(span_id)
        if not span:
            raise HTTPException(404, "Text selection not found.")
        try:
            source, _ = choose_font(span, span["text"] or " ", font, data.fonts.get(span["font_key"]))
        except ValueError as exc:
            raise EditError(str(exc), span_id, "font_unavailable") from exc
        buffer = browser_font(source.buffer or source.font.buffer)
        if buffer is None:
            return Response(status_code=204)
        return Response(buffer, media_type="font/otf")


@app.get("/api/documents/{document_id}/original")
def original_pdf(document_id: str):
    with engine_lock:
        return Response(get_document(document_id).source, media_type="application/pdf")


@app.get("/api/ocr-data/{language}.traineddata")
def ocr_data(language: str):
    with asset_lock:
        try:
            path = language_model(language)
        except (ValueError, OSError) as exc:
            raise EditError(str(exc), code="ocr_model_unavailable") from exc
    return FileResponse(path, media_type="application/octet-stream")


@app.post("/api/documents/{document_id}/pages/{page_number}/ocr")
def accept_ocr(document_id: str, page_number: int, request: OCRRequest):
    with engine_lock:
        data = get_document(document_id)
        if not 0 <= page_number < len(data.pages):
            raise HTTPException(404, "Page not found.")
        count = register_ocr(data, page_number, request)
        return {"document": manifest(document_id, data), "recognized": count}


@app.post("/api/documents/{document_id}/pages/{page_number}/regions")
def add_region(document_id: str, page_number: int, request: RegionRequest):
    with engine_lock:
        data = get_document(document_id)
        if not 0 <= page_number < len(data.pages):
            raise HTTPException(404, "Page not found.")
        span = register_region(data, page_number, request.bbox)
        return {"document": manifest(document_id, data), "span_id": span["id"]}


@app.get("/api/source")
def download_source():
    """Offer this application's source, never documents or environment files."""
    root = Path(__file__).resolve().parent.parent
    paths = [root / name for name in (
        "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
        "playwright.config.ts", "index.html", "requirements.txt", "requirements-dev.txt",
        "pyproject.toml", "run.py", "README.md", "IMPLEMENTATION.md", "CAPABILITIES.md",
        "LICENSE", "NOTICE.md", "CONTRIBUTING.md", ".gitignore", "public/font-licenses.txt",
    )]
    for folder in ("src", "server", "public", "tests", "e2e", "scripts", "docs"):
        extensions = (".py", ".ts", ".tsx", ".css", ".svg", ".mjs")
        if folder == "public":
            extensions += (".png", ".json", ".md", ".txt", ".woff2")
        elif folder == "docs":
            extensions = (".md",)
        paths.extend(path for path in (root / folder).rglob("*") if path.suffix in extensions)
    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(set(paths)):
            if path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root):
                archive.write(path, f"reage/{path.relative_to(root)}")
    return Response(buffer.getvalue(), media_type="application/zip", headers={"Content-Disposition": "attachment; filename=reage-source.zip"})


@app.get("/api/brand-kit")
def download_brand_kit():
    root = Path(__file__).resolve().parent.parent / "public" / "brand"
    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(root.iterdir()):
            if path.is_file() and not path.is_symlink() and path.suffix in (".svg", ".png", ".pdf", ".md", ".json", ".woff2"):
                archive.write(path, f"reage-brand-kit/{path.name}")
        license_file = root.parent / "font-licenses.txt"
        archive.write(license_file, "reage-brand-kit/font-licenses.txt")
        archive.write(root.parent.parent / "LICENSE", "reage-brand-kit/LICENSE")
    return Response(buffer.getvalue(), media_type="application/zip", headers={"Content-Disposition": "attachment; filename=reage-brand-kit.zip"})


@app.get("/api/license")
def license_text():
    path = Path(__file__).resolve().parent.parent / "LICENSE"
    return Response(path.read_text(encoding="utf-8"), media_type="text/plain")


@app.post("/api/documents")
async def upload_document(file: UploadFile = File(...)):
    try:
        source = await file.read(MAX_UPLOAD + 1)
    finally:
        await file.close()
    if len(source) > MAX_UPLOAD:
        raise HTTPException(413, "Please choose a PDF smaller than 30 MB.")
    if b"%PDF-" not in source[:1024]:
        raise HTTPException(415, "Please choose a valid PDF file.")
    name = (file.filename or "Untitled.pdf").replace("\\", "/").split("/")[-1][:200]
    return await run_in_threadpool(add_document, source, name)


@app.post("/api/demo")
def demo():
    with engine_lock:
        return add_document(create_demo(), "Common Ground — Field Notes.pdf")


@app.post("/api/demo/scanned")
def scanned_demo():
    with engine_lock:
        return add_document(create_scanned_demo(), "Scanned — Not Stuck.pdf")


@app.delete("/api/documents/{document_id}")
def close_document(document_id: str):
    with engine_lock:
        store.pop(document_id, None)
    return {"closed": True}


@app.post("/api/documents/{document_id}/validate")
def validate(document_id: str, request: EditRequest):
    with engine_lock:
        data = get_document(document_id)
        return {"changes": public_changes(prepare_edits(data, request.edits))}


@app.post("/api/documents/{document_id}/pages/{page_number}/render")
def render(document_id: str, page_number: int, request: RenderRequest):
    with engine_lock:
        data = get_document(document_id)
        if not 0 <= page_number < len(data.pages):
            raise HTTPException(404, "Page not found.")
        png = render_page(data, page_number, request.edits, request.scale)
    return Response(png, media_type="image/png")


@app.post("/api/documents/{document_id}/export")
def export(document_id: str, request: EditRequest):
    with engine_lock:
        data = get_document(document_id)
        result = export_pdf(data, request.edits)
        name = f"{Path(data.name).stem}-edited.pdf"
    return Response(result, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=edited.pdf; filename*=UTF-8''{quote(name)}"
    })


dist = Path(__file__).resolve().parent.parent / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
