-- ============================================================
-- OPTIONAL MIGRATION: Custom English & Lao names for Menu Catalog
-- (Built-in dictionary already translates common items automatically;
--  run this if you want to customize EN/LO names per drink in /menu)
-- ============================================================

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_lo TEXT DEFAULT '';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_lo TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_en TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS description_lo TEXT DEFAULT '';

ALTER TABLE public.toppings
  ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_lo TEXT DEFAULT '';

ALTER TABLE public.dining_tables
  ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS name_lo TEXT DEFAULT '';
