'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const {assertNoPrivateFields} = require('./public-export.cjs');
const args = process.argv.slice(2);
const ref = args.includes('--ref') ? args[args.indexOf('--ref') + 1] : null;
const directory = args.includes('--directory') ? path.resolve(args[args.indexOf('--directory') + 1]) : process.cwd();
const git = (...parameters) => cp.execFileSync('git', ['-C', directory, ...parameters], {maxBuffer: 150 * 1024 * 1024});
const files = git(...(ref ? ['ls-tree', '-r', '--name-only', ref] : ['ls-files'])).toString().trim().split('\n');
const read = file => ref ? git('show', `${ref}:${file}`) : fs.readFileSync(path.join(directory, file));
const forbiddenPath = /^(?:local-api|security-desk|server|replay-downloader|output|tmp|\.codex(?:-remote-attachments|-staging)?)(?:\/|$)|(?:^|\/)(?:\.env(?:\.|$)|config\.local\.|local-worker-env\.|player-ban-auth\.|player-ban-friend-users\.|player-bans\.json|player-ban-audit\.|id_rsa|id_ed25519)|\.(?:php|sqlite3?|db|pem|pfx|p12|key|jsonl|log)$/i;
const signatures = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{35,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\$2[aby]\$\d{2}\$[.\/A-Za-z0-9]{53}/,
  /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{25,}/
];
const failures = [];
for (const file of files) {
  // Existing map-file listing helper contains no admin configuration or secrets.
  // Pages serves it as source; all other PHP/admin code remains forbidden.
  if (forbiddenPath.test(file) && file !== 'mapmaker/maps/index.php') { failures.push(`Private path must not be published: ${file}`); continue; }
  if (!/\.(?:js|mjs|cjs|php|json|ya?ml|toml|ini|env|conf|config|ps1|cmd|bat|md|txt|html|css|xml|sql)$/i.test(file)) continue;
  const buffer = read(file);
  if (buffer.includes(0)) continue;
  const text = buffer.toString('utf8');
  if (signatures.some(pattern => pattern.test(text))) failures.push(`Possible credential in ${file}; value suppressed.`);
  if (/^stats\/published\/(?:leaderboards|matches)\.json$/.test(file)) {
    try { assertNoPrivateFields(JSON.parse(text)); } catch { failures.push(`Private or invalid data in ${file}; details suppressed.`); }
  }
  if (file === 'stats/published/armory-scores.json') {
    try {
      const value = JSON.parse(text);
      const {normalizePublication} = require('./../balloon/site-armory-scores.js');
      if (JSON.stringify(value) !== JSON.stringify(normalizePublication(value))) throw Error('Unexpected score fields');
    } catch { failures.push(`Private or invalid score publication in ${file}; details suppressed.`); }
  }
}
try {
  const manifest = JSON.parse(read('stats/published/manifest.json'));
  for (const [name, metadata] of Object.entries(manifest.files || {})) {
    if (!['matches.json', 'leaderboards.json'].includes(name)) throw new Error('Unexpected public file');
    const content = read('stats/published/' + name);
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (digest !== metadata.sha256 || content.length !== metadata.bytes) throw new Error('Manifest integrity failure');
  }
} catch { failures.push('Public manifest integrity check failed.'); }
if (failures.length) { failures.forEach(message => console.error(message)); process.exitCode = 1; }
else console.log(`Public release privacy checks passed (${files.length} files).`);
