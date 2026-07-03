-- Run this in the Supabase SQL editor on your existing project.
-- Adds "Ala Carte" as a valid NC Level, for one-time walk-in customers.
--
-- Run this in its own query (separately from other migrations) — Postgres
-- doesn't allow a brand new enum value to be used by other statements in
-- the same transaction it was added in.

alter type customer_nc_level add value 'Ala Carte';
