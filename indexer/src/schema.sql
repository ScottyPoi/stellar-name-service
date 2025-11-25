CREATE TABLE IF NOT EXISTS names (
  namehash BYTEA PRIMARY KEY,
  fqdn TEXT NOT NULL,
  owner TEXT,
  resolver TEXT,
  expires_at BIGINT,
  registration_tx TEXT,
  registered_via TEXT,
  registry_contract_id TEXT
);

-- Add registry_contract_id column if it doesn't exist (for existing databases)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'names' AND column_name = 'registry_contract_id'
  ) THEN
    ALTER TABLE names ADD COLUMN registry_contract_id TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_names_registry_contract_id ON names(registry_contract_id);
CREATE INDEX IF NOT EXISTS idx_names_owner_registry ON names(owner, registry_contract_id) WHERE owner IS NOT NULL;

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
