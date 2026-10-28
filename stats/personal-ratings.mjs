export const STORAGE_KEY = "boha.personalRatingSettings.v1";
export const CURRENT_SETTINGS = Object.freeze({ base: 1500, k: 20, ratingScale: 400, minimumGames: 5, multiplier: 1, multiplierGames: 50, minimumMinutes: 3, minimumTeamSize: 1, equalTeams: true });
export const BOHAN_SETTINGS = Object.freeze({ ...CURRENT_SETTINGS, k: 40, multiplier: 2 });

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
  return settings;
}

export function readSettings(storage) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    return saved?.version === 1 ? normalizeSettings(saved.settings) : null;
  } catch { return null; }
}

export function saveSettings(storage, settings) {
  try {
    if (settings) storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, settings: normalizeSettings(settings) }));
    else storage.removeItem(STORAGE_KEY);
    return true;
  } catch { return false; }
}

export function calculatePersonalRatings(board, input) {
  const settings = normalizeSettings(input);
  const visible = new Set(board.accounts.values());
  const copies = new Map();
  function copyAccount(account) {
    if (!copies.has(account)) {
      copies.set(account, { ...account, games: [], elo: settings.base, eloCount: 0,
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
  for (const game of [...games].sort((a, b) => a.endDate - b.endDate || a.startDate - b.startDate || String(a.id).localeCompare(String(b.id)))) {
    for (const slot of game.slots) slot.elo = slot.account.elo;
    const sizes = game.teams.map(team => team.players.length).filter(Boolean);
    if (game.cheated || game.crashed || game.duration < settings.minimumMinutes * 60000 || !sizes.length
      || Math.min(...sizes) < settings.minimumTeamSize
      || game.teams.every(team => team.userType === "loser")
      || (settings.equalTeams && Math.min(...sizes) !== Math.max(...sizes))) continue;
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

export function mountPersonalRatings(host, onChange, storage) {
  let settings = readSettings(storage);
  let payload = null;
  const cache = new Map();
  const style = document.createElement("style");
  style.textContent = `
    .personal-ratings { margin: 0 0 20px; border: 1px solid #315668; border-radius: 12px; background: linear-gradient(130deg, #102b38, #091922 75%); color: #c1dae2; overflow: hidden; }
    .personal-ratings summary { cursor: pointer; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 17px 20px; list-style: none; font-weight: 650; }
    .personal-ratings summary::-webkit-details-marker { display: none; }
    .personal-ratings .rating-title::before { content: '▸'; margin-right: 10px; color: #6de8ff; }
    .personal-ratings[open] .rating-title::before { content: '▾'; }
    .personal-ratings[open] summary { border-bottom: 1px solid #2b4958; }
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
    .personal-ratings p { font-size: 12px; line-height: 1.7; margin: 14px 0 0; }
    .personal-ratings .rating-help { margin-top: 18px; padding-top: 14px; border-top: 1px solid #294b5b; color: #91b1bf; }
    .personal-ratings .rating-feedback { color: #ffcf7a; margin-top: 10px; }
    .personal-ratings .rating-feedback:empty { display: none; }
    @media (max-width: 900px) { .personal-ratings .rating-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } .personal-ratings .rating-section:last-child { grid-column: 1 / -1; } }
    @media (max-width: 560px) { .personal-ratings form { padding: 14px; } .personal-ratings summary { padding: 15px 14px; } .personal-ratings .rating-fields { grid-template-columns: 1fr; } .personal-ratings .rating-section:last-child { grid-column: auto; } .personal-ratings .rating-actions button { flex: 1 1 100%; } }
  `;
  document.head.append(style);
  const panel = document.createElement("details");
  panel.className = "personal-ratings";
  panel.innerHTML = `
    <summary><span class="rating-title">Personal rating settings</span><span class="rating-status" aria-live="polite"></span></summary>
    <form>
      <div class="rating-toolbar">
        <label>Preset<select name="preset"><option value="published">Official published ratings</option><option value="current">Site defaults · K=20 preview</option><option value="bohan">Bohan-style · K=40 preview</option><option value="custom">Custom preview</option></select></label>
        <p>Start with the site defaults, adjust any value, then recalculate your personal leaderboard.</p>
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
        <fieldset class="rating-section"><legend>New-player boost</legend>
          <label>New-player multiplier<input name="multiplier" type="number" min="1" max="10" step="any" required><small>Default ×1 leaves rating changes unboosted.</small></label>
          <label>Multiplier decreases over games<input name="multiplierGames" type="number" min="0" max="10000" step="1" required><small>The boost fades over rated games. Set 0 to disable it.</small></label>
          <p>These values affect only your browser's preview. Published wins, losses and draws stay unchanged.</p>
        </fieldset>
      </div>
      <div class="rating-actions"><button type="submit">Recalculate</button><button type="button" class="rating-defaults">Load site defaults</button><button type="button" class="rating-reset">Reset to published</button></div>
      <p class="rating-help">Settings are remembered on this device. Previews use the selected category's published matches and visible player identities. Hidden players, quit-time and power-won data are unavailable, so neither preset guarantees an exact match to official ratings or Bohan's website. Crashed and cheated matches are always excluded.</p>
      <p class="rating-feedback" role="status" aria-live="polite"></p>
    </form>`;
  host.prepend(panel);
  const form = panel.querySelector("form");
  const preset = form.elements.namedItem("preset");
  const badge = panel.querySelector(".rating-status");
  const feedback = panel.querySelector(".rating-feedback");
  function showSettings(value, selected) {
    preset.value = selected;
    for (const key of Object.keys(CURRENT_SETTINGS)) {
      const field = form.elements.namedItem(key);
      if (key === "equalTeams") field.checked = value[key];
      else field.value = value[key];
      field.disabled = false;
    }
  }
  function showStatus() {
    badge.textContent = settings ? `Personal preview · K=${settings.k} · base ${settings.base} · boost ×${settings.multiplier}` : "Official published ratings";
  }
  function apply(next, persist = true) {
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
  showSettings(settings || CURRENT_SETTINGS, settings ? "custom" : "published");
  showStatus();
  preset.addEventListener("change", () => {
    if (preset.value === "custom") {
      for (const key of Object.keys(CURRENT_SETTINGS)) form.elements.namedItem(key).disabled = false;
    } else showSettings(preset.value === "bohan" ? BOHAN_SETTINGS : CURRENT_SETTINGS, preset.value);
    feedback.textContent = "Press Recalculate to apply this selection.";
  });
  form.addEventListener("input", event => {
    if (event.target === preset) return;
    preset.value = "custom";
    feedback.textContent = "Settings edited. Press Recalculate to apply.";
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    try {
      const next = Object.fromEntries(Object.keys(limits).map(key => [key, form.elements.namedItem(key).valueAsNumber]));
      next.equalTeams = form.elements.namedItem("equalTeams").checked;
      apply(preset.value === "published" ? null : normalizeSettings(next));
    } catch (error) { feedback.textContent = error.message; }
  });
  panel.querySelector(".rating-defaults").addEventListener("click", () => {
    showSettings(CURRENT_SETTINGS, "current");
    feedback.textContent = "Site defaults loaded. You can edit any value, then press Recalculate.";
  });
  panel.querySelector(".rating-reset").addEventListener("click", () => {
    showSettings(CURRENT_SETTINGS, "published");
    apply(null);
  });
  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const next = readSettings(storage);
    showSettings(next || CURRENT_SETTINGS, next ? "custom" : "published");
    apply(next, false);
  });
  return {
    getBoard(name, data, hydrate) {
      if (!settings) return hydrate(name);
      if (payload !== data) { payload = data; cache.clear(); }
      if (!cache.has(name)) cache.set(name, calculatePersonalRatings(hydrate(name), settings));
      return cache.get(name);
    }
  };
}
