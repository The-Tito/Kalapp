-- Kalapp v0.1: perfil, registros de comida, ingredientes y uso de la IA.
-- D1 aplica foreign_keys = ON siempre (no se puede desactivar fuera de una transacción),
-- así que ON DELETE CASCADE de entry_items funciona sin PRAGMA. Lo verifica entries.test.ts.

-- Una sola fila (id = 1). Guarda los datos crudos del perfil y la recomendación calculada
-- por el servidor con `recommend()` de @kalapp/shared.
CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sex TEXT NOT NULL CHECK (sex IN ('male', 'female')),
  birth_date TEXT NOT NULL,
  height_cm REAL NOT NULL,
  weight_kg REAL NOT NULL,
  body_fat_pct REAL,
  activity_level TEXT NOT NULL
    CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  training_days INTEGER NOT NULL CHECK (training_days BETWEEN 0 AND 7),
  goal TEXT NOT NULL CHECK (goal IN ('deficit', 'recomp', 'gain')),
  intensity TEXT NOT NULL CHECK (intensity IN ('mild', 'moderate', 'aggressive')),
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  manual_target_kcal INTEGER,
  bmr INTEGER NOT NULL,
  tdee INTEGER NOT NULL,
  bmr_formula TEXT NOT NULL CHECK (bmr_formula IN ('mifflin', 'katch')),
  adjust_pct REAL NOT NULL,
  target_kcal INTEGER NOT NULL,
  protein_g INTEGER NOT NULL,
  fat_g INTEGER NOT NULL,
  carbs_g INTEGER NOT NULL,
  expected_kg_per_week REAL NOT NULL,
  safety_floor_applied INTEGER NOT NULL CHECK (safety_floor_applied IN (0, 1)),
  is_manual_override INTEGER NOT NULL CHECK (is_manual_override IN (0, 1)),
  warnings_json TEXT NOT NULL DEFAULT '[]',
  explanation_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

-- id = UUID generado en el cliente (POST idempotente). local_date = día en la zona del usuario.
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  eaten_at TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  source TEXT NOT NULL CHECK (source IN ('photo', 'text', 'favorite', 'barcode', 'manual')),
  title TEXT,
  note TEXT,
  total_kcal REAL NOT NULL DEFAULT 0,
  total_protein_g REAL NOT NULL DEFAULT 0,
  total_carbs_g REAL NOT NULL DEFAULT 0,
  total_fat_g REAL NOT NULL DEFAULT 0,
  ai_model TEXT,
  ai_confidence TEXT CHECK (ai_confidence IN ('high', 'medium', 'low')),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_entries_local_date ON entries (local_date);

CREATE TABLE entry_items (
  id INTEGER PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  grams REAL NOT NULL,
  kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low'))
);

CREATE INDEX idx_entry_items_entry ON entry_items (entry_id, position);

-- Intentos de análisis por día local y modelo (límite diario DAILY_ANALYZE_LIMIT).
CREATE TABLE ai_usage (
  date TEXT NOT NULL,
  model TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, model)
);
