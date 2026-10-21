# Public website and private administration

This repository publishes website code and intentionally public game statistics.
It must not contain the local administration service, visitor logs, credentials,
database files, moderation reasons or private configuration.

The local `local-api/`, `security-desk/`, `server/` and `replay-downloader/`
directories are excluded from public releases. Keep private copies separately.
Do not blindly add and push the contents of a mixed public/private workspace.

Stats pass through `stats/public-export.cjs`: public profile fields are
allowlisted, excluded profiles and moderation flags are removed, and visitor or
credential fields cause publication to fail. Historical match facts remain
public; this is not a promise to anonymize records already in public replays.
Other players' ratings and match results must not be recalculated by this filter.

Run these checks before publishing:

```text
node --test stats/public-export.test.cjs
node stats/check-public-release.cjs
```

Public API addresses used by browser code are necessarily visible. Do not put
passwords or API credentials in frontend JavaScript. A hidden address or link
is not an access-control mechanism; administration needs server-side protection.

Deleting a public file does not remove it from old Git commits or existing
clones. Rotate any exposed credential before considering history cleanup.
