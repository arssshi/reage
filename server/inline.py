"""Local browser-font adapter. Export continues using the source font program."""
from functools import lru_cache
from io import BytesIO

import pymupdf as fitz
from fontTools.cffLib import CFFFontSet
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import newTable


def browser_font(buffer: bytes) -> bytes | None:
    if buffer[:4] in (b"OTTO", b"\x00\x01\x00\x00", b"true", b"wOFF", b"wOF2"):
        return buffer
    if buffer[:1] == b"\x01" and len(buffer) <= 4 * 1024 * 1024:
        return wrap_cff(buffer)
    return None


@lru_cache(maxsize=8)
def wrap_cff(buffer: bytes) -> bytes | None:
    """Place a simple CFF program in OpenType; retain outlines and advances.

    Base-14 faces are supplied by MuPDF as raw CFF, which browsers cannot load.
    CID-keyed CFF and unsupported programs use the explicitly labeled live-draft
    fallback. This adapter never changes the font used in the exported PDF.
    """
    try:
        cff = CFFFontSet()
        cff.decompile(BytesIO(buffer), None)
        top = cff.topDictIndex[0]
        if hasattr(top, "ROS"):
            return None
        matrix = top.FontMatrix
        if matrix[1] or matrix[2] or matrix[4] or matrix[5] or matrix[0] != matrix[3]:
            return None
        units = round(1 / matrix[0])
        if not 16 <= units <= 16384:
            return None
        source = fitz.Font(fontbuffer=buffer)
        glyphs = top.charset
        cmap = {}
        for codepoint in source.valid_codepoints():
            gid = source.has_glyph(codepoint)
            if 0 < gid < len(glyphs):
                cmap[codepoint] = glyphs[gid]
        if not cmap:
            return None
        metrics = {}
        for name in glyphs:
            charstring = top.CharStrings[name]
            pen = BoundsPen(None)
            charstring.draw(pen)
            metrics[name] = (round(charstring.width), round(pen.bounds[0]) if pen.bounds else 0)
        builder = FontBuilder(units, isTTF=False)
        builder.font.sfntVersion = "OTTO"
        builder.setupGlyphOrder(glyphs)
        builder.setupCharacterMap(cmap)
        table = newTable("CFF ")
        table.cff = cff
        builder.font["CFF "] = table
        builder.setupHorizontalMetrics(metrics)
        ascent, descent = round(source.ascender * units), round(source.descender * units)
        builder.setupHorizontalHeader(ascent=ascent, descent=descent)
        bold, italic = bool(source.flags.get("bold")), bool(source.flags.get("italic"))
        style = "Bold Italic" if bold and italic else "Bold" if bold else "Italic" if italic else "Regular"
        builder.setupNameTable({"familyName": source.name, "styleName": style, "psName": cff.fontNames[0],
                                "fullName": source.name, "uniqueFontIdentifier": source.name})
        builder.setupOS2(sTypoAscender=ascent, sTypoDescender=descent, usWinAscent=max(0, ascent), usWinDescent=max(0, -descent),
                         usWeightClass=700 if bold else 400, fsSelection=(32 if bold else 0) | (1 if italic else 0) | (64 if not bold and not italic else 0))
        builder.setupPost()
        builder.setupMaxp()
        # Hosted requests clear private font caches. Identical source programs
        # must still produce identical web-font bytes across requests/seconds.
        builder.font.recalcTimestamp = False
        builder.font["head"].created = builder.font["head"].modified = 2082844800
        builder.font["head"].macStyle = int(bold) | (2 if italic else 0)
        output = BytesIO()
        builder.font.save(output)
        return output.getvalue()
    except Exception:
        # Malformed/unsupported font programs are still renderable by the PDF
        # engine; they must not prevent the user editing through a live fallback.
        return None
