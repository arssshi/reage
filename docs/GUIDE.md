# Reage user and developer guide

[← Project overview](../README.md)

**Change the words. Keep the character.**

A local-first, open-source PDF text editor built with React, TypeScript,
FastAPI, and PyMuPDF. Open a PDF, select an existing text run, change its
content, and export a searchable PDF using the original font whenever that
font can be reused.

Reage v0.6 provides three editing paths: native PDF text, recovered text from
local OCR, and visual replacement regions. It includes font detection,
embedded-font recovery, a local font library, and open-font downloads.

The Document Studio update adds direct on-page typing, a redesigned workspace,
an orange-and-cream light interface, a keyboard command palette, transaction-based find/replace,
and an applied-edit fidelity report. See [IMPLEMENTATION.md](../IMPLEMENTATION.md)
for architecture and [CAPABILITIES.md](../CAPABILITIES.md) for supported features and the roadmap.

## Online and local editions

Use **https://reage0.vercel.app** to edit without installing anything. The online
workspace accepts PDFs up to **3 MB / 50 pages**. Each processing operation sends
the source PDF, recovery instructions and any added fonts to the hosted Python
service. The app discards request data after processing and does not maintain
a saved document store. Editing state lives in the current browser tab.
Fonts uploaded online are not shared between visitors or saved to a font cache.
OCR recognition runs in the browser; page rendering and edit processing use the server.

Vercel limits request/response sizes: Reage bounds combined PDF/font/recovery
requests to 4 MB and results to 4.3 MB, with up to eight extra fonts. Particularly
detailed PDFs or large font programs can reach these limits even below 3 MB input.
The local edition supports 30 MB / 300 pages and processes PDFs on your machine.
Instructions about installed fonts, persistent font caches and expiring server
sessions below describe **local mode**. Both editions require exporting before
closing or refreshing the browser; neither provides autosaved projects.

## Upgrading from an earlier version

Stop the old server with **Ctrl+C** before upgrading. In PowerShell:

```powershell
.\.venv\Scripts\python -m pip install -r requirements.txt
npm install
npm run dev
```

The new Python dependencies are fontTools, Pillow, and pymupdf-fonts. OCR uses
locally bundled Tesseract.js/WebAssembly: **no separate Tesseract executable
or system OCR installation is required**. For the single-process `run.py`
launcher, also run `npm run build` before restarting it. The development
launcher refuses to reuse an older backend, avoiding mismatched UI/API versions.

The interface now checks the backend version before making PDF/font/OCR
requests. If it finds a stale process, it displays both versions and restart
instructions. It checks again on window focus and offers **Check again**.

**If the page loads but editing, fonts, and OCR all fail:** check
`http://127.0.0.1:8000/api/health`. Its `version` must match the version in the
app footer. Rebuilding the frontend does not restart an already-running Python
process. Stop that process, restart the service, and reload the browser.

## What works

- Upload or drag and drop a PDF; an original two-page sample is included.
- Click original text to place a caret using available glyph geometry, select,
  type, and use Backspace directly on the page. IME composition pauses validation.
- On-page changes validate after a 500 ms typing pause. Enter finishes; export
  waits for pending text validation. Delayed responses cannot overwrite newer input.
- Locally load reusable browser fonts; wrap simple CFF/Base-14 programs in
  OpenType without changing outlines or advances. Unsupported browser fonts use
  a labeled live-draft fallback. Finish typing to see the authoritative PDF render.
- Edit font, size, color, fit, and content explicitly in the properties panel.
- Reuse embedded fonts and standard PDF fonts, preserving font size, RGB color,
  baseline, and opacity by default.
- Validate glyph availability, including conservative embedded-subset checks.
- Reconcile PDF resource names, PostScript names, and internal font-family names.
- Distinguish regular/bold family aliases, truncated face names, and duplicate
  subset names using renderer glyph IDs.
- Repair supported TrueType/OpenType Unicode maps using PDF glyph mappings.
- **Auto font recovery**: original → matching full local font → compatible or
  bundled substitute. Resolved fonts are displayed and pinned when applied.
- **Font Studio**: inspect PDF font diagnostics, search installed fonts, upload
  TTF/OTF files, or download open families from the Google Fonts repository.
- **Local OCR**: recognize image/outline pages, estimate font/size/color, review
  recognition confidence, and edit recovered lines. An image-only demo is included.
- **English + Hindi OCR**, with combined native-fragment coverage checks on hybrid pages.
- Localized image-pixel replacement preserves surrounding native text and artwork.
- Edit 90°, 180°, and 270° text runs; zoom directly to tiny text selections.
- **Replace region**: draw around an unrecognized area and replace its pixels
  with searchable text, even without OCR.
- HarfBuzz-backed shaping for complex scripts using MuPDF Story, with logical
  Unicode preserved through PDF ActualText. Arabic, Hindi, Bengali, and Thai
  have automated export regression tests.
- Explicitly choose a replacement font, change size/color, or delete text.
- Optional fit-to-original-width mode; otherwise the original size is retained.
- Detect page overflow and many collisions with neighboring text.
- Native text edits use text-only redaction: original text is removed, not hidden
  behind a rectangle. Images and vector graphics are retained on that path.
- Restore hyperlinks that MuPDF removes while replacing intersecting text.
- Actual PDF rendering for previews and export, using the same engine.
- Page thumbnails, zoom, text-boundary outlines, document search, undo/redo,
  the latest 100 history states, keyboard shortcuts, and a responsive properties panel.
- **Find and replace**: literal, case-sensitive/whole-word, current/all pages,
  selectable runs, glyph/collision checks and actual PDF previews before one
  atomic undoable application. Matches spanning multiple runs are not supported.
- **Commands** (Ctrl/⌘ K), a warm light interface, high-contrast preference
  support, and **Review edit fidelity** for applied fonts and reconstruction.
- Download an edited copy. Your original file is never overwritten.
- Locally bundled UI fonts and OCR runtime; no analytics or account. Public
  font/model assets are downloaded on demand and cached locally.
- AGPL-3.0-or-later, with a source download built into the Help dialog.

## Run locally

Requires **Node.js 22.13+** (or Node 24) and **Python 3.11+**.
Run the following from this project directory.

### Windows / PowerShell

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm install
npm run build
.\.venv\Scripts\python run.py
```

### macOS / Linux / WSL

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm install
npm run build
.venv/bin/python run.py
```

On Debian/Ubuntu, if creating a virtual environment reports that `ensurepip`
is unavailable, install the `python3-venv` package for your Python version.

The launcher opens **http://127.0.0.1:8000**. Use `--no-browser` to skip opening
a browser, or `--port 8001` to use another port. Press **Ctrl+C** to stop.
After the first build, only the final Python command is needed to start the app.

### Development with hot reload

After installing the Python and npm dependencies above, run **one command**:

```bash
npm run dev
```

This starts the Python PDF service, waits for it to become healthy, and then
starts Vite. It uses `.venv` automatically, supports Windows/PowerShell, and
prints setup instructions if Python or its dependencies are missing. An
existing Reage API of the same version on port 8000 is reused; an old Reage
version or another application's server is reported before the UI starts.

Open the **Local** URL printed in the terminal. It is normally
**http://127.0.0.1:5173**, but Vite can select **5174** or a later port if needed.
Those local ports are supported by the API. To choose a particular UI port:

```powershell
npm run dev -- --port 5174
```

Keep that terminal open. **Ctrl+C** stops the services the launcher started;
an existing API it reused is left running. Frontend edits hot-reload; restart
the command after changing Python code. API documentation is at
**http://127.0.0.1:8000/api/docs**.

Set `PYTHON` to a Python executable path if you use a different environment.
If API port 8000 is occupied by another application, set `REAGE_API_PORT`
before running the command; the launcher and Vite proxy use it together:

```powershell
$env:REAGE_API_PORT = "8001"
npm run dev
```

For independent terminals and Python hot reload, use these commands instead:

```bash
# Terminal 1 (use .venv\Scripts\python on Windows)
.venv/bin/python -m uvicorn server.app:app --reload --host 127.0.0.1 --port 8000

# Terminal 2: frontend only; requires the API above
npm run dev:ui
```

#### `ECONNREFUSED 127.0.0.1:8000` when opening a PDF

This means Vite is running but the Python PDF service is unavailable. Stop the
old Vite command with **Ctrl+C**, install the backend dependencies if needed,
then restart with the combined launcher. In Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm install
npm run dev
```

Use the newly printed Local URL rather than an older browser tab. The launcher
prints **PDF service ready** (or that it is reusing an existing Reage service)
before opening the frontend. `http://127.0.0.1:8000/api/health` should return
JSON containing `"status":"ok"`. A switch from UI port 5173 to 5174 is normal
and does not require editing the proxy configuration.

## Editing a document

1. Choose **Open PDF** or **Try a sample PDF**.
2. Click a text run on the page. A run has one font/size/color; a sentence can
   contain several runs if its formatting changes.
3. Type directly on the page. Input stays responsive while the service validates
   the edit. Press **Enter** to finish and display the actual PDF render. Native
   browser selection, word/line shortcuts and IME work within one text run.
4. For explicit typography changes, use **Text content** and the properties panel.
   **Auto** tries to preserve the original font first and
   shows the chosen font below the selector. Choose **Original** for strict
   original-font-only editing, or open **Font Studio** for more options.
5. Click **Apply changes** for properties-panel edits. Validation errors explain missing glyphs, collisions,
   shaping problems, or text that would leave the page.
6. Use **Fit to original width** if a longer replacement should shrink to fit.
7. Click **Export PDF** to download an edited copy.

From **Find text**, open **Find and replace** to preview selected replacements.
Use **Commands → Review edit fidelity** to audit applied font choices. Interface
colors and fonts never recolor or restyle the PDF itself. **Focus mode** hides
side panels; **Fit page** shows the complete page. On phones, expand **Text
properties** when you want to adjust formatting.

### When a font is missing

1. Keep the font selector on **Auto**. The resolver checks the embedded font,
   full matching fonts installed on this machine, metric-compatible cached
   alternatives, and bundled fonts with the required characters.
2. Open **Font Studio → PDF diagnosis** to distinguish missing font programs
   from embedded fonts and repaired character maps.
3. Use **Upload TTF / OTF** when you have the original font. Font Studio also
   lists system fonts on Windows, macOS, and Linux (including Windows fonts
   when running under WSL).
4. Use **Get open fonts** to fetch a free Google Fonts family. Useful alternatives
   include Carlito for Calibri, Caladea for Cambria, Arimo for Arial, Tinos for
   Times New Roman, and Cousine for Courier New. These are substitutes; a matching
   name or compatible metrics does not establish an identical font version.

The committed font/color preview is the actual PDF renderer; the active on-page
input is a browser draft and can differ in shaping or fit. Auto's resolved choice is
pinned into the edit, so adding another font later cannot silently change an
already-applied edit. Downloaded/uploaded fonts persist across local sessions.

### When there are no text fonts at all

This usually means the page contains an image or vector outlines, not a font
program. A font fetcher alone cannot recover that page's words.

1. Click **Scan text (OCR)**, choose the document language, and recognize the
   current page or all pages marked as needing OCR.
   English + Hindi is selected initially when the native text contains Devanagari.
2. Tesseract runs in a browser worker. Its worker and WASM files are served
   locally; the first use of a language downloads a public `tessdata_fast` model
   through the local API. Subsequent runs can use the cached model offline.
3. Select a recognized line. Review the text, recognition confidence, estimated
   font, text color, and **Replacement background** before applying changes.
4. For OCR misses, use **Replace region** and drag a rectangle around the area.
   Type new text, or leave it empty and apply to erase the selected area.

The visual font estimator compares Latin text against bundled serif/sans/mono
faces and styles. It is a best-fit estimate, **not identification of an original
font file from pixels**. For other supported scripts, a suitable Noto-family
font is offered. Existing editable native text is skipped to avoid duplicate
OCR selections. Repeated OCR does not stack duplicate regions.

**Recovery editing is localized.** OCR/region edits replace image pixels in the
selected rectangle, remove intersecting native text, fill the selected background,
and insert searchable replacement text. Surrounding native text, image resolution,
vectors, forms, and annotations are retained rather than flattening the page.
Supported links removed by the text-redaction operation are restored. Untouched
image-only words remain pixels; this is not a full searchable-OCR-layer conversion.

Background replacement currently uses an estimated or chosen **solid color**.
Text over photographs, gradients, or detailed art needs manual review; this
version does not reconstruct the hidden texture behind the letters.
Outline artwork is covered by that fill rather than removed from the underlying
vector stream; visual region replacement is not a security redaction tool.

### Local asset cache and network use

- Windows: `%LOCALAPPDATA%\Reage\cache`
- Linux: `$XDG_CACHE_HOME/reage`, or `~/.cache/reage`
- macOS: `~/.cache/reage`
- Override with the `REAGE_CACHE_DIR` environment variable.

Font downloads read public files from `github.com/google/fonts`; OCR models
come from `github.com/tesseract-ocr/tessdata_fast`. **PDFs and page images are
not sent to these providers.** Font downloads need internet access and may be
subject to GitHub's request limits. Font uploads and installed fonts work
offline. The font-cache ceiling is 300 MB; individual assets are limited to
30 MB. Delete cached font files only after exporting sessions that use them.

Changes live in this browser session. **Export before closing or refreshing.**
Server documents expire after two hours without API activity and are removed
when you explicitly close or replace a document. Restarting the service clears
its in-memory documents. Reopening an exported PDF starts a new editing session.

| Shortcut | Action |
| --- | --- |
| Ctrl / ⌘ O | Open PDF |
| Ctrl / ⌘ S | Export PDF |
| Ctrl / ⌘ F | Find text |
| Ctrl / ⌘ Z | Undo an applied edit outside text fields |
| Ctrl / ⌘ Shift Z | Redo |
| Ctrl / ⌘ Enter | Apply the current text edit |
| Escape | Deselect text |
| ? | Help and shortcuts |

## Website and deployment

The project website is [reage0.vercel.app](https://reage0.vercel.app). The checked-in
`vercel.json` builds Vite and routes `/api/*` to `api/index.py`, the stateless
FastAPI application in `server/cloud.py`. Python 3.12 and `requirements.txt`
provide the MuPDF engine. No database, object storage, secret key, or login is needed.

`src/cloud.ts` carries all document state with each request, so another serverless
instance or cold start can process the next operation. Font libraries are
request-scoped, uploaded font IDs are content-based, and OCR/region registration
is replayed deterministically. No server-side document lookup exists in online mode.
Public OCR model requests redirect to the Tesseract repository, avoiding function
payload limits without sharing document content. Source and brand downloads remain available.

`run.py` still serves the local interface and stateful API on loopback.
For local hosted-mode development, set `REAGE_HOSTED=1` and
`VITE_REAGE_MODE=hosted` before `npm run dev`. Use a free `REAGE_API_PORT` if a
local-mode server is already running. Frontend mode otherwise follows the hostname:
loopback uses local mode, public hostnames use hosted mode.

To verify a deployment using **only generated public samples**:

```bash
REAGE_TEST_URL=https://reage0.vercel.app REAGE_TEST_HOSTED=1 npm run test:e2e
```

For hosted-mode tests on localhost, omit `REAGE_TEST_URL` and set
`REAGE_TEST_HOSTED=1`; Playwright starts the stateless API and frontend together.
Never upload a private benchmark to a public test target.

## Why PDF fonts are hard

A PDF is a page-description format, not a word-processing document. It often
stores separately positioned glyphs, and may embed only the letters used in
that particular file. A font named `ABCDEF+SomeFont` may not contain a letter
you want to type—even when its internal character map claims otherwise.

Reage extracts reusable fonts and displays any selected substitute.
For subset fonts, only characters already observed with that font are treated
as verified. In strict **Original** mode, unavailable characters produce an
actionable error. **Auto** can use a full matching local font or a labeled
replacement when the embedded subset cannot render the new text.

For unembedded Base-14 fonts, the PDF engine uses its built-in standard face.
Unicode characters outside Latin-1 are handled by embedding that same face
when it contains the requested glyph. Other unembedded fonts are never
silently matched to lookalikes.

## Current boundaries

- **Selectable text runs at 0°, 90°, 180°, and 270°** are the supported native unit.
  There is no automatic paragraph reflow, multiline insertion, or rich-text
  formatting inside one run.
- Scans and text converted to vector outlines use OCR or visual region recovery,
  with the solid-background tradeoffs described above.
- Page-level rotation, arbitrary-angle text, vertical writing modes, invisible
  or outlined text, and optional-layer text are not directly reconstructed by
  the native path. Use OCR or region recovery
  where suitable. Skewed handwriting, low-resolution scans, unusual scripts,
  and severely damaged PDFs can still require manual correction.
- Complex-script replacement uses shaping, but line reconstruction and mixed
  bidirectional reading order vary between PDF producers and should be reviewed.
- Pending redactions must be resolved before native/OCR editing of that page.
- Custom kerning/tracking, text clipping masks, nonstandard character encodings,
  and unusual transforms are not fully reconstructed. Replacement uses normal
  font advances and is inserted above existing page artwork. Advanced blending,
  original CMYK/spot colors, tagged-PDF structure, and original content-stream
  reading order are not guaranteed to survive editing unchanged.
- Subset-font verification is deliberately conservative; it can reject a glyph
  that is present but not used in the source document.
- Collision detection covers extracted text, not every graphical object.
- Password-protected PDFs must be unlocked first. Existing digital signatures
  are invalidated by editing; detected signature fields trigger a notice.
- No page rearrangement, form editor, annotation authoring, signing, persistent
  project files, or collaborative editing yet.
- Limits: 30 MB per upload, 300 pages, 40,000 text runs, 1,000 edits per export,
  4,000-point page dimensions, and a 16-megapixel render ceiling. In-memory
  source storage is limited to 12 documents / 180 MB; decoded PDFs and font
  data require additional memory.

The service is designed for a single user's local machine. Document IDs are
unguessable session identifiers, not a multi-user authentication system.

## Architecture

```text
src/
  App.tsx                     Import, landing page, document lifecycle
  Editor.tsx                  Selection, draft, history, zoom, search, export
  api.ts                      Typed local-service requests
  components/PdfPreview.tsx   Lazy PDF rendering and selectable text geometry
  components/Welcome.tsx      Branded landing page and original product artwork
  components/BrandLogo.tsx    Shared application logo lockup
  components/Inspector.tsx    Text, typography, layout controls
  components/HelpDialog.tsx   Shortcuts, limitations, license, source download
  components/FontStudio.tsx   Font diagnostics, local library, uploads/downloads
  components/OcrDialog.tsx    Local OCR worker, language selection, progress
  styles.css                  Unified Warm character UI, layouts and tokens
  useTextSession.ts            Serialized validation, versioned drafts and history
public/brand/                 SVG/PNG artwork, webfonts, design tokens, brand guide
server/
  app.py                      Bounded local sessions, serialized engine access
  engine.py                   Font inspection, validation, replacement, export
  fonts.py                    Name matching, cmap repair, font library/resolution
  inline.py                   Local CFF/OpenType browser-font adapter
  recovery.py                 OCR geometry, visual estimates, localized pixel edits
  shaping.py                  HarfBuzz/Story layout and Unicode ActualText
  assets.py                   Bounded font/model downloads and local cache
  models.py                   Validated API payloads
  demo.py                     Original generated sample PDF
tests/                        PDF invariants and API integration tests
e2e/                          Browser workflow tests
run.py                        Single-process local launcher
scripts/dev.mjs               Cross-platform API + Vite development launcher
scripts/ocr-assets.ts         Bundles/serves local OCR worker and WASM assets
scripts/export-brand.mjs      Exports raster artwork and bundled brand webfonts
scripts/brand-assets.mjs       Source geometry for the transparent fluid r. identity
scripts/verify-benchmark.py    Pixel comparisons of real browser-exported PDFs
```

The source PDF is immutable. The client stores edit snapshots; the backend
validates the entire requested transaction, opens a fresh copy, applies
text-only redactions, restores affected links, and inserts the replacements.
Preview and export call the same transformation. Undo returns to a prior
snapshot, so repeated edits do not accumulate PDF modifications.

PyMuPDF calls are guarded by a single lock because the library is not safe for
concurrent use. This first version favors consistent output over parallel
render throughput. CPU-heavy work runs outside the API event loop.

## Verification

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
npm run test:startup
npm run build
npx playwright install chromium
npm run test:e2e
```

On Windows, use `.venv\Scripts\python` for the Python commands. Playwright
automatically starts the API and Vite. Set `PYTHON` if your environment uses a
different Python executable. Linux browser dependencies can be installed with
`npx playwright install-deps chromium`.

Tests check searchable exported text; original text removal; font, size, color,
and baseline preservation; untouched-page and background pixels; image and
hyperlink preservation; subset-font handling; explicit fitting; invalid input;
font-name mismatch recovery; cmap repair; full-font completion; complex-script
Unicode extraction; OCR-region registration and local pixel replacement; API lifecycle;
browser undo/redo, search, export/reimport, and mobile editing. Browser tests
also run real Tesseract OCR on the image-only demo and reimport its edited PDF.
That test requires the English model to be cached or internet access for its
first download.

The on-page tests cover selected-text replacement, Backspace, IME lifecycle,
delayed validation, immediate export and error recovery. PDF.js independently
extracts and renders the resulting copy. Bulk-replacement tests check preview,
fidelity reporting and single-step undo. The inline test writes interaction
measurements to ignored `test-results/`; compare runs on the same machine and
record whether service and font caches were warm.

To verify the actual running production app, including real public font downloads:

```powershell
$env:REAGE_TEST_URL = "http://127.0.0.1:8000"
$env:REAGE_TEST_DOWNLOADS = "1"
npm run test:e2e
```

These browser tests release their own PDF sessions after each test. The live-font
test is opt-in because it needs network access to the public font repository.

### Optional local regression fixture

Some acceptance tests depend on a private fixture at `demo/demo.pdf` and skip
when it is absent. The public suite uses generated documents; a fresh clone
does not need a personal PDF. `npm run test:benchmark` and
`scripts/verify-benchmark.py` are maintainer-only checks for that specific local
fixture, not a general-purpose test for arbitrary PDFs. Personal documents,
benchmark notes, and exported test artifacts are excluded from publication.

## Contributing and license

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidance and priorities.
Reage is licensed under **AGPL-3.0-or-later**, compatible with the open-source
PyMuPDF/MuPDF stack. See [LICENSE](../LICENSE) and [NOTICE.md](../NOTICE.md).
The Help dialog provides the license and an archive of this application's
source directly from your local service.

## Visual identity and branding assets

The **Warm character** identity uses ember orange, apricot, amber and cream,
with espresso copy and small sage/rose accents. Caveat adds cursive homepage
headlines and handwritten notes; Manrope and DM Sans keep controls clear.
All three fonts are bundled locally. The logo is a lowercase **r.** with an
orange/amber fluid fill. The logo,
favicon, and app-icon exports have a transparent background. The wordmark is
**reage**, and the secondary pattern uses flowing curves.

The homepage and editor share this system, including readable property controls,
keyboard-focus states, mobile layouts, dialogs, and reduced-motion behavior.
Tool cards open the file picker with the selected workflow ready. The homepage
paper illustration is original CSS artwork.

The complete kit is in [`public/brand/`](../public/brand/):

- Outlined SVG primary/inverse logo lockups, standalone wordmark, three mark variants.
- Transparent 4096 × 4096 marks, 2160 × 640 logo lockups, and 512-pixel app icons.
- A 1200 × 630 social card and 1600 × 1120 brand board, plus double-resolution PNGs.
- A print PDF brand board, fluid contour pattern, and variable Manrope/DM Sans/Caveat webfonts.
- `exports.json` records each raster file's native dimensions and transparency.
- [`tokens.json`](../public/brand/tokens.json) for colors, type, spacing, radii, and motion.
- [`BRAND-GUIDE.md`](../public/brand/BRAND-GUIDE.md) for usage, voice, logo rules, and exports.

Use **Brand assets** in the landing-page footer to download a ZIP, or open
`/api/brand-kit`. The ZIP includes the artwork, tokens, webfonts, and license files.
Logo SVGs use outlined text and are portable without installed fonts. For the
social card and brand board, use the supplied PNGs or PDF when the bundled fonts are not installed.

Edit `scripts/brand-assets.mjs` for the symbol and presentation artwork.
To regenerate vector/raster artwork and bundled webfonts:

```bash
npx playwright install chromium
npm run brand:export
npm run build
```

Run the export before the production build so Vite copies the latest public assets.
