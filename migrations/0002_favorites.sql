-- Kalapp v0.2: comidas favoritas. Los ingredientes se guardan como JSON (EntryItemInput[]).
CREATE TABLE favorites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  items_json TEXT NOT NULL,
  total_kcal REAL NOT NULL,
  total_protein_g REAL NOT NULL,
  total_carbs_g REAL NOT NULL,
  total_fat_g REAL NOT NULL,
  uses_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
