-- Lets an admin remove a mistakenly-added earn rule or reward outright,
-- not just deactivate it. Still safe: loyalty_points_ledger.earn_rule_id/
-- reward_id reference these tables with no cascade, so Postgres itself
-- refuses to delete one that's already been used (foreign key violation) —
-- the app surfaces that as "turn it off instead" rather than a raw DB
-- error. Same admin-only, own-club shape as the insert/update policies.

create policy "loyalty_earn_rules_delete_admin" on loyalty_earn_rules
  for delete to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );

create policy "loyalty_rewards_delete_admin" on loyalty_rewards
  for delete to authenticated
  using (
    is_current_coach_admin()
    and nc_club_id = (select nc_club_id from coaches where auth_user_id = auth.uid())
  );
