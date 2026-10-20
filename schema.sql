PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE COLLATE NOCASE,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  goods_description TEXT,
  status TEXT NOT NULL,
  public_tracking INTEGER NOT NULL DEFAULT 1 CHECK (public_tracking IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES staff_users(id)
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  public_note TEXT,
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES staff_users(id)
);

CREATE INDEX IF NOT EXISTS idx_shipments_updated_at ON shipments(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipment_events_timeline ON shipment_events(shipment_id, created_at DESC);
