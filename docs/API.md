# tabi API

All `/v1` endpoints except Google login require `Authorization: Bearer <session token>`.
Dates use `YYYY-MM-DD`; times use local `HH:mm`. A trip owner and every invited editor have the same itinerary editing rights.

## Authentication

- `POST /v1/auth/google` — exchange `{ "idToken": "..." }` for an app session.
- `GET /v1/me` — return the current user.
- `POST /v1/auth/logout` — revoke the current session.

## Gmail import

- `GET /v1/integrations/gmail` — return Gmail integration status.
- `POST /v1/integrations/gmail/authorization` — create a one-time Google authorization URL from `{ returnUrl }`.
- `GET /v1/integrations/gmail/callback` — Google OAuth callback. This endpoint consumes its single-use state and redirects to `returnUrl`.
- `DELETE /v1/integrations/gmail` — remove the encrypted refresh token and revoke it at Google when possible.
- `POST /v1/trips/:tripId/gmail/candidates` — inspect Gmail and return flight, train, and hotel candidates near the trip dates.
- `POST /v1/trips/:tripId/gmail/imports` — create a booking from a reviewed candidate and link its Gmail message ID for duplicate prevention.

The Worker stores only an AES-GCM encrypted refresh token and booking provenance. Gmail message bodies and access tokens are never persisted.

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
