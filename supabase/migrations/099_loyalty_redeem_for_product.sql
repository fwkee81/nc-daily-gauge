-- Lets a customer redeem LP for ANY active Herbalife product in the shared
-- products catalog (priced off products.vp), instead of the club having to
-- add a Rewards catalog entry for every single product by hand.

alter table loyalty_settings add column points_per_vp integer not null default 0;

alter table loyalty_points_ledger add column product_id uuid references products (id);

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
  v_coach_id uuid := current_coach_id();
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

  v_cost := round(v_product.vp * v_points_per_vp);

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

grant execute on function redeem_loyalty_product(uuid, uuid) to authenticated;

-- Adding p_points_per_vp changes the argument list — drop the old 4-arg
-- signature first, same reasoning as record_checkin() in earlier migrations.
drop function if exists upsert_loyalty_settings(boolean, integer, integer, integer);

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

grant execute on function upsert_loyalty_settings(boolean, integer, integer, integer, integer) to authenticated;
