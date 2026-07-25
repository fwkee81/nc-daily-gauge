-- Allows a coach to edit their own Daily Report "Remark / Post Meeting" log
-- entries (or an admin to edit anyone's) instead of the log being strictly
-- append-only. Not a financial record, so no audit trail is needed here.
create policy "daily_report_logs_update" on daily_report_logs
  for update to authenticated
  using (
    nc_club_id in (select visible_club_ids(current_coach_id()))
    and (created_by_coach_id = current_coach_id() or is_current_coach_admin())
  )
  with check (
    nc_club_id in (select visible_club_ids(current_coach_id()))
    and (created_by_coach_id = current_coach_id() or is_current_coach_admin())
  );
