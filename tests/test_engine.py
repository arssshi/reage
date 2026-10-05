import pymupdf as fitz
import pytest

from server.demo import create_demo
from server.engine import EditError, export_pdf, inspect_document, prepare_edits
from server.models import TextEdit


@pytest.fixture
def sample():
    return inspect_document(create_demo(), "sample.pdf")


def select(data, text):
    return next(span for span in data.spans.values() if span["text"] == text)


def test_replacement_removes_old_text_and_preserves_style(sample):
    original = select(sample, "Good spaces.")
    edited = export_pdf(sample, [TextEdit(span_id=original["id"], text="Great places.")])
    reopened = inspect_document(edited, "output.pdf")
    replacement = select(reopened, "Great places.")
    assert not any(s["text"] == "Good spaces." for s in reopened.spans.values())
    for key in ("font", "size", "color", "origin"):
        assert replacement[key] == original[key]
    assert len(reopened.spans) == len(sample.spans)
    assert select(sample, "Good spaces.") == original  # Immutable source.


def test_pixels_outside_edited_region_are_unchanged(sample):
    original = select(sample, "Good spaces.")
    output = export_pdf(sample, [TextEdit(span_id=original["id"], text="Great places.")])
    with fitz.open(stream=sample.source, filetype="pdf") as before, fitz.open(stream=output, filetype="pdf") as after:
        # Region includes the entire illustration and lower-page text.
        clip = fitz.Rect(0, 280, 595, 842)
        assert before[0].get_pixmap(clip=clip).samples == after[0].get_pixmap(clip=clip).samples
        assert before[1].get_pixmap().samples == after[1].get_pixmap().samples
        # Removing a text operation changes drawing sequence numbers only.
        clean = lambda drawings: [{k: v for k, v in drawing.items() if k != "seqno"} for drawing in drawings]
        assert clean(before[0].get_drawings()) == clean(after[0].get_drawings())


def test_font_subset_is_reused_and_missing_glyphs_are_rejected():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_font(fontname="Embedded", fontbuffer=fitz.Font("helv").buffer)
        page.insert_text((40, 70), "cafe", fontname="Embedded", fontsize=16)
        doc.subset_fonts()
        data = inspect_document(doc.tobytes(), "subset.pdf")
    span = select(data, "cafe")
    assert span["font_status"] == "embedded"
    edited = export_pdf(data, [TextEdit(span_id=span["id"], text="face")])
    with fitz.open(stream=edited, filetype="pdf") as doc:
        assert doc[0].get_text().strip() == "face"
    with pytest.raises(EditError, match="does not contain"):
        export_pdf(data, [TextEdit(span_id=span["id"], text="café")])
    # Substitution is available only after an explicit font choice.
    output = export_pdf(data, [TextEdit(span_id=span["id"], text="café", font="helv")])
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert doc[0].get_text().strip() == "café"


def test_unicode_supported_by_base14_is_embedded_without_losing_text(sample):
    span = select(sample, "Built around people.")
    output = export_pdf(sample, [TextEdit(span_id=span["id"], text="Here’s café • €", fit=True)])
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert "Here’s café • €" in doc[0].get_text()


def test_image_and_link_behind_text_survive():
    with fitz.open() as doc:
        page = doc.new_page()
        pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 8, 8))
        pix.clear_with(120)
        page.insert_image((20, 20, 300, 130), pixmap=pix)
        page.insert_text((40, 70), "Link text", fontsize=16)
        page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(35, 50, 140, 80), "uri": "https://example.com"})
        data = inspect_document(doc.tobytes(), "image.pdf")
    span = select(data, "Link text")
    output = export_pdf(data, [TextEdit(span_id=span["id"], text="New text")])
    with fitz.open(stream=data.source, filetype="pdf") as before, fitz.open(stream=output, filetype="pdf") as after:
        assert len(after[0].get_images()) == 1
        assert before.extract_image(before[0].get_images()[0][0])["image"] == after.extract_image(after[0].get_images()[0][0])["image"]
        assert [link["uri"] for link in after[0].get_links()] == ["https://example.com"]


def test_overflow_collision_and_explicit_fit(sample):
    span = select(sample, "COMMON GROUND")
    with pytest.raises(EditError) as error:
        prepare_edits(sample, [TextEdit(span_id=span["id"], text="An exceptionally long header " * 3)])
    assert error.value.code in ("overflow", "text_collision")
    prepared = prepare_edits(sample, [TextEdit(span_id=span["id"], text="An exceptionally long header " * 3, fit=True)])
    assert prepared[0]["size"] < span["size"]
    assert prepared[0]["bbox"][2] == pytest.approx(span["bbox"][2], abs=0.01)


def test_delete_and_noop_export(sample):
    assert export_pdf(sample, []) == sample.source
    span = select(sample, "Good spaces.")
    output = export_pdf(sample, [TextEdit(span_id=span["id"], text="")])
    assert len(inspect_document(output, "deleted.pdf").spans) == len(sample.spans) - 1


def test_pending_redactions_are_not_accidentally_applied():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((40, 70), "Keep this")
        page.add_redact_annot((30, 50, 150, 80))
        data = inspect_document(doc.tobytes(), "pending.pdf")
    span = select(data, "Keep this")
    assert not span["editable"]
    with pytest.raises(EditError, match="pending redactions"):
        export_pdf(data, [TextEdit(span_id=span["id"], text="changed")])


@pytest.mark.parametrize("text", ["line\nbreak", "tab\there", "nul\x00", "مرحبا", "कथा", "ภาษา"])
def test_unsupported_input_is_rejected_atomically(sample, text):
    span = select(sample, "Good spaces.")
    with pytest.raises(EditError):
        export_pdf(sample, [TextEdit(span_id=span["id"], text=text)])


def test_rotated_page_text_is_editable_in_rendered_coordinates():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((40, 70), "Rotated")
        page.set_rotation(90)
        data = inspect_document(doc.tobytes(), "rotated.pdf")
    assert data.pages[0]["width"] == 842
    span = select(data, "Rotated")
    assert span["editable"] and span["rotation"] == 270
    assert span["origin"] == [772, 40]
    output = export_pdf(data, [TextEdit(span_id=span["id"], text="Updated")])
    updated = select(inspect_document(output, "updated.pdf"), "Updated")
    assert updated["origin"] == span["origin"] and updated["rotation"] == 270


@pytest.mark.parametrize("rotation", [90, 180, 270])
def test_quarter_turn_text_can_be_edited_without_changing_direction(rotation):
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((300, 400), "Original label", fontsize=18, rotate=rotation)
        data = inspect_document(doc.tobytes(), "turned.pdf")
    span = select(data, "Original label")
    assert span["editable"]
    output = export_pdf(data, [TextEdit(span_id=span["id"], text="Updated label")])
    updated = select(inspect_document(output, "updated.pdf"), "Updated label")
    assert updated["rotation"] == rotation
    assert updated["origin"] == span["origin"]


def test_shaped_text_can_be_placed_on_a_quarter_turn():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((300, 400), "Original label", fontsize=18, rotate=90)
        data = inspect_document(doc.tobytes(), "turned.pdf")
    edit = TextEdit(span_id=select(data, "Original label")["id"], text="नमस्ते", font="auto")
    result = inspect_document(export_pdf(data, [edit]), "turned-hindi.pdf")
    assert select(result, "नमस्ते")["rotation"] == 90
