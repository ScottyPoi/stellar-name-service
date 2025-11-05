CREATE TABLE IF NOT EXISTS names (
  namehash BYTEA PRIMARY KEY,
  fqdn TEXT NOT NULL,
  owner TEXT,
  resolver TEXT,
  expires_at BIGINT
);

CREATE TABLE IF NOT EXISTS records (
  namehash BYTEA NOT NULL,
  key BYTEA NOT NULL,
  value BYTEA NOT NULL,
  PRIMARY KEY (namehash, key)
);

CREATE TABLE IF NOT EXISTS events (
  tx_id TEXT NOT NULL,
  ev_index INT NOT NULL,
  ev_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  ts BIGINT NOT NULL,
  PRIMARY KEY (tx_id, ev_index)
);

CREATE TABLE IF NOT EXISTS checkpoints (
  stream TEXT PRIMARY KEY,
  cursor TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
