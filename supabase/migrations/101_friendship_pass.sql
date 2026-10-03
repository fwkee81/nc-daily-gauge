-- Friendship Pass: a customer-level entitlement, not a loyalty-points
-- concept — each row is ONE physical pass (not a fungible balance), because
-- every pass carries its own 90-day expiry from the day it was issued and
-- needs to be followed up on individually ("remind them before it
-- expires"). Issued manually by an admin (award_friendship_passes()) for a
-- PJS sign-up (3), a first 30-Day upgrade (2), or a special occasion (any
-- count). Spent automatically when the referred friend's first visit is
-- recorded as a walk-in (record_walkin_checkin()'s p_friendship_pass_id) —
-- never spent manually, so there's no "use" RPC of its own.
create table friendship_passes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  nc_club_id uuid not null references nc_clubs (id),
  source text not null check (source in ('pjs', '30day_upgrade', 'special')),
  reason text not null,
  issued_by uuid not null references coaches (id),
  issued_at timestamptz not null default now(),
  expires_at date not null,
  used_at timestamptz,
  used_for_checkin_id uuid references checkins (id),
  voided boolean not null default false,
  voided_by uuid references coaches (id),
  voided_at timestamptz,
  void_reason text
);
create index idx_friendship_passes_customer on friendship_passes (customer_id);
create index idx_friendship_passes_club on friendship_passes (nc_club_id);

alter table friendship_passes enable row level security;

-- friendship_passes: read-only to clients, same club-scoped visibility as
-- the rest of the app. No insert/update policy for authenticated — every
-- write goes through award_friendship_passes()/void_friendship_pass()/
-- record_walkin_checkin() below, all security definer.
create policy "friendship_passes_select" on friendship_passes
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

-- Creates a one-time "Ala Carte" walk-in customer and checks them in for a
-- single cup. Stays active (unlike the old behavior) so recent_walkin_customers()
-- below can find them again next visit instead of a coach re-creating a
-- duplicate — see record_walkin_checkin_existing() for that repeat-visit
-- path. Admin-only.
--
-- Adding p_friendship_pass_id changes the argument list — drop the old
-- 7-arg signature first, same reasoning as record_checkin() elsewhere.
drop function if exists record_walkin_checkin(text, text, invited_by_type, uuid, uuid, consumption_type, date);

create or replace function record_walkin_checkin(
  p_name text,
  p_contact text,
  p_invited_by_type invited_by_type,
  p_invited_by_coach_id uuid,
  p_invited_by_customer_id uuid,
  p_consumption_type consumption_type,
  p_checkin_date date,
  p_friendship_pass_id uuid default null
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
  v_pass friendship_passes%rowtype;
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

  -- Friendship Pass: this free visit is "spent" from whichever customer's
  -- pass was picked. Validated and locked here, before the walk-in is even
  -- created, so a double-booked/expired/voided pass can never slip through.
  if p_friendship_pass_id is not null then
    select * into v_pass from friendship_passes where id = p_friendship_pass_id for update;
    if not found or v_pass.nc_club_id <> v_club_id then
      raise exception 'Friendship Pass not found';
    end if;
    if v_pass.voided then
      raise exception 'This Friendship Pass has been voided';
    end if;
    if v_pass.used_at is not null then
      raise exception 'This Friendship Pass has already been used';
    end if;
    if v_pass.expires_at < current_date then
      raise exception 'This Friendship Pass has expired';
    end if;
    if p_invited_by_type <> 'customer' or p_invited_by_customer_id is distinct from v_pass.customer_id then
      raise exception 'Friendship Pass must match the inviting customer';
    end if;
  end if;

  insert into customers (
    nc_club_id, name, gender, contact, dob, nc_level, initial_nc_level, consumption_balance,
    invited_by_type, invited_by_coach_id, invited_by_customer_id, coach_id,
    created_by, active
  )
  values (
    v_club_id, p_name, 'Others', p_contact, null, 'Ala Carte', 'Ala Carte', 1,
    p_invited_by_type, p_invited_by_coach_id, p_invited_by_customer_id,
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

  if p_friendship_pass_id is not null then
    update friendship_passes set used_at = now(), used_for_checkin_id = v_result.id
    where id = p_friendship_pass_id;
  end if;

  return v_result;
end;
$$;

grant execute on function record_walkin_checkin(text, text, invited_by_type, uuid, uuid, consumption_type, date, uuid) to authenticated;

-- Issues p_count brand-new Friendship Passes to one customer in a single
-- call (PJS = 3 at sign-up, a first 30-Day upgrade = 2, a special occasion =
-- however many the admin types in) — each pass is its own row so it can be
-- tracked and expire independently, all sharing the same issued_at and
-- therefore the same 90-day expires_at. Admin-only, own club.
create or replace function award_friendship_passes(
  p_customer_id uuid,
  p_source text,
  p_count integer,
  p_reason text
)
returns setof friendship_passes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_club_id uuid;
  v_issued_at timestamptz := now();
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can award Friendship Passes';
  end if;
  if p_source not in ('pjs', '30day_upgrade', 'special') then
    raise exception 'Invalid Friendship Pass source';
  end if;
  if p_count is null or p_count < 1 or p_count > 20 then
    raise exception 'Count must be between 1 and 20';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  if not exists (
    select 1 from customers where id = p_customer_id and nc_club_id = v_club_id and active
  ) then
    raise exception 'Customer not found in your club';
  end if;

  return query
    insert into friendship_passes (customer_id, nc_club_id, source, reason, issued_by, issued_at, expires_at)
    select p_customer_id, v_club_id, p_source, btrim(p_reason), v_coach_id, v_issued_at,
      (v_issued_at + interval '90 days')::date
    from generate_series(1, p_count)
    returning *;
end;
$$;

-- Undoes a mistaken award — e.g. the wrong customer was picked, or the
-- count was off. Can only void a pass that hasn't been used yet (once
-- spent on a real walk-in, voiding it would silently detach that check-in's
-- record of how it was free). Admin-only, own club.
create or replace function void_friendship_pass(p_pass_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_pass friendship_passes%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can void a Friendship Pass';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required';
  end if;

  select * into v_pass from friendship_passes where id = p_pass_id for update;
  if not found or v_pass.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Friendship Pass not found';
  end if;
  if v_pass.voided then
    raise exception 'Already voided';
  end if;
  if v_pass.used_at is not null then
    raise exception 'Cannot void a Friendship Pass that has already been used';
  end if;

  update friendship_passes
  set voided = true, voided_by = v_coach_id, voided_at = now(), void_reason = btrim(p_reason)
  where id = p_pass_id;
end;
$$;

grant execute on function award_friendship_passes(uuid, text, integer, text) to authenticated;
grant execute on function void_friendship_pass(uuid, text) to authenticated;
