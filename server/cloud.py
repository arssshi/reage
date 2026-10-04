"""Stateless hosted API. Each operation carries its source and recovery state.

No document IDs address server storage. User documents/fonts are request-scoped;
only public OCR language assets are redirected to their provider.
"""
from base64 import b64encode
from hashlib import sha256
import json
import re
from typing import Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field, ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from .app import APP_VERSION, download_brand_kit, download_source, engine_lock, license_text, manifest
from .assets import OCR_LANGUAGES
from .demo import create_demo, create_scanned_demo
from .engine import EditError, export_pdf, inspect_document, prepare_edits, public_changes, render_page
from .fonts import COMPATIBLE, GOOGLE_FAMILIES, choose_font, family_key, isolated_library
from .inline import browser_font, wrap_cff
from .models import EditRequest, FontFetchRequest, FontProbeRequest, OCRRequest, RegionRequest, RenderRequest
from .recovery import font_sample, register_ocr, register_region

MAX_DOCUMENT = 3 * 1024 * 1024
MAX_REQUEST = 4_000_000
MAX_RESPONSE = 4_300_000
MAX_PAGES = 50
app = FastAPI(title="Reage hosted PDF editor", version=APP_VERSION, docs_url=None, redoc_url=None, openapi_url=None)


class Recovery(BaseModel):
    page: int = Field(ge=0, lt=MAX_PAGES)
    kind: Literal["ocr", "region"]
    payload: dict


class Operation(BaseModel):
    path: str = Field(max_length=240)
    id: str = Field(default="", max_length=80, pattern=r"^[A-Za-z0-9-]*$")
    name: str = Field(default="Document.pdf", max_length=200)
    payload: dict = Field(default_factory=dict)
    recovery: list[Recovery] = Field(default_factory=list, max_length=50)
    compositions: dict[str, list[str]] = Field(default_factory=dict, max_length=16)


@app.middleware("http")
async def headers(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin:
        parsed = urlsplit(origin)
        loopback = parsed.hostname in ("localhost", "127.0.0.1", "::1") and request.url.hostname in ("localhost", "127.0.0.1", "::1")
        if parsed.scheme not in ("http", "https") or (parsed.netloc != request.headers.get("host") and not loopback):
            return JSONResponse({"detail": "Use this API from the Reage website."}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(EditError)
async def edit_error(_, exc):
    return JSONResponse({"detail": exc.message, "span_id": exc.span_id, "code": exc.code}, status_code=422)


@app.exception_handler(ValidationError)
async def invalid_operation(_, exc):
    return JSONResponse({"detail": "The editing request has invalid fields. Reopen the PDF and try again."}, status_code=422)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "reage", "version": APP_VERSION, "mode": "hosted",
            "max_upload_bytes": MAX_DOCUMENT, "max_pages": MAX_PAGES}


app.get("/api/source")(download_source)
app.get("/api/brand-kit")(download_brand_kit)
app.get("/api/license")(license_text)


@app.get("/api/sample")
def sample(scanned: bool = False):
    with engine_lock:
        return Response(create_scanned_demo() if scanned else create_demo(), media_type="application/pdf")


@app.get("/api/ocr/languages")
def languages():
    return {"languages": [{"code": "eng+hin", "name": "English + Hindi"},
                          *[{"code": code, "name": name} for code, name in OCR_LANGUAGES.items()]]}


@app.get("/api/ocr-data/{language}.traineddata")
def ocr_data(language: str):
    if language not in OCR_LANGUAGES:
        raise HTTPException(404, "Choose a supported OCR language.")
    # Language models can exceed Vercel's response limit. No document data is
    # included in this public, browser-side download.
    return RedirectResponse(f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/{language}.traineddata")


def bounded_response(value, media_type=None):
    response = Response(value, media_type=media_type) if media_type else JSONResponse(value)
    if len(response.body) > MAX_RESPONSE:
        raise HTTPException(413, "This result exceeds the online workspace limit. Run Reage locally for larger documents or exports.")
    return response


def execute(operation: Operation, source: bytes | None, fonts: list[bytes], uploaded_font: bytes | None):
    # Serialize MuPDF and discard caches containing original-font bytes or OCR
    # words before releasing the lock to the next visitor's request.
    with engine_lock, isolated_library() as library:
        try:
            for buffer in fonts:
                library.register(buffer)
            for key, components in operation.compositions.items():
                expected = "mix:" + sha256("|".join(components).encode()).hexdigest()[:24]
                if key != expected or not 2 <= len(components) <= 8 or any(
                    not re.fullmatch(r"(?:builtin|font|script):[A-Za-z0-9]{1,40}", part) for part in components
                ):
                    raise HTTPException(422, "Invalid mixed-script font selection.")
                library.compositions[key] = tuple(components)

            if operation.path == "/fonts":
                return bounded_response({"fonts": library.catalog(), "google_families": GOOGLE_FAMILIES})
            if operation.path in ("/fonts/upload", "/fonts/fetch"):
                if operation.path.endswith("upload"):
                    if not uploaded_font:
                        raise HTTPException(422, "Choose a TTF/OTF font file.")
                    entry = library.register(uploaded_font)
                else:
                    request = FontFetchRequest.model_validate(operation.payload)
                    entry = library.fetch_google(request.family, request.weight, request.italic)
                entry["data"] = b64encode(library.entries[entry["id"]]["buffer"]).decode()
                return bounded_response(entry)

            if source is None or b"%PDF-" not in source[:1024]:
                raise HTTPException(415, "Please choose a valid PDF file.")
            if len(source) > MAX_DOCUMENT:
                raise HTTPException(413, "The online editor accepts PDFs up to 3 MB. Run locally for files up to 30 MB.")
            data = inspect_document(source, operation.name)
            if len(data.pages) > MAX_PAGES:
                raise HTTPException(413, "The online editor supports up to 50 pages. Use local mode for longer documents.")
            for action in operation.recovery:
                if action.page >= len(data.pages):
                    raise HTTPException(422, "Recovery page not found.")
                if action.kind == "ocr":
                    register_ocr(data, action.page, OCRRequest.model_validate(action.payload))
                else:
                    register_region(data, action.page, RegionRequest.model_validate(action.payload).bbox)
            value = dispatch(operation, data)
            response = value if isinstance(value, Response) else bounded_response(value)
            if len(library.compositions) > 16:
                raise HTTPException(422, "Too many mixed-script font combinations for one online session. Export and reopen your PDF.")
            response.headers["X-Reage-Font-Compositions"] = json.dumps(library.compositions, separators=(",", ":"))
            return response
        except (ValueError, OSError) as exc:
            if isinstance(exc, ValidationError):
                raise
            raise HTTPException(422, str(exc)) from exc
        finally:
            font_sample.cache_clear()
            wrap_cff.cache_clear()


def dispatch(operation, data):
    if operation.path == "/documents":
        return manifest(operation.id, data)
    prefix = f"/documents/{operation.id}/"
    if not operation.id or not operation.path.startswith(prefix):
        raise HTTPException(404, "Unknown document operation.")
    route = operation.path[len(prefix):]
    payload = operation.payload
    if route == "validate":
        return {"changes": public_changes(prepare_edits(data, EditRequest.model_validate(payload).edits))}
    if route == "export":
        return bounded_response(export_pdf(data, EditRequest.model_validate(payload).edits), "application/pdf")
    if route == "original":
        return bounded_response(data.source, "application/pdf")
    if route == "font-probe":
        request = FontProbeRequest.model_validate(payload)
        span = data.spans.get(request.span_id)
        if not span:
            raise HTTPException(404, "Text selection not found.")
        font, resolution = choose_font(span, request.text, request.font, data.fonts.get(span["font_key"]))
        return {"name": font.display_name, "resolution": resolution, "id": font.id, "source": font.kind,
                "original_name": span["font"], "suggested_download": COMPATIBLE.get(family_key(span["font"]))}
    inline = re.fullmatch(r"(inline-style|inline-font)/([A-Za-z0-9-]+)", route)
    if inline:
        span = data.spans.get(inline[2])
        if not span:
            raise HTTPException(404, "Text selection not found.")
        font, resolution = choose_font(span, span["text"] or " ", payload.get("font", "auto"), data.fonts.get(span["font_key"]))
        buffer = browser_font(font.buffer or font.font.buffer)
        usable = buffer is not None and len(buffer) <= MAX_RESPONSE
        if inline[1] == "inline-font":
            return bounded_response(buffer, "font/otf") if usable else Response(status_code=204)
        return {"name": font.display_name, "resolution": resolution, "web_font": usable,
                "subset": span.get("subset", False), "ascent": font.font.ascender / (font.font.ascender - font.font.descender)}
    page_route = re.fullmatch(r"pages/(\d+)/(render|ocr|regions)", route)
    if page_route:
        page = int(page_route[1])
        if not 0 <= page < len(data.pages):
            raise HTTPException(404, "Page not found.")
        if page_route[2] == "render":
            request = RenderRequest.model_validate(payload)
            return bounded_response(render_page(data, page, request.edits, request.scale), "image/png")
        if page_route[2] == "ocr":
            count = register_ocr(data, page, OCRRequest.model_validate(payload))
            return {"document": manifest(operation.id, data), "recognized": count}
        span = register_region(data, page, RegionRequest.model_validate(payload).bbox)
        return {"document": manifest(operation.id, data), "span_id": span["id"]}
    raise HTTPException(404, "Unknown document operation.")


@app.post("/api/process")
async def process(request: Request):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_REQUEST:
            raise HTTPException(413, "This PDF and its fonts exceed the online request limit. Use a smaller file or run Reage locally.")
    # Reuse Starlette's bounded multipart parser after enforcing the total size,
    # including requests without a Content-Length header.
    request._body = bytes(body)
    async with request.form(max_files=10, max_fields=1, max_part_size=600_000) as form:
        metadata = form.get("operation")
        if not isinstance(metadata, str):
            raise HTTPException(422, "Missing editing operation.")
        operation = Operation.model_validate_json(metadata)
        async def contents(key):
            value = form.get(key)
            return await value.read() if isinstance(value, UploadFile) else None
        source = await contents("document")
        uploaded_font = await contents("file")
        fonts = [await value.read() for value in form.getlist("fonts") if isinstance(value, UploadFile)]
        if len(fonts) > 8:
            raise HTTPException(422, "Use up to eight additional fonts in one online workspace.")
        return await run_in_threadpool(execute, operation, source, fonts, uploaded_font)
