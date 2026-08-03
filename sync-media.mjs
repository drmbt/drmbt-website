// Owns the movement of heavy case-study media (projects/*/assets/{video,audio},
// gitignored) between this machine and the Cloudflare R2 bucket. The committed
// projects/<slug>/media.json manifests record what exists remotely; the public
// base url lives in media.config.json. build-projects.mjs falls back to
// `${baseUrl}/projects/<slug>/<path>` for any manifest file not present locally.
//
//   npm run media:push   upload new/changed local media to R2, refresh
//                        manifests, regenerate pages   (needs .env, see below)
//   npm run media:clean  delete local copies verified present at the public
//                        url                           (no keys needed)
//   npm run media:pull   download manifest files missing locally from the
//                        public url                    (no keys needed)
//   npm run media:prune  report bucket objects no manifest references (renames
//                        leave the old key behind); add -- --delete to remove
//                        them, -- --all to include folders with no local project
//
// push requires R2 credentials in .env (see .env.example):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const root = import.meta.dirname;
const projectsDir = path.join(root, 'projects');
const SYNC_DIRS = ['video', 'audio', 'image', 'poster'];

// minimal .env loader (no override of real environment)
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const baseUrl = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'media.config.json'), 'utf-8')).baseUrl || '';
  } catch {
    return '';
  }
})();

const CONTENT_TYPES = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.ogg': 'video/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

const projectFolders = () =>
  fs.existsSync(projectsDir)
    ? fs.readdirSync(projectsDir).filter(f => fs.statSync(path.join(projectsDir, f)).isDirectory())
    : [];

const readManifest = dir => {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'media.json'), 'utf-8'));
    return Array.isArray(m.files) ? m : { files: [] };
  } catch {
    return { files: [] };
  }
};

const writeManifest = (dir, files) => {
  files.sort((a, b) => a.path.localeCompare(b.path));
  fs.writeFileSync(path.join(dir, 'media.json'), JSON.stringify({ files }, null, 2) + '\n');
};

const publicUrl = (folder, p) => `${baseUrl}/projects/${folder}/${p}`;

function requireBaseUrl() {
  if (!baseUrl) {
    console.error('media.config.json has no baseUrl — set it to the bucket\'s public url (r2.dev subdomain or custom domain).');
    process.exit(1);
  }
}

async function remoteSize(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return null;
    return parseInt(res.headers.get('content-length') || '0', 10);
  } catch {
    return null;
  }
}

/* ---------- push ---------- */
async function push() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    console.error('Missing R2 credentials. Copy .env.example to .env and fill in R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.');
    process.exit(1);
  }
  const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const { Upload } = await import('@aws-sdk/lib-storage');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    // R2 rejects the SDK's default integrity checksums (SignatureDoesNotMatch)
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  let uploaded = 0, skipped = 0;
  for (const folder of projectFolders()) {
    const projectDir = path.join(projectsDir, folder);
    const manifest = readManifest(projectDir);
    const byPath = new Map(manifest.files.map(e => [e.path, e]));

    for (const kind of SYNC_DIRS) {
      const dir = path.join(projectDir, 'assets', kind);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter(f => !f.startsWith('.'))) {
        const rel = `assets/${kind}/${f}`;
        const abs = path.join(dir, f);
        const size = fs.statSync(abs).size;
        const key = `projects/${folder}/${rel}`;

        let exists = false;
        try {
          const head = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
          exists = head.ContentLength === size;
        } catch { /* not found */ }

        if (exists) {
          skipped++;
        } else {
          process.stdout.write(`uploading ${key} (${(size / 1e6).toFixed(1)}MB)... `);
          await new Upload({
            client: s3,
            params: {
              Bucket: R2_BUCKET,
              Key: key,
              Body: fs.createReadStream(abs),
              ContentType: CONTENT_TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream',
            },
          }).done();
          console.log('done');
          uploaded++;
        }
        byPath.set(rel, { path: rel, size });
      }
    }
    if (byPath.size) writeManifest(projectDir, [...byPath.values()]);
  }
  console.log(`push complete: ${uploaded} uploaded, ${skipped} already current.`);
  execFileSync('node', [path.join(root, 'build-projects.mjs')], { stdio: 'inherit' });
}

/* ---------- clean ---------- */
async function clean() {
  requireBaseUrl();
  let removed = 0, kept = 0;
  for (const folder of projectFolders()) {
    const projectDir = path.join(projectsDir, folder);
    for (const entry of readManifest(projectDir).files) {
      const abs = path.join(projectDir, entry.path);
      if (!fs.existsSync(abs)) continue;
      const localSize = fs.statSync(abs).size;
      const remote = await remoteSize(publicUrl(folder, entry.path));
      if (remote === localSize) {
        fs.unlinkSync(abs);
        console.log(`removed local ${folder}/${entry.path} (verified at ${baseUrl})`);
        removed++;
      } else {
        console.warn(`kept ${folder}/${entry.path}: remote ${remote === null ? 'missing' : `size ${remote}`} != local ${localSize} — run media:push first`);
        kept++;
      }
    }
  }
  console.log(`clean complete: ${removed} removed, ${kept} kept.`);
}

/* ---------- pull ---------- */
async function pull() {
  requireBaseUrl();
  let fetched = 0;
  for (const folder of projectFolders()) {
    const projectDir = path.join(projectsDir, folder);
    for (const entry of readManifest(projectDir).files) {
      const abs = path.join(projectDir, entry.path);
      if (fs.existsSync(abs)) continue;
      const url = publicUrl(folder, entry.path);
      process.stdout.write(`fetching ${folder}/${entry.path}... `);
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`failed (${res.status})`);
        continue;
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, Buffer.from(await res.arrayBuffer()));
      console.log('done');
      fetched++;
    }
  }
  console.log(`pull complete: ${fetched} fetched.`);
}

/* ---------- prune ---------- */
// Renaming media (the editor's reorder renumbers files) leaves the old object
// in the bucket forever: push only ever uploads. This reports those orphans and,
// with --delete, removes them. Never folded into push — a push from a machine
// where some media is remote-only would happily delete the live copies.
async function prune({ apply, all }) {
  const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    console.error('Missing R2 credentials. Copy .env.example to .env and fill in R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.');
    process.exit(1);
  }
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  // the manifests are the record of what the deployed site asks for
  const known = new Set();
  const localFolders = new Set(projectFolders());
  for (const folder of localFolders) {
    for (const entry of readManifest(path.join(projectsDir, folder)).files) {
      known.add(`projects/${folder}/${entry.path}`);
    }
  }

  const orphans = [];
  const foreign = []; // keys under a project folder this checkout doesn't have
  let token, scanned = 0;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'projects/', ContinuationToken: token }));
    for (const obj of page.Contents || []) {
      scanned++;
      if (known.has(obj.Key)) continue;
      const folder = obj.Key.split('/')[1];
      (localFolders.has(folder) ? orphans : foreign).push(obj.Key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const targets = all ? [...orphans, ...foreign] : orphans;
  for (const key of orphans) console.log(`orphan  ${key}`);
  for (const key of foreign) {
    console.log(`${all ? 'orphan' : 'skipped'} ${key}${all ? '' : '  (no local project — rerun with --all to include)'}`);
  }
  console.log(`scanned ${scanned} object(s), ${known.size} referenced by manifests, ${targets.length} to remove.`);

  if (!targets.length) return;
  if (!apply) {
    console.log('dry run — rerun with --delete to remove them.');
    return;
  }
  for (let i = 0; i < targets.length; i += 1000) {
    const batch = targets.slice(i, i + 1000);
    const res = await s3.send(new DeleteObjectsCommand({
      Bucket: R2_BUCKET,
      Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true },
    }));
    for (const err of res.Errors || []) console.error(`failed ${err.Key}: ${err.Message}`);
  }
  console.log(`prune complete: ${targets.length} deleted.`);
}

const cmd = process.argv[2];
const flags = process.argv.slice(3);
if (cmd === 'push') await push();
else if (cmd === 'clean') await clean();
else if (cmd === 'pull') await pull();
else if (cmd === 'prune') await prune({ apply: flags.includes('--delete'), all: flags.includes('--all') });
else {
  console.log('usage: node sync-media.mjs <push|clean|pull|prune [--delete] [--all]>');
  process.exit(1);
}
