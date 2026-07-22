-- Responsible coach is now required on every entry, not just expenses —
-- for income it's the coach responsible for/credited with the sale.
-- Added NOT VALID so it doesn't fail on any income rows already recorded
-- without one; only new/updated rows are checked. Run
-- "alter table finance_transactions validate constraint
-- finance_txn_responsible_coach_required;" later once any old rows have
-- been backfilled, if you want it fully enforced retroactively.
alter table finance_transactions drop constraint finance_txn_coach_for_out;

alter table finance_transactions add constraint finance_txn_responsible_coach_required
  check (responsible_coach_id is not null) not valid;
