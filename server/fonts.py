"""Font discovery, PDF-name reconciliation, cmap repair, and explicit recovery.

No PDF data is sent to font providers. Installed fonts are indexed locally;
downloaded Google Fonts and user-supplied fonts are cached on this machine.
"""
from collections import Counter
from dataclasses import dataclass, field
from hashlib import sha256
from io import BytesIO
import json
import os
from pathlib import Path
import re
import unicodedata
import urllib.error
from urllib.parse import quote

from fontTools.ttLib import TTFont, TTCollection, newTable
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
from fontTools.varLib.instancer import instantiateVariableFont
import pymupdf as fitz

from .assets import cache_root, download
from .shaping import requires_shaping

BASE_FONTS = {
    "helvetica": "helv", "helveticabold": "hebo", "helveticaoblique": "heit", "helveticaboldoblique": "hebi",
    "timesroman": "tiro", "timesbold": "tibo", "timesitalic": "tiit", "timesbolditalic": "tibi",
    "courier": "cour", "courierbold": "cobo", "courieroblique": "coit", "courierboldoblique": "cobi",
}
BUILTINS = {
    "helv": "Helvetica", "hebo": "Helvetica Bold", "heit": "Helvetica Oblique", "hebi": "Helvetica Bold Oblique",
    "tiro": "Times Roman", "tibo": "Times Bold", "tiit": "Times Italic", "tibi": "Times Bold Italic",
    "cour": "Courier", "cobo": "Courier Bold", "coit": "Courier Oblique", "cobi": "Courier Bold Oblique",
    "notos": "Noto Sans", "notosbo": "Noto Sans Bold", "notosit": "Noto Sans Italic", "notosbi": "Noto Sans Bold Italic",
    "figo": "FiraGO", "figbo": "FiraGO Bold", "figit": "FiraGO Italic", "figbi": "FiraGO Bold Italic",
    "cjk": "Droid Sans CJK",
    "math": "Noto Sans Math", "music": "Noto Music", "symbol1": "Noto Sans Symbols", "symbol2": "Noto Sans Symbols 2",
}
GOOGLE_FAMILIES = ["Carlito", "Caladea", "Arimo", "Tinos", "Cousine", "Noto Sans", "Noto Serif",
                   "Roboto", "Open Sans", "Lato", "Montserrat", "Inter", "Source Sans 3", "Source Serif 4",
                   "Noto Naskh Arabic", "Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Thai"]
COMPATIBLE = {"arial": "Arimo", "helvetica": "Arimo", "timesnewroman": "Tinos", "times": "Tinos",
              "calibri": "Carlito", "cambria": "Caladea", "couriernew": "Cousine"}


def normalize_font(name: str) -> str:
    name = re.sub(r"#([0-9a-fA-F]{2})", lambda m: chr(int(m[1], 16)), name)
    name = re.sub(r"^(?:[A-Za-z]{6}\+)+", "", name)
    return re.sub(r"[^a-z0-9]", "", name.lower())


def family_key(name: str) -> str:
    name = normalize_font(name)
    return re.sub(r"(?:bolditalic|boldoblique|semibold|demibold|extrabold|bold|italic|oblique|regular|roman|book|psmt|mt|ps|std)+$", "", name)


def font_names(buffer: bytes) -> set[str]:
    try:
        with TTFont(BytesIO(buffer), lazy=True) as font:
            return {entry.toUnicode() for entry in font["name"].names if entry.nameID in (1, 4, 6, 16)}
    except Exception:
        return set()


@dataclass
class FontSource:
    font: fitz.Font
    buffer: bytes | None = None
    base_name: str | None = None
    subset_characters: set[str] | None = None
    kind: str = "embedded"
    id: str = ""
    aliases: set[str] = field(default_factory=set)
    repaired: bool = False
    fallbacks: tuple["FontSource", ...] = ()
    face_names: set[str] = field(default_factory=set)
    pdf_xref: int | None = None

    @property
    def display_name(self) -> str:
        return " + ".join([self.font.name, *(font.font.name for font in self.fallbacks)])

    def missing(self, text: str) -> list[str]:
        missing = {c for c in text if not c.isspace() and unicodedata.category(c) != "Cf" and
                       (not self.font.has_glyph(ord(c)) or
                        (self.subset_characters is not None and c not in self.subset_characters))}
        return sorted(c for c in missing if not any(not fallback.missing(c) for fallback in self.fallbacks))


def repair_unicode_map(buffer: bytes, mapping: dict[int, int]) -> bytes | None:
    """Rebuild an SFNT Unicode cmap from PDF ToUnicode + renderer glyph IDs.

    Glyph outlines and glyph ordering are unchanged. This cannot repair bare
    Type1/CID programs; those retain the original-font / replacement paths.
    """
    try:
        with TTFont(BytesIO(buffer), recalcTimestamp=False) as font:
            order = font.getGlyphOrder()
            current = font.getBestCmap() or {}
            observed = {code: order[gid] for code, gid in mapping.items()
                        if 0 < gid < len(order) and 0 < code <= 0x10FFFF and code != 0xFFFD}
            if not observed or all(current.get(code) == glyph for code, glyph in observed.items()):
                return None
            combined = {**current, **observed}
            table = newTable("cmap")
            table.tableVersion = 0
            table.tables = []
            for platform, encoding in ((3, 10), (0, 4)):
                subtable = CmapSubtable.newSubtable(12)
                subtable.platformID, subtable.platEncID, subtable.language = platform, encoding, 0
                subtable.cmap = combined
                table.tables.append(subtable)
            font["cmap"] = table
            output = BytesIO()
            font.save(output)
            return output.getvalue()
    except Exception:
        return None


def embedded_candidates(doc: fitz.Document, page: fitz.Page, cache: dict[int, FontSource]) -> list[FontSource]:
    result = []
    for xref, _, _, base, resource, *_ in page.get_fonts(full=True):
        source = cache.get(xref)
        if source is None:
            try:
                extracted_name, _, _, buffer = doc.extract_font(xref)
                if not buffer:
                    continue
                font = fitz.Font(fontbuffer=buffer)
                aliases = {base, resource, extracted_name, font.name, *font_names(buffer)}
                source = FontSource(font, buffer=buffer, aliases=aliases,
                                    subset_characters=set() if re.search(r"[A-Z]{6}\+", base) else None,
                                    face_names={base, resource, extracted_name, font.name}, pdf_xref=xref)
                cache[xref] = source
            except Exception:
                continue
        source.aliases.update((base, resource))
        source.face_names.update((base, resource))
        if source not in result:
            result.append(source)
    return result


def resolve_embedded(name: str, candidates: list[FontSource], glyphs: list[tuple[int, int]] | None = None) -> FontSource | None:
    normalized = normalize_font(name)
    canonical = lambda value: re.sub(r"(?:regular|psmt|mt|ps)$", "", normalize_font(value))
    # Family aliases are deliberately weaker than face/resource names: a bold
    # face also calls its family "Liberation Serif", which is not a regular face.
    tiers = [
        [s for s in candidates if any(normalize_font(n) == normalized for n in s.face_names)],
        [s for s in candidates if any(canonical(n) == canonical(name) for n in s.face_names)],
        [s for s in candidates if any(normalize_font(n) == normalized for n in s.aliases)],
        [s for s in candidates if any(canonical(n) == canonical(name) for n in s.aliases)],
        # MuPDF can truncate long PostScript names in extracted spans.
        [s for s in candidates if len(normalized) >= 20 and any(normalize_font(n).startswith(normalized) for n in s.face_names)],
    ]
    matches = next((tier for tier in tiers if tier), [])
    if len(matches) == 1:
        return matches[0]
    if glyphs:
        observed = {(code, gid) for code, gid in glyphs if code > 32 and gid > 0}
        verified = [s for s in matches if observed and all(s.font.has_glyph(code) == gid for code, gid in observed)]
        if len(verified) == 1:
            return verified[0]
    return None


class FontLibrary:
    def __init__(self):
        self.entries: dict[str, dict] = {}
        self.loaded: dict[str, FontSource] = {}
        self.compositions: dict[str, tuple[str, ...]] = {}
        self.indexed = False

    def _metadata(self, path: Path, index: int = -1, kind: str = "installed") -> dict | None:
        try:
            with TTFont(path, fontNumber=index, lazy=True) as font:
                names = font["name"]
                family = names.getDebugName(16) or names.getDebugName(1) or path.stem
                style = names.getDebugName(17) or names.getDebugName(2) or "Regular"
                name = names.getDebugName(4) or f"{family} {style}"
                aliases = {name, family, names.getDebugName(6) or name}
                weight = int(font["OS/2"].usWeightClass) if "OS/2" in font else 400
                italic = bool(font["head"].macStyle & 2) if "head" in font else "italic" in style.lower()
                key = sha256(f"{path.resolve()}:{index}:{path.stat().st_mtime_ns}".encode()).hexdigest()[:24]
                return {"id": f"font:{key}", "name": name, "family": family, "style": style,
                        "weight": weight, "italic": italic, "source": kind, "path": path,
                        "index": index, "aliases": aliases}
        except Exception:
            return None

    def index(self, refresh: bool = False):
        if self.indexed and not refresh:
            return
        roots = [Path.home() / ".fonts", Path.home() / ".local/share/fonts", Path("/usr/share/fonts"),
                 Path("/usr/local/share/fonts"), Path("/Library/Fonts"), Path("/System/Library/Fonts"),
                 Path.home() / "Library/Fonts"]
        if os.name == "nt":
            roots += [Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts",
                      Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Microsoft/Windows/Fonts"]
        elif Path("/mnt/c/Windows/Fonts").is_dir():
            roots.append(Path("/mnt/c/Windows/Fonts"))
        roots.append(cache_root() / "fonts")
        count = 0
        for root in roots:
            if not root.is_dir():
                continue
            for path in root.rglob("*"):
                if count >= 2500:
                    break
                if path.suffix.lower() not in (".ttf", ".otf", ".ttc") or not path.is_file():
                    continue
                count += 1
                try:
                    if path.stat().st_size > 40 * 1024 * 1024:
                        continue
                    indices = [-1]
                    if path.suffix.lower() == ".ttc":
                        with TTCollection(path, lazy=True) as collection:
                            indices = list(range(min(32, len(collection.fonts))))
                    kind = "cached" if root == cache_root() / "fonts" else "installed"
                    for index in indices:
                        entry = self._metadata(path, index, kind)
                        if entry:
                            self.entries[entry["id"]] = entry
                except OSError:
                    continue
        self.indexed = True

    def catalog(self, refresh: bool = False) -> list[dict]:
        self.index(refresh)
        builtin = [{"id": f"builtin:{key}", "name": name, "family": name,
                    "source": "bundled", "style": "", "weight": 400, "italic": False} for key, name in BUILTINS.items()]
        entries = [{k: v for k, v in entry.items() if k not in ("path", "index", "aliases")}
                   for entry in self.entries.values()]
        return builtin + sorted(entries, key=lambda entry: entry["name"].casefold())

    def load(self, key: str) -> FontSource:
        if key in self.loaded:
            return self.loaded[key]
        if key in BUILTINS:
            key = f"builtin:{key}"
        if key.startswith("mix:"):
            keys = self.compositions.get(key)
            if not keys:
                raise ValueError("This mixed-script font selection is no longer available. Select Auto again.")
            primary, *fallbacks = [self.load(component) for component in keys]
            source = FontSource(primary.font, buffer=primary.buffer or primary.font.buffer,
                                kind="bundled", id=key, fallbacks=tuple(fallbacks), aliases=primary.aliases)
        elif key.startswith("builtin:"):
            code = key.split(":", 1)[1]
            if code not in BUILTINS:
                raise ValueError("Unknown bundled font.")
            font = fitz.Font(code)
            source = FontSource(font, buffer=None if code in BASE_FONTS.values() else font.buffer,
                                base_name=code if code in BASE_FONTS.values() else None,
                                kind="bundled", id=key, aliases={BUILTINS[code], font.name})
        elif key.startswith("script:"):
            script = key.split(":", 1)[1]
            code = getattr(fitz.mupdf, f"UCDN_SCRIPT_{script}", None)
            if code is None:
                raise ValueError("Unknown script font.")
            font = fitz.Font(script=code)
            source = FontSource(font, buffer=font.buffer, kind="bundled", id=key, aliases={font.name})
        else:
            self.index()
            entry = self.entries.get(key)
            if not entry:
                raise ValueError("This font is no longer available. Open Font Studio and select or upload it again.")
            try:
                modified = entry["path"].stat().st_mtime_ns
            except OSError as exc:
                raise ValueError("The selected font file is no longer on disk. Upload or select it again in Font Studio.") from exc
            current = sha256(f"{entry['path'].resolve()}:{entry['index']}:{modified}".encode()).hexdigest()[:24]
            if entry["id"] != f"font:{current}":
                raise ValueError("The selected font file changed on disk. Select it again in Font Studio before exporting.")
            with TTFont(entry["path"], fontNumber=entry["index"], recalcTimestamp=False) as font:
                if "fvar" in font:
                    axes = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
                    font = instantiateVariableFont(font, axes, inplace=True)
                font.flavor = None
                output = BytesIO()
                font.save(output)
                buffer = output.getvalue()
            source = FontSource(fitz.Font(fontbuffer=buffer), buffer=buffer, kind=entry["source"], id=key, aliases=entry["aliases"])
        if len(self.loaded) >= 48:
            self.loaded.pop(next(iter(self.loaded)))
        self.loaded[key] = source
        return source

    def register(self, buffer: bytes, kind: str = "uploaded", weight: int = 400) -> dict:
        try:
            with TTFont(BytesIO(buffer), recalcTimestamp=False) as font:
                if "fvar" in font:
                    axes = {axis.axisTag: (max(axis.minValue, min(weight, axis.maxValue)) if axis.axisTag == "wght" else axis.defaultValue)
                            for axis in font["fvar"].axes}
                    font = instantiateVariableFont(font, axes, inplace=True)
                font.flavor = None
                output = BytesIO()
                font.save(output)
                normalized = output.getvalue()
            fitz.Font(fontbuffer=normalized)
        except Exception as exc:
            raise ValueError("This file is not a reusable TrueType/OpenType font. Upload a .ttf or .otf font file.") from exc
        directory = cache_root() / "fonts"
        directory.mkdir(exist_ok=True)
        path = directory / f"{sha256(normalized).hexdigest()}.otf"
        if not path.exists():
            if sum(p.stat().st_size for p in directory.glob("*.otf")) + len(normalized) > 300 * 1024 * 1024:
                raise ValueError("The local font cache is full (300 MB). Remove unused cached fonts before adding more.")
            path.write_bytes(normalized)
        entry = self._metadata(path, kind=kind)
        if not entry:
            raise ValueError("The font's family metadata could not be read.")
        self.entries[entry["id"]] = entry
        return {k: v for k, v in entry.items() if k not in ("path", "index", "aliases")}

    def fetch_google(self, family: str, weight: int, italic: bool) -> dict:
        slug = re.sub(r"[^a-z0-9]", "", family.lower())
        if not slug:
            raise ValueError("Enter a Google Fonts family name.")
        entries = None
        category = "ofl"
        for category in ("ofl", "apache"):
            try:
                entries = json.loads(download(f"https://api.github.com/repos/google/fonts/contents/{category}/{slug}", maximum=2_000_000))
                break
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    continue
                raise ValueError("Google Fonts could not be reached or its rate limit was reached. Try again later or upload the font file.") from exc
        if not isinstance(entries, list):
            raise ValueError("That family was not found in Google Fonts. Try its exact family name, or upload your font file.")
        names = [item["name"] for item in entries if item.get("type") == "file" and item["name"].lower().endswith((".ttf", ".otf"))]
        names = [name for name in names if "/" not in name and "\\" not in name]
        names.sort(key=lambda name: (
            ("italic" in name.lower()) != italic,
            0 if "[" in name else 1,
            ("bold" in name.lower()) != (weight >= 600),
            not ("regular" in name.lower()), name,
        ))
        if not names:
            raise ValueError("This family has no downloadable TTF/OTF font. Upload a local font instead.")
        chosen = names[0]
        if ("italic" in chosen.lower()) != italic:
            raise ValueError("This Google Fonts family does not offer the requested italic style.")
        base = f"https://raw.githubusercontent.com/google/fonts/main/{category}/{slug}"
        buffer = download(f"{base}/{quote(chosen)}")
        entry = self.register(buffer, kind="downloaded", weight=weight)
        license_name = "OFL.txt" if category == "ofl" else "LICENSE.txt"
        try:
            license_text = download(f"{base}/{license_name}", maximum=200_000)
            (cache_root() / "fonts" / f"{slug}-LICENSE.txt").write_bytes(license_text)
        except (ValueError, urllib.error.HTTPError):
            pass
        entry["provider"] = "Google Fonts"
        entry["source_url"] = f"https://github.com/google/fonts/tree/main/{category}/{slug}"
        return entry

    def exact_candidates(self, name: str, bold: bool, italic: bool) -> list[dict]:
        self.index()
        key = family_key(name)
        matches = [entry for entry in self.entries.values() if any(family_key(alias) == key for alias in entry["aliases"])]
        return sorted(matches, key=lambda entry: ((entry["weight"] >= 600) != bold, entry["italic"] != italic))


library = FontLibrary()


def script_fonts(text: str) -> list[str]:
    # Unicode script names for the scripts most often encountered in PDFs.
    ranges = [(0x0600, 0x08FF, "ARABIC"), (0x0590, 0x05FF, "HEBREW"),
              (0x0900, 0x097F, "DEVANAGARI"), (0x0980, 0x09FF, "BENGALI"),
              (0x0A00, 0x0A7F, "GURMUKHI"), (0x0A80, 0x0AFF, "GUJARATI"),
              (0x0B00, 0x0B7F, "ORIYA"), (0x0B80, 0x0BFF, "TAMIL"),
              (0x0C00, 0x0C7F, "TELUGU"), (0x0C80, 0x0CFF, "KANNADA"),
              (0x0D00, 0x0D7F, "MALAYALAM"), (0x0D80, 0x0DFF, "SINHALA"),
              (0x0E00, 0x0E7F, "THAI"), (0x0E80, 0x0EFF, "LAO"), (0x0F00, 0x0FFF, "TIBETAN"),
              (0x1000, 0x109F, "MYANMAR"), (0x1780, 0x17FF, "KHMER"),
              (0x3040, 0x30FF, "HIRAGANA"), (0x3400, 0x9FFF, "HAN"), (0xAC00, 0xD7AF, "HANGUL")]
    counts = Counter(script for c in text for start, end, script in ranges if start <= ord(c) <= end)
    return [f"script:{script}" for script, _ in counts.most_common()]


def script_font(text: str) -> str | None:
    candidates = script_fonts(text)
    return candidates[0] if candidates else None


def choose_font(span: dict, text: str, choice: str, original: FontSource | None) -> tuple[FontSource, str]:
    contextual_subset = bool(original and original.subset_characters is not None and
                             text != span["text"] and requires_shaping(text))
    if choice == "original":
        if not original:
            raise ValueError("The original font program is missing. Use Auto font recovery, Font Studio, or upload the original TTF/OTF file.")
        if contextual_subset:
            raise ValueError("This subset font may lack the contextual forms required by your new text. Use Auto recovery or upload the full font for reliable shaping.")
        missing = original.missing(text)
        if missing:
            raise ValueError(f"This font does not contain these characters: {' '.join(missing[:12])}. Use Auto font recovery or supply the full font in Font Studio.")
        return original, "Original embedded font" if original.buffer else "Original standard PDF font"
    if choice != "auto":
        source = library.load(choice)
        if source.missing(text):
            raise ValueError(f"This font does not contain these characters: {' '.join(source.missing(text)[:12])}. Choose Auto or another font in Font Studio.")
        return source, "Explicit replacement font"
    if original and not contextual_subset and not original.missing(text):
        return original, "Estimated scan font" if span.get("source") != "native" else "Original font preserved"
    names = [span["font"], *sorted(original.aliases if original else ())]
    exact = {entry["id"]: entry for name in names for entry in library.exact_candidates(name, span["bold"], span["italic"])}
    for entry in exact.values():
        if (entry["weight"] >= 600) != span["bold"] or entry["italic"] != span["italic"]:
            continue
        try:
            source = library.load(entry["id"])
            if not source.missing(text):
                return source, "Matching full font found locally (font version may differ)"
        except Exception:
            continue
    compatible = COMPATIBLE.get(family_key(span["font"]))
    if compatible:
        for entry in library.exact_candidates(compatible, span["bold"], span["italic"]):
            if (entry["weight"] >= 600) != span["bold"] or entry["italic"] != span["italic"]:
                continue
            try:
                source = library.load(entry["id"])
                if not source.missing(text):
                    return source, f"Metric-compatible substitute for {span['font']}"
            except Exception:
                continue
    family = span["font"].lower()
    serif = any(word in family for word in ("times", "serif", "cambria", "garamond", "georgia")) and "sans" not in family
    mono = any(word in family for word in ("courier", "mono", "consolas"))
    index = int(span["bold"]) + 2 * int(span["italic"])
    preferred = (["cour", "cobo", "coit", "cobi"] if mono else
                 ["tiro", "tibo", "tiit", "tibi"] if serif else ["helv", "hebo", "heit", "hebi"])[index]
    primary = f"builtin:{['figo', 'figbo', 'figit', 'figbi'][index]}"
    candidates = [span.get("suggested_font"), f"builtin:{preferred}", *script_fonts(text),
                  primary, "builtin:notos", "builtin:cjk", "builtin:math", "builtin:music", "builtin:symbol2"]
    for key in filter(None, candidates):
        try:
            source = library.load(key)
            if not source.missing(text):
                return source, "Automatic substitute — preview the changed appearance"
        except Exception:
            continue
    # Mixed Latin / Indic / Arabic text often needs more than one font. Story
    # performs shaping and per-script fallback with the complete font chain.
    keys = [primary]
    remaining = library.load(primary).missing(text)
    for key in dict.fromkeys(filter(None, candidates)):
        if key == primary:
            continue
        try:
            covered = [char for char in remaining if not library.load(key).missing(char)]
        except Exception:
            continue
        if covered:
            keys.append(key)
            remaining = [char for char in remaining if char not in covered]
        if not remaining:
            break
    if not remaining:
        key = "mix:" + sha256("|".join(keys).encode()).hexdigest()[:24]
        library.compositions[key] = tuple(keys)
        source = library.load(key)
        return source, "Automatic mixed-script font fallback — review appearance"
    raise ValueError("No available font covers all these characters. Upload a font with the required script in Font Studio.")
