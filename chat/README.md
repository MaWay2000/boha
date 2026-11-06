# Public chat

The site header opens one shared, text-only chat room. The latest 200 messages
are stored by the existing API service. Nicknames are unverified. Only the
nickname is remembered in the browser; session tokens stay in memory.

The popup polls every five seconds while open and visible. It stops polling
when closed or when the tab is hidden. Failed sends retain the draft; retrying
the same message uses its original ID to prevent duplicate posts.

## Spam limits

- 500 characters per message; 24 characters per nickname.
- One message every three seconds and 12 messages per minute per session.
- Room-wide ceiling of 120 messages and 30 new sessions per minute.
- Sessions expire after 24 hours; stored sessions and history are bounded.
- Messages are rendered as plain text. HTML and scripts are never executed.

These are basic limits, not verified identities or CAPTCHA protection.

## Hosting

GitHub Pages serves the popup. The existing public API serves
`/wzstats/api/v1/chat/messages` and `/wzstats/api/v1/chat/sessions`.
The local preview uses the API at `127.0.0.1:8787`; the published site uses the
same public hostname as the game's shared scores. That API host must be running
for chat to load or accept messages. Backend code and message storage stay out
of the public Pages repository.
