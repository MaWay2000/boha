# Extended replay telemetry v1

This is **observational script telemetry**, not a native combat accounting system.
The read-only hook is `replay-telemetry-hook.js`; the shared validator and aggregator
is `replay-telemetry.js`. Private replay workers install their own copies. Public
GitHub Pages does not run a Warzone engine or expose worker/admin configuration.

## Available observations

- Completed unit and structure construction, object IDs and nominal engine build costs.
- Structure destruction callbacks and subsequent completed replacements at the same
  tile, with the same owner and name. This does not prove enemy damage or a comeback.
- Research-completion callbacks, distinguishing an attributed own lab from shared
  or unattributed research.
- Ownership changes, preserving both owners without assuming gift versus capture.
- Army counts, nominal army/building value and power **balances** sampled every ten seconds.
- Destruction and sampled attack notices. Destruction has unknown cause/killer;
  attack notices are not a hit counter or kill attribution.

Full callback totals require a start marker within the first second, completed
engine playback, no omitted replay mods, no malformed/truncated/overflow records,
and all timestamps within the engine duration. Partial records remain inspectable,
but their aggregate totals are unavailable rather than zero. Unknown object costs
make the corresponding value total unavailable. Logs stop at 100,000 records with
an explicit invalidating overflow marker. Attack notices are additionally sampled
to at most one per victim per ten seconds.

The collector never issues orders or changes power, ownership, health or gameplay.
The validator allowlists fields and does not export arbitrary object metadata.
Browser rendering uses text nodes, filters event types, and initially shows only
50 events. Engine player indices must be mapped through `players[].index`, not
through replay positions or array offsets.
Workers store the validated telemetry as `extended.telemetryEncoding=gzip+base64`
and `extended.telemetryGzipBase64`; the browser expands it before rendering. Raw
`extended.telemetry` is also accepted for diagnostics and compatibility.

## Not implemented by the stock script API

| Requested measurement | What still needs native engine instrumentation |
| --- | --- |
| Confirmed kill history | Final destruction cause, credited killer and owners at that instant; exclude recycling, self-destruction and friendly fire as appropriate. |
| Combat value trades | Confirmed enemy kill attribution plus victim unit design and power cost. Observed destroyed value alone is not a valid substitute. |
| Damage dealt/absorbed | Applied damage after armor/resistance, source and target ownership, object class and time. Throttled attack notifications are insufficient. |
| Repairs | Actual restored health, repairer/facility, recipient and power used. Health snapshots miss damage/repairs between samples. |
| Confirmed donations | Successful transfer reason and actual assets/power delivered, distinguishing gifts from captures and rejected commands. |
| Economy flows | Explicit income, spending, refunds and gift transactions. Completed build value is not exact spending; balance deltas are not exact income. |

These capabilities are always marked unavailable in schema v1. No cost-trade,
damage-absorbed or repair award is calculated from these observations. In particular,
this release does not turn Glass Cannon into a claimed cheap-versus-expensive unit
award. A compatible custom-engine build and separate schema/tests are required.

Old cached analyses do not contain v1 records. They display **Reanalysis needed**;
they are not silently requeued or assigned invented zeros. Installing the new hook
does not backfill historical analyses or update previously distributed worker packages.

## Tests

Run `node --test stats/replay-telemetry.test.cjs stats/replay-awards.test.cjs`.
Engine replay smoke tests are also required when changing collector callbacks.

API references: [events](https://github.com/Warzone2100/warzone2100/blob/master/doc/js-events.md),
[objects](https://github.com/Warzone2100/warzone2100/blob/master/doc/js-objects.md),
[functions](https://github.com/Warzone2100/warzone2100/blob/master/doc/js-functions.md).
