-- Allows a coach to delete their own Daily Report "Remark / Post Meeting" log
-- entry (or an admin to delete anyone's) — pulling a wrong entry shouldn't
-- need an RPC or an audit trail, same reasoning as the update policy.
create policy "daily_report_logs_delete" on daily_report_logs
  for delete to authenticated
  using (
    nc_club_id in (select visible_club_ids(current_coach_id()))
    and (created_by_coach_id = current_coach_id() or is_current_coach_admin())
  );
