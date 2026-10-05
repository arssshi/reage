# Precision editor implementation

## Engine and application

React 19 / TypeScript / Vite UI; FastAPI and PyMuPDF engine; fontTools font
repair and Tesseract.js OCR. Local mode binds to loopback; hosted mode uses
stateless Vercel functions. No accounts, saved cloud documents, collaboration,
or external AI service exists. PDF bytes remain
immutable during text editing: validated transactions remove original text and
insert replacements. This is real PDF editing, not a white-rectangle text overlay.

Rendering, shaping, and export use MuPDF. Engine and browser tests verify
exported text, document geometry, fonts, and unchanged surrounding pixels.
Rendering/extraction in a second engine is an additional interoperability
check, not a replacement for deterministic MuPDF comparisons.

Critical limitations: inferred rather than semantic paragraphs; partial Type3
support; no general PDF content-stream rewriting for arbitrary clipping/blending;
no general object/content-stream operations; volatile sessions. Page arrangement is
supported at export. Shared engine access is serialized.

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
Added text is a separate synthetic run and never triggers source redaction.
Annotation creation, hidden searchable OCR layers, and sanitized redaction remain
future command types, separate from ordinary visual region editing.

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
Manrope headings and DM Sans controls are bundled locally.
`public/brand/BRAND-GUIDE.md` and `tokens.json` describe the identity.

## v0.6 stateless hosting

`api/index.py` exposes `server/cloud.py` behind Vercel's `/api/*` rewrite.
`src/cloud.ts` translates the editor's operations into bounded multipart requests
containing the original PDF, recovery operations and added font programs. Each
request independently inspects the immutable source and replays recovery state;
native edits still use the same engine, validation, preview and export pipeline.

There is no shared document-ID store in this deployment. A context-local font
library isolates uploads; content hashes keep font choices stable across workers.
Font/OCR caches that can contain private source material are cleared before the
engine lock is released. The hosted interface explains temporary server processing,
and the local edition retains its original document-on-device workflow.

The online limits are 3 MB input, 50 pages, 4 MB combined multipart requests,
4.3 MB results and eight added fonts. Public language models bypass the function
body limit through validated redirects. Backend tests cover missing document
state, isolated font libraries, portable font IDs, recovered regions, Unicode,
size limits and unchanged pixels. Dedicated browser workflows use only original
public samples, including against the production URL.

## v0.6.1 editing stability and request efficiency

The inline surface and the PDF image now share an explicit handoff. Starting an
edit temporarily masks the source run until the text-free engine background
arrives. Finishing retains a noninteractive text mirror until the replacement
image is decoded. The draft and raster swap in one React commit. Rapid selection
can retain multiple pending handoffs, and object URLs are revoked only after
their displayed frame is replaced or unmounted.

Interaction epochs prevent late blur validation from closing a resumed editor.
An unavailable history operation leaves the active draft visible. Properties
text remains editable during validation; newer drafts are preserved. Fitted
typography uses the validated size when it is available. Validation remains
serialized, debounced after 500 ms, and paused during IME composition.

Per-tab render (32 MB) and inline-font (12 MB) LRU caches share identical
requests with subscriber-aware cancellation. Closing a document clears its
entries; OCR/region and font changes invalidate affected entries. Metadata and
browser font bytes travel together, eliminating a separate font request. Applied
font diagnostics reuse validation results instead of repeatedly probing while
typing. Undo/reselection can use cached frames; zoom changes remain debounced.

The interface and brand layouts use Manrope and DM Sans without cursive fonts.
Deterministic regressions cover delayed render handoffs, original-text masking,
late blur responses, continued properties input, IME/history, rapid selection,
network retry, independent exported-text extraction, and request reuse. These
check the supported workflows; broader PDF compatibility remains in the ledger.

## v0.7 Document Studio

`TextEdit` now models nullable real-face bold/italic selection, underline/strikeout,
opacity, text-frame alignment, PDF-point offsets and quarter-turn rotation.
`choose_styled_font` prefers embedded companions, full matching faces and bundled
family variants. Auto may use an explicitly labeled substitute; strict choices
reject absent styles rather than synthesizing glyph weight/slant. Font Studio
checks usable glyph coverage and offers a public open-family catalog and recommended
downloads. The simple CFF browser adapter produces deterministic font bytes and
retains style metadata.

Native source geometry is retained in unrotated PDF coordinates for text removal.
Public selection geometry and baselines use rendered page coordinates. Replacement
origins are transformed back before insertion, so supported native text on 90°,
180° and 270° pages can be edited and moved. Collision/overflow checks use the
displayed frame. Decorations are native vector lines with the chosen opacity.

New text uses `source: added` records registered without changing source bytes.
Duplicated runs can share the original font program through a template anchor,
retain its relative baseline, and preserve the current displayed text direction.
Added objects participate in the same validated snapshots and undo/redo, but do
not redact graphics or become active selection/collision targets when absent from
the current snapshot. Hosted requests replay these registrations deterministically,
and private shaping/font caches are cleared at the request boundary.

The document-first UI adds a contextual formatting bar, move/resize handles,
page/text snapping guides, directional movement constraints, nudging, original
comparison, color presets and advanced position/opacity controls. Size typing
commits on blur/Enter so multi-digit values remain editable. Handle gestures consume
their compatibility click to prevent unintended deselection during slower renders,
including when a handle is busy validating an edit. Region drawing uses the visible,
decoded page during background zoom renders and consumes its gesture's click too.

`ExportRequest` describes an independent output page sequence, extra quarter-turns,
metadata and optional font subsetting. Repeated pages are deep-copied before selection
so their rotations are independent. `ExportDialog` provides visual arrangement,
range extraction, duplicate/remove/rotate and local arrangement undo/redo. These
settings affect the downloaded copy; workspace anchors retain source page numbers.
Partial exports keep omitted-page edits marked as unsaved.
An unchanged export with no options still returns the exact original bytes.

Regression fixtures verify true face selection, opacity/position/rotation, artwork
preservation, new/duplicated searchable text, page independence and links. Browser
workflows exercise the same features in both local and stateless hosted modes.
