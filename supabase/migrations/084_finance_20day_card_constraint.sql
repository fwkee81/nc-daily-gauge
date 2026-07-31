-- Run after 083_finance_20day_card_category.sql has committed — allows
-- "20-Day Card" as an income category alongside the existing card tiers.
alter table finance_transactions drop constraint finance_txn_category_matches_direction;

alter table finance_transactions add constraint finance_txn_category_matches_direction check (
  (direction = 'in' and category in (
    '5-Day Card', '10-Day Card', '20-Day Card', '30-Day Card', 'Ala Carte',
    'Power Cup', 'Foodie', 'Fit Club', 'PJS', 'Membership', 'Product Purchased', 'Others'
  ))
  or
  (direction = 'out' and category in (
    'Ingredients', 'Stock-in', 'Claim', 'Rental', 'Cleaning', 'Others'
  ))
);
