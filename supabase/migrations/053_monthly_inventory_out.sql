-- Run this in the Supabase SQL editor on your existing project.
--
-- Powers the new "Consumption VP" stat and per-product breakdown on NC
-- Metrics: total quantity and VP of everything stocked OUT (sold, used,
-- loaned) in a given month, per product. Same p_month/p_club_id/visibility
-- shape as the other monthly_* RPCs. Voided movements don't count, same as
-- inventory_stock_levels().

create or replace function monthly_inventory_out(p_month date, p_club_id uuid default null)
returns table (
  product_id uuid,
  product_name text,
  vp numeric,
  qty bigint,
  total_vp numeric
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
  club_out as (
    select t.product_id, t.quantity
    from inventory_transactions t
    cross join bounds b
    cross join target_club tc
    where t.direction = 'out'
      and not t.voided
      and t.txn_date between b.month_start and b.month_end
      and t.nc_club_id = tc.id
      and t.nc_club_id in (select visible_club_ids(current_coach_id()))
  )
  select
    p.id,
    p.name,
    p.vp,
    sum(co.quantity) as qty,
    sum(co.quantity) * p.vp as total_vp
  from club_out co
  join products p on p.id = co.product_id
  group by p.id, p.name, p.vp
  order by total_vp desc;
$$;

grant execute on function monthly_inventory_out(date, uuid) to authenticated;
