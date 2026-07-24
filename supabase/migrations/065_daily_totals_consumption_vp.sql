-- Adds consumption_vp to daily_totals() so the Daily Report page can show
-- it up top, same as Branches already does. Changing a RETURNS TABLE
-- column list requires dropping the function first.
drop function if exists daily_totals(date, uuid);

create or replace function daily_totals(p_date date, p_club_id uuid default null)
returns table (
  total_cups bigint,
  plugin_cups bigint,
  coach_cup_total bigint,
  dine_in_cups bigint,
  takeaway_cups bigint,
  consumption_vp numeric
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
    coalesce(sum(ci.cups) filter (where ci.consumption_type = 'Take-away'), 0) as takeaway_cups,
    -- Same definition as branches_daily_summary's consumption_vp: stock-out
    -- with no customer_id (team's own consumption, not a sale/loan).
    coalesce((
      select sum(t.quantity * p.vp)
      from inventory_transactions t
      join products p on p.id = t.product_id
      where t.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
        and t.direction = 'out'
        and not t.voided
        and t.customer_id is null
        and t.txn_date = p_date
    ), 0) as consumption_vp
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()));
$$;

grant execute on function daily_totals(date, uuid) to authenticated;
