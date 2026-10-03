-- Voiding a walk-in check-in that redeemed a Friendship Pass (e.g. the
-- wrong sponsoring customer was picked) must give that pass back, or
-- correcting the mistake permanently and silently burns a pass that was
-- never actually used. void_checkin()'s signature is unchanged, so this is
-- a straight create-or-replace, no drop needed.
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

  -- Friendship Pass: if this check-in was free because it redeemed
  -- someone's pass (e.g. the wrong sponsoring customer was picked), voiding
  -- it must give that pass back — otherwise correcting the mistake
  -- permanently and silently burns a pass that was never actually used.
  update friendship_passes
  set used_at = null, used_for_checkin_id = null
  where used_for_checkin_id = p_checkin_id;
end;
$$;
