"""An original, generated sample; no externally licensed document assets."""
import pymupdf as fitz


def create_demo() -> bytes:
    doc = fitz.open()
    ink = (0.16, 0.22, 0.20)
    muted = (0.40, 0.45, 0.40)
    green = (0.28, 0.40, 0.31)
    cream = (0.97, 0.96, 0.93)

    def text(page, point, content, size=11, font="helv", color=ink):
        page.insert_text(point, content, fontsize=size, fontname=font, color=color)

    def base(number):
        page = doc.new_page(width=595, height=842)
        page.draw_rect(page.rect, fill=cream, color=None)
        text(page, (48, 44), "COMMON GROUND", 10, "hebo")
        text(page, (402, 44), "FIELD NOTES  /  2026", 9, color=muted)
        page.draw_line((48, 62), (547, 62), color=(0.77, 0.78, 0.72), width=0.6)
        page.draw_line((48, 790), (547, 790), color=(0.77, 0.78, 0.72), width=0.6)
        text(page, (48, 810), "A small studio. A more thoughtful world.", 9, color=muted)
        text(page, (529, 810), f"0{number}", 9, color=muted)
        return page

    page = base(1)
    text(page, (48, 104), "DESIGNING FOR WHAT MATTERS", 9, "hebo", green)
    text(page, (45, 171), "Good spaces.", 49, "tiro")
    text(page, (45, 225), "Better everyday.", 49, "tiro")
    text(page, (49, 260), "A field guide to places that bring us together.", 13, color=muted)
    # Architectural artwork made entirely from editable PDF vectors.
    page.draw_rect((48, 295, 547, 550), fill=(0.85, 0.87, 0.79), color=None)
    page.draw_rect((48, 490, 547, 550), fill=(0.73, 0.76, 0.64), color=None)
    page.draw_circle((463, 352), 29, fill=(0.95, 0.91, 0.67), color=None)
    page.draw_rect((148, 354, 424, 497), fill=(0.94, 0.92, 0.83), color=None)
    page.draw_quad(fitz.Quad((134, 354), (292, 308), (292, 354), (438, 354)), fill=green, color=None)
    page.draw_rect((177, 377, 237, 497), fill=(0.32, 0.44, 0.36), color=None)
    page.draw_rect((261, 377, 322, 435), fill=(0.47, 0.58, 0.48), color=None)
    page.draw_rect((343, 377, 397, 435), fill=(0.47, 0.58, 0.48), color=None)
    for x in (281, 363):
        page.draw_line((x, 377), (x, 435), color=cream, width=2)
    for x, y, r in ((103, 409, 37), (487, 429, 31)):
        page.draw_line((x, y), (x, 516), color=green, width=5)
        page.draw_circle((x, y), r, fill=green, color=None)
    page.draw_line((207, 498), (225, 550), color=(0.90, 0.87, 0.76), width=26)
    text(page, (49, 574), "01 / THE NEIGHBORHOOD STUDIO", 8, "hebo", muted)
    text(page, (48, 625), "Built around people.", 26, "tiro")
    for y, line in zip((655, 673, 691, 709), (
        "The best places do more than look good. They make room for life:",
        "a conversation over coffee, a quiet moment, an unexpected idea.",
        "We believe thoughtful design starts with listening, and grows",
        "through the little details that make a place feel like your own.",
    )):
        text(page, (49, y), line, 11, color=muted)
    text(page, (49, 756), "Less noise. More belonging.", 11, "hebo", green)

    page = base(2)
    text(page, (48, 108), "OUR APPROACH", 9, "hebo", green)
    text(page, (46, 174), "Small details.", 45, "tiro")
    text(page, (46, 224), "Lasting difference.", 45, "tiro")
    for top, number, title, lines in (
        (302, "01", "Start with listening.", ["Every neighborhood has a story. We take time to learn", "what matters to the people who call it home."]),
        (445, "02", "Make room for connection.", ["Welcoming spaces turn strangers into neighbors.", "A shared table can be the beginning of something good."]),
        (588, "03", "Build for the long run.", ["Honest materials. Flexible spaces. Thoughtful choices.", "We design for everyday life, and for the years ahead."]),
    ):
        page.draw_line((48, top - 18), (547, top - 18), color=(0.77, 0.78, 0.72), width=0.6)
        text(page, (48, top + 12), number, 13, "hebo", green)
        text(page, (105, top + 12), title, 24, "tiro")
        for i, line in enumerate(lines):
            text(page, (106, top + 44 + i * 19), line, 11, color=muted)
    text(page, (48, 748), "Let's make something meaningful.", 15, "tiit", green)
    doc.set_metadata({"title": "Common Ground — Field Notes", "author": "Reage", "subject": "An editable sample PDF"})
    result = doc.tobytes(garbage=4, deflate=True)
    doc.close()
    return result


def create_scanned_demo() -> bytes:
    """An image-only fixture that makes the OCR workflow easy to try."""
    with fitz.open() as original:
        page = original.new_page(width=595, height=420)
        page.draw_rect(page.rect, color=None, fill=(0.97, 0.96, 0.93))
        page.insert_text((45, 55), "REAGE / SCANNED SAMPLE", fontname="hebo", fontsize=10, color=(0.38, 0.45, 0.4))
        page.insert_text((45, 123), "Scanned, not stuck.", fontname="tiro", fontsize=36, color=(0.18, 0.25, 0.21))
        page.insert_text((46, 175), "This text started as pixels.", fontname="helv", fontsize=18, color=(0.22, 0.29, 0.24))
        page.insert_text((46, 220), "Recognize the words. Make them yours.", fontname="helv", fontsize=14, color=(0.3, 0.35, 0.31))
        page.draw_rect((46, 259, 549, 265), fill=(0.76, 0.81, 0.71), color=None)
        page.insert_text((46, 313), "No text layer. No embedded fonts.", fontname="helv", fontsize=13, color=(0.4, 0.45, 0.4))
        page.insert_text((46, 338), "Local OCR gives this page a new beginning.", fontname="helv", fontsize=13, color=(0.4, 0.45, 0.4))
        image = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).tobytes("png")
    with fitz.open() as scanned:
        page = scanned.new_page(width=595, height=420)
        page.insert_image(page.rect, stream=image)
        return scanned.tobytes(garbage=4, deflate=True)
