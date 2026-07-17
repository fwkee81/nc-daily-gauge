-- Run this in the Supabase SQL editor on your existing project.
--
-- Lets an admin void a mis-entered stock movement, same pattern as
-- void_checkin(): a reason is required, who/when/why is recorded on the row
-- itself (no separate history table needed since a movement only has one
-- correction path — void, not edit-in-place), and on-hand stock excludes
-- voided rows.

alter table inventory_transactions
  add column voided boolean not null default false,
  add column voided_by uuid references coaches (id),
  add column void_reason text,
  add column voided_at timestamptz;

create or replace function void_inventory_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editor_id uuid := current_coach_id();
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

grant execute on function void_inventory_transaction(uuid, text) to authenticated;

-- Voided movements no longer count toward on-hand stock.
create or replace function inventory_stock_levels()
returns table (
  product_id uuid,
  product_name text,
  vp numeric,
  on_hand bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.vp,
    coalesce(sum(
      case when t.direction = 'in' then t.quantity
           when t.direction = 'out' then -t.quantity
           else 0 end
    ), 0) as on_hand
  from products p
  left join inventory_transactions t
    on t.product_id = p.id
    and t.nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
    and not t.voided
  where p.active
  group by p.id, p.name, p.vp
  order by p.name;
$$;

grant execute on function inventory_stock_levels() to authenticated;
