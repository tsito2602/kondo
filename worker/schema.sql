CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT '',
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS trip_members (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'editor')),
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '予定',
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  day TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  confirmation_code TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS bookings_trip_day ON bookings(trip_id, day, time);

CREATE TABLE IF NOT EXISTS packing_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'その他',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1 AND quantity <= 99),
  packed INTEGER NOT NULL DEFAULT 0 CHECK(packed IN (0, 1)),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS packing_items_trip ON packing_items(trip_id, packed, category, name);

CREATE TABLE IF NOT EXISTS travel_tasks (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_on TEXT NOT NULL DEFAULT '',
  assignee TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS travel_tasks_trip ON travel_tasks(trip_id, done, due_on, title);

CREATE TABLE IF NOT EXISTS booking_details (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  origin TEXT NOT NULL DEFAULT '',
  origin_code TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL DEFAULT '',
  destination_code TEXT NOT NULL DEFAULT '',
  end_day TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS booking_documents (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size >= 1 AND size <= 20971520),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS booking_documents_trip ON booking_documents(trip_id, booking_id, created_at);

CREATE TABLE IF NOT EXISTS flight_connection_preferences (
  arrival_booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  departure_booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK(mode IN ('manual', 'none')),
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(arrival_booking_id != departure_booking_id),
  CHECK(mode = 'manual' OR departure_booking_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS flight_connection_departure
  ON flight_connection_preferences(departure_booking_id) WHERE departure_booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  consumed_by TEXT REFERENCES users(id),
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES itinerary_items(id) ON DELETE SET NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);


-- Purge data left by the discontinued Gmail import feature.
DROP TABLE IF EXISTS gmail_message_cache;
DROP TABLE IF EXISTS gmail_scan_limits;
DROP TABLE IF EXISTS gmail_oauth_states;
DROP TABLE IF EXISTS gmail_connections;
DROP TABLE IF EXISTS booking_imports;

CREATE TABLE IF NOT EXISTS trip_covers (
  trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  image TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  opening_hours TEXT NOT NULL DEFAULT '',
  reservation_status TEXT NOT NULL DEFAULT 'not_needed' CHECK(reservation_status IN ('not_needed','needed','requested','confirmed')),
  location TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- 訪問ステータス (places.status) is no longer read or written (2026-10-07); an older
-- database keeps the column and its places_trip index until they are dropped by hand.
CREATE INDEX IF NOT EXISTS places_trip_updated ON places(trip_id, updated_at);

CREATE TABLE IF NOT EXISTS place_itinerary_links (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES itinerary_items(id) ON DELETE SET NULL
);
-- Recover only unambiguous legacy additions. Keep a row even after deletion,
-- so subsequent schema runs cannot associate a place with another plan.
INSERT OR IGNORE INTO place_itinerary_links (place_id, item_id)
SELECT p.id, (
  SELECT i.id FROM itinerary_items i
  WHERE i.trip_id = p.trip_id AND i.kind = '予定' AND i.time = ''
    AND i.title = p.title
    AND i.note = p.note || CASE WHEN p.note <> '' AND p.location <> '' THEN char(10) ELSE '' END || p.location
    AND (SELECT COUNT(*) FROM places other WHERE other.trip_id = p.trip_id AND other.title = p.title
      AND other.note = p.note AND other.location = p.location) = 1
  GROUP BY i.trip_id HAVING COUNT(*) = 1
) FROM places p;

-- Extend place metadata without rebuilding existing rows or their status constraint.
CREATE TABLE IF NOT EXISTS place_details (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  reference_links TEXT NOT NULL DEFAULT '[]',
  reservation_status TEXT CHECK(reservation_status IS NULL OR reservation_status = 'unavailable')
);

-- Map position read from the place's Google Maps link (WGS84 degrees); absent when the link has none.
CREATE TABLE IF NOT EXISTS place_coordinates (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90),
  lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180)
);
-- When a place was added: candidates are numbered in this order. Older places
-- have no row and keep their earlier (id) order ahead of newer ones.
CREATE TABLE IF NOT EXISTS place_added (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- A link that gave no position, and when it was last tried; list requests skip it for a day.
CREATE TABLE IF NOT EXISTS place_coordinate_misses (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  location TEXT NOT NULL,
  tried_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Add read-only membership without rebuilding the existing member table.
CREATE TABLE IF NOT EXISTS trip_member_permissions (
  trip_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_only INTEGER NOT NULL DEFAULT 1 CHECK(read_only IN (0, 1)),
  PRIMARY KEY (trip_id, user_id),
  FOREIGN KEY (trip_id, user_id) REFERENCES trip_members(trip_id, user_id) ON DELETE CASCADE
);

-- Separate profile metadata keeps the repeatable schema safe on existing databases.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_url TEXT
);

-- Optional location metadata preserves existing booking rows and repeatable deployment.
CREATE TABLE IF NOT EXISTS booking_locations (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  location TEXT NOT NULL DEFAULT ''
);


CREATE TABLE IF NOT EXISTS travel_notes (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
  updated_by TEXT REFERENCES users(id),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS travel_notes_trip ON travel_notes(trip_id, pinned, updated_at);

-- Additive and repeatable: existing notes and older offline clients keep working.
CREATE TABLE IF NOT EXISTS note_details (
  note_id TEXT PRIMARY KEY REFERENCES travel_notes(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT
);

-- Optional link from a note to a numbered place; omission by old clients preserves it.
CREATE TABLE IF NOT EXISTS note_places (
  note_id TEXT PRIMARY KEY REFERENCES travel_notes(id) ON DELETE CASCADE,
  place_id TEXT REFERENCES places(id) ON DELETE SET NULL
);

-- Optional packing ownership preserves existing rows and repeatable deployment.
CREATE TABLE IF NOT EXISTS packing_details (
  item_id TEXT PRIMARY KEY REFERENCES packing_items(id) ON DELETE CASCADE,
  assignee TEXT NOT NULL DEFAULT '',
  shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN (0, 1))
);

-- Optional plan metadata; old clients can update a plan without erasing it.
CREATE TABLE IF NOT EXISTS itinerary_details (
  item_id TEXT PRIMARY KEY REFERENCES itinerary_items(id) ON DELETE CASCADE,
  details TEXT
);

-- Optional ticket-specified journey time. Omission by old clients preserves it.
CREATE TABLE IF NOT EXISTS booking_durations (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  duration_minutes INTEGER
);

-- Packing kinds: みんな各自 (each), 1つでいい (one) and 自分だけ (mine). Items
-- without a row are legacy items and read as 'one' with their old carrier.
-- owner_id is set only for 'mine'; nobody else can read or change those rows.
CREATE TABLE IF NOT EXISTS packing_kinds (
  item_id TEXT PRIMARY KEY REFERENCES packing_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'one' CHECK(kind IN ('each', 'one', 'mine')),
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Per-member packed marks for みんな各自 items: one row per member who packed it.
CREATE TABLE IF NOT EXISTS packing_marks (
  item_id TEXT NOT NULL REFERENCES packing_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, user_id)
);

-- Task kinds: 全員がやる (each: one row, every member ticks their own) and
-- 1人がやる (one). Tasks without a row are 'one', as every task was before.
CREATE TABLE IF NOT EXISTS task_kinds (
  task_id TEXT PRIMARY KEY REFERENCES travel_tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'one' CHECK(kind IN ('each', 'one'))
);

-- Per-member done marks for 全員がやる tasks: one row per member who did it.
CREATE TABLE IF NOT EXISTS task_marks (
  task_id TEXT NOT NULL REFERENCES travel_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

-- Optional link from a booking to one of the trip's places (the venue on the map).
-- Omission by old clients preserves it; deleting the place clears it.
CREATE TABLE IF NOT EXISTS booking_places (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  place_id TEXT REFERENCES places(id) ON DELETE SET NULL
);
