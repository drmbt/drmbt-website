# EXECUTION PLAN — drmbt.com portfolio

Goal: turn every item in Vincent's CV into either a **full case study** or a
**direct external link with a thumbnail**, using the scaffold in this repo.
This document is the playbook for agent workers. Each work item below is
self-contained: pick one, follow the SOP for its type, update its `status`
in `data/cv.json`, done.

## How the site works (read once)

- `data/cv.json` — single source of truth. Every CV item lives here with a
  `slug`, `link`, `linkType`, `display` (`case-study` | `external` | `none`)
  and `status`. The homepage sidebar renders ALL items; the grid renders
  built case studies + external items.
- `projects/<slug>/<slug>.md` — a case study: YAML frontmatter + markdown
  overview. Media is discovered by convention:
  - `assets/video/hero.*` → hero video; other files in `video/` → other-videos grid
  - `assets/image/hero.*` → hero image; other files in `image/` → carousel
  - `assets/poster/*` → full-height poster rows
  - `assets/audio/*` → audio players
- `npm run build:cases` regenerates `projects/<slug>/index.html` +
  `projects/index.json`. **Never hand-edit generated files.**
- ALL case-study media (image/poster/video/audio) is gitignored and synced
  to R2 via `npm run media:push` (requires `.env`). Committed `media.json`
  manifests record what's remote; the deploy build regenerates pages with
  media.drmbt.com URLs, local dev uses local files. Never run `media:clean`.
- Image/poster filenames double as lightbox captions ("00010_don_t_fear_
  the_reaper.jpg" → "don't fear the reaper") — name files after the
  prompt/title of the work, keep the NNNNN_ prefix for ordering.
- `assets/thumbs/<slug>.jpg` — thumbnail for external-link cards (the grid
  falls back to a text placeholder if missing).
- Homepage grid card resolution order for a CV item: built case study wins;
  otherwise `display: "external"` + `link` → external card; otherwise
  sidebar-only.
- Sample reference: `projects/electric-nightmares/` (placeholder SVGs —
  itself a work item below).

## Work item types & SOPs

### TYPE A — direct-link thumbnail (small, ~10 min)

For items with `display: "external"`. The card links straight out; we only
need a good thumbnail.

1. Get a representative image:
   - **vimeo**: `https://vimeo.com/api/oembed.json?url=<video-url>` → `thumbnail_url` (request the largest variant).
   - **youtube**: `https://img.youtube.com/vi/<id>/maxresdefault.jpg`.
   - **bandcamp / medium / soundcloud / generic site**: fetch the page, use `og:image`.
   - **instagram**: og:image often blocked headlessly — screenshot via browser tools, or ask Vincent for a still.
   - **live web apps** (vercel maps, abyss.cards, luma, eden): full-viewport screenshot via browser tools, 1600×1600 or 1600×900 crop.
2. Save as `assets/thumbs/<slug>.jpg` (≤ 2560px long edge, quality ~80,
   ideally square-ish since cards are 1:1).
3. In `data/cv.json`: set the item's `status` to `"done"`.
4. Load the homepage locally and confirm the card shows the image.

### TYPE B — full case study (larger, needs media)

For items with `display: "case-study"`. Media source is the item's `link`
(mostly Google Photos albums — see "Media harvesting" below).

1. Gather media into `_inbox/<slug>/` (gitignored staging is fine; the
   folder is temporary).
2. Curate: pick 1 hero (strongest single asset; video beats image), 4–12
   carousel images, 0–4 posters (tall/portrait crops work best), any video
   loops, any audio.
3. Process images: max 2560px long edge, JPEG quality ~80. Keep filenames
   descriptive (`hero.jpg`, `install-wide.jpg`…) — non-hero video titles are
   derived from filenames (`some-clip.mp4` → "SOME CLIP").
4. Create the project:
   ```
   projects/<slug>/<slug>.md
   projects/<slug>/assets/image/hero.jpg      (or assets/video/hero.mp4)
   projects/<slug>/assets/image/*.jpg
   projects/<slug>/assets/poster/*.jpg        (optional)
   projects/<slug>/assets/video/*.mp4         (optional, R2-synced)
   projects/<slug>/assets/audio/*.mp3         (optional, R2-synced)
   ```
   Frontmatter template:
   ```yaml
   ---
   title: "SHADOW SELFIE 2026"
   date: "2026-03-01"          # real date if known, else YYYY-01-01 of the CV year
   client: "Mars Electronica"  # venue/context line from the CV
   hashtags: ["interactive", "ai", "installation"]   # reuse tags from data/cv.json
   roles:
     - role: "ARTIST"
       name: "VINCENT NAPLES"
   ---
   2–5 short markdown paragraphs: what it is, how it was made (tools from
   the CV stack), where it showed. Factual, first-person-adjacent, no
   marketing fluff. Link out to the original album/post at the end.
   ```
5. `npm run build:cases`, then verify the page at
   `localhost:4174/projects/<slug>/` — hero loads, carousel scrolls,
   lightbox opens, related projects render.
6. If the project has video/audio: `npm run media:push` (needs R2 creds),
   then confirm `media.json` was written.
7. In `data/cv.json`: set `status` to `"built"`. Confirm the sidebar item
   now links to the case study and the grid card appears.

Alternative no-code path: with `npm run dev` running, the EDIT CASE wizard
on any case page (or ＋ flow) accepts drag-and-drop media and writes the
`.md` for you.

### Album download checklist (for Vincent)

One-time batch: open each link, ⋮ → **Download all**, then unzip into the
listed folder (create it if needed — `_inbox/` is gitignored). Zips land in
~/Downloads; an agent can unzip and sort them afterwards.

- [ ] https://photos.app.goo.gl/Vukr7G8Fh3VWDLyc7 → `_inbox/shadow-selfie-2026/`
- [ ] https://photos.app.goo.gl/ExFLchMweDgXHFJ58 → `_inbox/latent-martians/`
- [ ] https://photos.app.goo.gl/uvqRcuCqkWFNkAKVA → `_inbox/proof-of-waste/`
- [ ] https://photos.app.goo.gl/EDchXjHgdsmrn81X6 → `_inbox/prosperity-sphere/`
- [ ] https://photos.app.goo.gl/yTXr7Tp54V94LyEA9 → `_inbox/pure-slop/` (video infomercial)
- [ ] https://photos.app.goo.gl/A13RsfsSPEnn1RNs5 → `_inbox/vincent-naples-solo-exhibition/`
- [ ] https://photos.google.com/share/AF1QipOqfAy3rYPZZGwUienSk4bWFhpUsuyQSqNKK--OaKd8Zk7UoJy-FoOHFFp8B3VQ9Q?key=VDZxZ3NHTmpaWHVTMEpTME5ERU12RkJvZzlGSW9B → `_inbox/pure-imagination/`
- [ ] https://photos.app.goo.gl/pvmrWjocYRna77Jk7 → `_inbox/electric-nightmares/`
- [ ] https://photos.app.goo.gl/A3uG2NbrfyHf4Ltd6 → `_inbox/lovestadt-latent-latex/` (shared album — split later)

Nice-to-have while you're at it (not Google Photos):
- [ ] TBILISI TIMEWALL stills (Instagram highlight can't be harvested) → `_inbox/tbilisi-timewall/`
- [ ] Any source files for Wave 3 items (latent-mirror, adjacent-cascade, on-slop slides…) → `_inbox/<slug>/`

### Local Drive assets & symlinks (preferred when available)

Much of the media already lives in Vincent's Google Drive, mounted at
`~/Library/CloudStorage/GoogleDrive-vincent@drmbt.com`. Don't copy originals:

- Symlink Drive folders into `_inbox/<slug>/` for curation.
- Video/audio: symlink files into `projects/<slug>/assets/video|audio/`;
  `media:push` follows symlinks and streams them to R2.
- **Do NOT run `media:clean`** in this workflow — leave the symlinks in
  place (Vincent's call; clean would only remove the link, but we keep the
  local wiring intact).
- Images still get processed copies (resized JPEGs are committed to git —
  a symlink would break the deployed site).
- If a Drive file is online-only (cloud icon), make it available offline
  before pushing, or the stream will be slow.

### Media harvesting (Google Photos reality check)

Google Photos share links can't be scraped with plain HTTP. Options, in
order of preference:

1. **Vincent bulk-downloads** each album (Photos → ⋮ → Download all) into
   `_inbox/<slug>/`. Fastest and highest fidelity. Batch this: one session
   downloading all 9 albums unblocks every TYPE B item.
2. **Browser automation** (claude-in-chrome / preview tools): open the share
   link, screenshot or download individual items. Workable for small albums.
3. If neither is possible, mark the item's `status` as `"blocked-media"`
   with a `notes` explanation and move on.

## Backlog

### Wave 0 — repo hygiene (do first)
| # | task | notes |
|---|------|-------|
| 0.1 | R2 setup (Vincent) | Create bucket + API token per `.env.example`; set the bucket's public URL (custom domain media.drmbt.com or r2.dev) in `media.config.json` baseUrl. Until then: images-only case studies. |
| 0.2 | Favicons | `assets/favicon.png` (32px) + `assets/apple-touch-icon.png` (180px) — generated case pages already reference them. |
| 0.3 | Cloudflare Pages (Vincent) | Connect the GitHub repo: build command `npm run build:cases`, output dir `/`, auto-deploy `main`. Then flip the dreamhost drmbt.com redirect (currently → linktree) to the Pages site. All linktree links are preserved in the sidebar via `data/cv.json` `links`, so the transition is seamless. |

### Wave 1 — TYPE A direct links (11 items, no media blockers)
| slug | source for thumb |
|------|------------------|
| eden-art-labs | screenshot app.eden.art |
| super-dope-mixtape | soundcloud og:image |
| texture-cache | screenshot drmbt.github.io/dinacon-bali-2025 |
| tbilisi-timewall | instagram highlight — screenshot or ask Vincent |
| now-thats-what-i-call-prompin-vol-1 | bandcamp og:image |
| textures-gan | vimeo oembed |
| bombay-beach-network-map | screenshot vercel app |
| bombay-beach-biennale-schedule-map | screenshot vercel app |
| temple-abyss | screenshot abyss.cards |
| mixture-of-experts-attention | img.youtube.com/vi/jLuILDGydZg/maxresdefault.jpg |
| intermediate-td-practices | screenshot luma.com/drmbt |
| art-of-mancy-talk + the-art-of-mancy | medium og:image (same article, two CV items) |

### Wave 2 — TYPE B case studies (9 items, need album downloads)
| slug | album | notes |
|------|-------|-------|
| electric-nightmares | photos.app.goo.gl/pvmrWjocYRna77Jk7 | replace placeholder SVGs in existing sample project |
| shadow-selfie-2026 | photos.app.goo.gl/Vukr7G8Fh3VWDLyc7 | flagship interactive piece — strong hero video if available |
| latent-martians | photos.app.goo.gl/ExFLchMweDgXHFJ58 | video-led |
| proof-of-waste | photos.app.goo.gl/uvqRcuCqkWFNkAKVA | |
| prosperity-sphere | photos.app.goo.gl/EDchXjHgdsmrn81X6 | film short — hero video |
| pure-slop | bandcamp + photos.app.goo.gl/yTXr7Tp54V94LyEA9 | audio players from album + infomercial video |
| vincent-naples-solo-exhibition | photos.app.goo.gl/A13RsfsSPEnn1RNs5 | |
| pure-imagination | photos.google.com/share/AF1Qip… (key in cv.json) | |
| lovestadt | photos.app.goo.gl/A3uG2NbrfyHf4Ltd6 | album shared with latent-latex — split assets sensibly |
| latent-latex | same album as lovestadt | video loops → this; stills → lovestadt. Confirm with Vincent. |

### Wave 3 — items with no assets yet (ask Vincent, then TYPE A or B)
new-inc-exhibition-td, adjacent-cascade, latent-mirror, prompin-studio,
cur-ai-tor, nyc-resistor-interactive-show (can cross-link shadow-selfie),
on-slop, outer-membrane-zine. Each has `status: "needs-assets"` in cv.json.

### Wave 4 — polish (after content lands)
- About page (bio + stack/skills from cv.json tail)
- OG/social meta per case page; sitemap
- Optional: Fuse.js fuzzy search (current search is substring), list view
  toggle like MarsNET, print-friendly CV page at /cv

## Status lifecycle in data/cv.json

`todo` → `in-progress` → `built` (case study live)
`needs-thumb` → `done` (external card has real thumbnail)
`needs-assets` / `blocked-media` → waiting on Vincent

## QA checklist per item (before marking done/built)

- [ ] `npm run build:cases` runs clean, no `missing media` warnings
- [ ] Homepage card renders (image, hover overlay, correct link target)
- [ ] Sidebar entry links to the right place
- [ ] Case page: hero + carousel + lightbox work; no console errors
- [ ] All images ≤ 2560px, JPEG; no file > ~1.5 MB committed
- [ ] `data/cv.json` status updated
