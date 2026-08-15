#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { decodeReplayNetwork } from './decode-replay-network.mjs';

const ANALYZER_VERSION = '3.2.0';
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ANALYZER_MOD_DIRECTORY = resolve(SCRIPT_DIRECTORY, '..', 'analyzer-mod');
const SNAPSHOT_INTERVAL_SECONDS = Math.min(60, Math.max(5,
  Number(process.env.WZ_SNAPSHOT_INTERVAL_SECONDS) || 15));

function outputResult(result, pretty = false) {
  const output = `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`;
  if (process.env.WZ_ANALYSIS_OUTPUT_PATH) {
    writeFileSync(process.env.WZ_ANALYSIS_OUTPUT_PATH, output, 'utf8');
  } else {
    process.stdout.write(output);
  }
}

function fail(message, details = undefined) {
  const result = { status: 'error', error: message };
  if (details) result.details = details;
  outputResult(result, true);
  process.exitCode = 1;
}

function findWarzone() {
  const candidates = [
    process.env.WZ2100_BIN,
    process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'warzone2100.exe')
      : null,
    process.platform === 'win32' ? 'warzone2100.exe' : 'warzone2100',
  ].filter(Boolean);

  return candidates.find((candidate) => !candidate.includes('\\') && !candidate.includes('/') || existsSync(candidate));
}

function extractExtendedReport(logText) {
  const match = logText.match(/__REPORTextended__(.*?)__ENDREPORTextended__/s);
  if (!match) return null;
  return JSON.parse(match[1]);
}

function extractPeriodicReports(logText) {
  return [...logText.matchAll(/__REPORT__(.*?)__ENDREPORT__/gs)].map((match) => JSON.parse(match[1]));
}

function extractTacticalFrames(debugText) {
  return [...debugText.matchAll(/__WZTACTICAL__(.*?)__ENDWZTACTICAL__/gs)].map((match) => JSON.parse(match[1]));
}

function readTacticalFrames(logsDir) {
  if (!existsSync(logsDir)) return [];
  return readdirSync(logsDir)
    .filter((name) => /^init\.\d+\.log$/i.test(name))
    .flatMap((name) => extractTacticalFrames(readFileSync(join(logsDir, name), 'utf8')))
    .sort((left, right) => left.time - right.time);
}

function prepareEngineReplay(replayBuffer) {
  if (replayBuffer.length < 12 || replayBuffer.readUInt32BE(0) !== 0x575a7270) {
    return { buffer: replayBuffer, omittedModHashes: [] };
  }
  const headerLength = replayBuffer.readUInt32BE(4);
  const header = JSON.parse(replayBuffer.subarray(8, 8 + headerLength).toString('utf8'));
  const modHashes = Array.isArray(header.gameOptions?.game?.modHashes)
    ? header.gameOptions.game.modHashes.filter(Boolean)
    : [];
  if (modHashes.length === 0) return { buffer: replayBuffer, omittedModHashes: [] };

  // Downloaded multiplayer mods are transferred by the original host but are not
  // embedded in a replay archive. Removing only their availability requirement lets
  // Warzone replay the already-recorded deterministic network command stream.
  header.gameOptions.game.modHashes = [];
  const updatedHeader = Buffer.from(JSON.stringify(header), 'utf8');
  const updatedReplay = Buffer.alloc(8 + updatedHeader.length + replayBuffer.length - 8 - headerLength);
  replayBuffer.copy(updatedReplay, 0, 0, 4);
  updatedReplay.writeUInt32BE(updatedHeader.length, 4);
  updatedHeader.copy(updatedReplay, 8);
  replayBuffer.copy(updatedReplay, 8 + updatedHeader.length, 8 + headerLength);
  return { buffer: updatedReplay, omittedModHashes: modHashes };
}

function writeAnalyzerProgress(details) {
  const progressPath = process.env.WZ_PROGRESS_PATH;
  if (!progressPath) return;
  let queue = null;
  try {
    queue = JSON.parse(process.env.WZ_QUEUE_STATUS_JSON || 'null');
  } catch {
  }
  writeFileSync(progressPath, JSON.stringify({
    state: 'analyzing',
    updatedAt: new Date().toISOString(),
    matchId: Number(process.env.WZ_MATCH_ID) || null,
    source: process.env.WZ_MATCH_SOURCE || null,
    map: process.env.WZ_MATCH_MAP || null,
    queue,
    ...details,
  }), 'utf8');
}

function latestGameTime(logsDir) {
  if (!existsSync(logsDir)) return null;
  const logName = readdirSync(logsDir).find((name) => /^gamelog_.*\.log$/i.test(name));
  if (!logName) return null;
  const buffer = readFileSync(join(logsDir, logName));
  const tail = buffer.subarray(Math.max(0, buffer.length - 1024 * 1024)).toString('utf8');
  const reports = extractPeriodicReports(tail);
  return reports.at(-1)?.gameTime ?? null;
}

async function runWarzone(warzone, args, workDir) {
  const logsDir = join(workDir, 'logs');
  const debugPath = join(workDir, 'warzone.log');
  const totalMilliseconds = Number(process.env.WZ_REPLAY_DURATION_MS) || null;
  const startedAt = Date.now();
  const child = spawn(warzone, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  let processError = null;
  let timedOut = false;
  let replayLoadError = null;
  let lastGameTime = -1;

  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4000);
  });
  child.stdout.resume();
  child.on('error', (error) => {
    processError = error;
  });

  const progressTimer = setInterval(() => {
    try {
      if (existsSync(debugPath)) {
        const debugTail = readFileSync(debugPath, 'utf8').slice(-16000);
        if (/Could not load replay file|Failed to load a save game/i.test(debugTail)) {
          replayLoadError = 'Warzone rejected the replay before playback started.';
          child.kill();
          return;
        }
      }
      const gameTime = latestGameTime(logsDir);
      if (Number.isFinite(gameTime) && gameTime !== lastGameTime) {
        lastGameTime = gameTime;
        writeAnalyzerProgress({ elapsedMilliseconds: gameTime, totalMilliseconds, phase: 'replay' });
      } else if (lastGameTime < 0 && Date.now() - startedAt > 2 * 60 * 1000) {
        replayLoadError = 'Warzone did not start replay playback within two minutes.';
        child.kill();
      }
    } catch {
      // A partially written log record will be retried on the next update.
    }
  }, 1500);

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 30 * 60 * 1000);

  const completion = await new Promise((resolveCompletion) => {
    child.once('close', (status, signal) => resolveCompletion({ status, signal }));
  });
  clearInterval(progressTimer);
  clearTimeout(timeout);

  return {
    ...completion,
    error: processError
      || (replayLoadError ? new Error(replayLoadError) : null)
      || (timedOut ? new Error('Warzone replay analysis timed out.') : null),
    stderr,
  };
}

function normalizeSnapshotPlayer(player) {
  return {
    position: player.position,
    state: player.usertype || 'unknown',
    score: player.score ?? null,
    kills: player.kills ?? null,
    structureKills: player.structureKills ?? null,
    droidsBuilt: player.droidsBuilt ?? null,
    droidsLost: player.droidsLost ?? null,
    droidsAlive: player.droids ?? null,
    structuresBuilt: player.structuresBuilt ?? null,
    structuresLost: player.structuresLost ?? null,
    structuresAlive: player.structs ?? null,
    researchComplete: player.researchComplete ?? null,
    power: player.power ?? null,
    oilRigs: player.oilRigs ?? null,
    healthPercent: player.hp ?? null,
    experience: player.summExp ?? null,
    recentPowerLost: player.recentPowerLost ?? null,
    recentDroidPowerLost: player.recentDroidPowerLost ?? null,
    recentStructurePowerLost: player.recentStructurePowerLost ?? null,
    recentPowerWon: player.recentPowerWon ?? null,
    recentResearchPerformance: player.recentResearchPerformance ?? null,
    recentResearchPotential: player.recentResearchPotential ?? null,
  };
}

const replayArgument = process.argv[2];
if (!replayArgument) {
  fail('Usage: node analyze-replay-outcome.mjs <replay.wzrp>');
} else {
  const replayPath = resolve(replayArgument);
  if (!existsSync(replayPath)) {
    fail(`Replay not found: ${replayPath}`);
  } else {
    const warzone = findWarzone();
    if (!warzone) {
      fail('Warzone 2100 was not found. Set WZ2100_BIN to the executable path.');
    } else {
      const replayBuffer = readFileSync(replayPath);
      const engineReplay = prepareEngineReplay(replayBuffer);
      let recordedNetwork = null;
      try {
        recordedNetwork = decodeReplayNetwork(replayBuffer);
      } catch (error) {
        recordedNetwork = { error: error.message || 'Replay network decoding failed.' };
      }
      const workDir = mkdtempSync(join(tmpdir(), 'wzstats-outcome-'));
      const replayDir = join(workDir, 'replay', 'multiplay');
      const analyzerScriptDir = join(workDir, 'multiplay');
      const debugPath = join(workDir, 'warzone.log');
      const startedAt = Date.now();

      try {
        mkdirSync(replayDir, { recursive: true });
        cpSync(join(ANALYZER_MOD_DIRECTORY, 'multiplay'), analyzerScriptDir, { recursive: true });
        writeFileSync(join(replayDir, 'probe.wzrp'), engineReplay.buffer);

        writeAnalyzerProgress({
          elapsedMilliseconds: 0,
          totalMilliseconds: Number(process.env.WZ_REPLAY_DURATION_MS) || null,
          phase: 'starting',
        });
        const run = await runWarzone(warzone, [
          `--configdir=${workDir}`,
          '--loadreplay=probe',
          '--autogame',
          '--headless',
          '--nosound',
          '--noassert',
          '--debug=error',
          '--flush-debug-stderr',
          '--gamelog-output=log',
          `--gamelog-frameinterval=${SNAPSHOT_INTERVAL_SECONDS}`,
          `--debugfile=${debugPath}`,
        ], workDir);

        if (run.error || run.status !== 0) {
          fail('Warzone could not complete the replay.', {
            exitCode: run.status,
            signal: run.signal,
            message: run.error?.message,
            stderr: run.stderr?.trim().slice(-2000),
          });
        } else {
          const logsDir = join(workDir, 'logs');
          const logName = existsSync(logsDir)
            ? readdirSync(logsDir).find((name) => /^gamelog_.*\.log$/i.test(name))
            : null;
          const logText = logName ? readFileSync(join(logsDir, logName), 'utf8') : '';
          const report = extractExtendedReport(logText);
          const tacticalFrames = readTacticalFrames(logsDir);

          if (!report || !Array.isArray(report.playerData)) {
            fail('Warzone completed without a final extended game report.');
          } else {
            writeAnalyzerProgress({
              elapsedMilliseconds: report.game?.timeGameEnd ?? report.gameTime ?? null,
              totalMilliseconds: Number(process.env.WZ_REPLAY_DURATION_MS) || (report.game?.timeGameEnd ?? report.gameTime ?? null),
              phase: 'finalizing',
            });
            const players = report.playerData.map((player) => ({
              index: player.index,
              position: player.position,
              name: player.name,
              publicKey: player.publicKey || null,
              team: player.team,
              state: player.usertype || 'unknown',
              leftAtMilliseconds: player.playerLeftGameTime ?? null,
              droidsAlive: player.droids ?? null,
              structuresAlive: player.structs ?? null,
              droidsBuilt: player.droidsBuilt ?? null,
              droidsLost: player.droidsLost ?? null,
              structuresBuilt: player.structuresBuilt ?? null,
              structuresLost: player.structuresLost ?? null,
              kills: player.kills ?? null,
              structureKills: player.structureKills ?? null,
              researchComplete: player.researchComplete ?? null,
              power: player.power ?? null,
              oilRigs: player.oilRigs ?? null,
              healthPercent: player.hp ?? null,
              experience: player.summExp ?? null,
              faction: player.faction ?? null,
              colour: player.colour ?? null,
              recentDroidPowerLost: player.recentDroidPowerLost ?? null,
              recentStructurePowerLost: player.recentStructurePowerLost ?? null,
              recentPowerLost: player.recentPowerLost ?? null,
              recentPowerWon: player.recentPowerWon ?? null,
              recentResearchPerformance: player.recentResearchPerformance ?? null,
              recentResearchPotential: player.recentResearchPotential ?? null,
              score: player.score ?? null,
            }));
            const winners = players.filter((player) => player.state === 'winner');
            const losers = players.filter((player) => player.state === 'loser');
            const confirmed = winners.length > 0 && losers.length > 0;

            const result = {
              analyzerVersion: ANALYZER_VERSION,
              status: confirmed ? 'confirmed' : 'unknown',
              evidence: confirmed
                ? (engineReplay.omittedModHashes.length > 0
                    ? 'warzone_engine_final_state_without_unavailable_replay_mods'
                    : 'warzone_engine_final_state')
                : 'no_final_winner_state',
              replay: {
                file: basename(replayPath),
                sha256: createHash('sha256').update(replayBuffer).digest('hex'),
                engineReplayModified: engineReplay.omittedModHashes.length > 0,
                omittedModHashes: engineReplay.omittedModHashes,
              },
              game: {
                version: report.game?.version ?? null,
                map: report.game?.mapName ?? null,
                mapHash: report.game?.mapHash ?? null,
                elapsedMilliseconds: report.game?.timeGameEnd ?? report.gameTime ?? null,
                timeout: report.game?.timeout ?? null,
                cheated: report.game?.cheated ?? null,
              },
              teams: [...new Set(players.map((player) => player.team))].map((team) => ({
                team,
                state: players.find((player) => player.team === team)?.state || 'unknown',
                playerIndexes: players.filter((player) => player.team === team).map((player) => player.index),
              })),
              players,
              extended: {
                researchTimeline: (Array.isArray(report.researchComplete) ? report.researchComplete : []).map((event) => ({
                  timeMilliseconds: event.time ?? null,
                  position: event.position ?? null,
                  research: event.name ?? null,
                  structureId: event.struct ?? null,
                })),
                snapshots: extractPeriodicReports(logText).map((snapshot) => ({
                  timeMilliseconds: snapshot.gameTime ?? null,
                  players: (Array.isArray(snapshot.playerData) ? snapshot.playerData : []).map(normalizeSnapshotPlayer),
                })),
                frameIntervalSeconds: SNAPSHOT_INTERVAL_SECONDS,
                recordedNetwork,
                tacticalReplay: {
                  mode: tacticalFrames.length > 0 ? 'exact-object-positions' : 'commands-and-aggregate-snapshots',
                  exactObjectPositions: tacticalFrames.length > 0,
                  aggregateFrameIntervalSeconds: SNAPSHOT_INTERVAL_SECONDS,
                  positionFrameIntervalSeconds: tacticalFrames[0]?.interval ? tacticalFrames[0].interval / 1000 : null,
                  positionFrameSchema: tacticalFrames.length > 0 ? {
                    droids: ['id', 'player', 'x', 'y', 'health', 'droidType', 'order'],
                    structures: ['id', 'player', 'x', 'y', 'health', 'statType', 'status'],
                  } : null,
                  positionFrames: tacticalFrames,
                  commandEventCounts: recordedNetwork?.error ? null : {
                    production: recordedNetwork.productionTimeline?.length || 0,
                    construction: recordedNetwork.constructionOrders?.length || 0,
                    attack: recordedNetwork.attackOrders?.length || 0,
                    research: recordedNetwork.researchOrders?.length || 0,
                    departures: recordedNetwork.playerDepartures?.length || 0,
                  },
                },
                availability: {
                  researchTimeline: true,
                  aggregateSnapshots: true,
                  snapshotIntervalSeconds: SNAPSHOT_INTERVAL_SECONDS,
                  buildAndLossDeltasFromSnapshots: true,
                  exactUnitPositions: tacticalFrames.length > 0,
                  exactStructurePositions: tacticalFrames.length > 0,
                  commandDestinations: !recordedNetwork?.error,
                  individualUnitTypes: false,
                  individualWeaponStatistics: false,
                  damageDealt: false,
                  chatMessages: !recordedNetwork?.error,
                  exactDefeatReason: false,
                  remainingFactories: false,
                  inactivityDefeatDetails: false,
                  unitDesignsFromManufactureCommands: !recordedNetwork?.error,
                  constructionOrderTimeline: !recordedNetwork?.error,
                  attackOrderTimeline: !recordedNetwork?.error,
                  playerActivityFromCommands: !recordedNetwork?.error,
                },
              },
              analysisMilliseconds: Date.now() - startedAt,
            };
            outputResult(result);
          }
        }
      } finally {
        const safePrefix = join(tmpdir(), 'wzstats-outcome-');
        if (process.env.WZ_KEEP_WORKDIR === '1') {
          process.stderr.write(`Analyzer work directory retained at ${workDir}\n`);
        } else if (workDir.startsWith(safePrefix)) {
          rmSync(workDir, { recursive: true, force: true });
        }
      }
    }
  }
}
