// Case-study generator, ported from MarsNET's vite-plugin-project-database.
// Each case study is a folder under projects/ holding <slug>.md (frontmatter +
// markdown overview) and discoverable media in assets/{video,image,poster,audio}.
// This script compiles every folder into a standalone projects/<slug>/index.html
// (metadata embedded as JSON, rendered client-side by case-study/app.js) and an
// aggregate projects/index.json. Like fonts.js/presets.json, the generated
// files are committed so the deployed site stays plain static hosting.
//
//   npm run build:cases
//
// Asset roles (by filename, mirroring MarsNET conventions):
//   assets/video/hero.*  -> hero video      assets/video/*  -> other videos
//   assets/image/hero.*  -> hero image      assets/image/*  -> carousel
//   assets/poster/*      -> poster rows     assets/audio/*  -> audio players
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';

const projectsDir = path.resolve(import.meta.dirname, 'projects');

// Video/audio are gitignored and synced to R2 (sync-media.mjs). Each project's
// committed media.json manifest records what exists remotely, so machines
// without the local files (Netlify builds, fresh clones) still generate
// working pages: local file wins, otherwise the public R2 url is used.
const mediaBaseUrl = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'media.config.json'), 'utf-8')).baseUrl || '';
  } catch {
    return '';
  }
})();

const listFiles = dir =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !f.startsWith('.')).sort() : [];
const titleFromFile = f => f.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').toUpperCase();

function readManifest(projectDir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(projectDir, 'media.json'), 'utf-8'));
    return Array.isArray(m.files) ? m : { files: [] };
  } catch {
    return { files: [] };
  }
}

// Union of local files and manifest entries for a synced dir ("video"/"audio").
// Returns [{ path, resolved }] where `resolved` is what the page should use.
function mergedMedia(projectDir, folder, kind, manifest, missing) {
  const local = listFiles(path.join(projectDir, 'assets', kind)).map(f => `assets/${kind}/${f}`);
  const fromManifest = manifest.files.map(e => e.path).filter(p => p.startsWith(`assets/${kind}/`));
  return [...new Set([...local, ...fromManifest])].sort().map(p => {
    if (fs.existsSync(path.join(projectDir, p))) return { path: p, resolved: p };
    if (!mediaBaseUrl) missing.push(p);
    return { path: p, resolved: mediaBaseUrl ? `${mediaBaseUrl}/projects/${folder}/${p}` : p };
  });
}

// Refresh the manifest with any local files (sizes included for sync/clean
// verification). Entries are never dropped here — sync-media.mjs owns removal.
function updateManifest(projectDir, manifest, merged) {
  const byPath = new Map(manifest.files.map(e => [e.path, e]));
  for (const { path: p } of merged) {
    const abs = path.join(projectDir, p);
    if (fs.existsSync(abs)) byPath.set(p, { path: p, size: fs.statSync(abs).size });
  }
  const files = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  if (files.length) {
    writeIfChanged(path.join(projectDir, 'media.json'), JSON.stringify({ files }, null, 2) + '\n');
  }
  return files;
}

function pageHtml(data, htmlDescription, content, folder, plainDescription) {
  const meta = JSON.stringify({ ...data, overview: htmlDescription, descriptionRaw: content, id: folder });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title || 'Project'} — VINCENT NAPLES</title>
  <meta name="description" content="${(plainDescription || '').slice(0, 160).replace(/"/g, '&quot;')}">
  <link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="../../assets/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../css/style.css">
  <link rel="stylesheet" href="../../case-study/style.css">
  <script src="../../js/accent.js"></script>
</head>
<body>
  <div id="app"></div>
  <script type="application/json" id="project-meta">
    ${meta}
  </script>
  <script type="module" src="../../case-study/app.js"></script>
</body>
</html>
`;
}

function writeIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf-8') === contents) return false;
  fs.writeFileSync(filePath, contents);
  return true;
}

const projects = [];
const folders = fs.existsSync(projectsDir)
  ? fs.readdirSync(projectsDir).filter(f => !f.startsWith('.') && fs.statSync(path.join(projectsDir, f)).isDirectory())
  : [];

for (const folder of folders) {
  const mdPath = path.join(projectsDir, folder, `${folder}.md`);
  if (!fs.existsSync(mdPath)) {
    console.warn(`skipping ${folder}: no ${folder}.md`);
    continue;
  }
  const { data, content } = matter(fs.readFileSync(mdPath, 'utf-8'));
  const htmlDescription = marked.parse(content);

  // --- Procedural asset discovery (paths relative to the project page) ---
  // video/audio merge local files with the media.json manifest (R2 fallback);
  // images/posters are small enough to live in git and are always local
  const projectDir = path.join(projectsDir, folder);
  const assetsDir = path.join(projectDir, 'assets');
  const manifest = readManifest(projectDir);
  const missing = [];
  let discoveredHero = null;
  const otherVideos = [];
  const carousel = [];
  const posters = [];
  const audio = [];

  const videos = mergedMedia(projectDir, folder, 'video', manifest, missing);
  const audios = mergedMedia(projectDir, folder, 'audio', manifest, missing);
  const images = mergedMedia(projectDir, folder, 'image', manifest, missing);
  const posterM = mergedMedia(projectDir, folder, 'poster', manifest, missing);
  updateManifest(projectDir, manifest, [...videos, ...audios, ...images, ...posterM]);
  if (missing.length) {
    console.warn(`${folder}: ${missing.length} media file(s) not local and no baseUrl in media.config.json:\n  ${missing.join('\n  ')}`);
  }

  for (const { path: p, resolved } of videos) {
    const name = path.basename(p);
    if (name.toLowerCase().startsWith('hero')) {
      discoveredHero = { type: 'video', sources: [resolved], aspectRatios: ['16:9'] };
    } else {
      otherVideos.push({ title: titleFromFile(name), sources: [resolved], poster: `${resolved}#t=0`, aspectRatios: ['16:9'] });
    }
  }
  for (const { path: p, resolved } of images) {
    if (path.basename(p).toLowerCase().startsWith('hero') && !discoveredHero) {
      discoveredHero = { type: 'image', sources: [resolved] };
    } else {
      carousel.push(resolved);
    }
  }
  for (const { resolved } of posterM) {
    posters.push(resolved);
  }
  for (const { path: p, resolved } of audios) {
    audio.push({ title: titleFromFile(path.basename(p)), path: resolved });
  }

  // Inventory of LOCAL files for the author-mode wizard (dev-server.mjs).
  // Media that only exists in R2 isn't listed — run media:pull to edit it.
  const existingMedia = [];
  const heroVideoLocal = videos.some(v => v.resolved === v.path && path.basename(v.path).toLowerCase().startsWith('hero'));
  for (const { path: p, resolved } of videos) {
    if (resolved !== p) continue; // remote-only
    existingMedia.push({ name: path.basename(p), path: p, role: path.basename(p).toLowerCase().startsWith('hero') ? 'hero' : 'auto' });
  }
  for (const { path: p, resolved } of images) {
    if (resolved !== p) continue; // remote-only
    const isHero = path.basename(p).toLowerCase().startsWith('hero') && !heroVideoLocal;
    existingMedia.push({ name: path.basename(p), path: p, role: isHero ? 'hero' : 'auto' });
  }
  for (const { path: p, resolved } of posterM) {
    if (resolved !== p) continue;
    existingMedia.push({ name: path.basename(p), path: p, role: 'poster' });
  }
  for (const { path: p, resolved } of audios) {
    if (resolved !== p) continue;
    existingMedia.push({ name: path.basename(p), path: p, role: 'auto' });
  }
  for (const f of listFiles(projectDir)) {
    if (f.toLowerCase().startsWith('thumb') && !/\.(md|json|html)$/i.test(f)) {
      existingMedia.push({ name: f, path: f, role: 'thumbnail' });
    }
  }
  data.existingMedia = existingMedia;

  // Frontmatter paths (e.g. thumb) may point at R2-synced files — resolve them
  const resolvedByPath = new Map([...images, ...posterM].map(e => [e.path, e.resolved]));
  if (data.thumb) data.thumb = resolvedByPath.get(data.thumb) || data.thumb;

  // Frontmatter wins if explicitly defined
  data.hero = data.hero || discoveredHero ||
    (otherVideos.length ? { type: 'video', sources: otherVideos[0].sources, poster: otherVideos[0].poster, aspectRatios: otherVideos[0].aspectRatios } :
      carousel.length ? { type: 'image', sources: [carousel[0]] } :
        posters.length ? { type: 'image', sources: [posters[0]] } : null);

  if (data.hero?.type === 'video' && data.hero.sources) {
    const heroSrcs = data.hero.sources;
    for (let i = otherVideos.length - 1; i >= 0; i--) {
      if (heroSrcs.includes(otherVideos[i].sources[0])) otherVideos.splice(i, 1);
    }
    if (!data.hero.poster && posters.length) data.hero.poster = posters[0];
  }
  if (!data.otherVideos && otherVideos.length) data.otherVideos = otherVideos;
  // posters also join the carousel by default
  if (!data.carouselImages && (carousel.length || posters.length)) {
    data.carouselImages = [...carousel, ...posters];
  }
  if (!data.posterImages && posters.length) data.posterImages = [posters];
  if (!data.audioFiles && audio.length) data.audioFiles = audio;

  // Plain text for the search index / meta description
  const plainDescription = content.replace(/#(.*)/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\n/g, ' ').substring(0, 500).trim();

  if (writeIfChanged(path.join(projectsDir, folder, 'index.html'),
    pageHtml(data, htmlDescription, content, folder, plainDescription))) {
    console.log(`wrote projects/${folder}/index.html`);
  }

  // Aggregate entry; thumb paths are site-root-relative (no leading slash)
  const rootRel = p => (p && !p.startsWith('http') ? `projects/${folder}/${p}` : p);
  if (data.hidden) continue;
  projects.push({
    id: folder,
    title: data.title || folder,
    client: data.client || 'Project',
    description: plainDescription || data.description || '',
    date: data.date || new Date().toISOString().split('T')[0],
    thumb: rootRel(data.thumb || data.hero?.poster ||
      (data.hero?.type === 'image' ? data.hero.sources?.[0] : null) || posters[0] || carousel[0]),
    hashtags: data.hashtags ? (Array.isArray(data.hashtags) ? data.hashtags : [data.hashtags]) : [],
    roles: data.roles || data.credits || [],
  });
}

projects.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
if (writeIfChanged(path.join(projectsDir, 'index.json'), JSON.stringify(projects, null, 2) + '\n')) {
  console.log(`wrote projects/index.json (${projects.length} project${projects.length === 1 ? '' : 's'})`);
}
