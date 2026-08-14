# wz2100.uk source discovery

Verified on 2026-08-13. These paths require no authentication.

## Completed 1v1 archive

- `GET https://wz2100.uk/1v1/matches`
- Server-rendered HTML.
- Each `.archive-record` links to `/1v1/match/<id>` and supplies the winner, opponent, duration, played time and gameplay grade.
- The archive currently returns the retained matches in newest-first order. No pagination control was visible in the current archive.

## Match report

- `GET https://wz2100.uk/1v1/match/<id>`
- Server-rendered HTML plus structured JSON in:
  `<script id="tacticalPayload" type="application/json">`.
- The `Player totals` table supplies result, droids built/lost, unit kills, structure kills, research count, oil, power and score.
- `tacticalPayload` currently supplies:
  - map layout and placed map objects;
  - players and colours;
  - event timeline (production, research and other recorded events);
  - 15-second status frames containing power, units, army value, structures, oil, factories, labs and generators;
  - highlights;
  - position snapshot metadata.
- Unit design cards are rendered in HTML. Their components, produced/lost counts and first production time can be normalized in a later importer version.

## Position telemetry

- `GET https://wz2100.uk/1v1/match/<id>/positions.json`
- Structured JSON using compact array formats documented by top-level fields such as `droidFormat` and `structureFormat`.
- For match 27 it contains 335 frames sampled every 3 seconds and is about 1.7 MB. It is deliberately not downloaded by the first incremental importer.

## Replay

- `GET https://wz2100.uk/1v1/replay/<id>`
- `application/octet-stream` with a `Content-Disposition` replay filename.
- Match 27 returned `20260811_152224_multiplay_p13.wzrp`.
- The importer stores the original replay and calculates SHA-256 for reliable cross-source identity.

## Reliability rules

- The importer never invents absent fields.
- The replay hash is the preferred identity; source ID and exact filename remain source metadata.
- Existing records are retained when the source is unavailable.
- Browser clients will use the MaWay2000 API rather than calling wz2100.uk directly.
- Live lobby data is explicitly out of scope.
