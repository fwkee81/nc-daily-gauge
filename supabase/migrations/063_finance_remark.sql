-- Optional free-text note on any entry, independent of `detail` (which is
-- specifically the required "what is it" for category = 'Others').
alter table finance_transactions add column remark text;
