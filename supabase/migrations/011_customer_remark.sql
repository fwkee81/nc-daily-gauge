-- Run this in the Supabase SQL editor on your existing project.
-- Adds a free-text Remark field to customer profiles.

alter table customers add column if not exists remark text;
