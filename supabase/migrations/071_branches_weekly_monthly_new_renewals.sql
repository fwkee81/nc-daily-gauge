-- Per-customer detail behind the New 5-Day / 10-Day / 20-Day / 30-Day stats
-- on the Branches "Weekly" tab — mirrors the new_signups/renewals CTEs
-- inside branches_weekly_summary (same per-club "last 6 operating days"
-- window), so the list always matches that number.
create or replace function branches_weekly_new_renewals(p_date date default current_date)
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
  ),
  ranked_days as (
    select
      ci.nc_club_id as club_id,
      ci.checkin_date,
      row_number() over (partition by ci.nc_club_id order by ci.checkin_date desc) as rn
    from (
      select distinct nc_club_id, checkin_date
      from checkins
      where not voided and checkin_date <= p_date
    ) ci
    where ci.nc_club_id in (select club_id from my_clubs)
  ),
  windows as (
    select club_id, min(checkin_date) as window_start, max(checkin_date) as window_end
    from ranked_days
    where rn <= 6
    group by club_id
  )
  select
    cu.nc_club_id as club_id,
    cu.nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  join windows w on w.club_id = cu.nc_club_id
  left join coaches co on co.id = cu.created_by
  where cu.nc_club_id in (select club_id from my_clubs)
    and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
    and cu.created_at::date between w.window_start and w.window_end

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
  join windows w on w.club_id = cu.nc_club_id
  left join coaches co on co.id = cr.renewed_by
  where cu.nc_club_id in (select club_id from my_clubs)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date between w.window_start and w.window_end

  order by club_id, nc_level, created_at desc;
$$;

-- Per-customer detail behind the New 5-Day / 10-Day / 20-Day / 30-Day stats
-- on the Branches "Monthly" tab — mirrors the new_signups/renewals CTEs
-- inside branches_monthly_summary (same calendar-month bounds), so the list
-- always matches that number.
create or replace function branches_monthly_new_renewals(p_month date)
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
  ),
  bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  )
  select
    cu.nc_club_id as club_id,
    cu.nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  cross join bounds b
  left join coaches co on co.id = cu.created_by
  where cu.nc_club_id in (select club_id from my_clubs)
    and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
    and cu.created_at::date between b.month_start and b.month_end

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
  cross join bounds b
  left join coaches co on co.id = cr.renewed_by
  where cu.nc_club_id in (select club_id from my_clubs)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date between b.month_start and b.month_end

  order by club_id, nc_level, created_at desc;
$$;

grant execute on function branches_weekly_new_renewals(date) to authenticated;
grant execute on function branches_monthly_new_renewals(date) to authenticated;
