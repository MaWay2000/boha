#!/usr/bin/env node

import { appendFileSync, closeSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants as osConstants, homedir, setPriority, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gzipSync } from 'node:zlib';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const once = process.argv.includes('--once');
const retryFailed = process.argv.includes('--retry-failed');
const configOption = process.argv.find((argument) => argument.startsWith('--config='));
const configPath = resolve(configOption
  ? configOption.slice('--config='.length)
  : join(process.env.LOCALAPPDATA || homedir(), 'MaWay2000Wzstats', 'worker.json'));

function loadConfig() {
  if (!existsSync(configPath)) {
    throw new Error(`Worker configuration not found: ${configPath}`);
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!String(config.baseUrl || '').startsWith('https://')) {
    throw new Error('Worker baseUrl must use HTTPS.');
  }
  if (!config.token || !config.warzonePath) {
    throw new Error('Worker configuration requires token and warzonePath.');
  }
  return {
    baseUrl: String(config.baseUrl).replace(/\/$/, ''),
    token: String(config.token),
    warzonePath: resolve(String(config.warzonePath)),
    pollSeconds: Math.max(15, Number(config.pollSeconds) || 300),
    retrySeconds: Math.max(5, Number(config.retrySeconds) || 30),
  };
}

const config = loadConfig();
const logDirectory = dirname(configPath);
mkdirSync(logDirectory, { recursive: true });
const logPath = join(logDirectory, 'worker.log');
const progressPath = join(logDirectory, 'progress.json');
const interfaceSettingsPath = join(logDirectory, 'interface-settings.json');
const pendingDirectory = join(logDirectory, 'pending');
const lockPath = join(logDirectory, 'worker.lock');
mkdirSync(pendingDirectory, { recursive: true });

function log(message, details = undefined) {
  const line = `[${new Date().toISOString()}] ${message}${details === undefined ? '' : ` ${JSON.stringify(details)}`}`;
  process.stdout.write(`${line}\n`);
  appendFileSync(logPath, `${line}\n`, 'utf8');
}

function processExists(processId) {
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireWorkerLock() {
  const createLock = () => {
    const handle = openSync(lockPath, 'wx');
    writeFileSync(handle, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
    closeSync(handle);
  };
  try {
    createLock();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let ownerPid = 0;
    try {
      ownerPid = Number(JSON.parse(readFileSync(lockPath, 'utf8')).pid) || 0;
    } catch {
    }
    if (processExists(ownerPid)) {
      log('Replay worker already running.', { ownerPid });
      return false;
    }
    rmSync(lockPath, { force: true });
    createLock();
  }
  return true;
}

function releaseWorkerLock() {
  try {
    const ownerPid = Number(JSON.parse(readFileSync(lockPath, 'utf8')).pid) || 0;
    if (ownerPid === process.pid) rmSync(lockPath, { force: true });
  } catch {
  }
}

function applySavedPriority() {
  const priorities = {
    Low: osConstants.priority.PRIORITY_LOW,
    'Below normal': osConstants.priority.PRIORITY_BELOW_NORMAL,
    Normal: osConstants.priority.PRIORITY_NORMAL,
    High: osConstants.priority.PRIORITY_HIGH,
  };
  let selected = 'Below normal';
  try {
    const settings = JSON.parse(readFileSync(interfaceSettingsPath, 'utf8').replace(/^\uFEFF/, ''));
    if (Object.hasOwn(priorities, settings.priority)) selected = settings.priority;
  } catch {
  }
  try {
    setPriority(0, priorities[selected]);
  } catch (error) {
    log('Could not apply saved priority.', { priority: selected, error: error.message });
  }
  return selected;
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function writeProgress(details) {
  writeFileSync(progressPath, JSON.stringify({
    updatedAt: new Date().toISOString(),
    ...details,
  }), 'utf8');
}

async function request(path, options = {}) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'User-Agent': 'MaWay2000-replay-worker/1.0',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}: ${payload.error || text}`);
  }
  return payload;
}

async function downloadReplay(url, destination) {
  const response = await fetch(url, { headers: { 'User-Agent': 'MaWay2000-replay-worker/1.0' } });
  if (!response.ok || !response.body) {
    throw new Error(`Replay download returned HTTP ${response.status}.`);
  }
  const announcedBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(announcedBytes) && announcedBytes > 512 * 1024 * 1024) {
    throw new Error('Replay exceeds the 512 MiB worker limit.');
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

async function analyzeReplay(replayPath, job) {
  const analyzerPath = join(scriptDirectory, 'analyze-replay-outcome.mjs');
  const analysisOutputPath = join(dirname(replayPath), 'analysis.json');
  const child = spawn(process.execPath, [analyzerPath, replayPath], {
    env: {
      ...process.env,
      WZ2100_BIN: config.warzonePath,
      WZ_PROGRESS_PATH: progressPath,
      WZ_REPLAY_DURATION_MS: String(Number(job.duration_ms) || ''),
      WZ_MATCH_ID: String(Number(job.id)),
      WZ_MATCH_SOURCE: String(job.source || ''),
      WZ_MATCH_MAP: String(job.map || ''),
      WZ_QUEUE_STATUS_JSON: JSON.stringify(job.queue || {}),
      WZ_ANALYSIS_OUTPUT_PATH: analysisOutputPath,
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let processError = null;
  child.stdout.on('data', (chunk) => {
    stdout = `${stdout}${chunk.toString('utf8')}`.slice(-1024 * 1024);
  });
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4000);
  });
  child.on('error', (error) => {
    processError = error;
  });
  const timeout = setTimeout(() => child.kill(), 31 * 60 * 1000);
  const result = await new Promise((resolveResult) => {
    child.once('close', (status, signal) => resolveResult({ status, signal }));
  });
  clearTimeout(timeout);
  if (processError) throw processError;
  let payload;
  try {
    payload = JSON.parse(existsSync(analysisOutputPath)
      ? readFileSync(analysisOutputPath, 'utf8')
      : stdout);
  } catch {
    throw new Error(`Analyzer returned invalid JSON (exit ${result.status}). ${stderr.trim().slice(-500)}`.trim());
  }
  if (result.status !== 0 || payload.status === 'error') {
    throw new Error(payload.error || `Analyzer exited with code ${result.status}.`);
  }
  return payload;
}

function compactAnalysis(analysis) {
  const recordedNetwork = analysis?.extended?.recordedNetwork;
  const snapshots = analysis?.extended?.snapshots;
  const positionFrames = analysis?.extended?.tacticalReplay?.positionFrames;
  if ((!recordedNetwork || typeof recordedNetwork !== 'object')
      && !Array.isArray(snapshots)
      && !Array.isArray(positionFrames)) return analysis;
  const compacted = { ...analysis.extended };
  if (recordedNetwork && typeof recordedNetwork === 'object') {
    const json = JSON.stringify(recordedNetwork);
    compacted.recordedNetworkEncoding = 'gzip+base64';
    compacted.recordedNetworkCounts = Object.fromEntries(Object.entries(recordedNetwork)
      .filter(([, value]) => Array.isArray(value))
      .map(([name, value]) => [name, value.length]));
    compacted.recordedNetworkGzipBase64 = gzipSync(json).toString('base64');
    compacted.recordedNetwork = undefined;
  }
  if (Array.isArray(snapshots)) {
    compacted.snapshotsEncoding = 'gzip+base64';
    compacted.snapshotsCount = snapshots.length;
    compacted.snapshotsGzipBase64 = gzipSync(JSON.stringify(snapshots)).toString('base64');
    compacted.snapshots = undefined;
  }
  if (Array.isArray(positionFrames)) {
    compacted.tacticalReplay = {
      ...compacted.tacticalReplay,
      positionFramesEncoding: 'gzip+base64',
      positionFramesCount: positionFrames.length,
      positionFramesGzipBase64: gzipSync(JSON.stringify(positionFrames)).toString('base64'),
      positionFrames: undefined,
    };
  }
  return {
    ...analysis,
    extended: compacted,
  };
}

async function processNextJob() {
  const response = await request('/jobs?limit=5');
  const jobs = Array.isArray(response.jobs) ? response.jobs : [];
  const queue = response.queue || null;
  const job = jobs.sort((left, right) => Number(left.duration_ms || Infinity) - Number(right.duration_ms || Infinity))[0];
  if (!job) {
    writeProgress({ state: 'idle', queue });
    return false;
  }
  job.queue = queue;

  const jobProgress = {
    state: 'analyzing',
    matchId: Number(job.id),
    source: job.source,
    map: job.map,
    elapsedMilliseconds: 0,
    totalMilliseconds: Number(job.duration_ms) || null,
    phase: 'downloading',
    queue,
  };
  writeProgress(jobProgress);
  log('Analyzing replay.', {
    matchId: Number(job.id),
    source: job.source,
    map: job.map,
    durationMilliseconds: jobProgress.totalMilliseconds,
  });
  const workDirectory = mkdtempSync(join(tmpdir(), 'maway2000-worker-'));
  const replayPath = join(workDirectory, 'match.wzrp');
  try {
    await downloadReplay(job.replay_url, replayPath);
    let analysis;
    try {
      analysis = await analyzeReplay(replayPath, job);
    } catch (error) {
      analysis = {
        status: 'error',
        evidence: 'worker_error',
        replay: { sha256: job.replay_sha256 },
        error: error instanceof Error ? error.message : String(error),
      };
    }
    const pendingPath = join(pendingDirectory, `${Number(job.id)}.json`);
    const temporaryPendingPath = `${pendingPath}.tmp`;
    analysis = compactAnalysis(analysis);
    writeFileSync(temporaryPendingPath, JSON.stringify({ matchId: Number(job.id), analysis }), 'utf8');
    renameSync(temporaryPendingPath, pendingPath);
    const accepted = await request('/results', {
      method: 'POST',
      body: readFileSync(pendingPath, 'utf8'),
    });
    rmSync(pendingPath, { force: true });
    log('Result accepted.', {
      matchId: Number(job.id),
      status: analysis.status,
      players: accepted.updatedPlayers,
      published: accepted.published,
    });
    writeProgress({
      ...jobProgress,
      state: 'completed',
      elapsedMilliseconds: analysis.game?.elapsedMilliseconds ?? jobProgress.totalMilliseconds,
      phase: 'complete',
    });
  } finally {
    const safePrefix = join(tmpdir(), 'maway2000-worker-');
    if (workDirectory.startsWith(safePrefix)) rmSync(workDirectory, { recursive: true, force: true });
  }
  return true;
}

async function submitPendingResults() {
  const pendingFiles = readdirSync(pendingDirectory).filter((name) => /^\d+\.json$/.test(name));
  for (const name of pendingFiles) {
    const pendingPath = join(pendingDirectory, name);
    const payload = JSON.parse(readFileSync(pendingPath, 'utf8'));
    payload.analysis = compactAnalysis(payload.analysis);
    writeFileSync(pendingPath, JSON.stringify(payload), 'utf8');
    const accepted = await request('/results', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    rmSync(pendingPath, { force: true });
    log('Saved result accepted.', {
      matchId: Number(payload.matchId),
      status: payload.analysis?.status,
      players: accepted.updatedPlayers,
      published: accepted.published,
    });
  }
}

if (!acquireWorkerLock()) process.exit(0);
process.on('exit', releaseWorkerLock);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

const selectedPriority = applySavedPriority();
log('Replay worker started.', {
  once,
  pollSeconds: config.pollSeconds,
  retrySeconds: config.retrySeconds,
  priority: selectedPriority,
  config: configPath,
});
if (retryFailed) {
  try {
    const result = await request('/retry-failed', { method: 'POST', body: '{}' });
    log('Failed replay jobs queued for retry.', { retried: result.retried });
    writeProgress({ state: 'idle', queue: result.queue || null });
  } catch (error) {
    log('Could not retry failed replay jobs.', { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
  process.exit();
}
do {
  try {
    await submitPendingResults();
    const processed = await processNextJob();
    if (once) break;
    if (!processed) await sleep(config.pollSeconds * 1000);
  } catch (error) {
    log('Worker cycle failed.', { error: error instanceof Error ? error.message : String(error) });
    writeProgress({ state: 'error', error: error instanceof Error ? error.message : String(error) });
    if (once) {
      process.exitCode = 1;
      break;
    }
    await sleep(config.retrySeconds * 1000);
  }
} while (true);
