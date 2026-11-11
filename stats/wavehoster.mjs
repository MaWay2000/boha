import {combineRulesets} from './wavehoster-data.mjs';

let data = null;
const rulesetNames = new Map();
let selected = new URLSearchParams(window.location.search).get('ruleset') || 'all';
let selectedPlayer = new URLSearchParams(window.location.search).get('player');
const expandedPlayers = new Set(selectedPlayer ? [selectedPlayer] : []);
let limit = 25;

const $ = id => document.getElementById(id);
const number = value => Number(value ?? 0).toLocaleString();
const rulesetLabel = group => `${rulesetNames.get(group.id) || 'Custom mod'} · ${group.version}`;

function profileUrl(playerId) {
  const url = new URL('index.html', window.location.href);
  url.searchParams.set('tab', 'wavehoster');
  url.searchParams.set('ruleset', selected);
  if (playerId) url.searchParams.set('player', playerId);
  return url;
}

function syncSelection() {
  const url = new URL(window.location.href);
  url.searchParams.set('ruleset', selected);
  if (selectedPlayer) url.searchParams.set('player', selectedPlayer);
  else url.searchParams.delete('player');
  window.history.replaceState(null, '', url);
  window.bohaEmbeddedPage?.postState(url.search);
}

function selectPlayer(id) {
  selectedPlayer = id;
  if (!id) expandedPlayers.clear();
  else if (expandedPlayers.has(id)) expandedPlayers.delete(id);
  else expandedPlayers.add(id);
  limit = 25;
  syncSelection();
  render();
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

function badge(status, modsVerified) {
  const span = document.createElement('span');
  span.className = 'wave-status ' + status;
  span.textContent = ({
    confirmed: 'Verified',
    pending: 'Awaiting analysis',
    incomplete: 'Incomplete · unrated',
    unknown: modsVerified ? 'Mods verified · no winner' : 'Result unknown',
    unverified: 'Unverified · unrated',
    error: 'Needs analysis',
    ignored: 'Excluded'
  })[status] || 'Awaiting analysis';
  return span;
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
  const all = selected === 'all';
  const group = all ? combineRulesets(data) : data.groups.find(item => item.id === selected) || data.groups[0];
  if (!group) return;
  selected = group.id;
  const profile = group.players.find(player => player.id === selectedPlayer);
  if (!profile) selectedPlayer = null;
  $('waveRuleset').value = selected;
  $('waveTotal').textContent = number(data.games.length);
  $('waveGroups').textContent = number(data.groups.length);
  $('waveConfirmed').textContent = number(data.games.filter(game => game.status === 'confirmed').length);
  $('waveWaiting').textContent = number(data.games.filter(game => game.status === 'pending').length);
  $('waveRuleSummary').textContent = all
    ? `All ${number(data.groups.length)} rulesets · ${number(group.confirmed)} verified / ${number(group.matches)} replays`
    : `${rulesetLabel(group)} · ${number(group.confirmed)} verified / ${number(group.matches)} replays`;
  $('waveRankingNote').textContent = all
    ? 'Combined totals across all rulesets. Only verified outcomes add wins and scores.'
    : 'Each game version and mod pack has its own rankings. Only verified outcomes add wins and scores.';
  $('waveProfileNote').textContent = all ? 'Stats and match history across all rulesets.' : 'Stats and match history for this ruleset.';

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

  players.forEach(({player, rank}) => {
    const row = document.createElement('tr');
    row.classList.toggle('wave-selected', player.id === selectedPlayer);
    const expanded = expandedPlayers.has(player.id);
    row.classList.toggle('is-expanded', expanded);
    cell(row, rank);
    const name = cell(row, '');
    const link = document.createElement('a');
    link.className = 'wave-player-link';
    link.textContent = player.name;
    link.href = profileUrl(player.id).href;
    link.target = '_top';
    link.setAttribute('aria-expanded', String(expanded));
    link.setAttribute('aria-controls', 'waveIdentity-' + player.id);
    if (player.id === selectedPlayer) link.setAttribute('aria-current', 'true');
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectPlayer(player.id);
    });
    name.append(link);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'stats-expand-toggle';
    toggle.textContent = expanded ? '−' : '+';
    toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} nicknames and keys for ${player.name}`);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-controls', 'waveIdentity-' + player.id);
    toggle.addEventListener('click', () => selectPlayer(player.id));
    name.append(toggle);
    if (!player.identityVerified) {
      const note = document.createElement('span');
      note.className = 'wave-name-note';
      note.textContent = 'unverified nickname';
      name.append(note);
    }
    for (const key of ['bestScore', 'games', 'wins', 'losses', 'kills']) {
      cell(row, player[key] === null ? '—' : number(player[key]), key === 'bestScore' ? 'wave-score' : key === 'wins' ? 'wave-wins' : '');
    }
    $('wavePlayers').append(row);
    if (expanded) $('wavePlayers').append(identityDetails(player));
  });

  $('waveProfile').hidden = !profile;
  $('waveProfileMetrics').replaceChildren();
  if (profile) {
    $('waveProfileName').textContent = profile.name;
    const metrics = [
      ['Rank', '#' + (group.players.indexOf(profile) + 1)],
      ['Games', number(profile.games)],
      ['Win / Lost / Draw', `${number(profile.wins)} / ${number(profile.losses)} / ${number(profile.draws)}`],
      ['Win rate', `${Math.round(profile.wins / Math.max(1, profile.games) * 100)}%`],
      ['Best score', profile.bestScore === null ? '—' : number(profile.bestScore)],
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
  $('waveMatchesLabel').textContent = profile ? 'Player match history' : 'Recent matches';
  const header = document.createElement('tr');
  const headings = profile ? ['Date ↓', 'Map', 'Result', 'Score', 'Time', 'Kills'] : ['Date ↓', 'Map', 'Players', 'Time', 'Status'];
  if (all) headings.splice(2, 0, 'Ruleset');
  for (const label of headings) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    header.append(th);
  }
  $('waveMatchesHead').replaceChildren(header);
  const games = data.games.filter(game => (all || game.group === selected) && (!profile || game.participants?.some(player => player.id === profile.id)));
  $('waveMatchCount').textContent = `(${number(games.length)})`;
  $('waveMatches').replaceChildren();
  games.slice(0, limit).forEach(game => {
    const row = document.createElement('tr');
    cell(row, game.startedAt ? new Date(game.startedAt).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Unknown date');
    cell(row, game.map);
    if (all) {
      const ruleset = data.groups.find(group => group.id === game.group);
      cell(row, ruleset ? rulesetLabel(ruleset) : 'Unknown');
    }
    const participant = profile ? game.participants.find(player => player.id === profile.id) : null;
    if (participant) {
      const result = ({winner: 'Win', loser: 'Lost', contender: 'Draw'})[participant.result] || 'Unknown';
      cell(row, result, 'wave-result-' + participant.result);
      cell(row, participant.score === null ? '—' : number(participant.score));
    } else cell(row, game.players.join(', ') || 'No human player recorded');
    const seconds = Math.floor(game.durationMilliseconds / 1000);
    cell(row, `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    if (participant) cell(row, participant.kills === null ? '—' : number(participant.kills));
    else cell(row, '').append(badge(game.status, game.modsVerified));
    $('waveMatches').append(row);
  });
  $('waveMore').hidden = games.length <= limit;
  $('waveUpdated').textContent = updatedLabel(data.generatedAt);
  $('waveUpdated').title = new Date(data.generatedAt).toLocaleString();
}

async function load() {
  try {
    const response = await fetch('stats/published/wavehoster.json?t=' + Date.now(), {cache: 'no-store'});
    if (!response.ok) throw new Error('The replay collection is temporarily unavailable.');
    const next = await response.json();
    if (next.format !== 1 || !Array.isArray(next.groups) || !Array.isArray(next.games)) throw new Error('The replay collection could not be read.');
    data = next;
    const previous = selected;
    rulesetNames.clear();
    $('waveRuleset').replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'ALL';
    $('waveRuleset').append(allOption);
    data.groups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      const common = data.games.filter(game => game.group === group.id).reduce((counts, game) => {
        counts[game.map] = (counts[game.map] || 0) + 1;
        return counts;
      }, {});
      const map = Object.entries(common).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Custom mod';
      rulesetNames.set(group.id, group.mods.length ? map : 'Unmodded');
      option.textContent = rulesetLabel(group);
      $('waveRuleset').append(option);
    });
    selected = previous === 'all' || data.groups.some(group => group.id === previous) ? previous : 'all';
    $('waveError').textContent = '';
    render();
  } catch (error) {
    $('waveError').textContent = error.message;
    $('waveUpdated').textContent = 'Unavailable';
  }
}

$('waveRuleset').addEventListener('change', () => {
  selected = $('waveRuleset').value;
  selectedPlayer = null;
  expandedPlayers.clear();
  limit = 25;
  syncSelection();
  render();
});
$('waveClearPlayer').addEventListener('click', () => selectPlayer(null));
$('wavePlayerSearch').addEventListener('input', render);
$('waveMore').addEventListener('click', () => { limit += 25; render(); });
$('waveRefresh').addEventListener('click', load);

load();
setInterval(() => { if (!document.hidden) load(); }, 30000);
