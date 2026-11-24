import {moddedArcSnapshot, combineModNames, modMedals, medalPointValue, rankAllMods, replaySource, matchResults, participantResult, waveResult} from './wavehoster-data.mjs?v=20261121-arc-builds-1';
import {refreshWaveHoster} from './wavehoster-loader.mjs?v=20261117-live-1';
import {mountGameNicknames} from './player-nicknames.mjs';

let data = null;
let modData = null;
let allRanking = null;
let selected = new URLSearchParams(window.location.search).get('ruleset') || 'all';
let selectedBuild = new URLSearchParams(window.location.search).get('build') || '';
let selectedPlayer = new URLSearchParams(window.location.search).get('player');
const PAGE_SIZE = 100;
let playerLimit = PAGE_SIZE;
let matchLimit = PAGE_SIZE;
let fitMatches = true;
let visibleMatches = 0;
let totalMatches = 0;
let fitFrame = 0;
let currentRecord = null;
let loading = false;
let medals = new Map();
let medalAnchor = null;
let medalPinned = false;

const $ = id => document.getElementById(id);
const number = value => Number(value ?? 0).toLocaleString();
const rulesetLabel = group => group.name || 'Custom mod';
const isFactionsMod = group => group?.id === 'mod:FactionsMod';

function hideMedal() {
  if (medalAnchor) medalAnchor.setAttribute('aria-expanded', 'false');
  medalAnchor = null;
  medalPinned = false;
  $('waveMedalTip').hidden = true;
}

function showMedal(button, medal, pinned = false) {
  hideMedal();
  medalAnchor = button;
  medalPinned = pinned;
  const tip = $('waveMedalTip');
  tip.replaceChildren();
  const place = ['1st', '2nd', '3rd'][medal.place - 1];
  const points = medalPointValue(medal);
  for (const [tag, text] of [
    ['strong', `${place} place · ${medal.metal[0].toUpperCase() + medal.metal.slice(1)}`],
    ['span', medal.modName],
    ['span', `${number(medal.wins)} win${medal.wins === 1 ? '' : 's'} · Best score: ${medal.bestScore == null ? 'Unavailable' : number(medal.bestScore)}`],
    ['small', medal.tester ? `Tester podium · ${number(points)} medal points (30%)` :
      `Current standings · ${number(points)} medal point${points === 1 ? '' : 's'}`]
  ]) {
    const line = document.createElement(tag);
    line.textContent = text;
    tip.append(line);
  }
  tip.hidden = false;
  const rect = button.getBoundingClientRect();
  const bounds = tip.getBoundingClientRect();
  const gap = 8;
  // The shell grows its iframe to the full table height; clamp to the part of
  // that iframe actually visible in the parent viewport, not all 100 rows.
  const frame = window.frameElement?.getBoundingClientRect();
  const topEdge = frame ? Math.max(gap, gap - frame.top) : gap;
  const bottomEdge = frame ? Math.min(window.innerHeight, window.parent.innerHeight - frame.top) - gap : window.innerHeight - gap;
  tip.style.left = `${Math.max(gap, Math.min(rect.left, window.innerWidth - bounds.width - gap))}px`;
  const below = rect.bottom + gap;
  tip.style.top = `${Math.max(topEdge, below + bounds.height <= bottomEdge ? below : rect.top - bounds.height - gap)}px`;
  button.setAttribute('aria-expanded', 'true');
}

function appendMedals(name, player, all) {
  const awards = (medals.get(player.id) || []).filter(medal => all || medal.modId === selected);
  if (!awards.length) return;
  const list = document.createElement('span');
  list.className = 'wave-medals';
  for (const medal of awards) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = medal.tester ? 'wave-medal wave-medal-tester' : 'wave-medal';
    button.setAttribute('aria-label', `${medal.modName} · ${['1st', '2nd', '3rd'][medal.place - 1]} place · ${medal.metal} ${medal.tester ? 'tester medal' : 'medal'}`);
    button.setAttribute('aria-controls', 'waveMedalTip');
    button.setAttribute('aria-describedby', 'waveMedalTip');
    button.setAttribute('aria-expanded', 'false');
    const icon = document.createElement('img');
    icon.src = `assets/medals/${medal.metal}.svg`;
    icon.alt = '';
    icon.width = 20;
    icon.height = 24;
    button.append(icon);
    button.addEventListener('mouseenter', () => { if (!medalPinned) showMedal(button, medal); });
    button.addEventListener('mouseleave', () => { if (!medalPinned && document.activeElement !== button) hideMedal(); });
    button.addEventListener('focus', () => { if (!medalPinned) showMedal(button, medal); });
    button.addEventListener('blur', () => { if (medalAnchor === button) hideMedal(); });
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (medalAnchor === button && medalPinned) hideMedal();
      else showMedal(button, medal, true);
    });
    list.append(button);
  }
  name.append(list);
}

function profileUrl(playerId) {
  const url = new URL('index.html', window.location.href);
  url.searchParams.set('tab', 'wavehoster');
  url.searchParams.set('ruleset', selected);
  if (selectedBuild) url.searchParams.set('build', selectedBuild);
  if (playerId) url.searchParams.set('player', playerId);
  return url;
}

function syncSelection() {
  const url = new URL(window.location.href);
  url.searchParams.set('ruleset', selected);
  if (selectedBuild) url.searchParams.set('build', selectedBuild);
  else url.searchParams.delete('build');
  if (selectedPlayer) url.searchParams.set('player', selectedPlayer);
  else url.searchParams.delete('player');
  window.history.replaceState(null, '', url);
  window.bohaEmbeddedPage?.postState(url.search);
}

function selectPlayer(id) {
  selectedPlayer = selectedPlayer === id ? null : id;
  matchLimit = selectedPlayer ? PAGE_SIZE : playerLimit;
  fitMatches = true;
  syncSelection();
  render();
  if (!selectedPlayer) return;
  requestAnimationFrame(() => {
    const profile = $('waveProfile');
    if (!selectedPlayer || profile.hidden) return;
    const top = profile.getBoundingClientRect().top + window.scrollY;
    if (window !== window.parent) {
      window.parent.postMessage({type: 'boha:scroll-content-to', top}, window.location.origin);
    } else window.scrollTo({top, behavior: 'instant'});
  });
}

function identityDetails(player) {
  const row = document.createElement('tr');
  row.className = 'stats-detail-row wave-identity-row';
  row.id = 'waveIdentity-' + player.id;
  const td = document.createElement('td');
  td.colSpan = 7;
  const content = document.createElement('div');
  content.className = 'wave-identity-details';
  const status = document.createElement('span');
  status.className = 'wave-copy-status';
  status.setAttribute('role', 'status');
  function copyButton(value, className, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className + ' stats-copy-chip';
    button.title = 'Click to copy';
    button.setAttribute('aria-label', label);
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(value);
        status.textContent = 'Copied';
        button.classList.add('is-copied');
      } catch {
        status.textContent = 'Could not copy. Select the text to copy it.';
      }
    });
    return button;
  }
  function group(label, listClass) {
    const group = document.createElement('div');
    group.className = 'stats-detail-group';
    const heading = document.createElement('span');
    heading.className = 'stats-detail-label';
    heading.textContent = label;
    const list = document.createElement('div');
    list.className = listClass;
    group.append(heading, list);
    content.append(group);
    return list;
  }
  const names = group('Player names', 'stats-name-list');
  for (const alias of player.names || [{name: player.name, games: player.games}]) {
    const chip = copyButton(alias.name, 'stats-name-chip' + (alias.name === player.name ? ' is-primary' : ''), 'Copy alias ' + alias.name);
    const text = document.createElement('span');
    text.className = 'stats-name-text';
    text.textContent = alias.name;
    const count = document.createElement('sup');
    count.className = 'stats-name-count';
    count.textContent = number(alias.games);
    chip.append(text, count);
    names.append(chip);
  }
  if (player.identityVerified === true) {
    const recent = document.createElement('div');
    recent.className = 'stats-detail-group';
    content.append(recent);
    mountGameNicknames(recent, {arcId: player.id});
  }
  const publicKeys = player.publicKeys || [];
  const keys = group(`${publicKeys.length} key(s) tracked`, 'stats-key-list');
  for (const key of publicKeys) {
    const button = copyButton(key, 'stats-key-item', 'Copy public key');
    const code = document.createElement('code');
    code.className = 'stats-key-value';
    code.textContent = key;
    button.append(code);
    keys.append(button);
  }
  if (!publicKeys.length) keys.textContent = 'No verified public key recorded.';
  content.append(status);
  td.append(content);
  row.append(td);
  return row;
}

function cell(row, value, className = '') {
  const td = document.createElement('td');
  td.textContent = value;
  if (className) td.className = className;
  row.append(td);
  return td;
}

function updatedLabel(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function render() {
  if (!data) return;
  hideMedal();
  const all = selected === 'all';
  const scope = modData;
  const mod = all ? allRanking : scope.groups.find(item => item.id === selected);
  if (!mod) return;
  const build = mod.builds?.find(item => item.id === selectedBuild);
  const group = build || mod;
  const versionRanking = !build && !!mod.currentPodium;
  const groupIds = build ? new Set(build.groupIds) : null;
  const scopedGames = scope.games.filter(game => (all || game.group === selected) && (!groupIds || groupIds.has(game.build)));
  const profile = group.players.find(player => player.id === selectedPlayer);
  if (!profile) selectedPlayer = null;
  $('waveRuleset').value = selected;
  $('waveFactionsGuide').hidden = !isFactionsMod(mod);
  $('waveTotal').textContent = number(scopedGames.length);
  $('waveGroups').textContent = number(scope.groups.length);
  $('waveConfirmed').textContent = number(group.confirmed);
  $('waveWaiting').textContent = number(scopedGames.filter(game => game.status === 'pending').length);
  $('waveRuleSummary').textContent = all
    ? `All ${number(modData.groups.length)} mods · ${number(group.confirmed)} verified / ${number(group.matches)} replays`
    : `${rulesetLabel(mod)}${build ? ` · ${buildLabel(build)}` : ''} · ${number(group.confirmed)} verified / ${number(group.matches)} replays`;
  $('waveRankingNote').textContent = all
    ? 'Ranked by medal points (gold 3, silver 2, bronze 1), then games played, then kills. Tester medals are worth 30%.'
    : versionRanking
      ? 'Ranked by newest version won, then wins and best winning score on that version. Smaller medals mark the tester podium.'
      : 'Recorded departures count as defeats. Only verified final results add scores and kills.';
  $('waveProfileNote').textContent = all ? 'Stats and match history across all mods.' :
    build ? 'Stats and match history for this build.' : 'Stats and match history for this mod.';

  const scoreHeading = $('waveRankingScore');
  const winHeading = $('waveRankingWin');
  scoreHeading.textContent = all ? 'Medal pts ↓' : 'Best score';
  winHeading.textContent = all || versionRanking ? 'Win' : 'Win ↓';
  scoreHeading.setAttribute('aria-sort', all ? 'descending' : 'none');
  winHeading.setAttribute('aria-sort', all || versionRanking ? 'none' : 'descending');
  const scoreKey = all ? 'medalPoints' : 'bestScore';
  const query = $('wavePlayerSearch').value.trim().toLocaleLowerCase();
  const players = group.players
    .map((player, index) => ({player, rank: index + 1}))
    .filter(({player}) => [player.name, ...(player.names || []).map(alias => alias.name), ...(player.publicKeys || [])]
      .some(value => value.toLocaleLowerCase().includes(query)));
  $('wavePlayers').replaceChildren();
  $('waveEmpty').hidden = players.length > 0;
  $('waveEmptyTitle').textContent = group.players.length > 0 ? 'No matching players' : 'Results are being verified';
  $('waveEmptyMessage').textContent = group.players.length > 0
    ? 'Try another nickname or clear the player search.'
    : 'Players join this board after a complete result is verified with the recorded mods loaded.';

  players.slice(0, playerLimit).forEach(({player, rank}) => {
    const row = document.createElement('tr');
    row.classList.toggle('wave-selected', player.id === selectedPlayer);
    const expanded = player.id === selectedPlayer;
    row.classList.toggle('is-expanded', expanded);
    cell(row, rank);
    const name = cell(row, '', 'wave-player-cell');
    const link = document.createElement('a');
    link.className = 'wave-player-link';
    link.textContent = player.name;
    link.href = profileUrl(expanded ? null : player.id).href;
    link.target = '_top';
    link.setAttribute('aria-expanded', String(expanded));
    link.setAttribute('aria-controls', 'waveIdentity-' + player.id);
    if (player.id === selectedPlayer) link.setAttribute('aria-current', 'true');
    name.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectPlayer(player.id);
    });
    name.append(link);
    appendMedals(name, player, all);
    if (!player.identityVerified) {
      const note = document.createElement('span');
      note.className = 'wave-name-note';
      note.textContent = 'unverified nickname';
      name.append(note);
    }
    for (const key of [scoreKey, 'games', 'wins', 'losses', 'kills']) {
      cell(row, player[key] === null ? '—' : number(player[key]), key === scoreKey ? 'wave-score' : key === 'wins' ? 'wave-wins' : '');
    }
    $('wavePlayers').append(row);
    if (expanded) $('wavePlayers').append(identityDetails(player));
  });
  $('wavePlayersMore').hidden = players.length <= playerLimit;

  $('waveProfile').hidden = !profile;
  $('waveProfileMetrics').replaceChildren();
  if (profile) {
    $('waveProfileName').textContent = profile.name;
    const metrics = [
      ['Rank', '#' + (group.players.indexOf(profile) + 1)],
      ['Games', number(profile.games)],
      ['Win / Lost / Draw', `${number(profile.wins)} / ${number(profile.losses)} / ${number(profile.draws)}`],
      ['Win rate', `${Math.round(profile.wins / Math.max(1, profile.games) * 100)}%`],
      [all ? 'Medal points' : 'Best score', profile[scoreKey] === null ? '—' : number(profile[scoreKey])],
      ['Total kills', number(profile.kills)]
    ];
    for (const [label, value] of metrics) {
      const card = document.createElement('article');
      const caption = document.createElement('span');
      caption.textContent = label;
      const stat = document.createElement('strong');
      stat.textContent = value;
      card.append(caption, stat);
      $('waveProfileMetrics').append(card);
    }
  }
  const header = document.createElement('tr');
  const headings = profile ? ['Date ↓', 'Mod', 'Result', 'Score', 'Time', 'Kills'] : ['Date ↓', 'Mod', 'Players', 'Time', 'Results'];
  headings.push('Statistics');
  for (const label of headings) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    header.append(th);
  }
  $('waveMatchesHead').replaceChildren(header);
  const games = scopedGames.filter(game => !profile || game.participants?.some(player => player.id === profile.id));
  $('waveMatches').replaceChildren();
  games.slice(0, matchLimit).forEach(game => {
    const row = document.createElement('tr');
    cell(row, game.startedAt ? new Date(game.startedAt).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Unknown date');
    const ruleset = scope.groups.find(group => group.id === game.group);
    const modName = ruleset ? rulesetLabel(ruleset) : 'Unknown';
    const modCell = cell(row, isFactionsMod(ruleset) ? '' : modName, 'wave-mod-cell');
    if (isFactionsMod(ruleset)) {
      const link = document.createElement('a');
      link.className = 'wave-guide-link';
      link.href = 'factionsmod.html';
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = modName;
      link.setAttribute('aria-label', 'FactionsMod guide (opens in a new tab)');
      modCell.append(link);
    }
    const participant = profile ? game.participants.find(player => player.id === profile.id) : null;
    if (participant) {
      const wave = waveResult(game);
      const outcome = wave?.result || participantResult(game, participant);
      const result = wave?.label || (participant.resultReason === 'departure' ? 'Left game (loss)' : ({winner: 'Win', loser: 'Lost', contender: 'Draw'})[outcome]) || 'Result unavailable';
      cell(row, result, 'wave-result-' + outcome);
      cell(row, participant.score === null ? '—' : number(participant.score));
    } else cell(row, game.players.join(', ') || 'No human player recorded');
    const seconds = Math.floor(game.durationMilliseconds / 1000);
    cell(row, `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    if (participant) cell(row, participant.kills === null ? '—' : number(participant.kills));
    else {
      const results = cell(row, '');
      for (const result of matchResults(game)) {
        const label = document.createElement('span');
        label.className = 'wave-match-result wave-result-' + result.result;
        if (result.title) label.title = result.title;
        label.textContent = result.label;
        results.append(label);
      }
    }
    const source = replaySource(game);
    const action = cell(row, source ? '' : '—');
    if (source) {
      const link = document.createElement('a');
      const url = profileUrl(selectedPlayer);
      url.searchParams.set('replay', source.replayUrl);
      link.href = url.href;
      link.target = '_top';
      link.className = 'stats-replay-link';
      link.textContent = 'Analyze';
      link.setAttribute('aria-label', 'Analyze match on ' + game.map);
      link.dataset.replayAnalyzerUrl = source.replayUrl;
      link.dataset.replaySourceLabel = source.sourceLabel;
      link.dataset.replaySourceUrl = source.sourceUrl;
      link.addEventListener('click', event => {
        if (window.parent === window || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.parent.postMessage({type: 'boha:open-replay-analyzer', ...source}, window.location.origin);
      });
      action.append(link);
    }
    $('waveMatches').append(row);
  });
  totalMatches = games.length;
  visibleMatches = Math.min(totalMatches, matchLimit);
  $('waveMore').hidden = totalMatches <= visibleMatches;
  $('waveUpdated').textContent = updatedLabel(data.generatedAt);
  $('waveUpdated').title = new Date(data.generatedAt).toLocaleString();
  scheduleMatchFit();
}

function scheduleMatchFit() {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => {
    fitFrame = 0;
    const wrap = $('waveMatchesWrap');
    const rows = [...$('waveMatches').children];
    for (const row of rows) if (row.hidden) row.hidden = false;
    wrap.style.minHeight = '';
    visibleMatches = rows.length;
    if (fitMatches && !selectedPlayer && $('wavePlayers').children.length && window.matchMedia('(min-width: 1121px)').matches) {
      const height = $('wavePlayersWrap').getBoundingClientRect().height;
      const top = wrap.getBoundingClientRect().top;
      const edge = height - (wrap.offsetHeight - wrap.clientHeight) + wrap.clientTop;
      // Read every row before hiding any, so the cutoff uses the original layout.
      const bottoms = rows.map(row => row.getBoundingClientRect().bottom - top);
      const overflow = bottoms.findIndex(bottom => bottom > edge);
      visibleMatches = overflow < 0 ? rows.length : Math.max(1, overflow);
      rows.slice(visibleMatches).forEach(row => { row.hidden = true; });
      if (visibleMatches < totalMatches) wrap.style.minHeight = `${Math.ceil(height)}px`;
    }
    $('waveMore').hidden = totalMatches <= visibleMatches;
  });
}

function buildLabel(build) {
  if (build.modVersion) return `v${build.modVersion}`;
  if (!build.firstPlayed) return `Build ${build.id.slice(0, 7)}`;
  return new Date(build.firstPlayed).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
}

function renderBuildOptions() {
  const builds = modData.groups.find(group => group.id === selected)?.builds || [];
  const select = $('waveBuild');
  select.replaceChildren();
  $('waveBuildControl').hidden = builds.length < 2;
  if (builds.length < 2 || !builds.some(build => build.id === selectedBuild)) selectedBuild = '';
  for (const [id, label] of [['', 'All builds'], ...builds.map(build => [build.id, buildLabel(build)])]) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    select.append(option);
  }
  select.value = selectedBuild;
}

function renderOptions() {
  $('waveRuleset').replaceChildren();
  function option(value, text) {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = text;
    $('waveRuleset').append(element);
  }
  option('all', 'ALL');
  for (const group of modData.groups) option(group.id, rulesetLabel(group));
  $('waveRuleset').value = selected;
  renderBuildOptions();
}

function updateStatsSource(source) {
  const status = $('waveHostSync');
  const labels = {live: 'Live host', 'saved-host': 'Saved host', github: 'GitHub'};
  const label = labels[source] || '—';
  if (status.textContent !== label) status.textContent = label;
}

async function load() {
  if (loading) return;
  loading = true;
  try {
    const waitForSelection = !currentRecord && (selected !== 'all' || selectedPlayer);
    const showRecord = record => {
      data = record.snapshot;
      const legacyWaveDefense = selected === 'beta' || selected === 'mod:BOHA-Wave-Defense';
      const previous = legacyWaveDefense ? 'mod:Wave-Defense' : selected;
      const arc = moddedArcSnapshot(data);
      modData = combineModNames(arc);
      medals = modMedals(modData.groups);
      allRanking = rankAllMods(modData, medals);
      selected = previous === 'all' ? previous
        : modData.groups.find(group => group.id === previous || group.groupIds.includes(previous))?.id || 'all';
      renderOptions();
      render();
      if (legacyWaveDefense) syncSelection();
    };
    const result = await refreshWaveHoster({current: currentRecord, onUpdate(record) {
      if (!waitForSelection) {
        showRecord(record);
        updateStatsSource(record.source);
      }
    }});
    currentRecord = result.record;
    if (data !== currentRecord.snapshot) showRecord(currentRecord);
    updateStatsSource(currentRecord.source === 'live' && !result.liveAvailable ? 'saved-host' : currentRecord.source);
    $('waveError').textContent = '';
    const updated = updatedLabel(data.generatedAt);
    if ($('waveUpdated').textContent !== updated) $('waveUpdated').textContent = updated;
  } catch (error) {
    $('waveError').textContent = error.message;
    if (!data) $('waveUpdated').textContent = 'Unavailable';
  } finally { loading = false; }
}

document.addEventListener('pointerdown', event => {
  if (medalAnchor && !medalAnchor.contains(event.target)) hideMedal();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideMedal(); });
window.addEventListener('scroll', hideMedal, true);
window.addEventListener('resize', hideMedal);

function applyScopeSelection() {
  selectedPlayer = null;
  playerLimit = PAGE_SIZE;
  matchLimit = PAGE_SIZE;
  fitMatches = true;
  syncSelection();
  render();
}
$('waveRuleset').addEventListener('change', () => {
  selected = $('waveRuleset').value;
  selectedBuild = '';
  renderBuildOptions();
  applyScopeSelection();
});
$('waveBuild').addEventListener('change', () => {
  selectedBuild = $('waveBuild').value;
  applyScopeSelection();
});
$('waveClearPlayer').addEventListener('click', () => selectPlayer(null));
$('wavePlayerSearch').addEventListener('input', () => {
  playerLimit = PAGE_SIZE;
  matchLimit = PAGE_SIZE;
  fitMatches = true;
  render();
});
$('wavePlayersMore').addEventListener('click', () => {
  playerLimit += PAGE_SIZE;
  if (fitMatches && !selectedPlayer) matchLimit = playerLimit;
  render();
});
$('waveMore').addEventListener('click', () => {
  matchLimit = visibleMatches + PAGE_SIZE;
  fitMatches = false;
  render();
});
let layoutWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === layoutWidth) return;
  layoutWidth = window.innerWidth;
  scheduleMatchFit();
});
document.fonts?.ready.then(scheduleMatchFit);

load();
setInterval(() => { if (!document.hidden) load(); }, 30000);

