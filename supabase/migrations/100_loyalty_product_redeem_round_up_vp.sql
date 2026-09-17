-- redeem_loyalty_product() was rounding the final LP cost to the nearest
-- whole number (round(vp * rate)), which can round the club's asking price
-- DOWN in the customer's favor whenever vp * rate lands on a .5-or-under
-- fraction. Switch to rounding the VP itself UP to the next whole VP first
-- (24.95 -> 25), then multiplying by the rate — e.g. a 24.95 VP product at
-- 500 LP/VP now correctly costs 12500 LP, not 12475.

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

  -- VP rounds UP to the next whole VP first (24.95 -> 25), then multiplies
  -- by the rate — never rounds the club's asking price down in the
  -- customer's favor.
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
