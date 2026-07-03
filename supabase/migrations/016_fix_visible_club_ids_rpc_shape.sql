-- Run this in the Supabase SQL editor on your existing project.
--
-- Fixes the empty Coaches page: the app called visible_club_ids() (which
-- returns a bare `setof uuid`) directly from the client, but that scalar
-- SETOF shape isn't safe to assume when read via PostgREST. This adds a
-- proper table-returning wrapper (one named column), same pattern as the
-- already-working list_branch_clubs().

create or replace function list_visible_club_ids(p_coach_id uuid)
returns table (club_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select v.club_id from visible_club_ids(p_coach_id) as v(club_id);
$$;

grant execute on function list_visible_club_ids(uuid) to authenticated;
