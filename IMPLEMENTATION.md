# Precision editor implementation

## Engine and application

React 19 / TypeScript / Vite UI; local FastAPI and PyMuPDF engine; fontTools font
repair and Tesseract.js OCR. No authentication, cloud storage, collaboration,
or external AI service exists. The service binds to loopback. PDF bytes remain
immutable during text editing: validated transactions remove original text and
insert replacements. This is real PDF editing, not a white-rectangle text overlay.

Rendering, shaping, and export use MuPDF. Engine and browser tests verify
exported text, document geometry, fonts, and unchanged surrounding pixels.
Rendering/extraction in a second engine is an additional interoperability
check, not a replacement for deterministic MuPDF comparisons.

Critical limitations: inferred rather than semantic paragraphs; partial Type3
support; no general PDF content-stream rewriting for arbitrary clipping/blending;
no general page/object operations; volatile sessions. Shared engine access is serialized.

## Decisions

- Remain **open source / AGPL-3.0-or-later**, with dependency notices preserved.
- Retain the proven MuPDF engine. A rewrite with PDF.js alone would regress
  editing; PDF.js is primarily a renderer. Commercial engine migration is not
  justified without a demonstrated capability or licensing requirement.
- Add a native browser text-input surface with IME and browser selection. It
  writes the same validated PDF text transactions; immediate typing and committed
  PDF rendering are separate states. A browser font fallback is identified.
- Add atomic document commands that operate on a copy, reparse their output,
  invalidate stale anchors, and retain bounded restore points.
- Keep OCR search-layer generation separate from reconstructed visible edits.
- Use IndexedDB for explicitly enabled local recovery and named saved copies.
- Treat cloud collaboration, certificate signing, office conversion, and external
  AI as distinct integrations, never as simulated local buttons.

## Fidelity contract

Native edits preserve reusable font programs and untouched page content for
supported cases. Full matching fonts can differ in version; substitutes are
labeled. OCR/region changes are reconstructed and use a solid background.
Added text and annotations are separate commands. Searchable OCR changes the
hidden text layer, not the visible scanned letters. Redaction is a dedicated
sanitized export operation, not an ordinary visual region edit.

Original bytes, command restore points, local drafts, and exports have distinct
lifetimes. Unsupported source structures must produce an actionable limitation.
No PDF/A, PDF/UA, PDF/X, digital-signature validity, or universal fidelity claim
is made without the relevant validation.

## Implementation sequence and acceptance

1. On-page input → validated native transaction → undo/redo → export/reopen.
   Include Backspace, selected-text replacement, IME, rapid typing, zoom, and fonts.
2. Recoverable document commands, layout/text tools, and font/fidelity information.
3. Page organization, search/replace, annotations, forms, images, metadata, export.
4. OCR search layers/review, comparison, redaction, local recovery, validation.
5. Team/intelligence work follows reliable local commands and storage, as required
   by the collaboration phase. It needs authentication, shared storage and conflict semantics.

Workspace design, command palette and accessible dialogs accompany the
local editing increments. Benchmark and independent-reader checks, measurements,
and capability updates are acceptance gates for every phase, not a final add-on.

Track actual supported scope in `CAPABILITIES.md`. Roadmap items are not
completed features; the capability matrix records the distinction.

## v0.5 implementation checkpoint

The core vertical slice is implemented: glyph-based initial caret placement,
native textarea selection/typing and IME, debounced serialized validation,
versioned drafts that reject stale response overwrites, original-font pinning,
bounded undo/redo, export barriers, and reopen verification. `server/inline.py`
wraps supported simple CFF programs in OpenType for the browser; PDF export
continues using the source program. Complex/unsupported live fonts are labeled.

Literal bulk replacements reuse the transaction engine, preserve each matched
run's style, validate the whole batch, preview the actual PDF, and commit as one
history entry. The fidelity report exposes applied font resolution/reconstruction.
The Document Studio UI includes the warm light workspace and a real command palette. Existing
benchmark scenarios remain regression gates. PDF.js is a development-only second
reader; it is not shipped as the editing engine.

Phase 1's supported single-run workflow has acceptance coverage. Phases 2–5 are
not complete; remaining requirements are itemized in the capability ledger.

## Warm character UI and brand refresh

The interface was rebuilt around a light workspace, one tool row, labeled panels,
a floating page/zoom dock, fit-page and focus modes, and on-demand phone properties.
Tool cards carry the selected workflow through file opening. Legacy style layers
were removed; `src/styles.css` owns the visual system.

The approved orange direction extends to all brand assets: transparent fluid
marks, outlined logo lockups, icons, social artwork and the vector print board.
Ember, apricot, cream and espresso lead; sage and rose are complementary accents.
Caveat is bundled/preloaded locally for homepage handwriting, alongside Manrope
and DM Sans. `public/brand/BRAND-GUIDE.md` and `tokens.json` describe the identity.
