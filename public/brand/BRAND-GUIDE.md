# reage — Warm character

**Edit the page. Keep its character.**

## The idea

A precise workspace with a human touch. Warm orange gives the identity its
energy; cream and apricot give documents room to breathe. A handwritten accent
adds personality to the homepage and brand expressions.

The name is **reage**. The mark is a lowercase **r.**: a softly rounded letter
and circular dot, with orange, amber and apricot flowing inside the silhouette.
The logo's background is transparent, including the space between letter and dot.

## Palette

| Color | Value | Role |
| --- | --- | --- |
| Ember | `#BD5139` | Primary buttons, selected tools, handwritten headlines |
| Tangerine | `#EF853F` | Fluid logo body, larger decorative accents |
| Amber | `#FFC486` | Fluid highlights, hand-drawn strokes |
| Apricot | `#FFE8D6` | Welcoming panels and primary icon backgrounds |
| Cream | `#FFFAF5` | Main website surface |
| White | `#FFFFFF` | Document surroundings, controls, cards |
| Espresso | `#382A23` | Wordmark and primary copy |
| Canvas | `#F5EEE7` | Quiet PDF workspace |
| Rose | `#F8E6E1` | Font and creative-tool accents |
| Sage | `#E8F0EA` | Complementary scan/recovery accents |
| Supporting ink | `#7B6A60` | Secondary text |
| Warm line | `#EDE1D6` | Borders and separators |

Orange leads. Sage and rose stay small and complementary. Use ember with white
for primary actions; use espresso on pale surfaces. Amber and tangerine are
decorative colors, not small body text on white. Semantic success, warning and
error colors are separate entries in `tokens.json`.

## Typography

- **Caveat**, weights 400–500: the cursive homepage headline, handwritten notes,
  brand signatures and expressive social copy. Keep phrases short and generous.
- **Manrope**, weights 550–750: structured headings and the outlined wordmark.
- **DM Sans**, weights 400–600: body copy, navigation, controls, numbers and labels.

Use handwriting to add a personal touch, while keeping controls and long-form
reading in the clear interface typeface. All three fonts are bundled locally.
The supplied WOFF2s retain the SIL Open Font License in `font-licenses.txt`.
UI type never changes the font program or colors in an uploaded PDF.

## Logo use

- Primary: fluid orange mark and espresso wordmark on light backgrounds.
- Inverse: light apricot mark and cream wordmark on espresso backgrounds.
- Monochrome: solid ember mark for single-color uses.
- Preserve the lowercase r, circular dot, proportions and original fluid shape.
- Leave at least one quarter of the symbol's width as clear space.
- Use at least 24 px in normal UI. Prefer SVG for small or arbitrarily large uses.
- Never place an opaque tile behind a transparent logo export.
- Do not stretch the mark or use a small PNG for large print output.

## Included assets

| Asset | Format / size |
| --- | --- |
| `reage-mark.svg` | Transparent orange vector master |
| `reage-mark-inverse.svg` | Transparent light-apricot vector master |
| `reage-mark-mono.svg` | Transparent single-ink ember vector |
| `reage-logo.svg`, `reage-logo-inverse.svg` | Outlined horizontal lockups |
| `reage-wordmark.svg` | Outlined espresso wordmark |
| `reage-mark-4k.png`, `reage-mark-inverse-4k.png` | 4096 × 4096 transparent PNG |
| `reage-mark.png` | 1024 × 1024 transparent PNG |
| `reage-app-icon-512.png`, `reage-avatar-inverse.png` | 512 × 512 transparent icons |
| `reage-mark-mono.png` | 512 × 512 transparent monochrome icon |
| `reage-logo.png`, `reage-logo-inverse.png` | 2160 × 640 transparent lockups |
| `reage-wordmark.png` | 1584 × 528 transparent wordmark |
| `reage-social-card.svg`, `.png` | 1200 × 630 orange/cream social artwork |
| `reage-social-card@2x.png` | 2400 × 1260 social artwork |
| `reage-brand-board.svg`, `.png` | 1600 × 1120 identity overview |
| `reage-brand-board@2x.png` | 3200 × 2240 identity overview |
| `reage-brand-board.pdf` | Vector print overview with embedded fonts |
| `reage-pattern.svg` | Transparent orange fluid contours |
| `manrope-latin-wght-normal.woff2` | Manrope variable webfont |
| `dm-sans-latin-wght-normal.woff2` | DM Sans variable webfont |
| `caveat-latin-wght-normal.woff2` | Caveat variable cursive webfont |
| `tokens.json`, `exports.json` | Palette/type tokens and raster export manifest |

The favicon uses the same orange vector mark. Presentation SVGs depend on the
listed font families; supplied PNGs and the print PDF render with the bundled
fonts. Logo lockups use outlined paths and do not require installed fonts.

## Interface principles

The homepage opens directly into a usable workspace. Give uploading one clear
primary action, offer safe sample files, and connect tool cards to real workflows.
Use light orange surfaces, readable labels and restrained movement. Keep PDF
content visually independent from interface decoration.

The editor has one tool row, labeled navigation, contextual properties and a
floating page/zoom dock. On phones, properties expand on demand. Focus mode
removes side panels without changing the document. Native fonts, substitute
fonts and reconstructed content are identified explicitly.

## Regeneration and licensing

Edit `scripts/brand-assets.mjs` for vector compositions, `tokens.json` for brand
colors, and `reage-wordmark.svg` for the outlined wordmark geometry. Run:

```bash
npm run brand:export
npm run build
```

The download is available from **Brand assets** in the homepage footer or at
`/api/brand-kit`. Artwork is part of the AGPL-3.0-or-later project. Font software
retains its SIL Open Font License; both notices are included in the kit.
