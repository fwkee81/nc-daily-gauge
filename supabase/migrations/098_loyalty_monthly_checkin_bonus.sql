-- Automatic bonus for a heavy-attendance month: a 10/20/30-Day customer who
-- racks up at least monthly_checkin_bonus_threshold non-voided check-ins in
-- a calendar month gets monthly_checkin_bonus_points, once per month —
-- awarded by record_checkin() the moment the count is reached, and clawed
-- back by void_checkin() if a later void drops the month's count back
-- under the threshold. Threshold 0 (the default) disables the feature.

alter table loyalty_settings add column monthly_checkin_bonus_threshold integer not null default 0;
alter table loyalty_settings add column monthly_checkin_bonus_points integer not null default 0;

alter table loyalty_points_ledger add column bonus_period date;

alter table loyalty_points_ledger drop constraint loyalty_points_ledger_kind_check;
alter table loyalty_points_ledger add constraint loyalty_points_ledger_kind_check
  check (kind in ('checkin', 'adjustment', 'manual', 'redeem', 'monthly_bonus'));

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
    select points_per_cup, monthly_checkin_bonus_threshold, monthly_checkin_bonus_points
    into v_points_per_cup, v_bonus_threshold, v_bonus_points
    from loyalty_settings where nc_club_id = v_club_id and enabled;

    if found then
      insert into loyalty_points_ledger (customer_id, nc_club_id, points, kind, checkin_id, recorded_by)
      values (p_customer_id, v_club_id, p_cups * v_points_per_cup, 'checkin', v_result.id, v_coach_id);

      update customers set loyalty_points_balance = loyalty_points_balance + p_cups * v_points_per_cup
      where id = p_customer_id;

      -- Monthly check-in bonus: awarded once per calendar month, the first
      -- time this customer's non-voided check-in count for that month
      -- (checkin_date-based, so a backfilled date counts toward its own
      -- month) reaches the configured threshold. bonus_period pins down
      -- "already awarded this month" so it never double-fires on later
      -- check-ins; void_checkin() claws it back if a later void drops the
      -- month's count back under the threshold.
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

  -- Monthly check-in bonus: if voiding this check-in drops the customer's
  -- non-voided count for that calendar month back under the club's
  -- threshold, claw back a bonus already awarded for that same month —
  -- mirrors the per-checkin reversal above, just for the aggregate bonus
  -- instead of a single checkin_id.
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
end;
$$;

-- Adding the monthly-bonus params changes the argument list — drop the old
-- 2-arg signature first, same reasoning as record_checkin() above.
drop function if exists upsert_loyalty_settings(boolean, integer);

create or replace function upsert_loyalty_settings(
  p_enabled boolean,
  p_points_per_cup integer,
  p_monthly_bonus_threshold integer default 0,
  p_monthly_bonus_points integer default 0
)
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
  if p_monthly_bonus_threshold < 0 then
    raise exception 'Monthly check-in bonus threshold cannot be negative';
  end if;
  if p_monthly_bonus_points < 0 then
    raise exception 'Monthly check-in bonus points cannot be negative';
  end if;

  select nc_club_id into v_club_id from coaches where id = v_coach_id;

  insert into loyalty_settings (
    nc_club_id, enabled, points_per_cup, monthly_checkin_bonus_threshold, monthly_checkin_bonus_points
  )
  values (v_club_id, p_enabled, p_points_per_cup, p_monthly_bonus_threshold, p_monthly_bonus_points)
  on conflict (nc_club_id) do update
    set enabled = excluded.enabled,
        points_per_cup = excluded.points_per_cup,
        monthly_checkin_bonus_threshold = excluded.monthly_checkin_bonus_threshold,
        monthly_checkin_bonus_points = excluded.monthly_checkin_bonus_points
  returning * into v_settings;

  return v_settings;
end;
$$;

grant execute on function upsert_loyalty_settings(boolean, integer, integer, integer) to authenticated;
