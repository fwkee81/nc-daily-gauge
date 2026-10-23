-- Run this in the Supabase SQL editor on your existing project.
--
-- Lets two coaches (e.g. a married couple sharing one real Herbalife member
-- ID) each log in with their own email, while every customer/Coach's
-- Cup/finance/etc. attribution they produce shows up under ONE of them (the
-- "primary") — exactly the shared-identity-but-separate-logins setup
-- discussed with the user. The "secondary" is provisioned manually (same
-- reasoning as a founding coach with no sponsor — not a self-service flow):
--
--   update coaches set primary_coach_id = '<primary coach's id>'
--   where id = '<secondary coach's id>';
--
-- Also set the secondary's own nc_position to an admin-level position
-- (e.g. 'Owner', matching primary) when provisioning them — admin checks
-- throughout the app (is_current_coach_admin()) read the CALLER's own
-- nc_position directly, not the primary's, so this isn't derived
-- automatically.
--
-- Customer visibility itself needs NO change — RLS already scopes
-- customers by nc_club_id, not by individual coach, so as long as both are
-- coaches of the same club they already see/operate on the same customers
-- today.

-- Secondary points at primary; null means "not a secondary" (a solo coach,
-- or a primary themselves).
alter table coaches add column primary_coach_id uuid references coaches (id);
alter table coaches add constraint coaches_primary_not_self check (primary_coach_id is distinct from id);

-- Keeps pairing a flat 2-level structure (no secondary-of-a-secondary
-- chains) — without this, effective_coach_id() below could need to walk an
-- arbitrary chain instead of a single hop, and "who is the primary" could
-- become ambiguous.
create or replace function coaches_validate_primary_pairing()
returns trigger
language plpgsql
as $$
begin
  if new.primary_coach_id is not null and exists (
    select 1 from coaches where id = new.primary_coach_id and primary_coach_id is not null
  ) then
    raise exception 'Cannot pair to a coach who is themselves a secondary — pair to their primary instead';
  end if;
  return new;
end;
$$;

create trigger coaches_validate_primary_pairing
before insert or update of primary_coach_id on coaches
for each row execute function coaches_validate_primary_pairing();

-- Resolves a secondary coach to their primary's id; returns the input
-- unchanged for a primary, a solo (unpaired) coach, or null. This is the
-- single place "who does this count toward" is decided — every RPC that
-- attributes a customer/checkin/sale/etc. to a coach routes the acting
-- coach's id through this first, and a trigger does the same for the few
-- tables written by a direct client insert instead of an RPC.
create or replace function effective_coach_id(p_coach_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select primary_coach_id from coaches where id = p_coach_id), p_coach_id);
$$;

grant execute on function effective_coach_id(uuid) to authenticated;

-- =========================================================================
-- RPCs that attribute a record to "the coach doing this" — each gets its
-- v_coach_id/v_editor_id resolved through effective_coach_id() right at
-- declaration, so every later use (the insert itself, plus any "is this
-- MY record" check later in the same function) is automatically
-- primary-resolved. The auth-is-null check, is_current_coach_admin(), and
-- nc_club_id lookups are unaffected — those still read the actual caller's
-- own identity/admin status, only the ATTRIBUTED value changes.
-- =========================================================================

create or replace function record_checkin(
  p_customer_id uuid,
  p_cups integer,
  p_consumption_type consumption_type,
  p_checkin_date date,
  p_member_id uuid default null,
  p_is_birthday_shake boolean default false
)
returns checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_club_id uuid;
  v_balance_customer_id uuid;
  v_result checkins;
  v_nc_level customer_nc_level;
  v_points_per_cup integer;
  v_bonus_threshold integer;
  v_bonus_points integer;
  v_month_start date;
  v_month_checkin_count integer;
begin
  if v_coach_id is null then
    raise exception 'Not a registered coach';
  end if;
  if p_cups not in (1, 2) then
    raise exception 'Cups must be 1 or 2';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  select coalesce(linked_to_customer_id, id), nc_level into v_balance_customer_id, v_nc_level
  from customers where id = p_customer_id and nc_club_id = v_club_id and active;

  if v_balance_customer_id is null then
    raise exception 'Customer not found in your club';
  end if;

  if p_member_id is not null and not exists (
    select 1 from customer_members where id = p_member_id and customer_id = p_customer_id and active
  ) then
    raise exception 'Family member not found for this customer';
  end if;

  insert into checkins (customer_id, member_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by, is_birthday_shake)
  values (p_customer_id, p_member_id, v_club_id, p_cups, p_consumption_type, p_checkin_date, v_coach_id, p_is_birthday_shake)
  returning * into v_result;

  if not p_is_birthday_shake then
    update customers set consumption_balance = consumption_balance - p_cups
    where id = v_balance_customer_id;
  end if;

  if v_nc_level in ('10-day', '20-day', '30-day') then
    select points_per_cup, monthly_checkin_bonus_threshold, monthly_checkin_bonus_points
    into v_points_per_cup, v_bonus_threshold, v_bonus_points
    from loyalty_settings where nc_club_id = v_club_id and enabled;

    if found then
      insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, checkin_id, recorded_by)
      values (p_customer_id, v_club_id, p_cups * v_points_per_cup, 'checkin', v_result.id, v_coach_id);

      update customers set loyalty_points_balance = loyalty_points_balance + p_cups * v_points_per_cup
      where id = p_customer_id;

      if v_bonus_threshold > 0 and v_bonus_points > 0 then
        v_month_start := date_trunc('month', p_checkin_date)::date;

        select count(*) into v_month_checkin_count
        from checkins
        where customer_id = p_customer_id and not voided
          and checkin_date >= v_month_start and checkin_date < v_month_start + interval '1 month';

        if v_month_checkin_count >= v_bonus_threshold and not exists (
          select 1 from loyalty_points_ledger
          where customer_id = p_customer_id and kind = 'monthly_bonus'
            and bonus_period = v_month_start and not voided
        ) then
          insert into loyalty_points_ledger
            (customer_id, nc_club_id, points, kind, bonus_period, reason, recorded_by)
          values (
            p_customer_id, v_club_id, v_bonus_points, 'monthly_bonus', v_month_start,
            format('%s+ check-ins in %s', v_bonus_threshold, to_char(v_month_start, 'Mon YYYY')),
            v_coach_id
          );

          update customers set loyalty_points_balance = loyalty_points_balance + v_bonus_points
          where id = p_customer_id;
        end if;
      end if;
    end if;
  end if;

  return v_result;
end;
$$;

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
  v_coach_id uuid := effective_coach_id(current_coach_id());
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

create or replace function record_walkin_checkin_existing(
  p_customer_id uuid,
  p_consumption_type consumption_type,
  p_checkin_date date
)
returns checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_club_id uuid;
  v_customer customers%rowtype;
  v_result checkins;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can record a walk-in check-in';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if v_customer.nc_club_id <> v_club_id then
    raise exception 'Cannot check in a customer outside your club';
  end if;
  if v_customer.nc_level <> 'Ala Carte' then
    raise exception 'This is only for Ala Carte walk-in customers';
  end if;

  insert into checkins (customer_id, nc_club_id, cups, consumption_type, checkin_date, recorded_by)
  values (p_customer_id, v_club_id, 1, p_consumption_type, p_checkin_date, v_coach_id)
  returning * into v_result;

  update customers set consumption_balance = 0 where id = p_customer_id;

  return v_result;
end;
$$;

create or replace function award_friendship_passes(
  p_customer_id uuid,
  p_source text,
  p_count integer,
  p_reason text,
  p_expires_at date default null
)
returns setof friendship_passes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_club_id uuid;
  v_issued_at timestamptz := now();
  v_expires_at date := coalesce(p_expires_at, (now() + interval '90 days')::date);
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
  if v_expires_at < current_date then
    raise exception 'Expiry date must be today or later';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  if not exists (
    select 1 from customers where id = p_customer_id and nc_club_id = v_club_id and active
  ) then
    raise exception 'Customer not found in your club';
  end if;

  return query
    insert into friendship_passes (customer_id, nc_club_id, source, reason, issued_by, issued_at, expires_at)
    select p_customer_id, v_club_id, p_source, btrim(p_reason), v_coach_id, v_issued_at, v_expires_at
    from generate_series(1, p_count)
    returning *;
end;
$$;

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
    raise exception 'A reason is required to void a Friendship Pass';
  end if;

  select * into v_pass from friendship_passes where id = p_pass_id for update;
  if not found then
    raise exception 'Friendship Pass not found';
  end if;
  if v_pass.voided then
    raise exception 'Already voided';
  end if;
  if v_pass.used_at is not null then
    raise exception 'Cannot void a Friendship Pass that has already been used';
  end if;
  if v_pass.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot void a Friendship Pass outside your club';
  end if;

  update friendship_passes
  set voided = true, voided_by = v_coach_id, voided_at = now(), void_reason = p_reason
  where id = p_pass_id;
end;
$$;

create or replace function correct_checkin(
  p_checkin_id uuid,
  p_new_cups integer,
  p_new_consumption_type consumption_type,
  p_reason text,
  p_new_is_birthday_shake boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := effective_coach_id(current_coach_id());
  v_checkin checkins%rowtype;
  v_old_deduction integer;
  v_new_deduction integer;
  v_balance_customer_id uuid;
  v_ledger loyalty_points_ledger%rowtype;
  v_new_points integer;
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
  if v_checkin.is_birthday_shake is distinct from p_new_is_birthday_shake then
    insert into checkin_edits (checkin_id, edited_by, field_changed, old_value, new_value, reason)
    values (p_checkin_id, v_editor_id, 'is_birthday_shake', v_checkin.is_birthday_shake::text, p_new_is_birthday_shake::text, p_reason);
  end if;

  update checkins
  set cups = p_new_cups, consumption_type = p_new_consumption_type, is_birthday_shake = p_new_is_birthday_shake
  where id = p_checkin_id;

  v_old_deduction := case when v_checkin.is_birthday_shake then 0 else v_checkin.cups end;
  v_new_deduction := case when p_new_is_birthday_shake then 0 else p_new_cups end;

  if v_new_deduction <> v_old_deduction then
    select coalesce(linked_to_customer_id, id) into v_balance_customer_id
    from customers where id = v_checkin.customer_id;

    update customers set consumption_balance = consumption_balance - (v_new_deduction - v_old_deduction)
    where id = v_balance_customer_id;
  end if;

  if v_checkin.cups is distinct from p_new_cups then
    select * into v_ledger from loyalty_points_ledger
    where checkin_id = p_checkin_id and kind = 'checkin' and not voided
    for update;

    if found then
      v_new_points := (v_ledger.points / v_checkin.cups) * p_new_cups;
      v_delta := v_new_points - v_ledger.points;

      if v_delta <> 0 then
        insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, checkin_id, reason, recorded_by)
        values (v_checkin.customer_id, v_checkin.nc_club_id, v_delta, 'adjustment', p_checkin_id, p_reason, v_editor_id);

        update customers set loyalty_points_balance = loyalty_points_balance + v_delta
        where id = v_checkin.customer_id;
      end if;
    end if;
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
  v_editor_id uuid := effective_coach_id(current_coach_id());
  v_checkin checkins%rowtype;
  v_balance_customer_id uuid;
  v_loyalty_total integer;
  v_bonus_threshold integer;
  v_month_start date;
  v_month_checkin_count integer;
  v_monthly_bonus loyalty_points_ledger%rowtype;
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

  select coalesce(linked_to_customer_id, id) into v_balance_customer_id
  from customers where id = v_checkin.customer_id;

  update customers set consumption_balance = consumption_balance + v_checkin.cups
  where id = v_balance_customer_id;

  select coalesce(sum(points), 0) into v_loyalty_total
  from loyalty_points_ledger
  where checkin_id = p_checkin_id and not voided;

  if v_loyalty_total <> 0 then
    update loyalty_points_ledger
    set voided = true, voided_by = v_editor_id, voided_at = now(), void_reason = p_reason
    where checkin_id = p_checkin_id and not voided;

    update customers set loyalty_points_balance = loyalty_points_balance - v_loyalty_total
    where id = v_checkin.customer_id;
  end if;

  select monthly_checkin_bonus_threshold into v_bonus_threshold
  from loyalty_settings where nc_club_id = v_checkin.nc_club_id and enabled;

  if v_bonus_threshold > 0 then
    v_month_start := date_trunc('month', v_checkin.checkin_date)::date;

    select count(*) into v_month_checkin_count
    from checkins
    where customer_id = v_checkin.customer_id and not voided
      and checkin_date >= v_month_start and checkin_date < v_month_start + interval '1 month';

    if v_month_checkin_count < v_bonus_threshold then
      select * into v_monthly_bonus
      from loyalty_points_ledger
      where customer_id = v_checkin.customer_id and kind = 'monthly_bonus'
        and bonus_period = v_month_start and not voided
      for update;

      if found then
        update loyalty_points_ledger
        set voided = true, voided_by = v_editor_id, voided_at = now(),
            void_reason = 'Automatically reversed — a voided check-in dropped this month''s count back under the bonus threshold'
        where id = v_monthly_bonus.id;

        update customers set loyalty_points_balance = loyalty_points_balance - v_monthly_bonus.points
        where id = v_checkin.customer_id;
      end if;
    end if;
  end if;

  update friendship_passes
  set used_at = null, used_for_checkin_id = null
  where used_for_checkin_id = p_checkin_id;
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
    v_points := p_points;
    v_reason := coalesce(nullif(btrim(p_reason), ''), 'Manual award');
  end if;

  insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, earn_rule_id, reason, recorded_by)
  values (p_customer_id, v_club_id, v_points, 'manual', p_earn_rule_id, v_reason, v_coach_id);

  update customers set loyalty_points_balance = loyalty_points_balance + v_points
  where id = p_customer_id
  returning * into v_customer;

  return v_customer;
end;
$$;

create or replace function redeem_loyalty_reward(
  p_customer_id uuid,
  p_reward_id uuid
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
  v_reward loyalty_rewards%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can redeem loyalty rewards';
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

  select * into v_reward from loyalty_rewards where id = p_reward_id and nc_club_id = v_club_id and active;
  if not found then
    raise exception 'Reward not found';
  end if;
  if v_customer.loyalty_points_balance < v_reward.points_cost then
    raise exception 'Not enough points to redeem this reward';
  end if;

  insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, reward_id, reason, recorded_by)
  values (p_customer_id, v_club_id, -v_reward.points_cost, 'redeem', p_reward_id, v_reward.name, v_coach_id);

  update customers set loyalty_points_balance = loyalty_points_balance - v_reward.points_cost
  where id = p_customer_id
  returning * into v_customer;

  return v_customer;
end;
$$;

create or replace function redeem_loyalty_product(
  p_customer_id uuid,
  p_product_id uuid
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
  v_points_per_vp integer;
  v_product products%rowtype;
  v_cost integer;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can redeem loyalty rewards';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  select * into v_customer from customers where id = p_customer_id and nc_club_id = v_club_id and active for update;
  if not found then
    raise exception 'Customer not found in your club';
  end if;
  if v_customer.nc_level not in ('10-day', '20-day', '30-day') then
    raise exception 'Only 10-Day, 20-Day, and 30-Day customers are eligible for the loyalty program';
  end if;

  select points_per_vp into v_points_per_vp
  from loyalty_settings where nc_club_id = v_club_id and enabled;
  if not found then
    raise exception 'Loyalty program is not enabled for your club';
  end if;
  if v_points_per_vp <= 0 then
    raise exception 'Redeeming for products is not turned on for your club';
  end if;

  select * into v_product from products where id = p_product_id and active;
  if not found then
    raise exception 'Product not found';
  end if;

  v_cost := ceil(v_product.vp) * v_points_per_vp;

  if v_customer.loyalty_points_balance < v_cost then
    raise exception 'Not enough points to redeem this product';
  end if;

  insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, product_id, reason, recorded_by)
  values (p_customer_id, v_club_id, -v_cost, 'redeem', p_product_id, v_product.name, v_coach_id);

  update customers set loyalty_points_balance = loyalty_points_balance - v_cost
  where id = p_customer_id
  returning * into v_customer;

  return v_customer;
end;
$$;

create or replace function void_loyalty_redemption(p_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_entry loyalty_points_ledger%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can void a redemption';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to void a redemption';
  end if;

  select * into v_entry from loyalty_points_ledger where id = p_entry_id for update;
  if not found then
    raise exception 'Ledger entry not found';
  end if;
  if v_entry.kind <> 'redeem' then
    raise exception 'Only a redemption can be voided this way';
  end if;
  if v_entry.voided then
    raise exception 'Already voided';
  end if;
  if v_entry.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot void a redemption outside your club';
  end if;

  update loyalty_points_ledger
  set voided = true, voided_by = v_coach_id, voided_at = now(), void_reason = p_reason
  where id = p_entry_id;

  update customers set loyalty_points_balance = loyalty_points_balance - v_entry.points
  where id = v_entry.customer_id;
end;
$$;

create or replace function upsert_loyalty_settings(
  p_enabled boolean,
  p_points_per_cup integer,
  p_monthly_bonus_threshold integer default 0,
  p_monthly_bonus_points integer default 0,
  p_points_per_vp integer default 0
)
returns loyalty_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_club_id uuid;
  v_settings loyalty_settings%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can change loyalty program settings';
  end if;
  if p_points_per_cup < 0 then
    raise exception 'Points per cup cannot be negative';
  end if;
  if p_monthly_bonus_threshold < 0 then
    raise exception 'Monthly check-in bonus threshold cannot be negative';
  end if;
  if p_monthly_bonus_points < 0 then
    raise exception 'Monthly check-in bonus points cannot be negative';
  end if;
  if p_points_per_vp < 0 then
    raise exception 'Points per VP cannot be negative';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  insert into loyalty_settings (
    nc_club_id, enabled, points_per_cup, monthly_checkin_bonus_threshold, monthly_checkin_bonus_points,
    points_per_vp
  )
  values (v_club_id, p_enabled, p_points_per_cup, p_monthly_bonus_threshold, p_monthly_bonus_points, p_points_per_vp)
  on conflict (nc_club_id) do update
    set enabled = excluded.enabled,
        points_per_cup = excluded.points_per_cup,
        monthly_checkin_bonus_threshold = excluded.monthly_checkin_bonus_threshold,
        monthly_checkin_bonus_points = excluded.monthly_checkin_bonus_points,
        points_per_vp = excluded.points_per_vp
  returning * into v_settings;

  return v_settings;
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
  if p_cups_added is null or p_cups_added <= 0 then
    raise exception 'Cups added must be a positive number';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if v_customer.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot renew a customer outside your club';
  end if;

  v_new_balance := v_customer.consumption_balance + p_cups_added;

  insert into customer_renewals (customer_id, renewed_by, nc_level, cups_added, reason)
  values (p_customer_id, v_coach_id, p_nc_level, p_cups_added, p_reason);

  update customers
  set nc_level = p_nc_level, consumption_balance = v_new_balance
  where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;

create or replace function correct_customer_balance(
  p_customer_id uuid,
  p_new_balance integer,
  p_reason text
)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_customer customers%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can correct a customer''s balance';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to correct a balance';
  end if;
  if p_new_balance < 0 then
    raise exception 'Balance cannot be negative';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;

  if v_customer.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot correct a customer outside your club';
  end if;

  insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
  values (p_customer_id, v_coach_id, v_customer.consumption_balance, p_new_balance, p_reason);

  update customers set consumption_balance = p_new_balance where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;

create or replace function link_customer_to_spouse(
  p_customer_id uuid,
  p_linked_to_customer_id uuid
)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_customer customers%rowtype;
  v_target customers%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can link customer accounts';
  end if;
  if p_customer_id = p_linked_to_customer_id then
    raise exception 'Cannot link a customer to themselves';
  end if;

  perform 1 from customers where id in (p_customer_id, p_linked_to_customer_id) order by id for update;

  select * into v_customer from customers where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  select * into v_target from customers where id = p_linked_to_customer_id;
  if not found then
    raise exception 'Target customer not found';
  end if;

  if v_customer.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id)
     or v_target.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot link customers outside your club';
  end if;

  if v_customer.linked_to_customer_id is not null then
    raise exception '% is already linked to another account', v_customer.name;
  end if;
  if v_target.linked_to_customer_id is not null then
    raise exception '% is itself linked to another account — link to that account''s holder instead', v_target.name;
  end if;
  if exists (select 1 from customers where linked_to_customer_id = p_customer_id) then
    raise exception '% already has other accounts linked to it and cannot be linked to someone else', v_customer.name;
  end if;
  if exists (select 1 from customers where linked_to_customer_id = p_linked_to_customer_id) then
    raise exception '% already has an account linked to it — unlink that one first', v_target.name;
  end if;

  insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
  values (
    p_customer_id, v_coach_id, v_customer.consumption_balance, 0,
    'Linked to ' || v_target.name || E'\'s account — balance merged'
  );

  if v_customer.consumption_balance <> 0 then
    insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
    values (
      p_linked_to_customer_id, v_coach_id, v_target.consumption_balance,
      v_target.consumption_balance + v_customer.consumption_balance,
      'Merged from ' || v_customer.name || E'\'s account (linked)'
    );
  end if;

  update customers
  set consumption_balance = consumption_balance + v_customer.consumption_balance
  where id = p_linked_to_customer_id;

  update customers
  set linked_to_customer_id = p_linked_to_customer_id,
      consumption_balance = 0,
      nc_level = v_target.nc_level
  where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;

create or replace function unlink_customer(p_customer_id uuid)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := effective_coach_id(current_coach_id());
  v_customer customers%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can unlink a customer account';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer not found';
  end if;
  if v_customer.nc_club_id <> (select nc_club_id from coaches where id = v_coach_id) then
    raise exception 'Cannot unlink a customer outside your club';
  end if;
  if v_customer.linked_to_customer_id is null then
    raise exception '% is not linked to another account', v_customer.name;
  end if;

  insert into customer_balance_corrections (customer_id, corrected_by, previous_balance, new_balance, reason)
  values (
    p_customer_id, v_coach_id, v_customer.consumption_balance, 0,
    'Unlinked from linked account — balance forfeited'
  );

  update customers
  set linked_to_customer_id = null, consumption_balance = 0
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
  update loyalty_points_ledger set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update friendship_passes set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update inventory_transactions set customer_id = p_keep_customer_id where customer_id = p_duplicate_customer_id;
  update customers set invited_by_customer_id = p_keep_customer_id where invited_by_customer_id = p_duplicate_customer_id;

  update customers set consumption_balance = consumption_balance + v_duplicate.consumption_balance,
    loyalty_points_balance = loyalty_points_balance + v_duplicate.loyalty_points_balance
  where id = p_keep_customer_id;

  update customers set active = false, consumption_balance = 0, loyalty_points_balance = 0
  where id = p_duplicate_customer_id;

  select * into v_keep from customers where id = p_keep_customer_id;
  return v_keep;
end;
$$;

create or replace function void_inventory_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := effective_coach_id(current_coach_id());
  v_txn inventory_transactions%rowtype;
begin
  if v_editor_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can void inventory records';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to void a record';
  end if;

  select * into v_txn from inventory_transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'Record not found';
  end if;
  if v_txn.voided then
    raise exception 'Already voided';
  end if;
  if v_txn.nc_club_id <> (select nc_club_id from coaches where id = v_editor_id) then
    raise exception 'Cannot void records outside your club';
  end if;

  update inventory_transactions
  set voided = true, voided_by = v_editor_id, void_reason = p_reason, voided_at = now()
  where id = p_transaction_id;
end;
$$;

create or replace function void_finance_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := effective_coach_id(current_coach_id());
  v_txn finance_transactions%rowtype;
begin
  if v_editor_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can void finance records';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to void a record';
  end if;

  select * into v_txn from finance_transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'Record not found';
  end if;
  if v_txn.voided then
    raise exception 'Already voided';
  end if;
  if v_txn.nc_club_id <> (select nc_club_id from coaches where id = v_editor_id) then
    raise exception 'Cannot void records outside your club';
  end if;

  update finance_transactions
  set voided = true, voided_by = v_editor_id, void_reason = p_reason, voided_at = now()
  where id = p_transaction_id;
end;
$$;

-- =========================================================================
-- Coach-approval authorization — a secondary gets the same approval rights
-- as their primary, without upline_admin_ids() itself needing to know
-- about pairing (sponsor_id already always resolves to a primary, since
-- verifySponsor() now excludes secondaries from being matched as a
-- sponsor — see src/app/onboarding/actions.ts).
-- =========================================================================

create or replace function approve_coach(p_coach_id uuid)
returns coaches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := current_coach_id();
  v_target coaches%rowtype;
begin
  select * into v_target from coaches where id = p_coach_id for update;
  if not found then
    raise exception 'Coach not found';
  end if;
  if not v_target.active then
    raise exception 'This registration was already rejected';
  end if;
  if v_target.approved then
    raise exception 'Already approved';
  end if;

  if not is_super_admin() and not exists (
    select 1 from upline_admin_ids(v_target.sponsor_id) u where u = effective_coach_id(v_caller_id)
  ) then
    raise exception 'You are not authorized to approve this coach';
  end if;

  update coaches set approved = true where id = p_coach_id;
  select * into v_target from coaches where id = p_coach_id;
  return v_target;
end;
$$;

create or replace function reject_coach(p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := current_coach_id();
  v_target coaches%rowtype;
begin
  select * into v_target from coaches where id = p_coach_id for update;
  if not found then
    raise exception 'Coach not found';
  end if;
  if v_target.approved then
    raise exception 'Cannot reject an already-approved coach — deactivate them instead';
  end if;
  if not v_target.active then
    raise exception 'Already rejected';
  end if;

  if not is_super_admin() and not exists (
    select 1 from upline_admin_ids(v_target.sponsor_id) u where u = effective_coach_id(v_caller_id)
  ) then
    raise exception 'You are not authorized to reject this coach';
  end if;

  update coaches set active = false where id = p_coach_id;
end;
$$;

create or replace function pending_coaches_for_approval()
returns table (
  id uuid,
  name text,
  contact text,
  member_id text,
  nc_club_id uuid,
  nc_club_name text,
  nc_position nc_position,
  sponsor_id uuid,
  sponsor_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name, c.contact, c.member_id, c.nc_club_id, club.name,
    c.nc_position, c.sponsor_id, sponsor.name, c.created_at
  from coaches c
  left join nc_clubs club on club.id = c.nc_club_id
  left join coaches sponsor on sponsor.id = c.sponsor_id
  where c.active and not c.approved
    and (
      is_super_admin()
      or exists (select 1 from upline_admin_ids(c.sponsor_id) u where u = effective_coach_id(current_coach_id()))
    )
  order by c.created_at;
$$;

-- =========================================================================
-- Tables written by a direct client insert (not an RPC) — a trigger
-- normalizes every coach-attribution column through effective_coach_id()
-- regardless of what the client sends, so the RLS "must match my own id"
-- checks below can stay simple (the trigger runs before them) and the
-- client-side code needs no changes at all.
-- =========================================================================

create or replace function customers_normalize_coach_attribution()
returns trigger
language plpgsql
as $$
begin
  if new.coach_id is not null then
    new.coach_id := effective_coach_id(new.coach_id);
  end if;
  if new.invited_by_coach_id is not null then
    new.invited_by_coach_id := effective_coach_id(new.invited_by_coach_id);
  end if;
  if new.created_by is not null then
    new.created_by := effective_coach_id(new.created_by);
  end if;
  return new;
end;
$$;

create trigger customers_normalize_coach_attribution
before insert or update on customers
for each row execute function customers_normalize_coach_attribution();

create or replace function finance_transactions_normalize_coach_attribution()
returns trigger
language plpgsql
as $$
begin
  new.recorded_by := effective_coach_id(new.recorded_by);
  if new.responsible_coach_id is not null then
    new.responsible_coach_id := effective_coach_id(new.responsible_coach_id);
  end if;
  return new;
end;
$$;

create trigger finance_transactions_normalize_coach_attribution
before insert on finance_transactions
for each row execute function finance_transactions_normalize_coach_attribution();

-- The insert policy's "recorded_by = current_coach_id()" check runs AFTER
-- this trigger rewrites recorded_by to the primary's id, so it must accept
-- that resolved value too, not just the literal caller.
drop policy if exists "finance_transactions_insert" on finance_transactions;
create policy "finance_transactions_insert" on finance_transactions
  for insert to authenticated
  with check (
    nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    and recorded_by = effective_coach_id(current_coach_id())
  );

create or replace function inventory_transactions_normalize_coach_attribution()
returns trigger
language plpgsql
as $$
begin
  new.recorded_by := effective_coach_id(new.recorded_by);
  return new;
end;
$$;

create trigger inventory_transactions_normalize_coach_attribution
before insert on inventory_transactions
for each row execute function inventory_transactions_normalize_coach_attribution();

drop policy if exists "inventory_transactions_insert" on inventory_transactions;
create policy "inventory_transactions_insert" on inventory_transactions
  for insert to authenticated
  with check (
    nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    and recorded_by = effective_coach_id(current_coach_id())
  );

create or replace function daily_report_logs_normalize_coach_attribution()
returns trigger
language plpgsql
as $$
begin
  if new.created_by_coach_id is not null then
    new.created_by_coach_id := effective_coach_id(new.created_by_coach_id);
  end if;
  return new;
end;
$$;

create trigger daily_report_logs_normalize_coach_attribution
before insert on daily_report_logs
for each row execute function daily_report_logs_normalize_coach_attribution();

drop policy if exists "daily_report_logs_insert" on daily_report_logs;
create policy "daily_report_logs_insert" on daily_report_logs
  for insert to authenticated
  with check (
    created_by_coach_id = effective_coach_id(current_coach_id())
    and nc_club_id in (select visible_club_ids(current_coach_id()))
  );

-- daily_report_logs' update/delete policies also gate on
-- "created_by_coach_id = current_coach_id()" (so the author, or an admin,
-- can edit/delete their own note) — now that created_by_coach_id is always
-- the primary's id, that comparison needs the same resolution so a
-- secondary can still edit/delete a note the trigger attributed to primary.
drop policy if exists "daily_report_logs_update" on daily_report_logs;
create policy "daily_report_logs_update" on daily_report_logs
  for update to authenticated
  using (
    nc_club_id in (select visible_club_ids(current_coach_id()))
    and (created_by_coach_id = effective_coach_id(current_coach_id()) or is_current_coach_admin())
  )
  with check (
    nc_club_id in (select visible_club_ids(current_coach_id()))
    and (created_by_coach_id = effective_coach_id(current_coach_id()) or is_current_coach_admin())
  );

drop policy if exists "daily_report_logs_delete" on daily_report_logs;
create policy "daily_report_logs_delete" on daily_report_logs
  for delete to authenticated
  using (
    nc_club_id in (select visible_club_ids(current_coach_id()))
    and (created_by_coach_id = effective_coach_id(current_coach_id()) or is_current_coach_admin())
  );

grant execute on function customers_normalize_coach_attribution() to authenticated;
grant execute on function finance_transactions_normalize_coach_attribution() to authenticated;
grant execute on function inventory_transactions_normalize_coach_attribution() to authenticated;
grant execute on function daily_report_logs_normalize_coach_attribution() to authenticated;
