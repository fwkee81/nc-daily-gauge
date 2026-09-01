-- wellness_users is owned by the separate "My Wellness" customer-facing app,
-- not by NC Daily Gauge (see the comment on WellnessLog in
-- src/lib/types/database.ts) — but its only existing policy
-- (wellness_users_select_self) only lets a My Wellness login see its own
-- binding row. A coach querying it through NC Daily Gauge therefore always
-- got an empty result via RLS, even for a customer who really was bound —
-- the Wellness Report page's "Joined / Not joined" badge was silently wrong
-- regardless of the actual binding state.
--
-- This adds a second, additive SELECT policy — Postgres OR's multiple
-- permissive policies together, so the existing self-access policy is
-- untouched — scoped the same way customers_select already is: a coach can
-- see a wellness_users row only for a customer in one of their visible
-- clubs.
create policy "wellness_users_select_coach" on wellness_users
for select
to authenticated
using (
  exists (
    select 1 from customers c
    where c.id = wellness_users.customer_id
      and c.nc_club_id in (select visible_club_ids(current_coach_id()))
  )
);
