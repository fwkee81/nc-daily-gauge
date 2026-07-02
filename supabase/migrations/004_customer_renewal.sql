-- Run this in the Supabase SQL editor on your existing project to add
-- the "renew NC card" feature (adds consumption cups to a customer's
-- balance, with an audit trail of who renewed and how much).

create table if not exists customer_renewals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  renewed_by uuid not null references coaches (id),
  nc_level customer_nc_level not null,
  cups_added integer not null check (cups_added > 0),
  previous_balance integer not null,
  new_balance integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_renewals_customer on customer_renewals (customer_id);

alter table customer_renewals enable row level security;

create policy "customer_renewals_select" on customer_renewals
  for select to authenticated
  using (
    customer_id in (
      select id from customers where nc_club_id in (select visible_club_ids(current_coach_id()))
    )
  );

create or replace function renew_customer(
  p_customer_id uuid,
  p_nc_level customer_nc_level,
  p_cups_added integer
)
returns customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_id uuid := current_coach_id();
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

  insert into customer_renewals (customer_id, renewed_by, nc_level, cups_added, previous_balance, new_balance)
  values (p_customer_id, v_coach_id, p_nc_level, p_cups_added, v_customer.consumption_balance, v_new_balance);

  update customers
  set consumption_balance = v_new_balance, nc_level = p_nc_level
  where id = p_customer_id;

  select * into v_customer from customers where id = p_customer_id;
  return v_customer;
end;
$$;

grant execute on function renew_customer(uuid, customer_nc_level, integer) to authenticated;
