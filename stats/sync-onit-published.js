const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PUBLISH_ORIGIN = "https://onit.lt/wzstats/data/";
const OUTPUT_DIR = path.join(__dirname, "published");
const MANIFEST_NAME = "manifest.json";
const ALLOWED_FILES = new Set(["matches.json", "leaderboards.json"]);

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath).equals(content)) {
    return false;
  }
  fs.writeFileSync(filePath, content);
  return true;
}

async function fetchBuffer(name) {
  const response = await fetch(new URL(name, PUBLISH_ORIGIN), {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Unable to download ${name}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function sync() {
  const manifestBuffer = await fetchBuffer(MANIFEST_NAME);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  if (Number(manifest.format) !== 1 || !manifest.files) {
    throw new Error("Unsupported MaWay2000 publication manifest.");
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let changed = false;
  for (const [name, metadata] of Object.entries(manifest.files)) {
    if (!ALLOWED_FILES.has(name)) {
      throw new Error(`Publication manifest contains an unexpected file: ${name}`);
    }
    const content = await fetchBuffer(name);
    const actualHash = sha256(content);
    if (actualHash !== metadata.sha256) {
      throw new Error(`${name} SHA-256 mismatch.`);
    }
    changed = writeIfChanged(path.join(OUTPUT_DIR, name), content) || changed;
  }

  changed = writeIfChanged(path.join(OUTPUT_DIR, MANIFEST_NAME), manifestBuffer) || changed;
  console.log(changed
    ? `Published MaWay2000 snapshot ${manifest.files["matches.json"].sha256.slice(0, 16)}.`
    : "No MaWay2000 publication changes detected.");
}

sync().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
