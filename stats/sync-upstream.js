const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const STATS_DIR = __dirname;
const UPSTREAM_ORIGIN = "https://warzone2100.retropaganda.info";
const UPSTREAM_RESULTS_URL = `${UPSTREAM_ORIGIN}/results.json`;
const STATIC_SOURCES = [
  {
    sourceUrl: `${UPSTREAM_ORIGIN}/calculate.js`,
    outputName: "calculate.js"
  },
  {
    sourceUrl: `${UPSTREAM_ORIGIN}/leaderboards.js`,
    outputName: "leaderboards.js"
  },
  {
    sourceUrl: `${UPSTREAM_ORIGIN}/results.js`,
    outputName: "upstream-results.js"
  },
  {
    sourceUrl: `${UPSTREAM_ORIGIN}/player-public-keys.json`,
    outputName: "player-public-keys.json"
  }
];

function buildUpstreamHeaders(acceptValue) {
  const headers = {
    Accept: acceptValue
  };
  const basicAuthHeader = String(process.env.UPSTREAM_BASIC_AUTH || "").trim();
  const basicAuthUser = String(process.env.UPSTREAM_BASIC_USER || "");
  const basicAuthPassword = String(process.env.UPSTREAM_BASIC_PASSWORD || "");

  if (basicAuthHeader) {
    headers.Authorization = basicAuthHeader;
  } else if (basicAuthUser || basicAuthPassword) {
    headers.Authorization = `Basic ${Buffer.from(`${basicAuthUser}:${basicAuthPassword}`).toString("base64")}`;
  }

  return headers;
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
}

function writeTextIfChanged(filePath, nextContent) {
  const currentContent = readTextIfExists(filePath);
  if (currentContent === nextContent) {
    return false;
  }

  fs.writeFileSync(filePath, nextContent);
  return true;
}

function replaceModuleImport(source, from, to) {
  return source.replace(from, to);
}

async function fetchTextFile({ sourceUrl, outputName }) {
  const response = await fetch(sourceUrl, {
    headers: buildUpstreamHeaders("text/javascript, application/json, text/plain, */*")
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${sourceUrl}: HTTP ${response.status}`);
  }

  return {
    outputName,
    sourceUrl,
    content: await response.text()
  };
}

async function fetchResultsSnapshot() {
  const response = await fetch(UPSTREAM_RESULTS_URL, {
    headers: buildUpstreamHeaders("application/json, text/plain, */*")
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch results.json snapshot: HTTP ${response.status}`);
  }

  const compressedBuffer = Buffer.from(await response.arrayBuffer());
  const contentEncoding = String(response.headers.get("content-encoding") || "").toLowerCase();
  const decodedBuffer = contentEncoding === "zstd"
    ? zlib.zstdDecompressSync(compressedBuffer)
    : compressedBuffer;
  const upstreamPayload = JSON.parse(decodedBuffer.toString("utf8"));
  const normalizedPayload = Array.isArray(upstreamPayload)
    ? { format: 1, results: upstreamPayload }
    : upstreamPayload;

  return `${JSON.stringify(normalizedPayload)}\n`;
}

function getSnapshotMetadata(snapshotText) {
  const snapshot = JSON.parse(snapshotText);
  const latestEndDate = snapshot.results.reduce(
    (max, result) => Math.max(max, Number(result.endDate || 0)),
    0
  );

  return {
    resultsCount: snapshot.results.length,
    latestEndDate
  };
}

function loadCurrentManifest() {
  const manifestPath = path.join(STATS_DIR, "upstream-manifest.json");
  const currentText = readTextIfExists(manifestPath);
  return currentText ? JSON.parse(currentText) : null;
}

function buildManifest(files, syncedAt) {
  const manifest = {
    upstreamOrigin: UPSTREAM_ORIGIN,
    syncedAt,
    files
  };

  manifest.version = sha256(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(files).map(([name, metadata]) => [
          name,
          {
            sha256: metadata.sha256,
            sizeBytes: metadata.sizeBytes
          }
        ])
      )
    )
  ).slice(0, 16);

  return manifest;
}

function normalizeLeaderboardsSource(content, calculateHash) {
  return replaceModuleImport(
    content,
    "from './calculate.js';",
    `from './calculate.js?v=${calculateHash.slice(0, 16)}';`
  );
}

function normalizeResultsSource(content, hashes) {
  return content
    .replace(
      "import playerPublicKeys from './player-public-keys.json' with {type: 'json'};",
      `import playerPublicKeys from './player-public-keys.json?v=${hashes.playerKeysHash.slice(0, 16)}' with {type: 'json'};`
    )
    .replace(
      "from './calculate.js';",
      `from './calculate.js?v=${hashes.calculateHash.slice(0, 16)}';`
    )
    .replace(
      "from './leaderboards.js';",
      `from './leaderboards.js?v=${hashes.leaderboardsHash.slice(0, 16)}';`
    );
}

async function main() {
  const currentManifest = loadCurrentManifest();
  const fetchedStaticFiles = await Promise.all(STATIC_SOURCES.map(fetchTextFile));

  const rawFiles = Object.fromEntries(
    fetchedStaticFiles.map((file) => [file.outputName, file])
  );

  const calculateHash = sha256(rawFiles["calculate.js"].content);
  const playerKeysHash = sha256(rawFiles["player-public-keys.json"].content);

  rawFiles["leaderboards.js"].content = normalizeLeaderboardsSource(
    rawFiles["leaderboards.js"].content,
    calculateHash
  );

  const leaderboardsHash = sha256(rawFiles["leaderboards.js"].content);

  rawFiles["upstream-results.js"].content = normalizeResultsSource(
    rawFiles["upstream-results.js"].content,
    {
      calculateHash,
      leaderboardsHash,
      playerKeysHash
    }
  );

  let snapshotText = null;
  try {
    snapshotText = await fetchResultsSnapshot();
  } catch (error) {
    const existingSnapshotPath = path.join(STATS_DIR, "results-snapshot.json");
    const existingSnapshot = readTextIfExists(existingSnapshotPath);
    if (!existingSnapshot) {
      throw error;
    }

    console.warn(`Unable to refresh results-snapshot.json, keeping existing copy. ${error.message}`);
    snapshotText = existingSnapshot;
  }

  rawFiles["results-snapshot.json"] = {
    outputName: "results-snapshot.json",
    sourceUrl: UPSTREAM_RESULTS_URL,
    content: snapshotText
  };

  const filesMetadata = {};
  for (const file of Object.values(rawFiles)) {
    const filePath = path.join(STATS_DIR, file.outputName);
    const fileHash = sha256(file.content);
    filesMetadata[file.outputName] = {
      sourceUrl: file.sourceUrl,
      sha256: fileHash,
      sizeBytes: Buffer.byteLength(file.content, "utf8")
    };

    if (file.outputName === "results-snapshot.json") {
      Object.assign(filesMetadata[file.outputName], getSnapshotMetadata(file.content));
    }

    writeTextIfChanged(filePath, file.content);
  }

  const nextManifest = buildManifest(filesMetadata, new Date().toISOString());
  const manifestChanged =
    !currentManifest ||
    JSON.stringify(currentManifest.files) !== JSON.stringify(nextManifest.files);

  if (manifestChanged) {
    writeTextIfChanged(
      path.join(STATS_DIR, "upstream-manifest.json"),
      `${JSON.stringify(nextManifest, null, 2)}\n`
    );
  }

  if (!manifestChanged) {
    console.log("No upstream changes detected.");
    return;
  }

  console.log(`Synced upstream files with manifest version ${nextManifest.version}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
