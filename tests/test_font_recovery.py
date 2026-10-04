from io import BytesIO
import json

import pymupdf as fitz
from fontTools.ttLib import TTFont
import pytest

from server import fonts
from server.demo import create_demo
from server.engine import EditError, export_pdf, inspect_document, prepare_edits
from server.fonts import FontLibrary, FontSource, family_key, normalize_font, repair_unicode_map, resolve_embedded
from server.models import TextEdit


def headline(data):
    return next(span for span in data.spans.values() if span["text"] == "Good spaces.")


def test_embedded_font_matches_internal_name_when_pdf_resource_name_differs():
    with fitz.open() as doc:
        page = doc.new_page()
        xref = page.insert_font(fontname="PrinterResource", fontbuffer=fitz.Font("figo").buffer)
        page.insert_text((40, 70), "Recover my font", fontname="PrinterResource", fontsize=16)
        doc.xref_set_key(xref, "BaseFont", "/PrinterFont42")
        data = inspect_document(doc.tobytes(), "printer.pdf")
    span = next(iter(data.spans.values()))
    assert span["font_status"] in ("embedded", "repaired")
    output = export_pdf(data, [TextEdit(span_id=span["id"], text="Recovered font")])
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert "Recovered font" in doc[0].get_text()


def test_auto_replaces_unembedded_font_and_reports_substitution():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((40, 70), "Missing face", fontsize=16)
        xref = page.get_fonts()[0][0]
        doc.xref_set_key(xref, "BaseFont", "/AcmeMissingSans-Regular")
        data = inspect_document(doc.tobytes(), "unembedded.pdf")
    span = next(iter(data.spans.values()))
    assert span["font_status"] == "unavailable"
    with pytest.raises(EditError, match="missing"):
        export_pdf(data, [TextEdit(span_id=span["id"], text="New words")])
    edit = TextEdit(span_id=span["id"], text="New words", font="auto")
    prepared = prepare_edits(data, [edit])
    assert "substitute" in prepared[0]["resolution"]
    with fitz.open(stream=export_pdf(data, [edit]), filetype="pdf") as doc:
        assert "New words" in doc[0].get_text()
        assert "Missing face" not in doc[0].get_text()


def test_subset_can_be_completed_from_uploaded_full_matching_face(monkeypatch, tmp_path):
    monkeypatch.setattr(fonts, "cache_root", lambda: tmp_path)
    local = FontLibrary()
    local.indexed = True
    monkeypatch.setattr(fonts, "library", local)
    buffer = fitz.Font("figo").buffer
    entry = local.register(buffer)
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_font(fontname="Subset", fontbuffer=buffer)
        page.insert_text((40, 70), "cafe", fontname="Subset", fontsize=16)
        doc.subset_fonts()
        data = inspect_document(doc.tobytes(), "subset.pdf")
    span = next(iter(data.spans.values()))
    edit = TextEdit(span_id=span["id"], text="café and more", font="auto")
    prepared = prepare_edits(data, [edit])
    assert prepared[0]["font"].id == entry["id"]
    assert "Matching full font" in prepared[0]["resolution"]
    with fitz.open(stream=export_pdf(data, [edit]), filetype="pdf") as doc:
        assert "café and more" in doc[0].get_text()


def test_unicode_cmap_can_be_repaired_without_changing_glyph_order():
    buffer = fitz.Font("figo").buffer
    with TTFont(BytesIO(buffer)) as font:
        old_order = font.getGlyphOrder()
        glyph = font.getBestCmap()[ord("A")]
        index = old_order.index(glyph)
        for table in font["cmap"].tables:
            if table.isUnicode():
                table.cmap.pop(ord("A"), None)
        broken = BytesIO()
        font.save(broken)
    repaired = repair_unicode_map(broken.getvalue(), {ord("A"): index})
    assert repaired
    with TTFont(BytesIO(repaired)) as font:
        assert font.getBestCmap()[ord("A")] == glyph
        assert font.getGlyphOrder() == old_order
    assert fitz.Font(fontbuffer=repaired).has_glyph(ord("A"))


@pytest.mark.parametrize("text", ["مرحبا بالعالم", "नमस्ते दुनिया", "বাংলা লেখা", "ภาษาไทย"])
def test_auto_shapes_complex_scripts_and_preserves_logical_unicode(text):
    data = inspect_document(create_demo(), "multilingual.pdf")
    span = headline(data)
    edit = TextEdit(span_id=span["id"], text=text, font="auto", fit=True)
    prepared = prepare_edits(data, [edit])
    assert prepared[0]["shaped"] is not None
    with fitz.open(stream=export_pdf(data, [edit]), filetype="pdf") as doc:
        assert text in doc[0].get_text()
        assert "Good spaces." not in doc[0].get_text()


def test_decomposed_latin_is_normalized_to_a_supported_character():
    data = inspect_document(create_demo(), "latin.pdf")
    output = export_pdf(data, [TextEdit(span_id=headline(data)["id"], text="Cafe\u0301")])
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert "Café" in doc[0].get_text()


def test_open_font_fetch_uses_only_public_assets_and_caches_the_result(monkeypatch, tmp_path):
    monkeypatch.setattr(fonts, "cache_root", lambda: tmp_path)
    urls = []
    def download(url, maximum=30 * 1024 * 1024):
        urls.append(url)
        if "api.github.com" in url:
            return json.dumps([{"name": "FiraGO-Regular.ttf", "type": "file"}]).encode()
        if url.endswith(".ttf"):
            return fitz.Font("figo").buffer
        return b"SIL OPEN FONT LICENSE"
    monkeypatch.setattr(fonts, "download", download)
    local = FontLibrary()
    entry = local.fetch_google("Fira GO", 400, False)
    assert entry["source"] == "downloaded"
    assert local.load(entry["id"]).font.has_glyph(ord("A"))
    assert all("github" in url for url in urls)
    assert (tmp_path / "fonts" / "firago-LICENSE.txt").exists()


def test_font_name_normalization_handles_subset_and_postscript_names():
    assert normalize_font("ABCDEF+Arial#2dBoldMT") == "arialboldmt"
    assert family_key("ABCDEF+Calibri-BoldItalic") == "calibri"


def test_face_names_outweigh_shared_family_aliases_and_allow_truncated_names():
    regular = FontSource(fitz.Font("figo"), aliases={"Shared Family"}, face_names={"SharedFamily"})
    bold = FontSource(fitz.Font("figbo"), aliases={"Shared Family"}, face_names={"SharedFamily-Bold"})
    assert resolve_embedded("SharedFamily", [regular, bold]) is regular
    devanagari = FontSource(fitz.Font(script=fitz.mupdf.UCDN_SCRIPT_DEVANAGARI), face_names={"AAAAAA+NotoSansDevanagari-Regular"})
    assert resolve_embedded("NotoSansDevanagari-Regul", [devanagari, regular]) is devanagari


def test_duplicate_face_names_are_disambiguated_using_renderer_glyph_ids():
    correct = FontSource(fitz.Font("figo"), face_names={"Shared-Regular"})
    with TTFont(BytesIO(correct.font.buffer)) as font:
        for table in font["cmap"].tables:
            if table.isUnicode():
                table.cmap[ord("A")] = table.cmap[ord("Z")]
        output = BytesIO()
        font.save(output)
    other = FontSource(fitz.Font(fontbuffer=output.getvalue()), face_names={"Shared-Regular"})
    assert resolve_embedded("Shared-Regular", [other, correct]) is None
    assert resolve_embedded("Shared-Regular", [other, correct], [(ord("A"), correct.font.has_glyph(ord("A")))]) is correct


def test_complex_subset_uses_a_full_font_for_new_contextual_forms(monkeypatch):
    from server.fonts import FontSource, choose_font
    original = FontSource(fitz.Font(script=fitz.mupdf.UCDN_SCRIPT_ARABIC), subset_characters=set("مرحبا بالعالم"))
    original.buffer = original.font.buffer
    span = {"text": "مرحبا بالعالم", "font": "SubsetArabic", "bold": False, "italic": False, "source": "native"}
    with pytest.raises(ValueError, match="contextual forms"):
        choose_font(span, "مرحبا", "original", original)
    recovered, explanation = choose_font(span, "مرحبا", "auto", original)
    assert recovered is not original
    assert not recovered.missing("مرحبا")
    assert "substitute" in explanation


@pytest.mark.parametrize("text", ["Invoice 123: नमस्ते दुनिया", "English বাংলা 2026 مرحبا"])
def test_mixed_scripts_use_a_pinnable_font_chain(text):
    data = inspect_document(create_demo(), "mixed.pdf")
    edit = TextEdit(span_id=headline(data)["id"], text=text, font="auto", fit=True)
    prepared = prepare_edits(data, [edit])
    source = prepared[0]["font"]
    assert source.id
    assert not source.missing(text)
    # The resolved chain remains usable after the client pins the choice.
    output = export_pdf(data, [edit.model_copy(update={"font": source.id})])
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert text in doc[0].get_text()
        # ActualText alone can mask missing visible glyphs. Verify that the
        # shaped font operations contain real glyph IDs as well.
        assert all(char[1] != 0 for trace in doc[0].get_texttrace() for char in trace["chars"] if chr(char[0]).strip())
    reopened = inspect_document(output, "reopened.pdf")
    span = next(span for span in reopened.spans.values() if span["text"] == text)
    assert span["font_status"] == "embedded"
    assert span["size"] == pytest.approx(prepared[0]["size"], abs=0.001)
    again = export_pdf(reopened, [TextEdit(span_id=span["id"], text=text + "!", font="auto", fit=True)])
    with fitz.open(stream=again, filetype="pdf") as doc:
        assert text + "!" in doc[0].get_text()
