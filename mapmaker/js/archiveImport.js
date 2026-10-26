import {readMapVersion} from './mapVersion.js';

// Shared, DOM-free readers for classic Warzone map archives.
export function metadataText(...values) {
  for (const value of values) {
    let text = '';
    if (Array.isArray(value)) text = value.map(item => metadataText(item)).filter(Boolean).join(', ');
    else if (value && typeof value === 'object') text = metadataText(value.name, value.fullName, value.id);
    else if (value !== undefined && value !== null) text = String(value).trim();
    if (text) return text;
  }
  return '';
}

export function mapPlayerIndex(value) {
  if (typeof value === 'string' && /^scavengers?$/i.test(value.trim())) return 10;
  const player = Number.parseInt(value, 10);
  return Number.isFinite(player) ? Math.max(0, Math.min(10, player)) : 0;
}

export function parseLegacyIni(text) {
  const entries = [];
  let current = null;
  for (const line of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^(;|#|\/\/)/.test(trimmed)) continue;
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      current = {};
      entries.push(current);
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (!current || eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (/^".*"$/.test(value)) value = value.slice(1, -1);
    if (key === 'position' || key === 'rotation') {
      current[key] = value.split(',').map(part => Number.parseInt(part.trim(), 10) || 0);
    } else if (['id', 'startpos', 'modules'].includes(key)) {
      const number = Number.parseInt(value, 10);
      current[key] = Number.isFinite(number) ? number : value;
    } else current[key] = value;
  }
  return entries;
}

export function parseLegacyLevelMetadata(text) {
  const metadata = {};
  const source = String(text || '');
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*\/\/\s*(Made with|Author|License|Licence|Date|Source)\s*(?::\s*|\s+)(.*?)\s*$/i);
    if (!match || !match[2]) continue;
    const key = { 'made with': 'generator', author: 'author', license: 'license', licence: 'license', date: 'created', source: 'source' }[match[1].toLowerCase()];
    metadata[key] ||= match[2].trim();
  }
  if (metadata.created) metadata.created = metadata.created.replace(/^(\d{4})\/(\d{2})\/(\d{2})/, '$1-$2-$3');
  const players = source.match(/^\s*players\s+(\d+)\s*$/im);
  if (players) metadata.players = Number(players[1]);
  const level = source.match(/^\s*level\s+"?([^"\r\n]+)"?\s*$/im);
  if (level) metadata.name = level[1].trim().replace(/-T[123]$/i, '');
  const dataset = source.match(/^\s*dataset\s+\S*?(?:CAM_|_C)([123])\s*$/im);
  if (dataset) metadata.tileset = { 1: 'arizona', 2: 'urban', 3: 'rockies' }[dataset[1]];
  return metadata;
}

function archiveFile(zip, suffix) {
  return Object.keys(zip.files).find(name => !zip.files[name].dir && name.replace(/\\/g, '/').split('/').pop().toLowerCase() === suffix);
}

export async function readMapArchiveMetadata(zip) {
  const legacyName = Object.keys(zip.files).find(name => !zip.files[name].dir && /\.lev$/i.test(name));
  const legacy = legacyName ? parseLegacyLevelMetadata(await zip.files[legacyName].async('string')) : {};
  const jsonName = archiveFile(zip, 'level.json');
  const json = jsonName ? JSON.parse(await zip.files[jsonName].async('string')) : null;
  const data = { ...legacy };
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    for (const [key, value] of Object.entries(json)) {
      if (value !== null && value !== undefined && value !== '') data[key] = value;
    }
    // Alternative JSON names must also override a legacy fallback.
    const author = metadataText(json.author, json.authors, json.creator);
    const license = metadataText(json.license, json.licence, json['spdx-license-id']);
    if (author && !metadataText(json.author)) data.author = author;
    if (license) data.license = license;
    const generator = metadataText(json.generator, json.madeWith, json['made-with']);
    if (generator) data.generator = generator;
  }
  const savedVersion = await readMapVersion(zip);
  if (savedVersion) data.versionName = savedVersion;
  return { name: jsonName || null, data: Object.keys(data).length ? data : null };
}

export async function readMapArchiveEntities(zip, kind) {
  const jsonName = archiveFile(zip, kind + '.json');
  const iniName = archiveFile(zip, kind + '.ini');
  if (!jsonName && !iniName) return { name: null, entries: [] };
  if (!jsonName) {
    return { name: iniName.replace(/\.ini$/i, '.json'), entries: parseLegacyIni(await zip.files[iniName].async('string')) };
  }
  const data = JSON.parse(await zip.files[jsonName].async('string'));
  const collection = data?.[kind + 's'] ?? data?.[kind === 'feature' ? 'features' : kind === 'droid' ? 'droids' : 'structures'];
  const entries = Array.isArray(data) ? data : Array.isArray(collection) ? collection : Object.values(data || {});
  return { name: jsonName, entries: entries.filter(entry => entry && typeof entry === 'object') };
}
