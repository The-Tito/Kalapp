-- Kalapp v0.3: registro de peso. Un peso por día local (upsert por local_date).
CREATE TABLE weights (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL UNIQUE,
  weight_kg REAL NOT NULL,
  created_at TEXT NOT NULL
);
