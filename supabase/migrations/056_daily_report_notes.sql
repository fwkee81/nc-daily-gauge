-- A coach's free-text remark against one entry in the Daily Report's
-- New/Renewals ledger (e.g. notes from a post-signup or post-renewal
-- meeting). Polymorphic on purpose: a "new" ledger row is keyed by
-- customer_id, a "renewal" row by renewal_id — exactly one is set, matching
-- LedgerRow's kind+id in the client. nc_club_id is denormalized (rather than
-- derived via a join) purely so the RLS policies below stay simple, same
-- reasoning as checkins.nc_club_id.
create table daily_report_notes (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  customer_id uuid references customers (id) on delete cascade,
  renewal_id uuid references customer_renewals (id) on delete cascade,
  note text not null default '',
  updated_by_coach_id uuid references coaches (id),
  updated_at timestamptz not null default now(),
  constraint daily_report_notes_one_ref check (
    (customer_id is not null and renewal_id is null)
    or (customer_id is null and renewal_id is not null)
  )
);
create unique index daily_report_notes_customer_uidx on daily_report_notes (customer_id)
  where customer_id is not null;
create unique index daily_report_notes_renewal_uidx on daily_report_notes (renewal_id)
  where renewal_id is not null;
create index idx_daily_report_notes_club on daily_report_notes (nc_club_id);

alter table daily_report_notes enable row level security;

create policy "daily_report_notes_select" on daily_report_notes
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "daily_report_notes_insert" on daily_report_notes
  for insert to authenticated
  with check (
    updated_by_coach_id = current_coach_id()
    and nc_club_id in (select visible_club_ids(current_coach_id()))
  );

create policy "daily_report_notes_update" on daily_report_notes
  for update to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())))
  with check (updated_by_coach_id = current_coach_id());
