# Site news archive

`records.json` is the permanent, version-controlled public news record. It is
loaded by the balloon popup. It is not stored only in a visitor's browser.

To publish an update, add an entry to the beginning of `entries` with a unique
`id`, an ISO `date` (`YYYY-MM-DD`), a `category`, a `title`, and plain-text `text`.
Use the Europe/Vilnius calendar date. Keep all previous entries: never trim the
file to the latest three or five. Same-day entries keep their order in this file.
Do not put private/admin information, credentials, or unreleased claims here.

The popup starts with three entries and lets readers load three older entries at
a time until the entire archive is visible. There is no total-history cap.
Updating the archive does not require changing the rendering or 3D code. The
newest entry ID controls the unread badge; reading an update does not remove it
or any earlier update from the archive.

Run `node --test stats/site-news.test.cjs` after editing records.
