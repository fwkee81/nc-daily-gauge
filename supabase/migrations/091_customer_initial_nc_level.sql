-- customers.nc_level is CURRENT package level and gets overwritten by
-- renew_customer() on every renewal — so every "New 5-Day / 10-Day / 20-Day
-- / 30-Day" count in the app (NC Metrics Daily/Weekly/Monthly, and the
-- three matching /branches tabs) was reading it to decide what level a
-- customer's SIGN-UP counted as. A customer who signs up 5-Day and renews
-- to 30-Day in the same window was silently misattributed as a new 30-Day
-- signup, with the real 5-Day signup vanishing from every report.
--
-- initial_nc_level is set once at creation and never touched again, so it
-- reliably answers "what level did they start at" regardless of anything
-- that happens afterward. Existing rows are backfilled from their current
-- nc_level — exact for anyone who has never renewed, a best-effort (and
-- now permanently unrecoverable) guess for anyone who has, since the true
-- original level was never recorded before this migration. Every function
-- that classifies a "new" signup is updated to read initial_nc_level
-- instead; renewal-side logic already reads customer_renewals (its own
-- immutable log per event) and is untouched.
alter table customers add column initial_nc_level customer_nc_level;
update customers set initial_nc_level = nc_level where initial_nc_level is null;
alter table customers alter column initial_nc_level set not null;

-- record_walkin_checkin() is the only other INSERT into customers — an Ala
-- Carte walk-in always starts (and stays) Ala Carte, so initial_nc_level is
-- just a fixed literal here, same as nc_level already was.
create or replace function record_walkin_checkin(
  p_name text,
  p_contact text,
  p_invited_by_type invited_by_type,
  p_invited_by_coach_id uuid,
  p_invited_by_customer_id uuid,
  p_consumption_type consumption_type,
  p_checkin_date date
)
returns checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_club_id uuid;
  v_customer_id uuid;
  v_result checkins;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can add a walk-in customer';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Name is required';
  end if;
  if p_contact is null or btrim(p_contact) = '' then
    raise exception 'Contact is required';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  insert into customers (
    nc_club_id, name, gender, contact, dob, nc_level, initial_nc_level, consumption_balance,
    invited_by_type, invited_by_coach_id, invited_by_customer_id, coach_id,
    created_by, active
  )
  values (
    v_club_id, p_name, 'Others', p_contact, null, 'Ala Carte', 'Ala Carte', 1,
    p_invited_by_type, p_invited_by_coach_id, p_invited_by_customer_id,
    -- Invited by a coach: attribute directly to that coach. Invited by a
    -- customer: inherit whichever coach that customer is under, so the
    -- walk-in still counts toward Coach's Cup instead of falling through
    -- with no coach at all. Plug-in has no coach to attribute to.
    case
      when p_invited_by_type = 'coach' then p_invited_by_coach_id
      when p_invited_by_type = 'customer' then (
        select coach_id from customers where id = p_invited_by_customer_id
      )
      else null
    end,
    v_coach_id, true
  )
  returning id into v_customer_id;

  insert into checkins (customer_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by)
  values (v_customer_id, v_club_id, 1, p_consumption_type, p_checkin_date, v_coach_id)
  returning * into v_result;

  update customers set consumption_balance = 0 where id = v_customer_id;

  return v_result;
end;
$$;

-- The 10 functions below all classify a customer's package-level events
-- ("new" vs "renewed") for the New 5-Day/10-Day/20-Day/30-Day stats — every
-- one switches its "new" branch from cu.nc_level to cu.initial_nc_level.
-- The "renewed" branch (customer_renewals.nc_level) is unaffected.

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
      cu.initial_nc_level::text as nc_level,
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
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
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

create or replace function weekly_totals(p_date date default current_date, p_club_id uuid default null)
returns table (
  operating_days int,
  window_start date,
  window_end date,
  total_cups bigint,
  coach_cup_total bigint,
  consumption_vp numeric,
  total_5day bigint,
  total_10day bigint,
  total_20day bigint,
  total_30day bigint,
  daily jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  ranked_days as (
    select checkin_date, row_number() over (order by checkin_date desc) as rn
    from (
      select distinct checkin_date
      from checkins
      where nc_club_id = (select id from target_club)
        and nc_club_id in (select visible_club_ids(current_coach_id()))
        and not voided
        and checkin_date <= p_date
    ) d
  ),
  window_days as (
    select checkin_date from ranked_days where rn <= 6
  ),
  windows as (
    select min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from window_days
  ),
  excluded as (
    select customer_id, excluded_since from coach_cup_exclusion_dates((select id from target_club))
  ),
  cup_totals as (
    select
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
          )
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = (select id from target_club) and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
  ),
  inv_totals as (
    select coalesce(sum(t.quantity * p.vp), 0) as consumption_vp
    from windows w
    left join inventory_transactions t
      on t.nc_club_id = (select id from target_club) and t.direction = 'out' and not t.voided and t.customer_id is null
      and t.txn_date between w.window_start and w.window_end
    left join products p on p.id = t.product_id
  ),
  daily_cup_totals as (
    select
      wd.checkin_date,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded e where e.customer_id = cu.id and ci.checkin_date >= e.excluded_since
          )
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = (select id from target_club) and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
    group by wd.checkin_date
  ),
  daily_json as (
    select jsonb_agg(
      jsonb_build_object('date', checkin_date, 'total_cups', total_cups, 'coach_cup_total', coach_cup_total)
      order by checkin_date
    ) as daily
    from daily_cup_totals
  ),
  new_signups as (
    select cu.initial_nc_level as nc_level, count(*) as n
    from customers cu
    cross join windows w
    where cu.nc_club_id = (select id from target_club)
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between w.window_start and w.window_end
    group by cu.initial_nc_level
  ),
  renewals as (
    select cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    cross join windows w
    where cu.nc_club_id = (select id from target_club)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between w.window_start and w.window_end
    group by cr.nc_level
  )
  select
    coalesce(w.operating_days, 0),
    w.window_start,
    w.window_end,
    coalesce(ct.total_cups, 0),
    coalesce(ct.coach_cup_total, 0),
    coalesce(it.consumption_vp, 0),
    coalesce((select n from new_signups where nc_level = '5-day'), 0),
    coalesce((select n from new_signups where nc_level = '10-day'), 0)
      + coalesce((select n from renewals where nc_level = '10-day'), 0),
    coalesce((select n from new_signups where nc_level = '20-day'), 0)
      + coalesce((select n from renewals where nc_level = '20-day'), 0),
    coalesce((select n from new_signups where nc_level = '30-day'), 0)
      + coalesce((select n from renewals where nc_level = '30-day'), 0),
    coalesce(dj.daily, '[]'::jsonb)
  from windows w
  left join cup_totals ct on true
  left join inv_totals it on true
  left join daily_json dj on true;
$$;

create or replace function weekly_new_renewals(p_date date default current_date, p_club_id uuid default null)
returns table (
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
  with target_club as (
    select coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid())) as id
  ),
  ranked_days as (
    select checkin_date, row_number() over (order by checkin_date desc) as rn
    from (
      select distinct checkin_date
      from checkins
      where nc_club_id = (select id from target_club)
        and nc_club_id in (select visible_club_ids(current_coach_id()))
        and not voided
        and checkin_date <= p_date
    ) d
  ),
  windows as (
    select min(checkin_date) as window_start, max(checkin_date) as window_end
    from ranked_days
    where rn <= 6
  )
  select
    cu.initial_nc_level as nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  cross join windows w
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id = (select id from target_club)
    and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
    and cu.created_at::date between w.window_start and w.window_end

  union all

  select
    cr.nc_level,
    'renewal'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cr.created_at
  from customer_renewals cr
  join customers cu on cu.id = cr.customer_id
  cross join windows w
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id = (select id from target_club)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date between w.window_start and w.window_end

  order by nc_level, created_at desc;
$$;

create or replace function branches_daily_summary(p_date date)
returns table (
  club_id uuid,
  club_name text,
  total_cups bigint,
  prev_total_cups bigint,
  coach_cup_total bigint,
  prev_coach_cup_total bigint,
  consumption_vp numeric,
  prev_consumption_vp numeric,
  new_5day bigint,
  prev_new_5day bigint,
  total_10day bigint,
  prev_total_10day bigint,
  total_20day bigint,
  prev_total_20day bigint,
  total_30day bigint,
  prev_total_30day bigint,
  prev_date date
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  prev_days as (
    select mc.club_id, max(ci.checkin_date) as prev_date
    from my_clubs mc
    left join checkins ci
      on ci.nc_club_id = mc.club_id and ci.checkin_date < p_date and not ci.voided
    group by mc.club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  cup_totals as (
    select
      mc.club_id,
      coalesce(sum(ci.cups) filter (where ci.checkin_date = p_date), 0) as total_cups,
      coalesce(sum(ci.cups) filter (where ci.checkin_date = pd.prev_date), 0) as prev_total_cups,
      coalesce(sum(ci.cups) filter (
        where ci.checkin_date = p_date
          and cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = mc.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
          )
      ), 0) as coach_cup_total,
      coalesce(sum(ci.cups) filter (
        where ci.checkin_date = pd.prev_date
          and cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = mc.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
          )
      ), 0) as prev_coach_cup_total
    from my_clubs mc
    left join prev_days pd on pd.club_id = mc.club_id
    left join checkins ci
      on ci.nc_club_id = mc.club_id and not ci.voided
      and (ci.checkin_date = p_date or ci.checkin_date = pd.prev_date)
    left join customers cu on cu.id = ci.customer_id
    group by mc.club_id
  ),
  inv_totals as (
    select
      mc.club_id,
      coalesce(sum(t.quantity * p.vp) filter (where t.txn_date = p_date), 0) as consumption_vp,
      coalesce(sum(t.quantity * p.vp) filter (where t.txn_date = pd.prev_date), 0) as prev_consumption_vp
    from my_clubs mc
    left join prev_days pd on pd.club_id = mc.club_id
    left join inventory_transactions t
      on t.nc_club_id = mc.club_id and t.direction = 'out' and not t.voided and t.customer_id is null
      and (t.txn_date = p_date or t.txn_date = pd.prev_date)
    left join products p on p.id = t.product_id
    group by mc.club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.initial_nc_level as nc_level, cu.created_at::date as d, count(*) as n
    from customers cu
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
    group by cu.nc_club_id, cu.initial_nc_level, cu.created_at::date
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, cr.created_at::date as d, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level in ('10-day', '20-day', '30-day')
    group by cu.nc_club_id, cr.nc_level, cr.created_at::date
  )
  select
    mc.club_id,
    mc.club_name,
    coalesce(ct.total_cups, 0) as total_cups,
    coalesce(ct.prev_total_cups, 0) as prev_total_cups,
    coalesce(ct.coach_cup_total, 0) as coach_cup_total,
    coalesce(ct.prev_coach_cup_total, 0) as prev_coach_cup_total,
    coalesce(it.consumption_vp, 0) as consumption_vp,
    coalesce(it.prev_consumption_vp, 0) as prev_consumption_vp,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day' and ns.d = p_date), 0) as new_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day' and ns.d = pd.prev_date), 0) as prev_new_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day' and ns.d = p_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day' and r.d = p_date), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day' and ns.d = pd.prev_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day' and r.d = pd.prev_date), 0) as prev_total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day' and ns.d = p_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day' and r.d = p_date), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day' and ns.d = pd.prev_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day' and r.d = pd.prev_date), 0) as prev_total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day' and ns.d = p_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day' and r.d = p_date), 0) as total_30day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day' and ns.d = pd.prev_date), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day' and r.d = pd.prev_date), 0) as prev_total_30day,
    pd.prev_date
  from my_clubs mc
  left join prev_days pd on pd.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  left join inv_totals it on it.club_id = mc.club_id
  -- Own club first, then branches ranked by today's Total Cups (highest first).
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    coalesce(ct.total_cups, 0) desc,
    mc.club_name;
$$;

create or replace function branches_weekly_summary(p_date date default current_date)
returns table (
  club_id uuid,
  club_name text,
  operating_days int,
  window_start date,
  window_end date,
  total_cups bigint,
  coach_cup_total bigint,
  consumption_vp numeric,
  total_5day bigint,
  total_10day bigint,
  total_20day bigint,
  total_30day bigint,
  daily jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
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
  window_days as (
    select club_id, checkin_date
    from ranked_days
    where rn <= 6
  ),
  windows as (
    select club_id, min(checkin_date) as window_start, max(checkin_date) as window_end, count(*) as operating_days
    from window_days
    group by club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  cup_totals as (
    select
      wd.club_id,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = wd.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
          )
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = wd.club_id and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
    group by wd.club_id
  ),
  inv_totals as (
    select
      w.club_id,
      coalesce(sum(t.quantity * p.vp), 0) as consumption_vp
    from windows w
    left join inventory_transactions t
      on t.nc_club_id = w.club_id and t.direction = 'out' and not t.voided and t.customer_id is null
      and t.txn_date between w.window_start and w.window_end
    left join products p on p.id = t.product_id
    group by w.club_id
  ),
  daily_cup_totals as (
    select
      wd.club_id,
      wd.checkin_date,
      coalesce(sum(ci.cups), 0) as total_cups,
      coalesce(sum(ci.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = wd.club_id and ec.customer_id = cu.id and ci.checkin_date >= ec.excluded_since
          )
      ), 0) as coach_cup_total
    from window_days wd
    join checkins ci on ci.nc_club_id = wd.club_id and ci.checkin_date = wd.checkin_date and not ci.voided
    join customers cu on cu.id = ci.customer_id
    group by wd.club_id, wd.checkin_date
  ),
  daily_json as (
    select
      club_id,
      jsonb_agg(
        jsonb_build_object(
          'date', checkin_date,
          'total_cups', total_cups,
          'coach_cup_total', coach_cup_total
        )
        order by checkin_date
      ) as daily
    from daily_cup_totals
    group by club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.initial_nc_level as nc_level, count(*) as n
    from customers cu
    join windows w on w.club_id = cu.nc_club_id
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between w.window_start and w.window_end
    group by cu.nc_club_id, cu.initial_nc_level
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    join windows w on w.club_id = cu.nc_club_id
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between w.window_start and w.window_end
    group by cu.nc_club_id, cr.nc_level
  )
  select
    mc.club_id,
    mc.club_name,
    coalesce(w.operating_days, 0) as operating_days,
    w.window_start,
    w.window_end,
    coalesce(ct.total_cups, 0) as total_cups,
    coalesce(ct.coach_cup_total, 0) as coach_cup_total,
    coalesce(it.consumption_vp, 0) as consumption_vp,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day'), 0) as total_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day'), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day'), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day'), 0) as total_30day,
    coalesce(dj.daily, '[]'::jsonb) as daily
  from my_clubs mc
  left join windows w on w.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  left join inv_totals it on it.club_id = mc.club_id
  left join daily_json dj on dj.club_id = mc.club_id
  -- Own club first, then branches ranked by Total Cups over the window
  -- (highest first).
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    coalesce(ct.total_cups, 0) desc,
    mc.club_name;
$$;

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
    cu.initial_nc_level as nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  join windows w on w.club_id = cu.nc_club_id
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
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
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date between w.window_start and w.window_end

  order by club_id, nc_level, created_at desc;
$$;

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
    cu.initial_nc_level as nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
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
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date = p_date

  order by club_id, nc_level, created_at desc;
$$;

create or replace function branches_monthly_summary(p_month date)
returns table (
  club_id uuid,
  club_name text,
  operating_days int,
  avg_daily_cups numeric,
  coach_cup_avg_daily numeric,
  consumption_vp numeric,
  total_5day bigint,
  total_10day bigint,
  total_20day bigint,
  total_30day bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  club_checkins as (
    select ci.nc_club_id as club_id, ci.cups, ci.checkin_date, ci.customer_id
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id in (select club_id from my_clubs)
  ),
  operating_days as (
    select club_id, count(distinct checkin_date) as n
    from club_checkins
    group by club_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  cup_totals as (
    select
      cc.club_id,
      coalesce(sum(cc.cups), 0) as total_cups,
      coalesce(sum(cc.cups) filter (
        where cu.coach_id is not null
          and not exists (
            select 1 from excluded_per_club ec
            where ec.club_id = cc.club_id and ec.customer_id = cu.id and cc.checkin_date >= ec.excluded_since
          )
      ), 0) as coach_cup_total
    from club_checkins cc
    join customers cu on cu.id = cc.customer_id
    group by cc.club_id
  ),
  inv_totals as (
    select
      mc.club_id,
      coalesce(sum(t.quantity * p.vp), 0) as consumption_vp
    from my_clubs mc
    cross join bounds b
    left join inventory_transactions t
      on t.nc_club_id = mc.club_id and t.direction = 'out' and not t.voided and t.customer_id is null
      and t.txn_date between b.month_start and b.month_end
    left join products p on p.id = t.product_id
    group by mc.club_id
  ),
  new_signups as (
    select cu.nc_club_id as club_id, cu.initial_nc_level as nc_level, count(*) as n
    from customers cu
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
      and cu.created_at::date between b.month_start and b.month_end
    group by cu.nc_club_id, cu.initial_nc_level
  ),
  renewals as (
    select cu.nc_club_id as club_id, cr.nc_level, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cr.nc_level in ('10-day', '20-day', '30-day')
      and cr.created_at::date between b.month_start and b.month_end
    group by cu.nc_club_id, cr.nc_level
  )
  select
    mc.club_id,
    mc.club_name,
    coalesce(od.n, 0) as operating_days,
    round(coalesce(ct.total_cups, 0)::numeric / nullif(od.n, 0), 2) as avg_daily_cups,
    round(coalesce(ct.coach_cup_total, 0)::numeric / nullif(od.n, 0), 2) as coach_cup_avg_daily,
    coalesce(it.consumption_vp, 0) as consumption_vp,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '5-day'), 0) as total_5day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '10-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '10-day'), 0) as total_10day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '20-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '20-day'), 0) as total_20day,
    coalesce((select n from new_signups ns where ns.club_id = mc.club_id and ns.nc_level = '30-day'), 0)
      + coalesce((select n from renewals r where r.club_id = mc.club_id and r.nc_level = '30-day'), 0) as total_30day
  from my_clubs mc
  left join operating_days od on od.club_id = mc.club_id
  left join cup_totals ct on ct.club_id = mc.club_id
  left join inv_totals it on it.club_id = mc.club_id
  -- Own club first, then branches ranked by this month's Avg Cups / Day
  -- (highest first) — clubs with no operating days yet sort to the end.
  order by
    (mc.club_id <> (select nc_club_id from coaches where auth_user_id = auth.uid())),
    round(coalesce(ct.total_cups, 0)::numeric / nullif(od.n, 0), 2) desc nulls last,
    mc.club_name;
$$;

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
    cu.initial_nc_level as nc_level,
    'new'::text as kind,
    cu.name as customer_name,
    co.name as coach_name,
    cu.created_at
  from customers cu
  cross join bounds b
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cu.initial_nc_level in ('5-day', '10-day', '20-day', '30-day')
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
  left join coaches co on co.id = cu.coach_id
  where cu.nc_club_id in (select club_id from my_clubs)
    and cr.nc_level in ('10-day', '20-day', '30-day')
    and cr.created_at::date between b.month_start and b.month_end

  order by club_id, nc_level, created_at desc;
$$;

create or replace function branches_monthly_leaderboards(p_month date)
returns table (
  board text,
  coach_id uuid,
  coach_name text,
  club_id uuid,
  club_name text,
  value numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with my_clubs as (
    select nc.id as club_id, nc.name as club_name
    from nc_clubs nc
    where nc.id in (select visible_club_ids(current_coach_id()))
  ),
  bounds as (
    select
      date_trunc('month', p_month)::date as month_start,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as month_end
  ),
  new_5day_by_coach as (
    select cu.coach_id, count(*) as n
    from customers cu
    join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_club_id = co.nc_club_id
      and cu.initial_nc_level = '5-day'
      and cu.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  new_30_signups as (
    select cu.coach_id, count(*) as n
    from customers cu
    join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_club_id = co.nc_club_id
      and cu.initial_nc_level = '30-day'
      and cu.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  renew_30 as (
    select cu.coach_id, count(*) as n
    from customer_renewals cr
    join customers cu on cu.id = cr.customer_id
    join coaches co on co.id = cu.coach_id
    cross join bounds b
    where cu.nc_club_id in (select club_id from my_clubs)
      and cu.nc_club_id = co.nc_club_id
      and cr.nc_level = '30-day'
      and cr.created_at::date between b.month_start and b.month_end
      and cu.coach_id is not null
    group by cu.coach_id
  ),
  total_30_by_coach as (
    select coach_id, sum(n) as n
    from (
      select coach_id, n from new_30_signups
      union all
      select coach_id, n from renew_30
    ) x
    group by coach_id
  ),
  excluded_per_club as (
    select mc.club_id, e.customer_id, e.excluded_since
    from my_clubs mc
    cross join lateral coach_cup_exclusion_dates(mc.club_id) e
  ),
  club_checkins as (
    select ci.nc_club_id as club_id, ci.cups, ci.checkin_date, ci.customer_id
    from checkins ci
    cross join bounds b
    where ci.checkin_date between b.month_start and b.month_end
      and not ci.voided
      and ci.nc_club_id in (select club_id from my_clubs)
  ),
  operating_days as (
    select club_id, count(distinct checkin_date) as n
    from club_checkins
    group by club_id
  ),
  coach_cup_by_coach as (
    select cu.coach_id, cc.club_id, coalesce(sum(cc.cups), 0) as total_cups
    from club_checkins cc
    join customers cu on cu.id = cc.customer_id
    join coaches co on co.id = cu.coach_id
    where cu.coach_id is not null
      and co.nc_club_id = cc.club_id
      and not exists (
        select 1 from excluded_per_club ec
        where ec.club_id = cc.club_id and ec.customer_id = cu.id and cc.checkin_date >= ec.excluded_since
      )
    group by cu.coach_id, cc.club_id
  ),
  coach_cup_avg_rows as (
    select
      co.id as coach_id,
      co.name as coach_name,
      nc.id as club_id,
      nc.name as club_name,
      round(cb.total_cups::numeric / od.n, 2) as value
    from coach_cup_by_coach cb
    join coaches co on co.id = cb.coach_id
    join nc_clubs nc on nc.id = co.nc_club_id
    join operating_days od on od.club_id = cb.club_id and od.n > 0
  )
  select 'new_5day' as board, co.id as coach_id, co.name as coach_name, nc.id as club_id, nc.name as club_name, n5.n::numeric as value
  from new_5day_by_coach n5
  join coaches co on co.id = n5.coach_id
  join nc_clubs nc on nc.id = co.nc_club_id
  union all
  select 'total_30day', co.id, co.name, nc.id, nc.name, t30.n::numeric
  from total_30_by_coach t30
  join coaches co on co.id = t30.coach_id
  join nc_clubs nc on nc.id = co.nc_club_id
  union all
  select 'coach_cup_avg', coach_id, coach_name, club_id, club_name, value
  from coach_cup_avg_rows
  order by board, value desc;
$$;

