-- Color tags for filtering the Shake Recipes library (e.g. "find the blue
-- ones"). Ingredient search stays a plain text search over the existing
-- Base/Side/Shake/Body/Topping fields — no separate ingredient tag list,
-- since free-text search is good enough there and avoids yet another
-- picker to keep in sync. Colors are a small fixed palette (see
-- RECIPE_COLORS in the app), so a plain text[] is enough — the app is the
-- only writer and always sends values from that fixed list.

alter table shake_recipes add column if not exists colors text[] not null default '{}';
