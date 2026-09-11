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

## Flight connections

- `GET /v1/trips/:tripId/bookings` also returns `connectionMode` (`auto`, `manual`, `none`) and nullable `nextFlightId` for each booking.
- `PATCH /v1/trips/:tripId/bookings/:bookingId/connection` accepts `{ mode, nextFlightId }`. `nextFlightId` is required only for `manual`. `auto` removes the override; `none` prevents automatic linking from this arrival.
- The member check applies to every update. Both flights must belong to the same trip, meet at the same airport, and the next flight must depart after arrival. A departure can have only one explicitly linked arrival; conflicts return 409. Manual linking can represent a stopover longer than the automatic 24-hour window.
- Deleting the next flight clears its ID but preserves manual mode, so another flight is not silently selected. Changing an airport or date invalidates the displayed connection until the user selects again.

## Invitations

- `POST /v1/trips/:tripId/invites` — create a single-use link valid for seven days.
- `POST /v1/invites/:token/accept` — join the trip as an editor.

Invite tokens and session tokens are stored only as SHA-256 hashes in D1. Every trip and itinerary operation checks membership server-side.
