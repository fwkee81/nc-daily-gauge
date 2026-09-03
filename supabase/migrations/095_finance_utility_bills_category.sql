-- Add "Utility bills" as a new Finance expense category, positioned right
-- after "Cleaning". Postgres won't let a brand-new enum value be referenced
-- by other DDL in the same transaction it was added in ("unsafe use of new
-- value of enum type"), so this file is split into two steps that must be
-- run as two SEPARATE statements/executions in the Supabase SQL Editor —
-- run STEP 1, wait for it to finish, then run STEP 2.

-- STEP 1
alter type finance_category add value if not exists 'Utility bills' after 'Cleaning';

-- STEP 2 (run only after STEP 1 has committed)
alter table finance_transactions drop constraint finance_txn_category_matches_direction;

alter table finance_transactions add constraint finance_txn_category_matches_direction check (
  (direction = 'in' and category in (
    '5-Day Card', '10-Day Card', '20-Day Card', '30-Day Card', 'Ala Carte',
    'Power Cup', 'Foodie', 'Fit Club', 'PJS', 'Membership', 'Product Purchased', 'Others'
  ))
  or
  (direction = 'out' and category in (
    'Ingredients', 'Stock-in', 'Claim', 'Rental', 'Cleaning', 'Utility bills', 'Others'
  ))
);
