const versionPath = 'mapmaker-version.json';

export function getNextMapVersion(version) {
  const match = String(version || '').trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return '';
  const minor = Number(match[2] || 0) + 1;
  return Number.isSafeInteger(minor) ? match[1] + '.' + minor : '';
}

// Keep editor version metadata separate from legacy map/game file formats.
export function writeMapVersion(zip, versionName) {
  zip.file(versionPath, JSON.stringify({version:1, versionName}, null, 2));
}

export async function readMapVersion(zip) {
  try {
    const file = zip.file(versionPath);
    if (!file) return '';
    const metadata = JSON.parse(await file.async('string'));
    return metadata.version === 1 && typeof metadata.versionName === 'string'
      ? metadata.versionName.trim() : '';
  } catch {
    return '';
  }
}
