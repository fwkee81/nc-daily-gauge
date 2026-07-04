-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds "Non member" as a selectable Member Type on the Customer profile.
--
-- IMPORTANT: ALTER TYPE ... ADD VALUE cannot run in the same transaction as
-- other statements that might reference the new value. Run this migration
-- by itself (as its own "Run" in the SQL editor) before running 019.

alter type member_type add value 'Non member';
