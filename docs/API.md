# tabi API

All `/v1` endpoints except passkey sign-in, sign-up and `/v1/avatars/*` require `Authorization: Bearer <session token>`.
Dates use `YYYY-MM-DD`; times use local `HH:mm`. A trip owner and every invited editor have the same itinerary editing rights.

## Authentication

- `POST /v1/auth/passkey/login/options`, `POST /v1/auth/passkey/login` — sign in with a passkey (`{ challengeId, response }`).
- `POST /v1/auth/passkey/signup/options` (`{ name }`), `POST /v1/auth/passkey/signup` — create an account with a passkey.
- `GET /v1/passkeys`, `POST /v1/passkeys/options`, `POST /v1/passkeys`, `DELETE /v1/passkeys/:id` — the account's passkeys.
- `PUT /v1/me/avatar` (square JPEG/PNG/WebP, ≤ 1 MB), `DELETE /v1/me/avatar` — the account's icon.
- `GET /v1/me` — return the current user.
- `POST /v1/auth/logout` — revoke the current session.


## AI agents (MCP)

- `GET /v1/agent-keys`, `POST /v1/agent-keys` (`{ name, canWrite }`), `DELETE /v1/agent-keys/:id` — the account's keys for AI agents, made in 設定 > AIからの操作. `POST` returns the key (`kondo_…`) once with the server URL; only its hash is stored.
- `POST /v1/mcp` with `Authorization: Bearer kondo_…` — a Model Context Protocol server (streamable HTTP, JSON responses, no sessions) for Muse and other MCP clients. The key acts as its member through the routes below, so trip membership and 閲覧のみ apply. Tools: `list_trips`, `get_trip`, and with a writing key `create_trip`, `update_trip`, `save_plan`, `save_booking`, `save_place`, `save_packing_item`, `save_task`, `save_note`, `attach_booking_document` (base64, ≤ 8 MB) and `upload_booking_document` (a one-use `PUT /v1/uploads/:token` URL, 10 minutes, ≤ 20 MB). Edits keep omitted fields. Nothing can be deleted through it.

## Trips

- `GET /v1/trips` — list trips shared with the current user.
- `POST /v1/trips` — create a trip with `{ name, destination, startsOn, endsOn }`.
- `PATCH /v1/trips/:tripId` — replace those editable trip fields.

## Itinerary

- `GET /v1/trips/:tripId/items` — list itinerary items in date/time order.
- `POST /v1/trips/:tripId/items` — create `{ day, time, kind, title, note }`.
- `PATCH /v1/trips/:tripId/items/:itemId` — replace those editable item fields.
- `DELETE /v1/trips/:tripId/items/:itemId` — delete an item.

## Flight connections

- `GET /v1/trips/:tripId/bookings` also returns `connectionMode` (`auto`, `manual`, `none`) and nullable `nextFlightId` for each booking.
- `PATCH /v1/trips/:tripId/bookings/:bookingId/connection` accepts `{ mode, nextFlightId }`. `nextFlightId` is required only for `manual`. `auto` removes the override; `none` prevents automatic linking from this arrival.
- The member check applies to every update. Both flights must belong to the same trip, meet at the same airport, and the next flight must depart after arrival. A departure can have only one explicitly linked arrival; conflicts return 409. Manual linking can represent a stopover longer than the automatic 24-hour window.
- Deleting the next flight clears its ID but preserves manual mode, so another flight is not silently selected. Changing an airport or date invalidates the displayed connection until the user selects again.

## Invitations

- `POST /v1/trips/:tripId/invites` — create a single-use link valid for seven days.
- `POST /v1/invites/:token/accept` — join the trip as an editor.

Invite tokens and session tokens are stored only as SHA-256 hashes in D1. Every trip and itinerary operation checks membership server-side.
