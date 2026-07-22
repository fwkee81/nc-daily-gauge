-- Required when category = 'Others' (either direction) — what it actually
-- is, since 'Others' alone isn't useful in the ledger. Null otherwise.
alter table finance_transactions add column detail text;

alter table finance_transactions add constraint finance_txn_detail_for_others check (
  category <> 'Others' or (detail is not null and length(trim(detail)) > 0)
);
