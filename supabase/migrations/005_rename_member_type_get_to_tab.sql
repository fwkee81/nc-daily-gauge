-- Run this in the Supabase SQL editor on your existing project.
-- Renames the "GET" Member Type to "TAB". Any customers currently set to
-- GET are automatically relabeled to TAB — no data migration needed.

alter type member_type rename value 'GET' to 'TAB';
