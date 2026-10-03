-- Lets an admin override a Friendship Pass batch's expiry date instead of
-- always defaulting to 90 days from today — e.g. backfilling an award that
-- should've been given earlier, or extending one as a goodwill gesture.
--
-- Adding p_expires_at changes the argument list — drop the old 4-arg
-- signature first, same reasoning as record_checkin() elsewhere.
drop function if exists award_friendship_passes(uuid, text, integer, text);

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
  v_coach_id uuid := current_coach_id();
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

grant execute on function award_friendship_passes(uuid, text, integer, text, date) to authenticated;
