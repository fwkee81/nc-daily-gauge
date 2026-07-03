-- Run this in the Supabase SQL editor on your existing project.
--
-- Adds support for a spouse/family member who shares an existing customer's
-- consumption balance and NC package, but should still be found by their
-- own name at check-in (e.g. the spouse walks in without the account
-- holder). Their check-ins deduct from the parent customer's balance, and
-- their birthday shows up on Daily Report alongside regular customers.

create table customer_members (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  name text not null,
  contact text,
  dob date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_customer_members_customer on customer_members (customer_id);

alter table checkins add column member_id uuid references customer_members (id);
create index idx_checkins_member on checkins (member_id);

alter table customer_members enable row level security;

create policy "customer_members_select" on customer_members
  for select to authenticated
  using (
    customer_id in (
      select id from customers where nc_club_id in (select visible_club_ids(current_coach_id()))
    )
  );

create policy "customer_members_insert_admin" on customer_members
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and customer_id in (
      select id from customers where nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    )
  );

create policy "customer_members_update_admin" on customer_members
  for update to authenticated
  using (
    is_current_coach_admin()
    and customer_id in (
      select id from customers where nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    )
  )
  with check (
    is_current_coach_admin()
    and customer_id in (
      select id from customers where nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    )
  );

-- Adding p_member_id changes the argument list, so CREATE OR REPLACE would
-- leave the old 4-arg signature behind as a separate (now-dead) overload —
-- drop it first.
drop function if exists record_checkin(uuid, integer, consumption_type, date);

create or replace function record_checkin(
  p_customer_id uuid,
  p_cups integer,
  p_consumption_type consumption_type,
  p_checkin_date date,
  p_member_id uuid default null
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

  if p_member_id is not null and not exists (
    select 1 from customer_members where id = p_member_id and customer_id = p_customer_id and active
  ) then
    raise exception 'Family member not found for this customer';
  end if;

  insert into checkins (customer_id, member_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by)
  values (p_customer_id, p_member_id, v_club_id, p_cups, p_consumption_type, p_checkin_date, v_coach_id)
  returning * into v_result;

  update customers set consumption_balance = consumption_balance - p_cups
  where id = p_customer_id;

  return v_result;
end;
$$;

grant execute on function record_checkin(uuid, integer, consumption_type, date, uuid) to authenticated;

create or replace function upcoming_birthdays(p_club_id uuid default null)
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
    where cu.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cu.dob is not null
      and not (extract(month from cu.dob) = 2 and extract(day from cu.dob) = 29)
    union all
    select
      cm.id as customer_id,
      cm.name,
      cm.dob,
      (
        make_date(
          extract(year from current_date)::int +
            case when to_char(cm.dob, 'MMDD') < to_char(current_date, 'MMDD') then 1 else 0 end,
          extract(month from cm.dob)::int,
          extract(day from cm.dob)::int
        ) - current_date
      )::int as days_until
    from customer_members cm
    join customers cu on cu.id = cm.customer_id
    where cm.active
      and cu.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
      and cu.nc_club_id in (select visible_club_ids(current_coach_id()))
      and cm.dob is not null
      and not (extract(month from cm.dob) = 2 and extract(day from cm.dob) = 29)
  )
  select * from next_bday where days_until between 0 and 3 order by days_until;
$$;
