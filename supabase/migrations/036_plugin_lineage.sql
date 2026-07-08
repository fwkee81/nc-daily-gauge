-- Run this in the Supabase SQL editor on your existing project.
--
-- "Plug-in Cups" used to only count a customer whose OWN invited_by_type is
-- 'plugin'. Now it counts every generation descended from a Plug-in-invited
-- root — e.g. Customer A invited by Plug-in, Customer B invited by
-- Customer A: B's cups now count as Plug-in too, no matter how many
-- generations down the chain.

-- Every customer who traces back — through any number of customer-to-customer
-- generations via invited_by_customer_id — to a root customer whose own
-- invited_by_type is 'plugin', plus that root itself. "Plug-in Cups" credits
-- every generation of a Plug-in-originated chain, not just the customer
-- Plug-in invited directly. A chain stops the moment someone was invited by
-- a coach instead of a customer (invited_by_customer_id is null there), so
-- it never crosses into an unrelated coach-invited lineage.
create or replace function plugin_lineage_customer_ids(p_club_id uuid default null)
returns table (customer_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with recursive club_customers as (
    select id, invited_by_type, invited_by_customer_id
    from customers
    where nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and nc_club_id in (select visible_club_ids(current_coach_id()))
  ),
  tainted as (
    select id from club_customers where invited_by_type = 'plugin'
    union
    select cc.id
    from club_customers cc
    join tainted t on cc.invited_by_customer_id = t.id
  )
  select id as customer_id from tainted;
$$;

grant execute on function plugin_lineage_customer_ids(uuid) to authenticated;

create or replace function daily_totals(p_date date, p_club_id uuid default null)
returns table (
  total_cups bigint,
  plugin_cups bigint,
  coach_cup_total bigint,
  dine_in_cups bigint,
  takeaway_cups bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(ci.cups), 0) as total_cups,
    coalesce(sum(ci.cups) filter (
      where cu.id in (select customer_id from plugin_lineage_customer_ids(p_club_id))
    ), 0) as plugin_cups,
    -- Mirrors the daily_coach_cups() eligibility rule (coach assigned, not in
    -- coach_cup_excluded_customer_ids), summed across every coach for this
    -- club/date.
    coalesce(sum(ci.cups) filter (
      where cu.coach_id is not null
        and cu.id not in (select customer_id from coach_cup_excluded_customer_ids(p_club_id))
    ), 0) as coach_cup_total,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Dine-in'), 0) as dine_in_cups,
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Take-away'), 0) as takeaway_cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()));
$$;
