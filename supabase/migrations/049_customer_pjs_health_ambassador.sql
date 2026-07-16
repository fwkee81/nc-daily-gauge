-- Manual designations a coach ticks on the customer's profile — independent
-- of any computed report (e.g. NC Metrics' Health Ambassador leaderboard,
-- which is based on referral counts, not this flag).
alter table customers
  add column is_pjs boolean not null default false,
  add column is_health_ambassador boolean not null default false;
