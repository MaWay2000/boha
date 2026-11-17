# Arc Mod Beta rules

These rules preserve the decision to show the newest Arc release as **Beta**, keep replay history, and remember the people who test it.

## Active release

- The main Arc Mod board shows one release: **Beta (Arc-Mw Mod v155, Warzone 4.7.0)**.
- Its exact mod SHA-256 is `e4568ef645926c5079bf3a1dd78d55cde55fd78918161a586eab5d6322ce1c70`. Releases v152, v153 and v154 remain archived.
- `stats/arc-beta.json` controls the active release. Match the game version and the complete mod pack; a map name alone is insufficient.
- A later replay of an older or unrelated mod does not promote that mod to Beta.
- To promote a release, move the previous hash into `archiveModHashes`, set the new version and hash, and update this document. Do not reset the tester archive.

## Results and rankings

- Match rows may additionally show the host-recorded scripted ending and wave reached. The local collector matches one log to one exact replay SHA-256, verifies the archived pack, and excludes ambiguous logs, unsupported rosters and impossible endings. Publication also requires engine-verified mods, matching version, a non-cheated replay and an ending within its duration.
- Labels distinguish **Defeated**, **Left game (loss)** and **Victory**, with **Wave N/60**. An unresolved result is **Result unavailable** (or **Awaiting analysis**), never a guessed defeat. Host labels do not certify engine scores or kills and do not change ranking eligibility.
- These four scalar host fields survive publication and history refreshes; raw logs, chat, local paths and network payloads stay private. The collector refreshes automatically whenever the local match publication runs.

- A human player who leaves before a verified final result receives a **defeat** when the recorded replay contains that player's departure event or an engine departure timestamp.
- The timestamp must be positive and within the replay duration. The roster position must identify a human participant, excluding spectators and bots.
- Departure losses require verified replay mods and matching replay hash, mod pack, and game version. Keep the replay's analysis status separate from the player's defeat.
- Preserve verified wins, defeats, and draws. Leaving after a verified final result does not change that result.
- Missing data, a replay engine error, an incomplete replay, an unverified mod, or the absence of a final winner is insufficient by itself to infer a departure. Keep those results **Unknown** until evidence is available.
- Count each qualifying player once per replay. A departure adds one game and one loss; it does not invent a score, kill count, win, or draw.
- Rankings remain wins first, then best verified score. Equal nicknames do not establish a verified identity; a departure without a verified identity uses an explicitly unverified nickname entry.

## Replay history

- Keep existing replay records and Analyze links. A refresh must not delete an old replay merely because the source omits it.
- Show old releases and unrelated mods through **Replay archive**, separate from the default Beta selector. Preserve links to specific archived rulesets and players.
- Historical results can receive evidence-backed corrections. Preserve verified final results when the upstream source temporarily regresses to an unfinished analysis.

## Tester credits

- Save observed human participant names from recognized Arc releases to `stats/published/arc-beta-testers.json`.
- Include early departures, defeats, and unresolved replays. Testing does not require a win or a verified score.
- Credit names from the public human roster, excluding spectators and bots. Keep the spelling, symbols, capitalization, and Unicode as recorded.
- Credits are observed nicknames, not a claim about unique people. Retain different aliases separately; never merge verified player identities using a shared nickname.
- Retain names, first and last observed dates, and replay references across releases and refreshes. Do not replace the archive with only the newest release's names.
- Credits do not grant leaderboard points or change match results. Any correction or removal should be deliberate and documented.

## Publication

- The scheduled publisher maintains the replay history and tester archive together. Failed downloads retain the last available data; failed evidence requests leave that replay unresolved for retry.
- Publish only the public roster, result facts, and credits. Do not add backend configuration, credentials, private worker files, or raw API responses to GitHub.
- Run the Arc publication, data, and Beta regression tests and the public release check before publishing changes.
