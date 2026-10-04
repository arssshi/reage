from io import BytesIO

import pymupdf as fitz
from fontTools.ttLib import TTFont
import pytest

from server.inline import browser_font


@pytest.mark.parametrize("face", ["helv", "hebo", "tiro", "tibo", "cour"])
def test_cff_browser_wrapper_keeps_glyphs_and_advances(face):
    original = fitz.Font(face)
    buffer = browser_font(original.buffer)
    assert buffer and buffer.startswith(b"OTTO")
    with TTFont(BytesIO(buffer)) as font:
        assert font.getBestCmap()[ord("A")]
        assert "CFF " in font
    wrapped = fitz.Font(fontbuffer=buffer)
    for text in ("Good spaces.", "Wim", "Café", "123 €"):
        assert wrapped.text_length(text, fontsize=49) == pytest.approx(original.text_length(text, fontsize=49), abs=.01)
        for char in text:
            assert bool(wrapped.has_glyph(ord(char))) == bool(original.has_glyph(ord(char)))


def test_unsupported_programs_do_not_break_inline_style():
    assert browser_font(b"not a font") is None
    assert browser_font(b"\x01broken") is None
