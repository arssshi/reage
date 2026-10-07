# Reage SEO and publishing guide

Reage's public pages are pre-rendered at build time. GitHub Pages serves the
HTML, metadata, structured data, sitemap, robots file, and the static guide
pages without waiting for JavaScript. The editor hydrates over that shell when
the browser loads the app bundle.

## GitHub Pages architecture

GitHub Pages is a static host and cannot run FastAPI, PyMuPDF, or the PDF
processing API. The Pages workflow therefore hosts the public website and
frontend at:

```text
https://arssshi.github.io/reage/
```

The `VITE_API_ORIGIN` workflow variable points the interactive editor at the
stateless API. It defaults to the existing hosted API at
`https://reage0.vercel.app`; set the repository variable `REAGE_API_ORIGIN`
when the API moves to another service. The API must allow the Pages origin with
`REAGE_ALLOWED_ORIGINS=https://arssshi.github.io`.

This split is required by GitHub Pages. Moving the PDF engine itself requires a
separate Python-capable host; it cannot be replaced by a static Pages setting.

## Included SEO work

- Build-time HTML for the home page and focused pages for PDF editing, online
  editing, font recovery, OCR, page organization, the guide, about, privacy,
  and press information.
- One descriptive H1 per page, unique titles and descriptions, canonical URLs,
  Open Graph/Twitter metadata, image alt text, stable image dimensions, and a
  human-readable author section.
- `sitemap.xml`, `robots.txt`, `humans.txt`, a useful Pages `404.html`, and
  breadcrumb, Organization, WebApplication, WebPage, and FAQ structured data.
- Internal links in every page header/footer and contextual links between the
  feature pages, so public pages are not orphaned.
- WebP social-card assets with PNG fallbacks, a small static SEO stylesheet,
  reduced layout shift, and no third-party analytics or blocking fonts.

Verify the generated public output locally with:

```bash
npm run build
npm run test:seo
```

## Search Console submission

Search Console access is tied to the site owner and cannot be completed by the
repository build alone:

1. Enable **Settings → Pages → Source: GitHub Actions** in the repository.
2. Run the `Deploy Reage to GitHub Pages` workflow and confirm the Pages URL.
3. In Google Search Console, add the URL-prefix property
   `https://arssshi.github.io/reage/`.
4. Verify ownership using the available GitHub/HTML-tag method.
5. Submit `https://arssshi.github.io/reage/sitemap.xml`.
6. Use URL Inspection for the home page and the focused pages, then request
   indexing after the deployment is publicly reachable.

Google controls crawl and indexing timing. No implementation can honestly
guarantee first-page rankings or indexing within a few days.

## Backlinks and editorial outreach

A backlink from Forbes or any other publication must be earned or arranged by
the site owner and publisher; it cannot be created safely in code. The public
`/press/` page now provides concise product facts, the project story, source
links, and approved asset links for journalist or community outreach. Do not
buy links, impersonate a publication, or publish invented endorsements.
