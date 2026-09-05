-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
--  USERS & AUTH
-- ================================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('partner', 'manager', 'student')),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
--  CORE CRM (mirrors the existing localStorage data model exactly)
-- ================================================================
CREATE TABLE clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module       TEXT NOT NULL CHECK (module IN ('audit', 'tax', 'consulting', 'misc')),
  name         TEXT NOT NULL,
  ntn          TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  is_firm      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE engagements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module         TEXT NOT NULL CHECK (module IN ('audit', 'tax', 'consulting', 'misc')),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  year           INT NOT NULL,
  incharge       TEXT NOT NULL DEFAULT '',
  contact_phone  TEXT NOT NULL DEFAULT '',
  wa_group_id    TEXT NOT NULL DEFAULT '',
  deadline       TEXT NOT NULL DEFAULT '',
  rolled_from    UUID REFERENCES engagements(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module, client_id, year)
);

CREATE TABLE items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  ref            TEXT NOT NULL DEFAULT '',
  section        TEXT NOT NULL DEFAULT '',
  head_id        TEXT NOT NULL DEFAULT '',
  sub            TEXT NOT NULL DEFAULT '',
  p              TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'document',
  value          TEXT NOT NULL DEFAULT '',
  requestable    BOOLEAN NOT NULL DEFAULT true,
  head_included  BOOLEAN NOT NULL DEFAULT true,
  status         TEXT NOT NULL DEFAULT 'No progress'
                   CHECK (status IN ('No progress','Requested','Under Review','Completed','NA')),
  status_since   TEXT NOT NULL DEFAULT '',
  peak           INT NOT NULL DEFAULT 0,
  owner          TEXT NOT NULL DEFAULT '',
  file_note      TEXT NOT NULL DEFAULT '',
  date_requested TEXT NOT NULL DEFAULT '',
  date_received  TEXT NOT NULL DEFAULT '',
  queried        BOOLEAN NOT NULL DEFAULT false,
  date_queried   TEXT NOT NULL DEFAULT '',
  followups      INT NOT NULL DEFAULT 0,
  last_contact   TEXT NOT NULL DEFAULT '',
  remarks        TEXT NOT NULL DEFAULT '',
  adhoc          BOOLEAN NOT NULL DEFAULT false,
  due            TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- File metadata only; actual bytes live in MinIO
CREATE TABLE inbox_files (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id    UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  size             BIGINT NOT NULL DEFAULT 0,
  mime_type        TEXT NOT NULL DEFAULT '',
  minio_key        TEXT NOT NULL DEFAULT '',
  uploaded_at      TEXT NOT NULL DEFAULT '',
  received_at      TEXT NOT NULL DEFAULT '',
  source           TEXT NOT NULL DEFAULT 'manual',
  sender           TEXT NOT NULL DEFAULT '',
  message_id       TEXT NOT NULL DEFAULT '',
  group_id         TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'Unmatched' CHECK (status IN ('Unmatched','Matched')),
  assigned_item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
--  LIBRARIES (per-module document templates)
-- ================================================================
CREATE TABLE library_heads (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module   TEXT NOT NULL CHECK (module IN ('audit', 'tax', 'consulting', 'misc')),
  head_id  TEXT NOT NULL,
  section  TEXT NOT NULL DEFAULT '',
  sub      TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (module, head_id)
);

CREATE TABLE library_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  head_id_fk  UUID NOT NULL REFERENCES library_heads(id) ON DELETE CASCADE,
  ref         TEXT NOT NULL DEFAULT '',
  p           TEXT NOT NULL,
  req         BOOLEAN NOT NULL DEFAULT false,
  sort_order  INT NOT NULL DEFAULT 0
);

-- ================================================================
--  EVENT LOG (append-only audit trail)
-- ================================================================
CREATE TABLE events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  day            TEXT NOT NULL DEFAULT '',
  by             TEXT NOT NULL DEFAULT '',
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  module         TEXT NOT NULL DEFAULT 'audit',
  type           TEXT NOT NULL,
  engagement_id  UUID REFERENCES engagements(id) ON DELETE CASCADE,
  client_id      UUID REFERENCES clients(id) ON DELETE CASCADE,
  entity         TEXT NOT NULL DEFAULT '',
  entity_id      TEXT NOT NULL DEFAULT '',
  label          TEXT NOT NULL DEFAULT '',
  from_val       TEXT NOT NULL DEFAULT '',
  to_val         TEXT NOT NULL DEFAULT ''
);

-- ================================================================
--  INDEXES
-- ================================================================
CREATE INDEX idx_engagements_client ON engagements(client_id);
CREATE INDEX idx_items_engagement ON items(engagement_id);
CREATE INDEX idx_items_owner ON items(owner);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_inbox_engagement ON inbox_files(engagement_id);
CREATE INDEX idx_events_engagement ON events(engagement_id);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_day ON events(day);
CREATE INDEX idx_events_user ON events(user_id);

-- ================================================================
--  SEED: default admin user (change password immediately after setup)
-- ================================================================
-- Password is: changeme123 — CHANGE THIS ON FIRST LOGIN
INSERT INTO users (name, username, password_hash, role)
VALUES (
  'Admin',
  'admin',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewnMCZWVhQJjYU0y',
  'partner'
);
