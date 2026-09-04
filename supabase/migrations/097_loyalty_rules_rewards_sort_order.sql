-- Lets an admin manually reorder Earn rules and the Rewards catalog on the
-- Loyalty Program Settings panel (up/down buttons per row), instead of the
-- fixed created_at order they were stuck with before.

alter table loyalty_earn_rules add column sort_order integer not null default 0;
alter table loyalty_rewards add column sort_order integer not null default 0;

-- Backfill existing rows into a stable, sequential order per club so the
-- first reorder click has something sane to swap against, rather than
-- every row starting tied at 0.
with ranked as (
  select id, row_number() over (partition by nc_club_id order by created_at) - 1 as rn
  from loyalty_earn_rules
)
update loyalty_earn_rules r set sort_order = ranked.rn
from ranked where ranked.id = r.id;

with ranked as (
  select id, row_number() over (partition by nc_club_id order by created_at) - 1 as rn
  from loyalty_rewards
)
update loyalty_rewards r set sort_order = ranked.rn
from ranked where ranked.id = r.id;
