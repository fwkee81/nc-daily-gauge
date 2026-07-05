-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds invited_by_type to monthly_package_sales()'s output, so NC
-- Metrics' 5/10/20/30-Day sections can label a coachless customer
-- "Plug-in" instead of "Unassigned" when that's actually who invited
-- them (a customer with no coach relationship but still invited by
-- another coach/customer stays "Unassigned").

drop function if exists monthly_package_sales(date, uuid);

create or replace function monthly_package_sales(p_month date, p_club_id uuid default null)
returns table (
  nc_level text,
  coach_id uuid,
  coach_name text,
  customer_id uuid,
  customer_name text,
  entry_date date,
  kind text,
  invited_by_type text
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  new_customers as (
    select
      cu.nc_level::text as nc_level,
      cu.coach_id,
      co.name as coach_name,
      cu.id as customer_id,
      cu.name as customer_name,
      cu.created_at::date as entry_date,
      'new' as kind,
      cu.invited_by_type::text as invited_by_type
    from customers cu
    left join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id = (select id from target_club)
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cu.nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between b.month_start and b.month_end
  ),
  renewals as (
    select
      cr.nc_level::text as nc_level,
      cu.coach_id,
      co.name as coach_name,
      cu.id as customer_id,
      cu.name as customer_name,
      cr.created_at::date as entry_date,
      'renewed' as kind,
      cu.invited_by_type::text as invited_by_type
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    left join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id = (select id from target_club)
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between b.month_start and b.month_end
  )
  select * from new_customers
  union all
  select * from renewals
  order by nc_level, coach_name nulls last, entry_date;
$$;

grant execute on function monthly_package_sales(date, uuid) to authenticated;
