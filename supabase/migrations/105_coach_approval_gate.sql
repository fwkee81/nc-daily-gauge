-- Gates real access, not just existence — a self-registered coach starts
-- unapproved (see completeOnboarding()) and (app)/layout.tsx sends them to
-- /pending-approval instead of the dashboard until an admin in their
-- sponsor's upline chain (or the super admin) calls approve_coach().
-- Defaults true so every coach that already existed before this column was
-- added stays unaffected; only new self-registrations are inserted with it
-- explicitly false.
alter table coaches add column approved boolean not null default true;

-- coaches: readable by any signed-in coach (needed to populate sponsor /
-- invited-by pickers, including across clubs, and so any admin can view
-- their downline network's coaches). A coach may freely edit every field on
-- their own row, including position, level, sponsor, club, member ID, and
-- active status — self-service via the Profile page. The one exception is
-- `approved`: self-update is not how a pending registration gets let in —
-- that only ever happens through approve_coach() below, so the with check
-- here pins `approved` to whatever it already was, same self-referencing-
-- subquery trick used to stop a column from moving on a self-update.
-- The super admin may additionally edit any OTHER coach's row (e.g.
-- downline coaches), which a regular coach cannot do.
drop policy if exists "coaches_insert_self" on coaches;
drop policy if exists "coaches_update_self" on coaches;

-- Self-registration always starts unapproved — the only way to flip it is
-- approve_coach() (security definer, bypasses RLS), never a direct insert.
create policy "coaches_insert_self" on coaches
  for insert to authenticated with check (auth_user_id = auth.uid() and not approved);

create policy "coaches_update_self" on coaches
  for update to authenticated using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and approved = (select c2.approved from coaches c2 where c2.id = coaches.id)
  );

-- Walks UP the sponsor chain starting at p_coach_id (inclusive) to the root
-- founding coach, returning every admin (Owner/Internship) found along the
-- way — the opposite direction from visible_club_ids(). Backs the
-- coach-approval gate: a pending registrant's chosen sponsor might not
-- themselves be an admin, so approval rights belong to whichever admin is
-- nearest in that sponsor's own upline, not just the direct sponsor.
-- Call with the pending coach's sponsor_id, not the pending coach's own id.
create or replace function upline_admin_ids(p_coach_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive upline as (
    select id, sponsor_id, is_admin
    from coaches
    where id = p_coach_id
    union all
    select c.id, c.sponsor_id, c.is_admin
    from coaches c
    join upline u on c.id = u.sponsor_id
  )
  select id from upline where is_admin;
$$;

grant execute on function upline_admin_ids(uuid) to authenticated;

-- Admins this pending coach's chosen sponsor reports to (inclusive, via
-- upline_admin_ids) may approve them, same as the super admin. Flips
-- approved to true — see the coaches_update_self RLS comment for why this
-- can't happen any other way.
create or replace function approve_coach(p_coach_id uuid)
returns coaches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := current_coach_id();
  v_target coaches%rowtype;
begin
  select * into v_target from coaches where id = p_coach_id for update;
  if not found then
    raise exception 'Coach not found';
  end if;
  if not v_target.active then
    raise exception 'This registration was already rejected';
  end if;
  if v_target.approved then
    raise exception 'Already approved';
  end if;

  if not is_super_admin() and not exists (
    select 1 from upline_admin_ids(v_target.sponsor_id) u where u = v_caller_id
  ) then
    raise exception 'You are not authorized to approve this coach';
  end if;

  update coaches set approved = true where id = p_coach_id;
  select * into v_target from coaches where id = p_coach_id;
  return v_target;
end;
$$;

-- Same authorization as approve_coach() — declines a pending registration
-- instead. Reuses the active flag (same soft-delete rationale as elsewhere)
-- rather than adding a third status value: pending is approved=false +
-- active=true, rejected is approved=false + active=false.
create or replace function reject_coach(p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := current_coach_id();
  v_target coaches%rowtype;
begin
  select * into v_target from coaches where id = p_coach_id for update;
  if not found then
    raise exception 'Coach not found';
  end if;
  if v_target.approved then
    raise exception 'Cannot reject an already-approved coach — deactivate them instead';
  end if;
  if not v_target.active then
    raise exception 'Already rejected';
  end if;

  if not is_super_admin() and not exists (
    select 1 from upline_admin_ids(v_target.sponsor_id) u where u = v_caller_id
  ) then
    raise exception 'You are not authorized to reject this coach';
  end if;

  update coaches set active = false where id = p_coach_id;
end;
$$;

-- Feeds the Dashboard's "N pending" notice and the /approvals page — every
-- coach still pending that the caller is allowed to act on, per the same
-- upline_admin_ids() check used inside approve_coach()/reject_coach().
create or replace function pending_coaches_for_approval()
returns table (
  id uuid,
  name text,
  contact text,
  member_id text,
  nc_club_id uuid,
  nc_club_name text,
  nc_position nc_position,
  sponsor_id uuid,
  sponsor_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name, c.contact, c.member_id, c.nc_club_id, club.name,
    c.nc_position, c.sponsor_id, sponsor.name, c.created_at
  from coaches c
  left join nc_clubs club on club.id = c.nc_club_id
  left join coaches sponsor on sponsor.id = c.sponsor_id
  where c.active and not c.approved
    and (
      is_super_admin()
      or exists (select 1 from upline_admin_ids(c.sponsor_id) u where u = current_coach_id())
    )
  order by c.created_at;
$$;

grant execute on function approve_coach(uuid) to authenticated;
grant execute on function reject_coach(uuid) to authenticated;
grant execute on function pending_coaches_for_approval() to authenticated;
