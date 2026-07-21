-- Remark/Post Meeting notes across every visible branch club for one day —
-- feeds the "Remarks" list under each club card on the Branches Daily tab.
-- Only rows with a non-empty note are returned (a ledger entry with no
-- saved remark has nothing to show here); editing still happens on that
-- club's own Daily Report page.
create or replace function branches_daily_remarks(p_date date)
returns table (
  club_id uuid,
  kind text,
  customer_name text,
  note text,
  updated_by_coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select cu.nc_club_id as club_id, 'new' as kind, cu.name as customer_name, n.note,
    co.name as updated_by_coach_name, cu.created_at
  from customers cu
  join daily_report_notes n on n.customer_id = cu.id
  left join coaches co on co.id = n.updated_by_coach_id
  where cu.nc_club_id in (select visible_club_ids(current_coach_id()))
    and cu.created_at::date = p_date
    and length(trim(n.note)) > 0

  union all

  select cu.nc_club_id as club_id, 'renewal' as kind, cu.name as customer_name, n.note,
    co.name as updated_by_coach_name, cr.created_at
  from customer_renewals cr
  join customers cu on cu.id = cr.customer_id
  join daily_report_notes n on n.renewal_id = cr.id
  left join coaches co on co.id = n.updated_by_coach_id
  where cu.nc_club_id in (select visible_club_ids(current_coach_id()))
    and cr.created_at::date = p_date
    and length(trim(n.note)) > 0

  order by created_at desc;
$$;

grant execute on function branches_daily_remarks(date) to authenticated;
