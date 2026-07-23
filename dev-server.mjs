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
const isSyncedPath = rel => rel.startsWith('assets/video/') || rel.startsWith('assets/audio/');

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

  let thumbRel = '';
  let existingThumbFlag = existing_thumb || '';
  let explicitThumbFlag = body.explicit_thumb || '';

  // place a file, uniquifying unless it claims a reserved name (hero/thumb)
  const placeFile = (fromPath, targetDir, finalName) => {
    const ext = path.extname(finalName).toLowerCase();
    let target = path.join(targetDir, finalName);
    if (target !== fromPath) {
      const reserved = ['hero', 'thumb'].some(p => finalName.startsWith(p));
      if (reserved && fs.existsSync(target)) {
        fs.unlinkSync(target);
      } else {
        let counter = 1;
        while (fs.existsSync(target)) {
          target = path.join(targetDir, `${path.basename(finalName, ext)}_${counter}${ext}`);
          counter++;
        }
      }
      fs.renameSync(fromPath, target);
    }
    return target;
  };
  const relOf = abs => path.relative(projectDir, abs).split(path.sep).join('/');

  // --- apply edits to existing media (removals + role changes) ---
  if (project_id && body.existing_media) {
    const edits = JSON.parse(body.existing_media);
    const existing = [];
    for (const kind of ['video', 'image', 'poster', 'audio']) {
      for (const f of fs.readdirSync(dirs[kind]).filter(f => !f.startsWith('.'))) {
        existing.push({ name: f, abs: path.join(dirs[kind], f), kind });
      }
    }
    for (const f of fs.readdirSync(projectDir).filter(f => !fs.statSync(path.join(projectDir, f)).isDirectory())) {
      if (f.toLowerCase().startsWith('thumb') && !/\.(md|json|html)$/.test(f)) {
        existing.push({ name: f, abs: path.join(projectDir, f), kind: 'root' });
      }
    }

    for (const file of existing) {
      const rel = relOf(file.abs);
      const match = edits.find(e => e.path === rel);
      if (!match) {
        fs.unlinkSync(file.abs);
        if (isSyncedPath(rel)) editManifest(projectDir, list => {
          const idx = list.findIndex(e => e.path === rel);
          if (idx >= 0) list.splice(idx, 1);
        });
        if (file.kind === 'root' && existingThumbFlag === rel) existingThumbFlag = '';
        continue;
      }
      if (match.targetRole && match.targetRole !== match.role) {
        const ext = path.extname(file.name).toLowerCase();
        const isVideo = VIDEO_EXT.includes(ext);
        const isAudio = AUDIO_EXT.includes(ext);
        let targetDir = isVideo ? dirs.video : isAudio ? dirs.audio : dirs.image;
        let finalName = file.name;

        if (match.targetRole === 'hero') {
          finalName = `hero${ext}`;
        } else if (match.role === 'hero' || match.role === 'thumbnail') {
          finalName = `media${ext}`;
          if (match.role === 'thumbnail' && existingThumbFlag === rel) existingThumbFlag = '';
        }
        if (match.targetRole === 'poster') targetDir = dirs.poster;
        else if (match.targetRole === 'audio') targetDir = dirs.audio;
        else if (match.targetRole === 'thumbnail') {
          targetDir = projectDir;
          finalName = `thumb${ext}`;
        }

        const placed = placeFile(file.abs, targetDir, finalName);
        const newRel = relOf(placed);
        if (match.targetRole === 'thumbnail') existingThumbFlag = newRel;
        if (explicitThumbFlag === rel) explicitThumbFlag = newRel;
        if (isSyncedPath(rel) || isSyncedPath(newRel)) editManifest(projectDir, list => {
          const idx = list.findIndex(e => e.path === rel);
          if (idx >= 0) list.splice(idx, 1);
          if (isSyncedPath(newRel)) list.push({ path: newRel, size: fs.statSync(placed).size });
        });
      }
    }
  }

  // --- place newly uploaded files by elected role ---
  for (const file of files || []) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isVideo = VIDEO_EXT.includes(ext);
    const isAudio = AUDIO_EXT.includes(ext);
    let targetDir = isVideo ? dirs.video : isAudio ? dirs.audio : dirs.image;
    let finalName = file.originalname;

    const role = body[`file_role_${file.originalname}`];
    if (role === 'hero') finalName = `hero${ext}`;
    else if (role === 'poster') targetDir = dirs.poster;
    else if (role === 'audio') targetDir = dirs.audio;
    else if (role === 'thumbnail') {
      targetDir = projectDir;
      finalName = `thumb${ext}`;
    }

    const placed = placeFile(file.path, targetDir, finalName);
    const newRel = relOf(placed);
    if (role === 'thumbnail') thumbRel = newRel;
    if (body.explicit_thumb_new === file.originalname) explicitThumbFlag = newRel;
    if (isSyncedPath(newRel)) editManifest(projectDir, list => {
      if (!list.some(e => e.path === newRel)) list.push({ path: newRel, size: fs.statSync(placed).size });
    });
  }

  // --- write the markdown source ---
  let md = `---\ntitle: "${title}"\ndate: "${date}"\nclient: "${client}"\n`;
  const thumb = explicitThumbFlag || thumbRel || existingThumbFlag;
  if (thumb) md += `thumb: "${thumb}"\n`;
  if (hashtags.length) {
    md += 'hashtags:\n';
    for (const tag of hashtags) md += `  - "${tag.replace(/"/g, '\\"')}"\n`;
  }
  if (credits.length) {
    md += 'roles:\n';
    for (const c of credits) md += `  - role: "${c.role.replace(/"/g, '\\"')}"\n    name: "${c.name.replace(/"/g, '\\"')}"\n`;
  }
  md += `---\n\n${description}\n`;
  fs.writeFileSync(path.join(projectDir, `${folder}.md`), md);

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
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store', // dev: always serve fresh js/css
  });
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
