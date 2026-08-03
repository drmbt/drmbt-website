// Local authoring server, ported from MarsNET's vite-plugin-project-creator
// but standalone (no Vite). Serves the static site plus the case-study wizard
// API, so `npm run dev` gives you the in-browser editor on case pages:
//
//   POST /api/create-project   create or update a case study (multipart:
//                              fields + media files, routed by elected role)
//   POST /api/delete-project   remove a case-study folder entirely
//   GET  /api/ping             lets case-study/app.js detect author mode
//
// Every mutation reruns build-projects.mjs, then the page reloads itself.
// The wizard edits LOCAL files only — media synced to R2 and cleaned locally
// won't appear in the editor until `npm run media:pull`.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { execFileSync } from 'child_process';
import matter from 'gray-matter';
import multer from 'multer';

const root = import.meta.dirname;
const projectsDir = path.join(root, 'projects');
const PORT = parseInt(process.argv[2] || process.env.PORT || '4174', 10);

const upload = multer({ dest: path.join(projectsDir, '.tmp') });

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.flf': 'text/plain', '.md': 'text/plain',
};

const VIDEO_EXT = ['.mp4', '.webm', '.ogg', '.mov'];
const AUDIO_EXT = ['.mp3', '.m4a', '.wav'];

const json = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const rebuild = () => execFileSync('node', [path.join(root, 'build-projects.mjs')], { stdio: 'inherit' });

/* ---------- media.json upkeep (renames/deletes must not resurrect from R2) */
function editManifest(projectDir, fn) {
  const p = path.join(projectDir, 'media.json');
  let manifest = { files: [] };
  try {
    const m = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (Array.isArray(m.files)) manifest = m;
  } catch { /* none yet */ }
  fn(manifest.files);
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  if (manifest.files.length) fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + '\n');
  else if (fs.existsSync(p)) fs.unlinkSync(p);
}
// every assets/ dir is R2-synced (see .gitignore + sync-media.mjs SYNC_DIRS)
const isSyncedPath = rel => /^assets\/(video|audio|image|poster)\//.test(rel);

// Media order is carried by a numeric filename prefix (build-projects.mjs sorts
// by path, the lightbox caption strips the prefix), so reordering in the editor
// means renumbering. Reserved hero/thumb names stay put — they're addressed by
// name, not position.
const ORDER_PREFIX = /^\d+[_-]/;
const seqName = (name, n) => `${String(n).padStart(5, '0')}_${name.replace(ORDER_PREFIX, '')}`;

// Walk preserved frontmatter and rewrite any asset path the reorder moved.
function remapPaths(value, renames) {
  if (typeof value === 'string') return renames.get(value) || value;
  if (Array.isArray(value)) return value.map(v => remapPaths(v, renames));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapPaths(v, renames)]));
  }
  return value;
}

/* ---------- create / update ---------- */
function createProject(body, files) {
  const {
    title, description, client = 'Project',
    date = new Date().toISOString().split('T')[0],
    hashtags_json, project_id, existing_thumb,
  } = body;

  let hashtags = [];
  try {
    if (hashtags_json) hashtags = JSON.parse(hashtags_json);
  } catch { /* ignore */ }

  const credits = [];
  let i = 0;
  while (body[`credit_role_${i}`] !== undefined) {
    if (body[`credit_role_${i}`].trim() || body[`credit_name_${i}`].trim()) {
      credits.push({ role: body[`credit_role_${i}`].trim(), name: body[`credit_name_${i}`].trim() });
    }
    i++;
  }

  const folder = project_id || (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!folder) throw new Error('Invalid title');
  const projectDir = path.join(projectsDir, folder);
  if (!projectDir.startsWith(projectsDir + path.sep)) throw new Error('Invalid project id');

  const dirs = {};
  for (const kind of ['video', 'image', 'poster', 'audio']) {
    dirs[kind] = path.join(projectDir, 'assets', kind);
    fs.mkdirSync(dirs[kind], { recursive: true });
  }

  const relOf = abs => path.relative(projectDir, abs).split(path.sep).join('/');
  const uploads = files || [];

  // The wizard sends one ordered plan covering every asset it knows about:
  //   { source: 'existing', path } | { source: 'new', index }   + role
  // List order IS the published order, so the plan drives placement, role and
  // sequence prefix in a single pass.
  let plan = [];
  try {
    if (body.media_plan) plan = JSON.parse(body.media_plan);
  } catch { /* treat as no plan */ }
  // a client that posts files without a plan still gets them filed, in upload order
  if (!plan.length && uploads.length) {
    plan = uploads.map((_, index) => ({ source: 'new', index, role: 'auto' }));
  }

  const existing = [];
  for (const kind of ['video', 'image', 'poster', 'audio']) {
    for (const f of fs.readdirSync(dirs[kind]).filter(f => !f.startsWith('.'))) {
      existing.push({ abs: path.join(dirs[kind], f), rel: relOf(path.join(dirs[kind], f)) });
    }
  }
  for (const f of fs.readdirSync(projectDir).filter(f => !fs.statSync(path.join(projectDir, f)).isDirectory())) {
    if (f.toLowerCase().startsWith('thumb') && !/\.(md|json|html)$/.test(f)) {
      existing.push({ abs: path.join(projectDir, f), rel: f });
    }
  }

  // --- removals: anything on disk the plan dropped ---
  const dropped = new Set();
  if (project_id && body.media_plan) {
    const kept = new Set(plan.filter(e => e.source === 'existing').map(e => e.path));
    for (const file of existing) {
      if (kept.has(file.rel)) continue;
      fs.unlinkSync(file.abs);
      dropped.add(file.rel);
    }
  }

  // --- resolve each plan entry to its final destination, in order ---
  const seq = { video: 0, image: 0, poster: 0, audio: 0 };
  const staged = []; // { from, finalAbs, oldRel }
  for (const entry of plan) {
    const from = entry.source === 'new'
      ? uploads[entry.index]?.path
      : existing.find(f => f.rel === entry.path)?.abs;
    const originalName = entry.source === 'new' ? uploads[entry.index]?.originalname : path.basename(entry.path);
    if (!from || !fs.existsSync(from)) continue;

    const ext = path.extname(originalName).toLowerCase();
    const kind = VIDEO_EXT.includes(ext) ? 'video' : AUDIO_EXT.includes(ext) ? 'audio' : 'image';
    let targetDir = dirs[kind];
    let finalName;
    if (entry.role === 'thumbnail') {
      targetDir = projectDir;
      finalName = `thumb${ext}`;
    } else if (entry.role === 'hero') {
      finalName = `hero${ext}`;
    } else {
      if (entry.role === 'poster') targetDir = dirs.poster;
      const bucket = entry.role === 'poster' ? 'poster' : kind;
      finalName = seqName(originalName, ++seq[bucket]);
    }
    staged.push({
      from, role: entry.role, thumb: !!entry.thumb,
      finalAbs: path.join(targetDir, finalName),
      oldRel: entry.source === 'existing' ? entry.path : null,
    });
  }

  // Two-phase move so a file can take a name another file is vacating.
  const parked = staged.map((s, i) => {
    const tmp = path.join(path.dirname(s.finalAbs), `.__ord_${i}${path.extname(s.finalAbs)}`);
    fs.renameSync(s.from, tmp);
    return { ...s, tmp };
  });
  const renames = new Map(); // oldRel -> newRel, for frontmatter fixups
  const placed = [];
  for (const s of parked) {
    if (fs.existsSync(s.finalAbs)) fs.unlinkSync(s.finalAbs); // stale leftover
    fs.renameSync(s.tmp, s.finalAbs);
    const newRel = relOf(s.finalAbs);
    if (s.oldRel && s.oldRel !== newRel) renames.set(s.oldRel, newRel);
    placed.push({ oldRel: s.oldRel, newRel, abs: s.finalAbs, role: s.role, thumb: s.thumb });
  }

  // --- manifest upkeep: drop what moved or vanished, record what landed ---
  editManifest(projectDir, list => {
    for (const rel of [...dropped, ...renames.keys()]) {
      const idx = list.findIndex(e => e.path === rel);
      if (idx >= 0) list.splice(idx, 1);
    }
    for (const p of placed) {
      if (!isSyncedPath(p.newRel)) continue;
      const size = fs.statSync(p.abs).size;
      const idx = list.findIndex(e => e.path === p.newRel);
      if (idx >= 0) list[idx] = { path: p.newRel, size };
      else list.push({ path: p.newRel, size });
    }
  });

  // --- write the markdown source ---
  const mdPath = path.join(projectDir, `${folder}.md`);
  // Frontmatter the wizard doesn't own (posterImages rows, hero overrides,
  // hidden…) survives an edit; its asset paths follow the reorder.
  let preserved = {};
  if (fs.existsSync(mdPath)) {
    try {
      preserved = { ...matter(fs.readFileSync(mdPath, 'utf-8')).data };
    } catch { /* unreadable frontmatter: start clean */ }
  }
  for (const key of ['title', 'date', 'client', 'thumb', 'hashtags', 'roles', 'credits', 'existingMedia']) {
    delete preserved[key];
  }
  preserved = remapPaths(preserved, renames);
  // an elected hero wins over a frontmatter override, else the drag is a no-op
  if (plan.some(e => e.role === 'hero')) delete preserved.hero;
  // explicit orderings get rebuilt from the new sequence, keeping poster rows
  const orderedRel = role => placed.filter(p => p.role === role).map(p => p.newRel);
  if (Array.isArray(preserved.posterImages)) {
    const posters = orderedRel('poster');
    const rows = [];
    let cursor = 0;
    for (const row of preserved.posterImages) {
      const width = Array.isArray(row) ? row.length : 1;
      const slice = posters.slice(cursor, cursor + width);
      cursor += width;
      if (slice.length) rows.push(Array.isArray(row) ? slice : slice[0]);
    }
    if (cursor < posters.length) rows.push(posters.slice(cursor));
    if (rows.length) preserved.posterImages = rows;
    else delete preserved.posterImages;
  }
  if (Array.isArray(preserved.carouselImages)) {
    preserved.carouselImages = [...orderedRel('auto'), ...orderedRel('poster')]
      .filter(p => p.startsWith('assets/image/') || p.startsWith('assets/poster/'));
  }

  const thumb = placed.find(p => p.thumb)?.newRel ||
    placed.find(p => p.role === 'thumbnail')?.newRel ||
    renames.get(existing_thumb || '') || existing_thumb || '';

  const data = { title, date, client };
  if (thumb) data.thumb = thumb;
  if (hashtags.length) data.hashtags = hashtags;
  if (credits.length) data.roles = credits;
  Object.assign(data, preserved);
  fs.writeFileSync(mdPath, matter.stringify(`\n${description}\n`, data));

  rebuild();
  return folder;
}

/* ---------- server ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/ping') return json(res, 200, { ok: true });

  if (url.pathname === '/api/create-project' && req.method === 'POST') {
    return upload.any()(req, res, err => {
      if (err) return json(res, 500, { success: false, error: err.message });
      try {
        const folder = createProject(req.body, req.files);
        json(res, 200, { success: true, folder });
      } catch (e) {
        console.error(e);
        json(res, 500, { success: false, error: e.message });
      }
    });
  }

  if (url.pathname === '/api/delete-project' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { project_id } = JSON.parse(body);
        if (!project_id) throw new Error('No project_id provided');
        const target = path.resolve(projectsDir, project_id);
        if (!target.startsWith(projectsDir + path.sep)) throw new Error('Invalid project_id');
        if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
        rebuild();
        json(res, 200, { success: true });
      } catch (e) {
        json(res, 500, { success: false, error: e.message });
      }
    });
    return;
  }

  // static files
  let filePath = path.join(root, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const size = fs.statSync(filePath).size;
  const headers = {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store', // dev: always serve fresh js/css
    'Accept-Ranges': 'bytes',
  };

  // Range support: without it <video> can't seek, so media fragments (#t=3)
  // never paint a frame and long clips stall — locally only, R2 serves ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? parseInt(range[1], 10) : size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  res.writeHead(200, { ...headers, 'Content-Length': size });
  fs.createReadStream(filePath).pipe(res);
});

// hand edits to the markdown sources also regenerate (debounced)
let watchTimer;
if (fs.existsSync(projectsDir)) {
  fs.watch(projectsDir, { recursive: true }, (event, filename) => {
    if (!filename || !filename.endsWith('.md')) return;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      try { rebuild(); } catch (e) { console.error(e.message); }
    }, 300);
  });
}

server.listen(PORT, () => {
  console.log(`drmbt dev server (with case-study editor) on http://localhost:${PORT}`);
});
