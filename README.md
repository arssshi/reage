<p align="center">
  <img src="public/brand/reage-social-card.png" alt="Reage — Your PDFs. A little more you." width="960">
</p>

<h1 align="center">Reage</h1>
<p align="center"><strong>A free, privacy-first, open-source alternative to Adobe Acrobat.</strong></p>
<p align="center">Edit the words. Keep the character. Keep your documents on your machine.</p>

<p align="center">
  <a href="https://reage0.vercel.app">Website · deployment pending</a> ·
  <a href="#run-locally">Get started</a> ·
  <a href="docs/GUIDE.md">Guide</a> ·
  <a href="CAPABILITIES.md">Capabilities</a> ·
  <a href="https://github.com/arssshi/reage/issues">Feedback</a>
</p>

## A little less friction. A lot more yours.

Reage is a local PDF editor for the moments when you need to fix a sentence,
recover a font, or edit a scanned line—without a subscription or an account.
Click text, type on the page, and export a searchable copy. Your original stays intact.

| What you can do | What makes it useful |
| --- | --- |
| **Edit directly on the page** | Native text selection, typing, undo/redo, and font, size, and color controls. |
| **Keep the original character** | Reuse supported embedded fonts; inspect and choose clearly labeled alternatives. |
| **Recover scanned text** | Local OCR, including English + Hindi, with reviewable text and region replacement. |
| **Find and replace** | Preview validated changes across selected text runs, then apply them in one undoable step. |
| **Check before exporting** | PDF-engine previews, font diagnostics, and an applied-edit fidelity report. |
| **Work comfortably** | A warm orange workspace, keyboard commands, focus mode, and responsive layouts. |

**Current focus:** precise text editing. Reage is early-stage; paragraph reflow,
page organization, form editing, and digital signing are still on the roadmap.
OCR estimates typography and uses solid-color backgrounds; visual region
replacement is not secure redaction. See the [full capability matrix](CAPABILITIES.md).

## Your PDFs stay yours

- **Local processing.** The browser talks to a Python service on your own machine.
  PDF editing and OCR stay local, with no accounts, analytics, or cloud document storage.
- **Transparent network use.** Optional public font downloads and first-use OCR
  language downloads need internet. They send no document content and are cached locally.
- **You control the files.** Export an edited copy whenever you like. Sessions are
  temporary—export before closing or restarting; inactive documents expire after two hours.

**Free to use, study, modify, and share under [AGPL-3.0-or-later](LICENSE).**
The published source stays available under that license, so you can keep running
your own copy independently of a hosted service.

## Run locally

Requires **Node.js 22.13+** and **Python 3.11+**. Clone the project first:

```bash
git clone https://github.com/arssshi/reage.git
cd reage
```

<details open>
<summary><strong>macOS / Linux / WSL</strong></summary>

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci
npm run build
.venv/bin/python run.py
```

</details>

<details>
<summary><strong>Windows / PowerShell</strong></summary>

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm ci
npm run build
.\.venv\Scripts\python run.py
```

</details>

Open **http://127.0.0.1:8000** → try a sample or open a PDF → click text → edit → **Export PDF**.
After setup, only the final Python command is needed to launch again.

The intended website is **[reage0.vercel.app](https://reage0.vercel.app)**; its
deployment is pending. The working editor currently uses the local setup above
and requires the Python service. [Setup, troubleshooting, and deployment details →](docs/GUIDE.md)

## Built in the open

**React + TypeScript · FastAPI · PyMuPDF/MuPDF · fontTools · Tesseract.js**

After installing dependencies, `npm run dev` starts both services with frontend
hot reload. Contributions, reproducible bug reports, and thoughtful ideas are welcome.

[Contributing](CONTRIBUTING.md) · [Architecture](IMPLEMENTATION.md) ·
[Testing guide](docs/GUIDE.md#verification) · [Brand kit](public/brand/BRAND-GUIDE.md) ·
[Third-party notices](NOTICE.md)

## A special thank you to Omnirush 🧡

**[Omnirush](https://omnirush.ai/)** made this project possible by providing access
to frontier models that helped bring Reage from an idea to a working editor.
That access made a real difference throughout development. A heartfelt thank you
to the people behind Omnirush for helping independent builders create more.

**Explore [omnirush.ai](https://omnirush.ai/).**

---

<p align="center"><strong>Your PDFs. A little more you.</strong><br>Open source. Local first. Made for your words.</p>
