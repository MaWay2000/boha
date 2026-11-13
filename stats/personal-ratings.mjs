import { calculateMawayMatch, MAWAY_RULES } from './maway-ratings.mjs?v=20261108-beta3-fields-1';
export const STORAGE_KEY = "boha.personalRatingSettings.v1";
export const CURRENT_SETTINGS = Object.freeze({ base: 1500, k: 20, ratingScale: 400, minimumGames: 5, multiplier: 1, multiplierGames: 50, minimumMinutes: 3, minimumTeamSize: 1, equalTeams: true });
export const BOHAN_SETTINGS = Object.freeze({ ...CURRENT_SETTINGS, k: 40, multiplier: 2 });
const MAWAY_EXTRA = Object.freeze({ performanceScale: MAWAY_RULES.performanceScale, provisionalExtraK: MAWAY_RULES.provisionalExtraK,
  provisionalGames: MAWAY_RULES.provisionalGames, personalCap: MAWAY_RULES.personalCap, matchCap: MAWAY_RULES.matchCap });
const MAWAY_LIMITS = {performanceScale:[100,2000],provisionalExtraK:[0,200],provisionalGames:[0,10000],personalCap:[0,100],matchCap:[0,200]};
const METRIC_LABELS = {score:'Score',kills:'Kills',unitKd:'Kill/loss ratio',structuresDestroyed:'Buildings destroyed',research:'Research',production:'Production'};
export const MAWAY_SETTINGS = Object.freeze({ ...CURRENT_SETTINGS, ...MAWAY_EXTRA, k: MAWAY_RULES.establishedK, multiplierGames: 0,
  algorithm: 'maway-beta3', personalWeight: MAWAY_RULES.personalWeight, metrics:MAWAY_RULES.metrics });

const limits = { base: [0, 10000], k: [0, 200], ratingScale: [100, 2000], minimumGames: [0, 10000], multiplier: [1, 10], multiplierGames: [0, 10000], minimumMinutes: [0, 180], minimumTeamSize: [1, 20] };

export function normalizeSettings(input) {
  if (!input || typeof input !== "object") throw new Error("Invalid rating settings.");
  const settings = {};
  for (const [key, [min, max]] of Object.entries(limits)) {
    // Older saved preferences predate these two controls; retain their original behavior.
    const value = input[key] === undefined && ["ratingScale", "minimumTeamSize"].includes(key) ? CURRENT_SETTINGS[key] : input[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max
      || (["minimumGames", "multiplierGames", "minimumTeamSize"].includes(key) && !Number.isInteger(value))) {
      throw new Error(`Invalid ${key} setting.`);
    }
    settings[key] = value;
  }
  if (typeof input.equalTeams !== "boolean") throw new Error("Invalid team-size setting.");
  settings.equalTeams = input.equalTeams;
  if (input.algorithm !== undefined) {
    if (!['maway','maway-beta3'].includes(input.algorithm)) throw new Error('Invalid rating method.');
    const weight = input.algorithm === 'maway' ? MAWAY_RULES.personalWeight : input.personalWeight;
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) throw new Error('Personal contribution weight must be between 0 and 100.');
    if (input.algorithm === 'maway') settings.k = MAWAY_RULES.establishedK;
    settings.algorithm = 'maway-beta3'; settings.personalWeight = weight;
    for (const [key,[min,max]] of Object.entries(MAWAY_LIMITS)) {
      const value=input[key] === undefined ? MAWAY_EXTRA[key] : input[key];
      if (!Number.isFinite(value)||value<min||value>max||(key==='provisionalGames'&&!Number.isInteger(value))) throw new Error(`Invalid ${key} setting.`);
      settings[key]=value;
    }
    const metrics=input.metrics === undefined ? MAWAY_RULES.metrics : input.metrics;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw new Error('Invalid metric weights.');
    settings.metrics={};
    for (const key of Object.keys(MAWAY_RULES.metrics)) {
      const value=metrics[key];
      if (!Number.isFinite(value)||value<0||value>1) throw new Error('Each metric weight must be between 0% and 100%.');
      settings.metrics[key]=value;
    }
    if (Math.abs(Object.values(settings.metrics).reduce((a,b)=>a+b,0)-1)>1e-8) throw new Error('Metric weights must add up to 100%.');
    settings.multiplier = 1; settings.multiplierGames = 0;
  }
  return settings;
}

export function readSettings(storage) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && saved.mode === "published") return null;
    return saved?.version === 1 ? normalizeSettings(saved.settings) : { ...BOHAN_SETTINGS };
  } catch { return { ...BOHAN_SETTINGS }; }
}

export function saveSettings(storage, settings) {
  try {
    if (settings) storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, settings: normalizeSettings(settings) }));
    else storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, mode: "published" }));
    return true;
  } catch { return false; }
}

export function calculatePersonalRatings(board, input, performance = {}) {
  const settings = normalizeSettings(input);
  const visible = new Set(board.accounts.values());
  const copies = new Map();
  function copyAccount(account) {
    if (!copies.has(account)) {
      copies.set(account, { ...account, games: [], elo: settings.base, eloCount: 0,
        ratingIneligible: !visible.has(account) || Boolean(account.bot || account.banned) || !(account.mainPublicKey || account.publicKeys?.size),
        discounted: !visible.has(account) || Boolean(account.bot || account.banned)
          || !(account.mainPublicKey || account.publicKeys?.size)
          || account.games.length < settings.minimumGames });
    }
    return copies.get(account);
  }
  const accounts = new Map([...board.accounts].map(([id, account]) => [id, copyAccount(account)]));
  const games = board.games.map(original => {
    const slots = original.slots.map(slot => ({ ...slot, account: copyAccount(slot.account), elo: settings.base, eloDelta: null }));
    const teams = new Map();
    for (const slot of slots) {
      const key = original.alliancesType ? slot.team : slot.position;
      if (!teams.has(key)) teams.set(key, { slots: [], players: [], userType: null });
      const team = teams.get(key);
      team.slots.push(slot);
      if (["winner", "loser", "contender"].includes(slot.userType)) team.players.push(slot);
    }
    for (const team of teams.values()) {
      const types = new Set(team.players.map(slot => slot.userType));
      team.userType = types.size === 1 ? [...types][0] : null;
    }
    const game = { ...original, slots, teams: [...teams.values()], eloDelta: null };
    game.players = slots.filter(slot => ["winner", "loser", "contender"].includes(slot.userType));
    for (const slot of slots) slot.account.games.push(game);
    return game;
  });
  let ratedGames = 0;
  for (const game of [...games].sort((a, b) => (settings.algorithm === 'maway-beta3'
    ? a.startDate - b.startDate : a.endDate - b.endDate || a.startDate - b.startDate) || String(a.id).localeCompare(String(b.id)))) {
    for (const slot of game.slots) slot.elo = slot.account.elo;
    const sizes = game.teams.map(team => team.players.length).filter(Boolean);
    if (game.cheated || game.crashed || game.duration < settings.minimumMinutes * 60000 || !sizes.length
      || Math.min(...sizes) < settings.minimumTeamSize
      || game.teams.every(team => team.userType === "loser")
      || (settings.equalTeams && Math.min(...sizes) !== Math.max(...sizes))) continue;
    if (settings.algorithm === 'maway-beta3') {
      const players = game.teams.flatMap(team => team.players);
      if (new Set(players.map(slot => slot.account)).size !== players.length) continue;
      if (calculateMawayMatch(game, settings, performance[game.id])) ratedGames++;
      continue;
    }
    const teams = game.teams.map(team => {
      const players = team.players.filter(slot => !slot.account.discounted);
      return { players, userType: team.userType, delta: 0,
        elo: players.reduce((sum, slot) => sum + slot.elo, 0) / players.length };
    }).filter(team => team.players.length);
    const ratedPlayers = teams.flatMap(team => team.players);
    if (new Set(ratedPlayers.map(slot => slot.account)).size !== ratedPlayers.length) continue;
    const winners = teams.filter(team => team.userType === "winner");
    const contenders = teams.filter(team => team.userType === "contender");
    const survivors = winners.length ? winners : contenders;
    const delta = (actual, a, b) => settings.k * (actual - 1 / (1 + 10 ** ((b - a) / settings.ratingScale)));
    let hasResult = false;
    for (const loser of teams.filter(team => team.userType === "loser")) {
      const best = teams.filter(team => team !== loser).reduce((best, team) => !best || team.elo > best.elo ? team : best, null);
      if (!best || !survivors.length) continue;
      const points = delta(1, best.elo, loser.elo) * loser.players.length;
      loser.delta -= points;
      for (const survivor of survivors) survivor.delta += points / survivors.length;
      hasResult = true;
    }
    for (let i = 0; i < contenders.length; i++) for (const second of contenders.slice(i + 1)) {
      const first = contenders[i];
      const points = delta(0.5, first.elo, second.elo) * (first.players.length + second.players.length) / 2;
      first.delta += points;
      second.delta -= points;
      hasResult = true;
    }
    if (!hasResult) continue;
    ratedGames++;
    game.eloDelta = 0;
    for (const team of teams) for (const slot of team.players) {
      const count = slot.account.eloCount;
      const boost = settings.multiplierGames > 0
        ? 1 + (settings.multiplier - 1) * (1 - Math.min(settings.multiplierGames, count) / settings.multiplierGames) : 1;
      slot.eloDelta = team.delta / team.players.length * boost;
      slot.account.elo += slot.eloDelta;
      if (team.delta) slot.account.eloCount++;
      if (!Number.isFinite(slot.account.elo)) throw new Error("These settings produced an invalid rating.");
      game.eloDelta += Math.max(0, slot.eloDelta);
    }
  }
  return { accounts, games, ratedGames };
}

export function mountPersonalRatings(host, onChange, storage, prepareSettings) {
  let settings = readSettings(storage);
  let payload = null;
  const cache = new Map();
  const style = document.createElement("style");
  style.textContent = `
    .personal-ratings { box-sizing: border-box; width: min(1100px, 90vw); max-width: none; max-height: 90dvh; padding: 0; margin: auto; border: 1px solid #315668; border-radius: 12px; background: linear-gradient(130deg, #102b38, #091922 75%); color: #c1dae2; overflow: auto; font: 14px 'Space Grotesk', sans-serif; }
    .personal-ratings::backdrop { background: #020a10d9; }
    .personal-ratings .rating-header { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px; border-bottom: 1px solid #2b4958; background: #102b38; }
    .personal-ratings .rating-header h2 { margin: 0 0 8px; font: 700 24px 'Oxanium', sans-serif; color: #8ae9ff; }
    .personal-ratings .rating-close { padding: 8px 12px; font-size: 24px; line-height: 1; }
    .stats-summary > .rating-settings-button { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; justify-self: end; width: 36px; min-width: 36px; max-width: 36px; align-self: stretch; min-height: 40px; padding: 7px; border: 0; border-left: 1px solid rgba(179,125,255,.18); border-radius: 0; background: transparent; color: #8ae9ff; cursor: pointer; }
    .rating-settings-button svg { width: 20px; height: 20px; }
    .rating-settings-button:hover { color: white; background: #9360cd22; }
    .rating-settings-button:focus-visible { outline: 2px solid #6de8ff; outline-offset: -3px; }
    body.personal-ratings-open { overflow: hidden; }
    .personal-ratings .rating-status { border: 1px solid #315b69; border-radius: 20px; padding: 4px 10px; background: #0c2430; color: #91e9ef; font-size: 11px; font-weight: 500; overflow-wrap: anywhere; }
    .personal-ratings form { padding: 20px; }
    .personal-ratings .rating-toolbar { display: flex; align-items: end; gap: 14px; margin-bottom: 20px; flex-wrap: wrap; }
    .personal-ratings .rating-toolbar label { flex: 1 1 260px; max-width: 460px; }
    .personal-ratings .rating-toolbar p { flex: 1 1 240px; margin: 0; padding-bottom: 7px; color: #98b7c6; }
    .personal-ratings .rating-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .personal-ratings .rating-section { min-width: 0; margin: 0; padding: 16px; border: 1px solid #2c5262; border-radius: 8px; background: #081c27a6; }
    .personal-ratings .rating-section legend { padding: 0 7px; color: #ddf2fa; font-size: 13px; font-weight: 650; }
    .personal-ratings .rating-section label + label { margin-top: 14px; }
    .personal-ratings label { display: flex; flex-direction: column; gap: 7px; font-size: 12px; }
    .personal-ratings label small { color: #8faeba; line-height: 1.5; font-size: 11px; }
    .personal-ratings input, .personal-ratings select, .personal-ratings button { font: inherit; color: #e1f2f9; background: #0b2330; border: 1px solid #3c6272; padding: 10px 12px; min-width: 0; border-radius: 6px; }
    .personal-ratings input, .personal-ratings select { width: 100%; min-height: 42px; }
    .personal-ratings .rating-switch { flex-direction: row; align-items: center; gap: 10px; }
    .personal-ratings .rating-switch input { width: 17px; min-height: 17px; height: 17px; accent-color: #72dce9; flex-shrink: 0; }
    .personal-ratings .rating-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    .personal-ratings button { cursor: pointer; font-size: 13px; font-weight: 600; }
    .personal-ratings button[type=submit] { border-color: #65d8ed; background: #17637b; color: white; }
    .personal-ratings button:hover { border-color: #80cadd; }
    .personal-ratings :focus-visible { outline: 2px solid #6de8ff; outline-offset: 2px; }
    .personal-ratings :disabled { opacity: .55; cursor: not-allowed; }
    .personal-ratings [hidden] { display: none !important; }
    .personal-ratings p { font-size: 12px; line-height: 1.7; margin: 14px 0 0; }
    .personal-ratings .rating-help { margin-top: 18px; padding-top: 14px; border-top: 1px solid #294b5b; color: #91b1bf; }
    .personal-ratings .rating-feedback { color: #ffcf7a; margin-top: 10px; }
    .personal-ratings .rating-feedback:empty { display: none; }
    .personal-ratings .rating-maway-options { margin-top: 18px; }
    .personal-ratings .rating-metric-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    .personal-ratings .rating-metric-grid label + label { margin-top:0; }
    .personal-ratings.is-maway form > .rating-fields { grid-template-columns:repeat(2,minmax(0,1fr)); }
    @media (max-width:560px) { .personal-ratings.is-maway form > .rating-fields { grid-template-columns:1fr; } }
    @media (max-width: 900px) { .personal-ratings .rating-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } .personal-ratings .rating-section:last-child { grid-column: 1 / -1; } }
    @media (max-width: 560px) { .personal-ratings form { padding: 14px; } .personal-ratings .rating-header { padding: 15px 14px; } .personal-ratings .rating-fields { grid-template-columns: 1fr; } .personal-ratings .rating-section:last-child { grid-column: auto; } .personal-ratings .rating-actions button { flex: 1 1 100%; } }
  `;
  document.head.append(style);
  style.dataset.ratingPopup = "";
  let modalDocument = document;
  try { if (window.parent !== window && window.parent.location.origin === window.location.origin) modalDocument = window.parent.document; } catch {}
  if (modalDocument !== document) modalDocument.head.append(style.cloneNode(true));
  const panel = modalDocument.createElement("dialog");
  panel.className = "personal-ratings";
  panel.setAttribute("aria-labelledby", "personalRatingTitle");
  panel.innerHTML = `
    <header class="rating-header"><div><h2 id="personalRatingTitle">Personal rating settings</h2><span class="rating-status" aria-live="polite"></span></div><button class="rating-close" type="button" aria-label="Close rating settings" autofocus>×</button></header>
    <form>
      <input type="hidden" name="algorithm" value="">
      <div class="rating-toolbar">
        <label>Preset<select name="preset"><option value="published">Official published ratings</option><option value="current">Classic · K=20 preview</option><option value="bohan">Bohan-style · K=40 · default</option><option value="maway">Maway v1 · Beta 3 · experimental</option><option value="custom">Custom preview</option></select></label>
        <p>Bohan-style is the default. Adjust any value, then recalculate your personal leaderboard.</p>
      </div>
      <div class="rating-fields">
        <fieldset class="rating-section"><legend>Rating formula</legend>
          <label>Starting Elo<input name="base" type="number" min="0" max="10000" step="any" required></label>
          <label>K factor<input name="k" type="number" min="0" max="200" step="any" required><small>How strongly each match changes the rating.</small></label>
          <label>Elo scale<input name="ratingScale" type="number" min="100" max="2000" step="any" required><small>Default 400. Higher values soften the effect of rating gaps.</small></label>
        </fieldset>
        <fieldset class="rating-section"><legend>Match eligibility</legend>
          <label>Minimum games to rate<input name="minimumGames" type="number" min="0" max="10000" step="1" required></label>
          <label>Minimum match minutes<input name="minimumMinutes" type="number" min="0" max="180" step="any" required></label>
          <label>Minimum players per team<input name="minimumTeamSize" type="number" min="1" max="20" step="1" required><small>1 includes duels and FFA. 3 requires teams of at least three.</small></label>
          <label class="rating-switch"><input name="equalTeams" type="checkbox">Require equal team sizes</label>
        </fieldset>
        <fieldset class="rating-section rating-boost"><legend>New-player boost</legend>
          <label>New-player multiplier<input name="multiplier" type="number" min="1" max="10" step="any" required><small>Bohan-style uses ×2. Set ×1 for no boost.</small></label>
          <label>Multiplier decreases over games<input name="multiplierGames" type="number" min="0" max="10000" step="1" required><small>The boost fades over rated games. Set 0 to disable it.</small></label>
          <p>These values affect only your browser's preview. Published wins, losses and draws stay unchanged.</p>
        </fieldset>
      </div>
      <div class="rating-maway-options" hidden>
        <div class="rating-fields">
          <fieldset class="rating-section"><legend>Maway metric weights (%)</legend>
            <div class="rating-metric-grid">${Object.entries(METRIC_LABELS).map(([key,label])=>`<label>${label} weight (%)<input name="metric_${key}" type="number" min="0" max="100" step="any" required></label>`).join('')}</div>
            <p class="rating-weight-total" aria-live="polite"></p>
          </fieldset>
          <fieldset class="rating-section"><legend>Maway performance &amp; caps</legend>
            <label>Personal contribution weight<input name="personalWeight" type="number" min="0" max="100" step="any" required></label>
            <label>Performance expectation scale<input name="performanceScale" type="number" min="100" max="2000" step="any" required><small>Separate from the team Elo scale.</small></label>
            <label>Personal adjustment cap (± points)<input name="personalCap" type="number" min="0" max="100" step="any" required></label>
            <label>Final match cap (± points)<input name="matchCap" type="number" min="0" max="200" step="any" required></label>
          </fieldset>
          <fieldset class="rating-section"><legend>Maway provisional ratings</legend>
            <label>Provisional extra K<input name="provisionalExtraK" type="number" min="0" max="200" step="any" required><small>Added to the base K factor for new players, then fades.</small></label>
            <label>Provisional bonus fades over matches<input name="provisionalGames" type="number" min="0" max="10000" step="1" required><small>Set 0 to disable the provisional bonus.</small></label>
            <p>Beta 3 defaults: +4 K over 20 matches, ±10 personal adjustment and ±15 final change.</p>
          </fieldset>
        </div>
      </div>
      <p class="rating-maway-help" hidden>Maway v1 uses Beta 3. Balanced 2v2 or larger only. A strong losing player can gain points. All six metric weights must total 100%. Missing verified stats means result-only scoring. Bohan-style remains the default.</p>
      <div class="rating-actions"><button type="submit">Recalculate</button><button type="button" class="rating-defaults">Load Bohan defaults</button><button type="button" class="rating-reset">Reset to published</button></div>
      <p class="rating-help">Settings are remembered on this device. Previews use the selected category's published matches and visible player identities. Hidden players, quit-time and power-won data are unavailable, so neither preset guarantees an exact match to official ratings or Bohan's website. Crashed and cheated matches are always excluded.</p>
      <p class="rating-feedback" role="status" aria-live="polite"></p>
    </form>`;
  modalDocument.body.append(panel);
  const settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.className = "rating-settings-button";
  settingsButton.setAttribute("aria-label", "Personal rating settings");
  settingsButton.setAttribute("aria-haspopup", "dialog");
  settingsButton.title = "Personal rating settings";
  settingsButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 3-.6 2.2-2 .9L4.3 5.5 2.5 8.6 4 10.3v2.3l-1.5 1.8 1.8 3.1 2.1-.6 2 .9L9 20h3.6l.6-2.2 2-.9 2.1.6 1.8-3.1-1.5-1.8v-2.3l1.5-1.7-1.8-3.1-2.1.6-2-.9L12.6 3Z" transform="translate(1.2 .5)"/><circle cx="12" cy="12" r="3"/></svg>';
  function placeButton(summary = host.querySelector(".stats-summary"), status = host.querySelector("#resultsStatus")) {
    if (status?.parentNode === summary) summary.insertBefore(settingsButton, status);
    else summary?.append(settingsButton);
  }
  placeButton();
  settingsButton.addEventListener("click", () => { panel.showModal(); panel.scrollTop = 0; modalDocument.body.classList.add("personal-ratings-open"); });
  panel.querySelector(".rating-close").addEventListener("click", () => panel.close());
  panel.addEventListener("close", () => { modalDocument.body.classList.remove("personal-ratings-open"); settingsButton.focus(); });
  window.addEventListener("pagehide", () => {
    panel.close(); panel.remove(); modalDocument.body.classList.remove("personal-ratings-open");
    if (modalDocument !== document) modalDocument.head.querySelectorAll('style[data-rating-popup]').forEach(node => node.remove());
  }, { once: true });
  const form = panel.querySelector("form");
  const preset = form.elements.namedItem("preset");
  const badge = panel.querySelector(".rating-status");
  const feedback = panel.querySelector(".rating-feedback");
  function showSettings(value, selected) {
    preset.value = selected;
    const isMaway = value.algorithm === 'maway-beta3';
    form.elements.namedItem('algorithm').value = isMaway ? 'maway-beta3' : '';
    form.elements.namedItem('personalWeight').value = value.personalWeight ?? MAWAY_RULES.personalWeight;
    panel.classList.toggle('is-maway',isMaway);
    panel.querySelector('.rating-maway-options').hidden = !isMaway;
    panel.querySelector('.rating-boost').hidden = isMaway;
    for (const key of Object.keys(MAWAY_EXTRA)) form.elements.namedItem(key).value=value[key] ?? MAWAY_EXTRA[key];
    for (const key of Object.keys(METRIC_LABELS)) form.elements.namedItem(`metric_${key}`).value=Number(((value.metrics ?? MAWAY_RULES.metrics)[key]*100).toFixed(8));
    panel.querySelectorAll('.rating-maway-options input').forEach(field=>field.disabled=!isMaway);
    updateWeightTotal();
    panel.querySelector('.rating-maway-help').hidden = !isMaway;
    for (const key of Object.keys(CURRENT_SETTINGS)) {
      const field = form.elements.namedItem(key);
      if (key === "equalTeams") field.checked = value[key];
      else field.value = value[key];
      field.disabled = false;
    }
    if (isMaway) for (const key of ['multiplier', 'multiplierGames']) form.elements.namedItem(key).disabled = true;
    form.elements.namedItem('multiplier').closest('label').querySelector('small').textContent = isMaway
      ? 'Beta 3 uses its own provisional K schedule; no multiplicative boost.' : 'Bohan-style uses ×2. Set ×1 for no boost.';
  }
  function updateWeightTotal() {
    const total=Object.keys(METRIC_LABELS).reduce((sum,key)=>sum+form.elements.namedItem(`metric_${key}`).valueAsNumber,0);
    panel.querySelector('.rating-weight-total').textContent=`Total: ${Number.isFinite(total)?Number(total.toFixed(6)):'—'}% · must equal 100%.`;
  }
  function showStatus() {
    badge.textContent = settings ? `${settings.algorithm === 'maway-beta3' ? 'Maway v1 · Beta 3' : 'Personal preview'} · K=${settings.k} · base ${settings.base} · boost ×${settings.multiplier}` : "Official published ratings";
  }
  let applyGeneration = 0;
  async function apply(next, persist = true) {
    const generation = ++applyGeneration;
    try {
      if (prepareSettings) {
        feedback.textContent = "Loading rating data…";
        await prepareSettings(next);
      }
    } catch {
      if (generation === applyGeneration) feedback.textContent = "Could not load rating data. Previous settings kept. Please retry.";
      return;
    }
    if (generation !== applyGeneration) return;
    const previous = settings;
    settings = next;
    cache.clear();
    try { onChange(); }
    catch (error) {
      settings = previous;
      cache.clear();
      showStatus();
      feedback.textContent = "Could not calculate this preview. Previous settings kept.";
      onChange();
      return;
    }
    showStatus();
    feedback.textContent = persist && !saveSettings(storage, settings)
      ? "Applied for this page. Browser storage is unavailable; settings could not be saved."
      : settings ? "Personal preview applied. Official published ratings are unchanged." : "Showing official published ratings.";
  }
  function selectedPreset(value) {
    if (!value) return "published";
    if (value.algorithm === 'maway-beta3') return 'maway';
    if (Object.keys(BOHAN_SETTINGS).every(key => value[key] === BOHAN_SETTINGS[key])) return "bohan";
    if (Object.keys(CURRENT_SETTINGS).every(key => value[key] === CURRENT_SETTINGS[key])) return "current";
    return "custom";
  }
  showSettings(settings || BOHAN_SETTINGS, selectedPreset(settings));
  showStatus();
  preset.addEventListener("change", () => {
    if (preset.value === "custom") {
      const isMaway = form.elements.namedItem('algorithm').value === 'maway-beta3';
      for (const key of Object.keys(CURRENT_SETTINGS)) form.elements.namedItem(key).disabled = isMaway && ['multiplier','multiplierGames'].includes(key);
    } else showSettings(preset.value === 'maway' ? MAWAY_SETTINGS : preset.value === "bohan" ? BOHAN_SETTINGS : CURRENT_SETTINGS, preset.value);
    feedback.textContent = "Press Recalculate to apply this selection.";
  });
  form.addEventListener("input", event => {
    if (event.target === preset) return;
    preset.value = "custom";
    if (event.target.name?.startsWith('metric_')) updateWeightTotal();
    feedback.textContent = "Settings edited. Press Recalculate to apply.";
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    try {
      const next = Object.fromEntries(Object.keys(limits).map(key => [key, form.elements.namedItem(key).valueAsNumber]));
      next.equalTeams = form.elements.namedItem("equalTeams").checked;
      if (form.elements.namedItem('algorithm').value === 'maway-beta3') {
        next.algorithm = 'maway-beta3'; next.personalWeight = form.elements.namedItem('personalWeight').valueAsNumber;
        for (const key of Object.keys(MAWAY_EXTRA)) next[key]=form.elements.namedItem(key).valueAsNumber;
        next.metrics=Object.fromEntries(Object.keys(METRIC_LABELS).map(key=>[key,form.elements.namedItem(`metric_${key}`).valueAsNumber/100]));
      }
      apply(preset.value === "published" ? null : normalizeSettings(next));
    } catch (error) { feedback.textContent = error.message; }
  });
  panel.querySelector(".rating-defaults").addEventListener("click", () => {
    showSettings(BOHAN_SETTINGS, "bohan");
    feedback.textContent = "Bohan defaults loaded. You can edit any value, then press Recalculate.";
  });
  panel.querySelector(".rating-reset").addEventListener("click", () => {
    showSettings(CURRENT_SETTINGS, "published");
    apply(null);
  });
  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const next = readSettings(storage);
    showSettings(next || BOHAN_SETTINGS, selectedPreset(next));
    apply(next, false);
  });
  return {
    placeButton,
    requiresPerformance: () => settings?.algorithm === 'maway-beta3',
    getBoard(name, data, hydrate) {
      if (!settings) return hydrate(name);
      if (payload !== data) { payload = data; cache.clear(); }
      if (!cache.has(name)) cache.set(name, calculatePersonalRatings(hydrate(name), settings, data.ratingPerformance || {}));
      return cache.get(name);
    }
  };
}
