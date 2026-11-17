'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {gzipSync} = require('node:zlib');
const {exportDirectory} = require('./public-export.cjs');
const {buildPerformance} = require('./build-rating-performance.cjs');
const FILES = ['leaderboards.json', 'matches.json', 'rating-performance.json'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function writeAtomic(file, bytes) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = file + '.tmp-' + process.pid;
  try { fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function publishMainLive({source, destination, now = Date.now()}) {
  const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
  const fingerprint = digest(Buffer.concat([manifestBytes, ...['main-live-publication.cjs', 'public-export.cjs', 'build-rating-performance.cjs']
    .map(file => fs.readFileSync(path.join(__dirname, file)))]));
  const statePath = path.join(destination, 'state.json');
  let previous;
  try { previous = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
  if (previous?.fingerprint === fingerprint && fs.existsSync(path.join(destination, 'manifest.json'))) return false;
  fs.mkdirSync(destination, {recursive: true});
  const staging = fs.mkdtempSync(path.join(destination, '.building-'));
  try {
    const captured = path.join(staging, 'input'), filtered = path.join(staging, 'public');
    fs.mkdirSync(captured);
    fs.writeFileSync(path.join(captured, 'manifest.json'), manifestBytes);
    // Capture one immutable input generation before checking hashes or parsing it.
    for (const name of ['leaderboards.json', 'matches.json']) {
      const bytes = fs.readFileSync(path.join(source, name));
      if (bytes.length > 128 * 1024 * 1024) throw Error('Main publication exceeds the size limit');
      fs.writeFileSync(path.join(captured, name), bytes);
    }
    const manifest = exportDirectory(captured, filtered);
    const matches = JSON.parse(fs.readFileSync(path.join(filtered, 'matches.json'), 'utf8'));
    const performance = Buffer.from(JSON.stringify(buildPerformance(matches.matches)) + '\n');
    fs.writeFileSync(path.join(filtered, 'rating-performance.json'), performance);
    manifest.files['rating-performance.json'] = {sha256: digest(performance), bytes: performance.length};
    for (const name of FILES) {
      const hash = manifest.files[name].sha256;
      const target = path.join(destination, 'blobs', name, hash + '.json');
      if (!fs.existsSync(target)) {
        const bytes = fs.readFileSync(path.join(filtered, name));
        writeAtomic(target + '.gz', gzipSync(bytes));
        writeAtomic(target, bytes);
      }
    }
    // Publish the manifest only when every hash-addressed file is ready.
    writeAtomic(path.join(destination, 'manifest.json'), JSON.stringify(manifest) + '\n');
    const history = [manifest, ...(previous?.history || []).filter(item =>
      item.files?.['leaderboards.json']?.sha256 !== manifest.files['leaderboards.json'].sha256)].slice(0, 3);
    writeAtomic(statePath, JSON.stringify({fingerprint, history}) + '\n');
    for (const name of FILES) {
      const keep = new Set(history.map(item => item.files?.[name]?.sha256));
      const directory = path.join(destination, 'blobs', name);
      for (const file of fs.readdirSync(directory)) {
        const match = file.match(/^([a-f0-9]{64})\.json(?:\.gz)?$/);
        const target = path.join(directory, file);
        if (match && !keep.has(match[1]) && now - fs.statSync(target).mtimeMs > 10 * 60 * 1000) {
          try { fs.unlinkSync(target); } catch {}
        }
      }
    }
    return true;
  } finally {
    if (!path.resolve(staging).startsWith(path.resolve(destination) + path.sep)) throw Error('Invalid staging path');
    fs.rmSync(staging, {recursive: true, force: true});
  }
}

module.exports = {publishMainLive};
if (require.main === module) {
  const [source, destination] = process.argv.slice(2);
  try {
    if (!source || !destination) throw Error('Supply source and destination directories');
    if (publishMainLive({source, destination})) console.log('Published live main leaderboard results.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
