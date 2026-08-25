-- auth.users isn't exposed to PostgREST directly, so this is the only way
-- for the Coaches admin page to show each coach's login email (handy for
-- telling apart two accounts that registered with near-identical names).
-- Admin-only, same visibility scope as the coaches list itself: your own
-- club plus any downline branch that named you sponsor.
create or replace function network_coach_emails()
returns table (coach_id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select co.id as coach_id, u.email
  from coaches co
  join auth.users u on u.id = co.auth_user_id
  where is_current_coach_admin()
    and co.nc_club_id in (select visible_club_ids(current_coach_id()));
$$;

grant execute on function network_coach_emails() to authenticated;
