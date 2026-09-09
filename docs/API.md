# tabi API

All `/v1` endpoints except Google login require `Authorization: Bearer <session token>`.
Dates use `YYYY-MM-DD`; times use local `HH:mm`. A trip owner and every invited editor have the same itinerary editing rights.

## Authentication

- `POST /v1/auth/google` — exchange `{ "idToken": "..." }` for an app session.
- `GET /v1/me` — return the current user.
- `POST /v1/auth/logout` — revoke the current session.

## Trips

- `GET /v1/trips` — list trips shared with the current user.
- `POST /v1/trips` — create a trip with `{ name, destination, startsOn, endsOn }`.
- `PATCH /v1/trips/:tripId` — replace those editable trip fields.

## Itinerary

- `GET /v1/trips/:tripId/items` — list itinerary items in date/time order.
- `POST /v1/trips/:tripId/items` — create `{ day, time, kind, title, note }`.
- `PATCH /v1/trips/:tripId/items/:itemId` — replace those editable item fields.
- `DELETE /v1/trips/:tripId/items/:itemId` — delete an item.

## Invitations

- `POST /v1/trips/:tripId/invites` — create a single-use link valid for seven days.
- `POST /v1/invites/:token/accept` — join the trip as an editor.

Invite tokens and session tokens are stored only as SHA-256 hashes in D1. Every trip and itinerary operation checks membership server-side.
