export const BOHAN_PREFERENCE_KEY = "boha.useBohanLiveCalculation";
export const BOHAN_CALCULATION_URL = "https://warzone2100.retropaganda.info/calculate.js";

export function readBohanPreference(storage) {
  try { return storage.getItem(BOHAN_PREFERENCE_KEY) === "true"; }
  catch { return false; }
}

export function writeBohanPreference(storage, enabled) {
  try { storage.setItem(BOHAN_PREFERENCE_KEY, String(enabled)); }
  catch { /* Rating selection still works if browser storage is unavailable. */ }
}

export async function loadBohanCalculation() {
  let timeout;
  try {
    const url = new URL(BOHAN_CALCULATION_URL);
    url.searchParams.set("v", Date.now().toString());
    const calculation = await Promise.race([
      import(url.href),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Bohan's calculation took too long to load.")), 15000);
      })
    ]);
    if (typeof calculation.calculate !== "function" || !Number.isFinite(calculation.eloBase)) {
      throw new Error("Bohan's calculation exports are incompatible.");
    }
    return calculation;
  } finally {
    clearTimeout(timeout);
  }
}

// Adapt freshly hydrated public match facts to the live calculation's input.
// Keep the publisher's profile identities and visibility rules: gathering remote
// aliases here could merge profiles or reintroduce deliberately omitted players.
export function calculatePublishedRatings(board, calculation) {
  const { accounts, games } = board;
  const visibleAccounts = new Set(accounts.values());
  const allAccounts = new Set(visibleAccounts);
  for (const game of games) {
    delete game.eloDelta;
    for (const slot of game.slots) {
      allAccounts.add(slot.account);
      delete slot.eloDelta;
      slot.elo = calculation.eloBase;
      // The public publication has outcomes but no quit-time/power telemetry.
      // Do not infer quit times or enable performance-based redistribution.
      slot.powerWon = 0;
    }
  }
  const records = new Map();
  for (const account of allAccounts) {
    records.set(account, [account.winCount, account.loseCount, account.drawCount]);
    account.elo = calculation.eloBase;
    account.eloCount = 0;
    account.winCount = account.loseCount = account.drawCount = 0;
    if (!visibleAccounts.has(account) || account.bot) account.discounted = true;
  }
  try {
    calculation.calculate([...games].sort((a, b) => a.endDate - b.endDate || a.startDate - b.startDate));
    for (const account of visibleAccounts) {
      if (!Number.isFinite(account.elo)) throw new Error("Live calculation produced an invalid rating.");
    }
    for (const game of games) for (const slot of game.slots) {
      if (!Number.isFinite(slot.elo) || (slot.eloDelta !== undefined && !Number.isFinite(slot.eloDelta))) {
        throw new Error("Live calculation produced invalid match ratings.");
      }
    }
  } finally {
    // A different rating algorithm must not rewrite recorded wins/losses/draws.
    for (const [account, [wins, losses, draws]] of records) {
      account.winCount = wins;
      account.loseCount = losses;
      account.drawCount = draws;
    }
  }
  return board;
}

export function mountBohanControl(host) {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("./bohan-live-rating.css", import.meta.url).href;
  document.head.append(stylesheet);

  const control = document.createElement("div");
  control.className = "bohan-calculation-control";
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "useBohanCalculation";
  checkbox.disabled = true;
  label.append(checkbox, " Use bohan’s live calculation");
  label.title = "Calculate Elo with code loaded directly from bohan's website, using this site's published matches and player identities. Quit-time and power telemetry are not included in the public data.";
  const status = document.createElement("span");
  status.id = "bohanCalculationStatus";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "Published ratings";
  control.append(label, status);
  host.prepend(control);
  return { checkbox, status };
}
