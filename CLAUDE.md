# drmbt-website

Vincent Naples' portfolio: a CV-driven case-study site. Zero-build static
hosting — generated artifacts are committed. Engine ported from
vvex-website (which ported it from MarsNET); homepage look follows MarsNET
with a collapsible CV sidebar.

## Commands

- `npm run dev` — dev server + case editor wizard on http://localhost:4174
- `npm run build:cases` — regenerate `projects/*/index.html` + `projects/index.json`
- `npm run media:push|clean|pull` — R2 sync for gitignored video/audio (needs `.env`)
- `npm start` — plain static serve (production-like, no editor)

## Rules

- `data/cv.json` is the single source of truth for CV items, links, and
  work status. Update it whenever an item's state changes.
- Never hand-edit generated files: `projects/*/index.html`,
  `projects/index.json`, `projects/*/media.json`.
- Case studies: `projects/<slug>/<slug>.md` + convention-named media in
  `assets/{video,image,poster,audio}/`. Slugs must match `data/cv.json`.
- CSS variable names in `css/style.css` (`--bg`, `--line`, `--text`,
  `--text-dim`, `--accent`, `--mono`, `--pad`) are consumed by
  `case-study/style.css` — don't rename them.
- Images/posters are committed; video/audio are gitignored and live in R2.
  Local video/audio may be symlinks into Vincent's Google Drive mount —
  never run `media:clean` or delete/modify symlink targets.
- Deploys via Cloudflare Pages (build `npm run build:cases`, output `/`);
  media bucket is Cloudflare R2 (`.env.example` has setup steps).
- Work items and SOPs live in EXECUTION-PLAN.md — follow it for new case
  studies or direct-link thumbnails.
- Don't push to main without explicit confirmation from Vincent.
