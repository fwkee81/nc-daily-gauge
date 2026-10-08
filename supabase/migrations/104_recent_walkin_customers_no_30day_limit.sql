-- Search pool for the Walk-in dialog's "have they been in before?" lookup.
-- Originally scoped to the last 30 days ("a month-plus gap is basically
-- new") but that caused real duplicates: a walk-in who comes back after a
-- longer gap doesn't show up in the search, so a coach has no way to find
-- and reuse their existing record, and ends up creating a second one by
-- mistake. Every active Ala Carte customer is searchable now, however long
-- it's been — the Combobox's own search keeps this usable even with a long
-- history of one-time walk-ins. Signature is unchanged, so this is a
-- straight create-or-replace, no drop needed.
create or replace function recent_walkin_customers(p_club_id uuid default null)
returns table (id uuid, name text, contact text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.contact
  from customers c
  where c.nc_club_id = coalesce(p_club_id, (select nc_club_id from coaches where auth_user_id = auth.uid()))
    and c.nc_level = 'Ala Carte'
    and c.active
  order by c.name;
$$;
