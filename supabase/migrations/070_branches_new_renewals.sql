-- Per-customer detail behind the New 5-Day / 10-Day / 20-Day / 30-Day stats
-- on /branches — same counting rules as the new_signups/renewals CTEs inside
-- branches_daily_summary, so the list here always matches that number.
create or replace function branches_new_renewals(p_date date)
returns table (
  club_id uuid,
  nc_level customer_nc_level,
  kind text,
  customer_name text,
  coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  )
  select
    cu.nc_club_id as club_id,
    cu.nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  left join coaches co on co.id = cu.created_by
  where cu.nc_club_id in (select club_id from my_clubs)
    and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
    and cu.created_at::date = p_date

  union all

  select
    cu.nc_club_id as club_id,
    cr.nc_level,
    'renewal'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cr.created_at
  from customer_renewals cr
  join customers cu on cu.id = cr.customer_id
  left join coaches co on co.id = cr.renewed_by
  where cu.nc_club_id in (select club_id from my_clubs)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date = p_date

  order by club_id, nc_level, created_at desc;
$$;

grant execute on function branches_new_renewals(date) to authenticated;
