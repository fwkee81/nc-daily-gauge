-- Loyalty Program: 10-Day/20-Day/30-Day customers (5-Day and Ala Carte are
-- not eligible) earn points automatically on every check-in and by hand for
-- referrals/events, redeemable for gifts/vouchers. Optional per club —
-- loyalty_settings.enabled defaults to false and nothing here ever changes
-- behavior for a club that hasn't turned it on. Points are always
-- cups × points_per_cup, never a flat per-visit amount, so they can be kept
-- exactly in sync when a check-in is later voided or its cups edited (see
-- the record_checkin()/correct_checkin()/void_checkin() changes below).

alter table customers add column loyalty_points_balance integer not null default 0;

create table loyalty_settings (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null unique references nc_clubs (id),
  enabled boolean not null default false,
  points_per_cup integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger loyalty_settings_set_updated_at
before update on loyalty_settings
for each row execute function set_updated_at();

-- Manual-award reasons (Referral, Event Participation, ...) an admin picks
-- from when awarding bonus points — is_default marks the starter set
-- Claude seeds; a club can deactivate those or add their own on top.
create table loyalty_earn_rules (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  label text not null,
  points integer not null check (points > 0),
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Redeemable catalog (gifts, cash vouchers, ...) — same is_default/active
-- shape as loyalty_earn_rules.
create table loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  name text not null,
  points_cost integer not null check (points_cost > 0),
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Immutable audit trail behind customers.loyalty_points_balance, same
-- pattern as customer_renewals/inventory_transactions. 'adjustment' rows
-- are how a later cup-count edit stays reflected without ever rewriting the
-- original 'checkin' row — same immutable-ledger-plus-correction-row spirit
-- as customer_balance_corrections sitting alongside customer_renewals.
create table loyalty_points_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  nc_club_id uuid not null references nc_clubs (id),
  points integer not null check (points <> 0),
  kind text not null check (kind in ('checkin', 'adjustment', 'manual', 'redeem')),
  checkin_id uuid references checkins (id),
  earn_rule_id uuid references loyalty_earn_rules (id),
  reward_id uuid references loyalty_rewards (id),
  reason text,
  recorded_by uuid not null references coaches (id),
  created_at timestamptz not null default now(),
  voided boolean not null default false,
  voided_by uuid references coaches (id),
  voided_at timestamptz,
  void_reason text
);

create index idx_loyalty_points_ledger_customer on loyalty_points_ledger (customer_id);
create index idx_loyalty_points_ledger_checkin on loyalty_points_ledger (checkin_id) where checkin_id is not null;

alter table loyalty_settings enable row level security;
alter table loyalty_earn_rules enable row level security;
alter table loyalty_rewards enable row level security;
alter table loyalty_points_ledger enable row level security;

-- Read: any coach can see their visible clubs' loyalty setup/history, same
-- visibility as Finance/Customers. Write: admin-only, own club only (not
-- branch-wide), same shape as customers_insert_admin/customers_update_admin.
-- loyalty_points_ledger has no insert/update policy for authenticated at
-- all — every write goes through the security definer RPCs below, same as
-- customer_renewals.

create policy "loyalty_settings_select" on loyalty_settings
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "loyalty_settings_insert_admin" on loyalty_settings
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_settings_update_admin" on loyalty_settings
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_earn_rules_select" on loyalty_earn_rules
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "loyalty_earn_rules_insert_admin" on loyalty_earn_rules
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_earn_rules_update_admin" on loyalty_earn_rules
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_rewards_select" on loyalty_rewards
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "loyalty_rewards_insert_admin" on loyalty_rewards
  for insert to authenticated
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_rewards_update_admin" on loyalty_rewards
  for update to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  )
  with check (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_points_ledger_select" on loyalty_points_ledger
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

-- ===========================================================================
-- record_checkin() / correct_checkin() / void_checkin(): re-created in full
-- with the Loyalty Program hooks added, everything else unchanged from the
-- versions already in schema.sql.
-- ===========================================================================

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
  v_coach_id uuid := current_coach_id();
  v_club_id uuid;
  v_balance_customer_id uuid;
  v_result checkins;
  v_nc_level customer_nc_level;
  v_points_per_cup integer;
begin
  if v_coach_id is null then
    raise exception 'Not a registered coach';
  end if;
  if p_cups not in (1, 2) then
    raise exception 'Cups must be 1 or 2';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  -- Resolves to the linked account's balance holder when this customer has
  -- been merged into another (see link_customer_to_spouse()); otherwise
  -- it's just their own id. Loyalty eligibility below is always the
  -- checking-in customer's own nc_level, not the balance holder's.
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

  -- Birthday shake is a free breakfast: check-in and Coach's Cup still count
  -- (they read from checkins.cups directly), but the balance isn't touched.
  if not p_is_birthday_shake then
    update customers set consumption_balance = consumption_balance - p_cups
    where id = v_balance_customer_id;
  end if;

  -- Loyalty Program: 10/20/30-Day customers only, only when the club has it
  -- turned on, always cups x points_per_cup so it can never drift from what
  -- was actually checked in — see correct_checkin()/void_checkin() for how
  -- this stays in sync with later edits/voids. Never blocks the check-in.
  if v_nc_level in ('10-day', '20-day', '30-day') then
    select points_per_cup into v_points_per_cup
    from loyalty_settings where nc_club_id = v_club_id and enabled;

    if found then
      insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, checkin_id, recorded_by)
      values (p_customer_id, v_club_id, p_cups * v_points_per_cup, 'checkin', v_result.id, v_coach_id);

      update customers set loyalty_points_balance = loyalty_points_balance + p_cups * v_points_per_cup
      where id = p_customer_id;
    end if;
  end if;

  return v_result;
end;
$$;

-- Adding p_new_is_birthday_shake changes the argument list, so CREATE OR
-- REPLACE would leave the old 4-arg signature behind as a separate
-- (now-dead) overload — drop it first.
drop function if exists correct_checkin(uuid, integer, consumption_type, text);

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
  v_editor_id uuid := current_coach_id();
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

  -- A birthday shake never deducts from the balance, so the amount to
  -- refund/charge depends on both the old and new birthday-shake state, not
  -- just the change in cups.
  v_old_deduction := case when v_checkin.is_birthday_shake then 0 else v_checkin.cups end;
  v_new_deduction := case when p_new_is_birthday_shake then 0 else p_new_cups end;

  if v_new_deduction <> v_old_deduction then
    select coalesce(linked_to_customer_id, id) into v_balance_customer_id
    from customers where id = v_checkin.customer_id;

    update customers set consumption_balance = consumption_balance - (v_new_deduction - v_old_deduction)
    where id = v_balance_customer_id;
  end if;

  -- Loyalty Program: if this check-in earned points, keep them in step with
  -- the new cup count — at the SAME per-cup rate that was actually applied
  -- when it was checked in, not whatever loyalty_settings says today (a
  -- later rate change must never retroactively rewrite an old check-in
  -- beyond the cup delta itself). No-op if loyalty was never active for
  -- this check-in (no ledger row to begin with).
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
  v_editor_id uuid := current_coach_id();
  v_checkin checkins%rowtype;
  v_balance_customer_id uuid;
  v_loyalty_total integer;
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

  -- Loyalty Program: reverse whatever this check-in currently totals in the
  -- ledger (the original 'checkin' row plus any later 'adjustment' rows
  -- from cup-count edits), same "undo everything this check-in caused" as
  -- the balance refund above.
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
end;
$$;

-- ===========================================================================
-- New Loyalty Program RPCs
-- ===========================================================================

-- Admin-only bonus award (referral, event participation, or a custom
-- amount+reason) — mirrors renew_customer()'s shape.
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
  v_coach_id uuid := current_coach_id();
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

-- Admin-only redemption — mirrors correct_customer_balance()'s validation
-- shape.
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
  v_coach_id uuid := current_coach_id();
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

-- Admin-only undo for a mis-clicked redemption — refunds the points.
-- Deliberately scoped to kind='redeem' only; the automatic void-on-
-- checkin-void above is a separate mechanism (system-triggered, not an
-- admin action on the ledger itself).
create or replace function void_loyalty_redemption(p_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
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

  -- v_entry.points is negative for a redemption, so subtracting it adds
  -- the points back.
  update customers set loyalty_points_balance = loyalty_points_balance - v_entry.points
  where id = v_entry.customer_id;
end;
$$;

-- Admin-only, own club — creates or updates the club's single settings row.
create or replace function upsert_loyalty_settings(p_enabled boolean, p_points_per_cup integer)
returns loyalty_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
  v_club_id uuid;
  v_settings loyalty_settings%rowtype;
begin
  if v_coach_id is null or not is_current_coach_admin() then
    raise exception 'Only admins can change loyalty program settings';
  end if;
  if p_points_per_cup < 0 then
    raise exception 'Points per cup cannot be negative';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  insert into loyalty_settings (nc_club_id, enabled, points_per_cup)
  values (v_club_id, p_enabled, p_points_per_cup)
  on conflict (nc_club_id) do update
    set enabled = excluded.enabled, points_per_cup = excluded.points_per_cup
  returning * into v_settings;

  return v_settings;
end;
$$;

grant execute on function award_loyalty_points(uuid, uuid, integer, text) to authenticated;
grant execute on function redeem_loyalty_reward(uuid, uuid) to authenticated;
grant execute on function void_loyalty_redemption(uuid, text) to authenticated;
grant execute on function upsert_loyalty_settings(boolean, integer) to authenticated;
