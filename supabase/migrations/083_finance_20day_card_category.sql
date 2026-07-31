-- Adds the "20-Day Card" income category, between 10-Day and 30-Day.
-- Must run (and commit) in its own migration/transaction — Postgres won't
-- let a brand new enum value be referenced (e.g. in the check constraint
-- migration that follows) until the ADD VALUE transaction has committed.
alter type finance_category add value if not exists '20-Day Card' after '10-Day Card';
