-- Corrects the design from migrations 056/057: that version tied a remark
-- to one specific New/Renewals ledger row (customer_id/renewal_id). What's
-- actually wanted is a general "what happened today" log for the club, not
-- attached to any one customer — so drop that table/function and replace
-- with a simple append-only log keyed by club + date.

drop function if exists branches_daily_remarks(date);
drop table if exists daily_report_notes;

-- A running log of notable events for the day on a club's Daily Report —
-- sits right after the New/Renewals ledger. NOT tied to any one customer or
-- ledger row. Free-text entries a coach adds over the course of the day,
-- append-only like a journal. log_date is set explicitly from whichever
-- date the Daily Report page is viewing (not always "today"), so
-- backfilling a past day's notes works the same way backfilling check-ins
-- does.
create table daily_report_logs (
  id uuid primary key default gen_random_uuid(),
  nc_club_id uuid not null references nc_clubs (id),
  log_date date not null,
  note text not null,
  created_by_coach_id uuid references coaches (id),
  created_at timestamptz not null default now()
);
create index idx_daily_report_logs_club_date on daily_report_logs (nc_club_id, log_date);

alter table daily_report_logs enable row level security;

-- Append-only: no update/delete policy, matching the journal-entry intent
-- (log entries aren't edited after the fact).
create policy "daily_report_logs_select" on daily_report_logs
  for select to authenticated
  using (nc_club_id in (select visible_club_ids(current_coach_id())));

create policy "daily_report_logs_insert" on daily_report_logs
  for insert to authenticated
  with check (
    created_by_coach_id = current_coach_id()
    and nc_club_id in (select visible_club_ids(current_coach_id()))
  );

-- Daily report log entries ("what happened today") across every visible
-- branch club for one day — feeds the list under each club card on the
-- Branches Daily tab.
create or replace function branches_daily_remarks(p_date date)
returns table (
  club_id uuid,
  note text,
  created_by_coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select l.nc_club_id as club_id, l.note, co.name as created_by_coach_name, l.created_at
  from daily_report_logs l
  left join coaches co on co.id = l.created_by_coach_id
  where l.nc_club_id in (select visible_club_ids(current_coach_id()))
    and l.log_date = p_date
  order by l.created_at desc;
$$;

grant execute on function branches_daily_remarks(date) to authenticated;
