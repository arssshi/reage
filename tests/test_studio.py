from io import BytesIO
import json

from fastapi.testclient import TestClient
from fontTools.ttLib import TTFont
import pymupdf as fitz
import pytest

from server.app import app
from server.cloud import app as hosted_app
from server.demo import create_demo
from server.engine import EditError, export_pdf, inspect_document, prepare_edits, public_changes
from server.fonts import google_catalog, isolated_library
from server.models import ExportPage, ExportRequest, TextEdit
from server.recovery import register_text


def select(data, text):
    return next(span for span in data.spans.values() if span["text"] == text)


@pytest.mark.parametrize("bold,italic,name", [(True, False, "Times-Bold"), (False, True, "Times-Italic"), (True, True, "Times-BoldItalic")])
def test_formatting_uses_real_family_faces_and_preserves_unaffected_pixels(bold, italic, name):
    data = inspect_document(create_demo(), "styles.pdf")
    span = select(data, "Good spaces.")
    edit = TextEdit(span_id=span["id"], text="Good spaces.", bold=bold, italic=italic, fit=True)
    changes = public_changes(prepare_edits(data, [edit]))
    assert changes[0]["font_name"] == name
    assert changes[0]["bold"] is bold and changes[0]["italic"] is italic
    assert changes[0]["origin"] == span["origin"]
    output = export_pdf(data, [edit])
    updated = select(inspect_document(output, "result.pdf"), "Good spaces.")
    assert updated["bold"] is bold and updated["italic"] is italic
    with fitz.open(stream=data.source, filetype="pdf") as before, fitz.open(stream=output, filetype="pdf") as after:
        clip = fitz.Rect(0, 280, 595, 842)
        assert before[0].get_pixmap(clip=clip).samples == after[0].get_pixmap(clip=clip).samples
        assert before[1].get_pixmap().samples == after[1].get_pixmap().samples


def test_embedded_style_companion_wins_over_bundled_font_and_can_be_pinned():
    with fitz.open() as doc:
        page = doc.new_page()
        for code, y in (("figo", 70), ("figbo", 150)):
            page.insert_font(fontname=code, fontbuffer=fitz.Font(code).buffer)
            page.insert_text((50, y), code, fontname=code, fontsize=18)
        data = inspect_document(doc.tobytes(), "companions.pdf")
    edit = TextEdit(span_id=select(data, "figo")["id"], text="Changed", font="auto", bold=True)
    prepared = prepare_edits(data, [edit])
    assert prepared[0]["resolution"] == "Matching embedded style face"
    pinned = edit.model_copy(update={"font": "original"})
    updated = select(inspect_document(export_pdf(data, [pinned]), "pinned.pdf"), "Changed")
    assert updated["font"] == "FiraGO-Bold" and updated["bold"]


def test_unavailable_style_is_rejected_instead_of_synthesized():
    with TTFont(BytesIO(fitz.Font("figo").buffer)) as font:
        for entry in font["name"].names:
            if entry.nameID in (1, 4, 6, 16):
                entry.string = "UniqueStudioFace".encode(entry.getEncoding())
        buffer = BytesIO()
        font.save(buffer)
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_font(fontname="Custom", fontbuffer=buffer.getvalue())
        page.insert_text((50, 70), "Unique face", fontname="Custom", fontsize=18)
        data = inspect_document(doc.tobytes(), "custom.pdf")
    with isolated_library(), pytest.raises(EditError, match="style face is not available"):
        prepare_edits(data, [TextEdit(span_id=select(data, "Unique face")["id"], text="Unique face", bold=True)])


def test_move_resize_opacity_and_decorations_export_as_native_pdf_content():
    data = inspect_document(create_demo(), "geometry.pdf")
    span = select(data, "Good spaces.")
    edit = TextEdit(span_id=span["id"], text="Moved text", size=32, offset_x=20, offset_y=-25, opacity=.6, underline=True, strikeout=True)
    change = public_changes(prepare_edits(data, [edit]))[0]
    assert change["origin"] == [span["origin"][0] + 20, span["origin"][1] - 25]
    assert change["opacity"] == .6 and change["underline"] and change["strikeout"]
    output = export_pdf(data, [edit])
    moved = select(inspect_document(output, "moved.pdf"), "Moved text")
    assert moved["origin"] == change["origin"] and moved["size"] == 32
    assert moved["opacity"] == pytest.approx(.6, abs=.01)
    with fitz.open(stream=data.source, filetype="pdf") as before, fitz.open(stream=output, filetype="pdf") as after:
        assert "Good spaces." not in after[0].get_text()
        assert len(after[0].get_drawings()) == len(before[0].get_drawings()) + 2
        assert len(after[0].get_images()) == len(before[0].get_images())


@pytest.mark.parametrize("align,factor", [("left", 0), ("center", .5), ("right", 1)])
def test_alignment_is_relative_to_the_original_frame(align, factor):
    data = inspect_document(create_demo(), "align.pdf")
    span = select(data, "Good spaces.")
    prepared = prepare_edits(data, [TextEdit(span_id=span["id"], text="Short", align=align)])[0]
    width = prepared["font"].font.text_length("Short", fontsize=span["size"])
    assert prepared["origin"][0] == pytest.approx(span["origin"][0] + (span["bbox"][2] - span["bbox"][0] - width) * factor)


def test_quarter_turn_and_movement_preserve_searchable_text():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((300, 400), "Turn me", fontsize=18)
        data = inspect_document(doc.tobytes(), "turn.pdf")
    edit = TextEdit(span_id=select(data, "Turn me")["id"], text="Turned", rotation=90, offset_x=10, offset_y=20)
    turned = select(inspect_document(export_pdf(data, [edit]), "turned.pdf"), "Turned")
    assert turned["rotation"] == 90 and turned["origin"] == [310, 420]


@pytest.mark.parametrize("page_rotation", [90, 180, 270])
def test_native_moves_on_rotated_pages_preserve_graphics_and_other_runs(page_rotation):
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=600)
        page.draw_rect((20, 20, 350, 250), color=None, fill=(.8, .9, .7))
        page.insert_text((80, 120), "Move this", fontsize=18)
        page.insert_text((80, 210), "Keep this", fontsize=18)
        page.set_rotation(page_rotation)
        data = inspect_document(doc.tobytes(), "rotated.pdf")
    source = select(data, "Move this")
    edit = TextEdit(span_id=source["id"], text="Moved now", offset_x=10, offset_y=12, size=16)
    output = export_pdf(data, [edit])
    result = inspect_document(output, "moved.pdf")
    moved = select(result, "Moved now")
    assert moved["origin"] == pytest.approx([source["origin"][0] + 10, source["origin"][1] + 12])
    assert moved["rotation"] == source["rotation"]
    assert select(result, "Keep this")["origin"] == select(data, "Keep this")["origin"]
    with fitz.open(stream=data.source, filetype="pdf") as before, fitz.open(stream=output, filetype="pdf") as after:
        clean = lambda page: [{k: v for k, v in drawing.items() if k != "seqno"} for drawing in page.get_drawings()]
        assert clean(before[0]) == clean(after[0])
        assert "Move this" not in after[0].get_text()


def test_added_text_rotation_is_relative_to_the_rendered_rotated_page():
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=600)
        page.set_rotation(90)
        data = inspect_document(doc.tobytes(), "rotated-blank.pdf")
    added = register_text(data, 0, [250, 200, 450, 230])
    edit = TextEdit(span_id=added["id"], text="New label", rotation=90, size=16)
    result = inspect_document(export_pdf(data, [edit]), "added.pdf")
    assert select(result, "New label")["rotation"] == 90
    assert select(result, "New label")["origin"] == pytest.approx(added["origin"])


def test_added_text_preserves_artwork_and_is_undoable_without_a_white_patch():
    data = inspect_document(create_demo(), "add.pdf")
    span = register_text(data, 0, [180, 450, 400, 480])
    edit = TextEdit(span_id=span["id"], text="New studio label", font="auto", size=16)
    output = export_pdf(data, [edit])
    assert export_pdf(data, []) == data.source
    with fitz.open(stream=data.source, filetype="pdf") as before, fitz.open(stream=output, filetype="pdf") as after:
        assert "New studio label" in after[0].get_text()
        assert "Good spaces." in after[0].get_text()
        clean = lambda page: [{k: v for k, v in drawing.items() if k != "seqno"} for drawing in page.get_drawings()]
        assert clean(before[0]) == clean(after[0])
        assert before[0].get_pixmap(clip=fitz.Rect(0, 550, 595, 842)).samples == after[0].get_pixmap(clip=fitz.Rect(0, 550, 595, 842)).samples


def test_duplicated_text_reuses_original_font_and_keeps_original_text():
    data = inspect_document(create_demo(), "duplicate.pdf")
    source = select(data, "Good spaces.")
    added = register_text(data, 0, [45, 350, 350, 405], source["id"])
    edit = TextEdit(span_id=added["id"], text=source["text"], font="original")
    output = inspect_document(export_pdf(data, [edit]), "duplicate.pdf")
    matches = [span for span in output.spans.values() if span["text"] == source["text"]]
    assert len(matches) == 2 and all(span["font"] == source["font"] for span in matches)


@pytest.mark.parametrize("rotation", [0, 90, 180, 270])
def test_template_duplicates_preserve_text_direction_and_baseline_geometry(rotation):
    with fitz.open() as doc:
        page = doc.new_page(width=600, height=600)
        page.insert_text((300, 300), "Copy me", fontsize=18, rotate=rotation)
        data = inspect_document(doc.tobytes(), "duplicate-direction.pdf")
    source = select(data, "Copy me")
    box = [source["bbox"][0] + 100, source["bbox"][1] + 120, source["bbox"][2] + 100, source["bbox"][3] + 120]
    added = register_text(data, 0, box, source["id"])
    edit = TextEdit(span_id=added["id"], text="Copied", font="original")
    copied = select(inspect_document(export_pdf(data, [edit]), "copied.pdf"), "Copied")
    assert copied["rotation"] == rotation
    assert copied["origin"] == pytest.approx([source["origin"][0] + 100, source["origin"][1] + 120])
    assert copied["font"] == source["font"]


def test_invalid_movement_is_rejected_atomically():
    data = inspect_document(create_demo(), "bad-move.pdf")
    edit = TextEdit(span_id=select(data, "Good spaces.")["id"], text="Good spaces.", offset_x=-100)
    with pytest.raises(EditError) as error:
        export_pdf(data, [edit])
    assert error.value.code == "overflow" and export_pdf(data, []) == data.source


def test_export_order_repeated_pages_independent_rotation_metadata_and_links():
    with fitz.open() as doc:
        for number in range(3):
            page = doc.new_page(width=400, height=600)
            page.insert_text((50, 70), f"Source page {number + 1}")
            page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(40, 50, 180, 80), "uri": "https://example.com"})
        data = inspect_document(doc.tobytes(), "pages.pdf")
    options = ExportRequest(pages=[ExportPage(page=2, rotation=90), ExportPage(page=0), ExportPage(page=2, rotation=180)], title="Final", author="Studio", optimize=True)
    output = export_pdf(data, [], options)
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert len(doc) == 3 and [page.rotation for page in doc] == [90, 0, 180]
        assert [page.get_text().strip() for page in doc] == ["Source page 3", "Source page 1", "Source page 3"]
        assert doc.metadata["title"] == "Final" and doc.metadata["author"] == "Studio"
        assert all([link["uri"] for link in page.get_links()] == ["https://example.com"] for page in doc)
    with pytest.raises(EditError, match="does not exist"):
        export_pdf(data, [], ExportRequest(pages=[ExportPage(page=9)]))


def test_public_catalog_only_contains_open_families(monkeypatch):
    from server import fonts
    google_catalog.cache_clear()
    monkeypatch.setattr(fonts, "download", lambda *args, **kwargs: json.dumps({"familyMetadataList": [{"family": "Open Family", "isOpenSource": True}, {"family": "Private Face", "isOpenSource": False}]}).encode())
    try:
        assert google_catalog() == ["Open Family"]
    finally:
        google_catalog.cache_clear()


def test_font_download_rejects_an_absent_weight_instead_of_returning_regular(monkeypatch):
    from server import fonts
    def download(url, **kwargs):
        if "api.github.com" in url:
            return json.dumps([{"type": "file", "name": "Fixture-Regular.ttf"}]).encode()
        return fitz.Font("figo").buffer
    monkeypatch.setattr(fonts, "download", download)
    library = fonts.FontLibrary(memory_only=True)
    with pytest.raises(ValueError, match="requested weight"):
        library.fetch_google("Fixture", 700, False)
    assert not library.entries


@pytest.mark.parametrize("hosted", [False, True])
def test_added_text_formatting_and_page_export_work_in_both_runtimes(hosted):
    source = create_demo()
    with TestClient(hosted_app if hosted else app) as client:
        recovery = []
        doc_id = "studio-test"
        def call(route, payload):
            if hosted:
                return client.post("/api/process", data={"operation": json.dumps({"path": f"/documents/{doc_id}/{route}", "id": doc_id, "name": "studio.pdf", "payload": payload, "recovery": recovery})}, files={"document": ("studio.pdf", source, "application/pdf")})
            return client.post(f"/api/documents/{doc_id}/{route}", json=payload)
        if not hosted:
            opened = client.post("/api/documents", files={"file": ("studio.pdf", source, "application/pdf")})
            doc_id = opened.json()["id"]
        try:
            payload = {"bbox": [180, 450, 400, 480]}
            added = call("pages/0/text", payload)
            assert added.status_code == 200, added.text
            recovery.append({"page": 0, "kind": "text", "payload": payload})
            span = added.json()["span_id"]
            edits = [{"span_id": span, "text": "Studio text", "font": "auto", "bold": True, "italic": True, "size": 16}]
            validated = call("validate", {"edits": edits})
            assert validated.status_code == 200, validated.text
            assert validated.json()["changes"][0]["bold"] and validated.json()["changes"][0]["italic"]
            exported = call("export", {"edits": edits, "pages": [{"page": 0, "rotation": 90}]})
            assert exported.status_code == 200, exported.text[:200]
            with fitz.open(stream=exported.content, filetype="pdf") as doc:
                assert len(doc) == 1 and doc[0].rotation == 90 and "Studio text" in doc[0].get_text()
        finally:
            if not hosted:
                client.delete(f"/api/documents/{doc_id}")
