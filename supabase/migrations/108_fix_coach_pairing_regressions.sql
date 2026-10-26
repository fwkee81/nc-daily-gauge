-- Run this in the Supabase SQL editor on your existing project.
--
-- Fixes regressions introduced by 107_coach_pairing.sql: that migration
-- file was hand-reconstructed from memory instead of copied from the
-- actual source, and diverged from supabase/schema.sql (which was patched
-- correctly, by surgically editing the existing file in place) in four
-- functions. This migration re-applies the correct bodies, verbatim from
-- schema.sql, verified with an automated diff against every function 107
-- touched — these four are the only ones that actually differed.
--
--   * renew_customer() dropped the previous_balance/new_balance columns
--     from its customer_renewals insert entirely (NOT NULL columns) —
--     this is the bug that broke Renew in production.
--   * void_friendship_pass() changed which error message a cross-club
--     pass gets (now correctly hidden as "not found" instead of leaking
--     that it exists in another club) and restores the "already used"
--     check, which 107's version dropped.
--   * award_loyalty_points() now requires a reason for a custom point
--     award again, instead of 107's version silently defaulting to
--     "Manual award" when left blank.
--   * merge_customers() restores moving customer_members rows to the
--     surviving customer (107's version left them silently orphaned on
--     the deactivated duplicate), restores the customer_balance_corrections
--     audit-trail row for the merged balance, restores the remark note
--     left on the deactivated duplicate, and stops merging
--     loyalty_points_balance (something the original never did).
--
-- All four already include 107's intended effective_coach_id() change —
-- this migration is not reverting that, only restoring what else each
-- function's rewrite accidentally dropped.

create or replace function void_friendship_pass(p_pass_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
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

create or replace function award_loyalty_points(
  p_customer_id uuid,
  p_earn_rule_id uuid default null,
  p_points integer default null,
  p_reason text default null
)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_customer customers%rowtype;
  v_club_id uuid;
  v_points integer;
  v_reason text;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can award loyalty points';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  select * into v_customer from customers where id = p_customer_id and nc_club_id = v_club_id and active for update;
  if not found then
    raise exception 'Customer not found in your club';
  end if;
  if v_customer.nc_level not in ('10-day', '20-day', '30-day') then
    raise exception 'Only 10-Day, 20-Day, and 30-Day customers are eligible for the loyalty program';
  end if;
  if not exists (select 1 from loyalty_settings where nc_club_id = v_club_id and enabled) then
    raise exception 'Loyalty program is not enabled for your club';
  end if;

  if p_earn_rule_id is not null then
    select points, label into v_points, v_reason
    from loyalty_earn_rules
    where id = p_earn_rule_id and nc_club_id = v_club_id and active;
    if not found then
      raise exception 'Earn rule not found';
    end if;
  else
    if p_points is null or p_points <= 0 then
      raise exception 'Points must be a positive number';
    end if;
    if p_reason is null or btrim(p_reason) = '' then
      raise exception 'A reason is required for a custom point award';
    end if;
    v_points := p_points;
    v_reason := p_reason;
  end if;

  insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, earn_rule_id, reason, recorded_by)
  values (p_customer_id, v_club_id, v_points, 'manual', p_earn_rule_id, v_reason, v_coach_id);

  update customers set loyalty_points_balance = loyalty_points_balance + v_points
  where id = p_customer_id
  returning * into v_customer;

  return v_customer;
end;
$$;

create or replace function renew_customer(
  p_customer_id uuid,
  p_nc_level customer_nc_level,
  p_cups_added integer,
  p_reason text default null
)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_customer customers%rowtype;
  v_new_balance integer;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can renew a customer''s card';
  end if;
  if p_cups_added <= 0 then
    raise exception 'Cups added must be positive';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;

  if v_customer.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot renew a customer outside your club';
  end if;

  v_new_balance := v_customer.consumption_balance + p_cups_added;

  insert into customer_renewals (customer_id, renewed_by, nc_level, cups_added, previous_balance, new_balance, reason)
  values (p_customer_id, v_coach_id, p_nc_level, p_cups_added, v_customer.consumption_balance, v_new_balance, p_reason);

  update customers
  set consumption_balance = v_new_balance, nc_level = p_nc_level
  where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;

create or replace function merge_customers(p_duplicate_customer_id uuid, p_keep_customer_id uuid)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_duplicate customers%rowtype;
  v_keep customers%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can merge customer accounts';
  end if;
  if p_duplicate_customer_id = p_keep_customer_id then
    raise exception 'Cannot merge a customer into themselves';
  end if;

  -- Lock both rows (consistent id order avoids deadlocking against a
  -- concurrent merge in the opposite direction) before touching balances.
  perform 1 from customers where id in (p_duplicate_customer_id, p_keep_customer_id) order by id for update;

  select * into v_duplicate from customers where id = p_duplicate_customer_id;
  if not found then
    raise exception 'Duplicate customer not found';
  end if;
  select * into v_keep from customers where id = p_keep_customer_id;
  if not found then
    raise exception 'Customer to keep not found';
  end if;

  if v_duplicate.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id)
     or v_keep.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot merge customers outside your club';
  end if;

  if v_duplicate.linked_to_customer_id is not null or v_keep.linked_to_customer_id is not null
     or exists (select 1 from customers where linked_to_customer_id in (p_duplicate_customer_id, p_keep_customer_id))
  then
    raise exception 'Unlink any shared-balance accounts on either customer before merging';
  end if;

  update checkins set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update customer_renewals set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update customer_balance_corrections set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update inventory_transactions set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update customer_members set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update customers set invited_by_customer_id = p_keep_customer_id where invited_by_customer_id = p_duplicate_customer_id;

  if v_duplicate.consumption_balance <> 0 then
    insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
    values (
      p_keep_customer_id, v_coach_id, v_keep.consumption_balance,
      v_keep.consumption_balance + v_duplicate.consumption_balance,
      'Merged from duplicate record ' || v_duplicate.name
    );
    update customers set consumption_balance = consumption_balance + v_duplicate.consumption_balance
    where id = p_keep_customer_id;
  end if;

  update customers
  set active = false,
      consumption_balance = 0,
      remark = case
        when coalesce(remark, '') = '' then 'Merged into ' || v_keep.name || ' on ' || current_date
        else remark || E'\nMerged into ' || v_keep.name || ' on ' || current_date
      end
  where id = p_duplicate_customer_id;

  select * into v_keep from customers where id = p_keep_customer_id;
  return v_keep;
end;
$$;
