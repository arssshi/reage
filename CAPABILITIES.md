# Capability matrix

This matrix records implemented features and the remaining roadmap, not Acrobat parity.
Runtime: Python/MuPDF service and a current browser. Local mode uses bounded,
expiring memory; online mode processes self-contained requests without a saved
document store. Online limits: 3 MB / 50 pages; local limits: 30 MB / 300 pages.

## Content and fidelity

| Content | Working operations | Fidelity / constraints | Verification |
| --- | --- | --- | --- |
| Native, complete font | Direct typing/selection/Backspace, replace/delete a run, font/size/color, preserve-layout fit, atomic bulk replacement | Original baseline and reusable font; unsupported transforms are view-only; browser draft labeled separately | Engine + browser export/reopen, independent PDF.js extraction/render, outside-edit pixel checks |
| Embedded subset | Reuse present glyphs, supply/download full font | Missing outlines cannot be recovered from a subset; substitute identified | Font recovery + private benchmark |
| Non-embedded font | Base-14 reuse, local/uploaded/public font resolution | Matching family is not proof of identical font version | Font recovery tests |
| Complex scripts | Shaped replacement, logical Unicode export | HarfBuzz/Story; full font may be required, no vertical-writing editing | Indic and mixed-script engine/benchmark tests |
| Type3 | Recognize Reage shaped runs; substitute arbitrary unsupported Type3 | Arbitrary Type3 programs are not editable as original fonts | Benchmark; substitute explicitly reported |
| Scanned text | Local OCR review and visible-region replacement | Estimated font/background; solid fill, no texture reconstruction | OCR browser tests and localized pixel checks |
| Outlined text | Manual replacement regions | Reconstructed, not original-font preservation or secure redaction | Recovery tests |
| Forms | Preserve existing fields during supported text edits | Form-field editing/creation pending | Existing engine preservation tests |
| Tagged content | Render; limited ordinary text editing | Structure-tree remediation and PDF/UA validation pending | No conformance claim |
| Signed documents | Detect signature fields, explain edit consequences | Certificate validation/signing pending | No signature-validity claim |
| Encrypted documents | Explicitly reject locked input | User-credential workflow pending | API rejection tests |

## Feature status and acceptance gates

| Area | State / next acceptance gate |
| --- | --- |
| 1–3 Assessment, fidelity, engine | Assessed in `IMPLEMENTATION.md`; retain MuPDF and AGPL; benchmark proof exists |
| 4 Document model | Page/line/style-run anchors, font resources and bounded glyph geometry (4,000 per run / 200,000 per document); paragraph model remains inferred; full graphics-state model pending |
| 5 Existing-text editing | Direct input and inspector workflows verified, including delayed commits/IME/error recovery. Mixed-run selection, paragraph and linked-frame reflow pending |
| 6 Typography | Embedded repair, uploads, public downloads, shaping, font probe, subset/source-object details and edit-fidelity report working; simple CFF browser adapter retains advances; detailed text-state controls pending |
| 7 Geometry | Fractional PDF bounds, baseline preservation, zoom, boundaries; rulers/snapping/object geometry pending |
| 8 OCR | Worker recognition, bilingual models, line confidence, regional reconstruction; hidden layer, cleanup, correction queue pending |
| 9 Interface | Professional orange/cream workspace, locally bundled sans-serif type, tool-first file opening, command palette, focus mode, fit-page view, high-contrast/reduced-motion preferences and on-demand mobile properties; multiview modes pending |
| 10 Objects | Preserve unaffected graphics; image/path manipulation pending |
| 11 Pages | Navigation only; atomic organization commands pending |
| 12 Search | Run search and literal replacement, case/whole-word flags, current/all-page scope, selected runs, validated real-PDF preview, one undo step; cross-run/hidden-text/regex matching pending |
| 13 Review | Preserve supported existing annotations; creation and threaded review pending |
| 14 Forms | Preserve existing widgets; editing/creation/flattening pending |
| 15 Signatures | Signature-field warning; appearances and certificate workflows pending |
| 16 Redaction | Pending a dedicated sanitizing rewrite and independent recovery tests. Region replacement is not redaction |
| 17 Saving | Validated export/download/reopen; local drafts, named versions and export profiles pending |
| 18 Accessibility | Accessible UI basics; document tagging/remediation pending |
| 19 Performance | Lazy thumbnails, subscriber-safe cancellation, 32 MB render / 12 MB inline-font tab caches, combined font responses, decoded-frame handoffs; pixel/upload/session budgets; tiled rendering/process isolation pending |
| 20 Architecture | Immutable source, validated transactions, font/OCR separation; generalized command/storage abstractions pending |
| 21 Privacy | Local processing or disclosed temporary hosted processing; request-isolated hosted fonts, no saved cloud document store; providers receive no document data |
| 22 Collaboration | Pending reliable local command/storage model, authentication and conflict semantics |
| 23 Advanced tools | Comparison, tables, navigation editing, batch and conversions pending |
| 24 AI | No AI integration; core editor independent of external AI |
| 25 Interaction details | Dirty state, fonts, validation, filenames, direct input and IME lifecycle acceptance tests; history bounded to 100 states; remaining fine-grained text operations pending |
| 26 Testing | 74 backend tests, 5 launcher tests, 5 request-cache tests; 27 local and 14 hosted browser workflows including delayed-frame, blur/resume, IME/undo, rapid-selection, retry and cache regressions; independent PDF.js extraction/render and private local pixel benchmark; full plan corpus remains incomplete |
| 27 Measurements | Pixel comparisons and geometry checks in engine tests; reproducible interaction measurements emitted by `e2e/inline.spec.ts` into ignored `test-results/` |
| 28–30 Phases and delivery | Expand acceptance coverage before broadening engine scope; this ledger records unfinished requirements |

## Prioritized remaining work

1. Phase 2: mixed-style selection, paragraph inference and explicit region reflow;
   shared-object/clipping fixtures and precise fidelity reporting.
2. Phase 3: recoverable page/object commands, cross-run replacements, review/forms,
   signature appearances, metadata/navigation and export settings.
3. Phase 4: searchable OCR, verified sanitization, comparison, accessibility,
   certificate signatures, batch/optimization.
4. Phase 5: authenticated shared storage, semantic conflicts/review, integrations
   and optional traceable AI services.
