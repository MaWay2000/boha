# Maway v1 — experimental Beta 3 foundation

Bohan-style remains the default. Maway is an optional research preset, not a
replacement for official results or a validated claim of fairness.

The arithmetic in `beta3-core.mjs` is ported from the retired Beta 3 implementation
introduced by commit `01a19e9ae85a9bdd6e6e16ce9cce4b7e5e66912f` on 29 September 2026.
This replaces the earlier unpublished Maway K32 / two-metric draft.

## Original Beta 3 rules

- Start at 1500. Process games in start-time order, with match ID as tie-breaker.
- Use pre-match team-average Elo for expected results, with scale 400.
- Established K is 8. Provisional players get up to +4 K, fading over their first
  20 rated matches. There is no separate multiplicative new-player boost.
- Rank six recorded metrics across everyone in the match. Weights are score
  25%, kills 15%, smoothed unit kill/loss ratio 30%, buildings destroyed 10%,
  research 15%, production 5%. The smoothed ratio is `(kills+5)/(losses+5)`.
- Tied metric values use midranks. Compare weighted observed performance with
  performance expected from each player's pre-match Elo against every other
  player. This prevents perpetual bonuses merely for topping the scoreboard.
- Personal change is `36 × (observed − expected performance)`, capped at ±10.
- Add result and personal changes, then cap the final match change at ±15.
- A strong losing player may gain points; a winning player may lose points.
- Missing any verified metric for any participant disables personal adjustment
  for the whole match. Result-only scoring remains available.

## Integration and limitations

Matches must have two equally sized teams of at least two players and an
unambiguous win/loss or draw. Existing minimum-duration, crash and cheat filters
apply. This integration conservatively excludes matches with bots, banned or
untracked identities. That exclusion differs from historical Beta 3, which
calculated banned players before hiding them from its published player list.
Valid provisional identities develop ratings even below the visibility threshold.

Verified metrics are joined by source match ID and position, with team and result
cross-checks. Unlike historical Beta 3, nickname equality is not required, because
the current publication resolves aliases. These are integration differences;
the six-stat ranking and match-change arithmetic retain the original Beta 3 rules.

The personal match breakdown shows expected win chance, observed/expected
performance, performance rank, result change, personal change and capped final
change. Current ranking percentiles beside names remain separate from those
pre-match expectations.

Maway-only controls expose all six metric percentages, personal contribution
weight, performance expectation scale, provisional extra K and match count, and
the personal/final point caps. Percentages must total 100%. Zero provisional
matches disables that bonus. Preferences persist with the Maway algorithm;
other presets do not use or display these extra controls. Older saved Maway
preferences adopt the original Beta 3 defaults for newly exposed values.

Unit counts do not measure unit power value or damage. Engine score, research
and production can also reflect roles or strategies. The model needs further
comparison and balance work; the cap does not by itself prove fairness.
