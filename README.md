# drmbt.com

Portfolio of Vincent Naples (drmbt) — generative media, interactive
installation, projection, AI-driven art.

The site is built from the CV: `data/cv.json` lists every work with its
link scattered across the internet (Google Photos, Vimeo, Bandcamp,
Instagram, live apps…). Each item either becomes a full **case study**
(a folder of markdown + media under `projects/`) or a **direct-link card**
with a thumbnail. A collapsible left sidebar renders the whole CV as a
scrolling list; the main grid shows the works MarsNET-style.

## Quick start

```sh
npm install
npm run dev          # http://localhost:4174 — includes the case-study wizard
npm run build:cases  # regenerate case pages + projects/index.json
```

## Adding a case study (no-code)

Run `npm run dev`, open any case page, hit **EDIT CASE** (or create new):
drag in media, assign roles (hero / poster / thumbnail / carousel), fill
title/date/tags/credits, submit. The wizard writes
`projects/<slug>/<slug>.md` and rebuilds.

Or by hand: create `projects/<slug>/<slug>.md` (frontmatter + markdown),
drop media into `projects/<slug>/assets/{video,image,poster,audio}/`, and
run `npm run build:cases`.

## Media

Images are committed. Video/audio are gitignored and synced to Cloudflare
R2 (`npm run media:push`), referenced through committed `media.json`
manifests so fresh clones and CI builds still resolve them. The site
deploys on Cloudflare Pages; R2 setup steps live in `.env.example`.

See EXECUTION-PLAN.md for the full backlog of CV items to bring online.
