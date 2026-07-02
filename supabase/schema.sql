-- NC App database schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`) on a fresh project.
-- Assumptions made where the spec was ambiguous are called out inline with "ASSUMPTION:".

-- =========================================================================
-- ENUMS
-- =========================================================================

create type coach_level as enum (
  'SC 35%', 'SB 42%', 'Supervisor', 'World Team', 'Active World Team',
  'GET Team', 'GET 2500RO', 'Millionaire Team', 'MT 7500RO', 'President''s Team'
);

create type nc_position as enum ('Owner', 'Internship', 'NC Partner', 'Junior Coach');

create type customer_gender as enum ('Male', 'Female', 'Couple', 'Family', 'Others');

create type customer_nc_level as enum ('5-day', '10-day', '20-day', '30-day');

create type member_type as enum ('MB', 'SC', 'SB', 'SP', 'WT', 'AWT', 'GET');

create type consumption_type as enum ('Dine-in', 'Take-away');

create type invited_by_type as enum ('coach', 'customer', 'plugin');

-- =========================================================================
-- TABLES
-- =========================================================================

create table nc_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ASSUMPTION: sponsor_id is nullable to allow the very first ("founding") coach
-- to register with no sponsor. The UI still requires a choice ("no sponsor" vs
-- pick a coach) so the intent of "required" is preserved for every coach after
-- the first.
create table coaches (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete cascade,
  name text not null,
  contact text not null,
  dob date not null,
  sponsor_id uuid references coaches (id),
  member_id text not null,
  level coach_level not null,
  nc_club_id uuid references nc_clubs (id),
  nc_position nc_position not null,
  is_admin boolean generated always as (nc_position in ('Owner', 'Internship')) stored,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  name text not null,
  gender customer_gender not null,
  contact text not null,
  dob date not null,
  age_override integer,
  nc_level customer_nc_level not null,
  consumption_balance integer not null default 0,
  invited_by_type invited_by_type not null,
  invited_by_coach_id uuid references coaches (id),
  invited_by_customer_id uuid references customers (id),
  member_id text,
  member_type member_type,
  created_by uuid references coaches (id),
  -- Soft delete: customers are never hard-deleted because checkins.customer_id
  -- references them (and we want historical reports to keep working). "Remove"
  -- in the UI sets active = false and hides them from search/listing.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invited_by_consistency check (
    (invited_by_type = 'coach' and invited_by_coach_id is not null and invited_by_customer_id is null) or
    (invited_by_type = 'customer' and invited_by_customer_id is not null and invited_by_coach_id is null) or
    (invited_by_type = 'plugin' and invited_by_coach_id is null and invited_by_customer_id is null)
  )
);

-- ASSUMPTION: checkin_date is supplied by the app (client's local calendar date)
-- rather than derived from the DB server clock, so club-local "today" is correct
-- regardless of where Supabase's servers run.
create table checkins (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  nc_club_id uuid not null references nc_clubs (id),
  cups integer not null check (cups in (1, 2)),
  consumption_type consumption_type not null,
  checkin_date date not null,
  recorded_by uuid references coaches (id),
  voided boolean not null default false,
  created_at timestamptz not null default now()
);

-- Audit trail for admin corrections to a check-in (who changed what and why).
create table checkin_edits (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references checkins (id),
  edited_by uuid not null references coaches (id),
  field_changed text not null,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_customers_nc_club on customers (nc_club_id);
create index idx_customers_invited_by_coach on customers (invited_by_coach_id);
create index idx_customers_invited_by_customer on customers (invited_by_customer_id);
create index idx_customers_name on customers (name);
create index idx_coaches_sponsor on coaches (sponsor_id);
create index idx_checkins_customer on checkins (customer_id);
create index idx_checkins_club_date on checkins (nc_club_id, checkin_date);
create index idx_checkin_edits_checkin on checkin_edits (checkin_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_set_updated_at
before update on customers
for each row execute function set_updated_at();

-- =========================================================================
-- HELPER FUNCTIONS (identity + visibility)
-- =========================================================================

create or replace function current_coach_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from coaches where auth_user_id = auth.uid();
$$;

create or replace function is_current_coach_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from coaches where auth_user_id = auth.uid()), false);
$$;

-- Returns every nc_club a coach is allowed to see reports for: their own club,
-- plus any club whose Owner traces back to them through the sponsor chain
-- (i.e. a branch NC owner who named this coach as their sponsor, directly or
-- via further branches sponsored beneath that owner).
create or replace function visible_club_ids(p_coach_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive downline as (
    select id, nc_club_id, sponsor_id, nc_position
    from coaches
    where id = p_coach_id
    union all
    select c.id, c.nc_club_id, c.sponsor_id, c.nc_position
    from coaches c
    join downline d on c.sponsor_id = d.id
    where c.nc_position = 'Owner'
  )
  select distinct nc_club_id from downline where nc_club_id is not null;
$$;

grant execute on function current_coach_id() to authenticated;
grant execute on function is_current_coach_admin() to authenticated;
grant execute on function visible_club_ids(uuid) to authenticated;

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

alter table nc_clubs enable row level security;
alter table coaches enable row level security;
alter table customers enable row level security;
alter table checkins enable row level security;
alter table checkin_edits enable row level security;

-- nc_clubs: club names aren't sensitive; any signed-in coach can search/create
-- one during onboarding (find-or-create by name).
create policy "nc_clubs_select" on nc_clubs
  for select to authenticated using (true);
create policy "nc_clubs_insert" on nc_clubs
  for insert to authenticated with check (true);

-- coaches: readable by any signed-in coach (needed to populate sponsor /
-- invited-by pickers, including across clubs). Each coach may only create or
-- edit their own profile row.
create policy "coaches_select" on coaches
  for select to authenticated using (true);
create policy "coaches_insert_self" on coaches
  for insert to authenticated with check (auth_user_id = auth.uid());
create policy "coaches_update_self" on coaches
  for update to authenticated using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- customers: visible across visible clubs (own + sponsored branches); only
-- admins (Owner/Internship) may write, and only within their own club.
create policy "customers_select" on customers
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "customers_insert_admin" on customers
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "customers_update_admin" on customers
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

-- No hard-delete policy for customers: checkins reference them, so "removing"
-- a customer is a soft delete (active = false) via the update policy above.

-- checkins / checkin_edits: read-only to clients. All writes go through the
-- SECURITY DEFINER functions below so balance updates + audit rows stay
-- atomic and can't be forged from the client.
create policy "checkins_select" on checkins
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "checkin_edits_select" on checkin_edits
  for select to authenticated
  using (
    checkin_id in (
      select id from checkins where nc_club_id in (select visible_club_ids(current_coach_id()))
    )
  );

-- =========================================================================
-- WRITE RPCs (check-in, corrections)
-- =========================================================================

create or replace function record_checkin(
  p_customer_id uuid,
  p_cups integer,
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
  v_result checkins;
begin
  if v_coach_id is null then
    raise exception 'Not a registered coach';
  end if;
  if p_cups not in (1, 2) then
    raise exception 'Cups must be 1 or 2';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  if not exists (select 1 from customers where id = p_customer_id and nc_club_id = v_club_id and active) then
    raise exception 'Customer not found in your club';
  end if;

  insert into checkins (customer_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by)
  values (p_customer_id, v_club_id, p_cups, p_consumption_type, p_checkin_date, v_coach_id)
  returning * into v_result;

  update customers set consumption_balance = consumption_balance - p_cups
  where id = p_customer_id;

  return v_result;
end;
$$;

create or replace function correct_checkin(
  p_checkin_id uuid,
  p_new_cups integer,
  p_new_consumption_type consumption_type,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := current_coach_id();
  v_checkin checkins%rowtype;
  v_delta integer;
begin
  if v_editor_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can correct check-ins';
  end if;
  if p_new_cups not in (1, 2) then
    raise exception 'Cups must be 1 or 2';
  end if;

  select * into v_checkin from checkins where id = p_checkin_id for update;
  if not found then
    raise exception 'Check-in not found';
  end if;
  if v_checkin.voided then
    raise exception 'Cannot edit a voided check-in';
  end if;
  if v_checkin.nc_club_id <> (select nc_club_id from coaches where id = v_editor_id) then
    raise exception 'Cannot edit check-ins outside your club';
  end if;

  if v_checkin.cups is distinct from p_new_cups then
    insert into checkin_edits (checkin_id, edited_by, field_changed, old_value, new_value, reason)
    values (p_checkin_id, v_editor_id, 'cups', v_checkin.cups::text, p_new_cups::text, p_reason);
  end if;
  if v_checkin.consumption_type is distinct from p_new_consumption_type then
    insert into checkin_edits (checkin_id, edited_by, field_changed, old_value, new_value, reason)
    values (p_checkin_id, v_editor_id, 'consumption_type', v_checkin.consumption_type::text, p_new_consumption_type::text, p_reason);
  end if;

  v_delta := p_new_cups - v_checkin.cups;

  update checkins
  set cups = p_new_cups, consumption_type = p_new_consumption_type
  where id = p_checkin_id;

  if v_delta <> 0 then
    update customers set consumption_balance = consumption_balance - v_delta
    where id = v_checkin.customer_id;
  end if;
end;
$$;

create or replace function void_checkin(p_checkin_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := current_coach_id();
  v_checkin checkins%rowtype;
begin
  if v_editor_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can void check-ins';
  end if;

  select * into v_checkin from checkins where id = p_checkin_id for update;
  if not found then
    raise exception 'Check-in not found';
  end if;
  if v_checkin.voided then
    raise exception 'Already voided';
  end if;
  if v_checkin.nc_club_id <> (select nc_club_id from coaches where id = v_editor_id) then
    raise exception 'Cannot edit check-ins outside your club';
  end if;

  insert into checkin_edits (checkin_id, edited_by, field_changed, old_value, new_value, reason)
  values (p_checkin_id, v_editor_id, 'voided', 'false', 'true', p_reason);

  update checkins set voided = true where id = p_checkin_id;
  update customers set consumption_balance = consumption_balance + v_checkin.cups
  where id = v_checkin.customer_id;
end;
$$;

grant execute on function record_checkin(uuid, integer, consumption_type, date) to authenticated;
grant execute on function correct_checkin(uuid, integer, consumption_type, text) to authenticated;
grant execute on function void_checkin(uuid, text) to authenticated;

-- =========================================================================
-- REPORTING RPCs
-- =========================================================================

create or replace function daily_totals(p_date date)
returns table (total_cups bigint, plugin_cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(ci.cups), 0) as total_cups,
    coalesce(sum(ci.cups) filter (where cu.invited_by_type = 'plugin'), 0) as plugin_cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()));
$$;

-- ASSUMPTION: "Coach's Cup" is grouped by the coach the customer was
-- originally invited by (their sponsor), matching "categories by same
-- sponsor" in the spec. Only counts customers with a non-null member_id and
-- member_type in (MB, SC, SB), per spec.
create or replace function daily_coach_cups(p_date date)
returns table (coach_id uuid, coach_name text, cups bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups), 0) as cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  join coaches co on co.id = cu.invited_by_coach_id
  where ci.checkin_date = p_date
    and not ci.voided
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and cu.member_id is not null
    and cu.member_type in ('MB', 'SC', 'SB')
  group by co.id, co.name
  order by cups desc;
$$;

-- ASSUMPTION: "next 3 days" birthdays are relative to real today, independent
-- of whatever date is selected on the Daily Report page. Feb 29 birthdays in
-- a non-leap upcoming year are skipped rather than shifted.
create or replace function upcoming_birthdays()
returns table (customer_id uuid, name text, dob date, days_until int)
language sql
stable
security definer
set search_path = public
as $$
  with next_bday as (
    select
      cu.id as customer_id,
      cu.name,
      cu.dob,
      (
        make_date(
          extract(year from current_date)::int +
            case when to_char(cu.dob, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
          extract(month from cu.dob)::int,
          extract(day from cu.dob)::int
        ) - current_date
      )::int as days_until
    from customers cu
    where cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and not (extract(month from cu.dob) = 2 and extract(day from cu.dob) = 29)
  )
  select * from next_bday where days_until between 0 and 3 order by days_until;
$$;

-- ASSUMPTION: "Average NC Cups" / "Average Coach Cups" for a month = total
-- cups / days elapsed so far (for the current month) or / total days in the
-- month (for a past month) — not divided by 30 flat, and not skipping
-- zero-checkin days.
create or replace function monthly_totals(p_month date)
returns table (total_cups bigint, days_in_period int, avg_daily_cups numeric)
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
  effective as (
    select month_start, least(month_end, current_date) as effective_end
    from bounds
  ),
  days as (
    select (greatest(effective_end, month_start) - month_start + 1)::int as n from effective
  )
  select
    coalesce(sum(ci.cups), 0) as total_cups,
    (select n from days) as days_in_period,
    round(coalesce(sum(ci.cups), 0)::numeric / nullif((select n from days), 0), 2) as avg_daily_cups
  from checkins ci
  cross join bounds b
  where ci.checkin_date between b.month_start and b.month_end
    and not ci.voided
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()));
$$;

create or replace function monthly_coach_cups(p_month date)
returns table (coach_id uuid, coach_name text, total_cups bigint, avg_daily_cups numeric)
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
  effective as (
    select month_start, least(month_end, current_date) as effective_end
    from bounds
  ),
  days as (
    select (greatest(effective_end, month_start) - month_start + 1)::int as n from effective
  )
  select
    co.id as coach_id,
    co.name as coach_name,
    coalesce(sum(ci.cups), 0) as total_cups,
    round(coalesce(sum(ci.cups), 0)::numeric / nullif((select n from days), 0), 2) as avg_daily_cups
  from checkins ci
  join customers cu on cu.id = ci.customer_id
  join coaches co on co.id = cu.invited_by_coach_id
  cross join bounds b
  where ci.checkin_date between b.month_start and b.month_end
    and not ci.voided
    and ci.nc_club_id in (select visible_club_ids(current_coach_id()))
    and cu.member_id is not null
    and cu.member_type in ('MB', 'SC', 'SB')
  group by co.id, co.name
  order by total_cups desc;
$$;

grant execute on function daily_totals(date) to authenticated;
grant execute on function daily_coach_cups(date) to authenticated;
grant execute on function upcoming_birthdays() to authenticated;
grant execute on function monthly_totals(date) to authenticated;
grant execute on function monthly_coach_cups(date) to authenticated;
