# Contributing to Reage

The goal is faithful, understandable PDF editing: preserve what the user
didn't change, and explain what cannot yet be preserved.

## Getting started

Follow the setup in [README.md](README.md), then see the
[development and testing guide](docs/GUIDE.md). Install
`requirements-dev.txt` for Python checks. TypeScript uses strict mode.

Before submitting a change, run:

```bash
python -m pytest -q
npm run build
npm run test:startup
npm run test:cache
npm run test:e2e
```

Use your virtual environment's Python. Browser tests start both services;
Playwright's Chromium installation and its OS libraries are required.

## Editing-engine principles

- Keep the original PDF immutable and edits transactional.
- Preview and export must share the exact same transformation.
- Never silently replace an unavailable font or insert missing glyphs.
- Test rendered output as well as extracted text. A successful export can
  still have blank glyphs, shifted baselines, or damaged background art.
- Preserve images, vector drawings, links, annotations, and untouched pages.
- Add generated regression fixtures for actual PDF failure modes rather than
  committing private customer PDFs.
- Serialize MuPDF access. Moving to parallel processing requires isolated
  worker processes and an appropriate document-storage design.
- Update the source-download allowlist if you introduce new source directories.

## High-impact next steps

1. A larger real-world PDF corpus, font-encoding diagnostics, and visual diffs.
2. Content-stream-aware replacement that retains tracking, clipping, and z-order.
3. Broader mixed-script shaping fixtures and native rotated-text transforms.
4. Multirun paragraph editing and explicit reflow controls.
5. Better OCR layout reconstruction and textured-background inpainting.
6. Persistent local project files and recovery of unsaved sessions.
7. Native desktop packaging and a simpler first-run installer.

Please explain the supported PDF cases and remaining limits in each change.
Contributions are made under the project's AGPL-3.0-or-later license.
