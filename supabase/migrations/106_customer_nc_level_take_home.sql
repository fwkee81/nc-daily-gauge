-- Run this in the Supabase SQL editor on your existing project, by itself.
--
-- Adds "Take Home" as a selectable NC Level — a customer who buys Herbalife
-- product to take home but never drinks/checks in at the club, so their
-- consumption_balance has no reason to ever move off its default 0. Same
-- shape as Ala Carte in that it's deliberately left out of every "New
-- 5-Day/10-Day/20-Day/30-Day" report breakdown and the Loyalty Program
-- (neither hardcodes it into their level lists) — but unlike Ala Carte it
-- isn't a one-time walk-in record; it's an ordinary customer row a coach
-- can search and check in like any other level.
--
-- IMPORTANT: ALTER TYPE ... ADD VALUE cannot run in the same transaction as
-- other statements that might reference the new value, so this migration
-- does nothing else — run it on its own.

alter type customer_nc_level add value if not exists 'Take Home';
