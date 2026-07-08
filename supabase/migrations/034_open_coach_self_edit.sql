-- Run this in the Supabase SQL editor on your existing project.
--
-- Profile page: coaches can now freely edit their own Level, NC Position,
-- Sponsor, Nutrition Club, Member ID, and Active status — not just
-- name/contact/dob. This removes the restrict_coach_self_update trigger
-- that used to block a non-super-admin from changing those fields on their
-- own row. The coaches_update_self RLS policy already allowed updating any
-- column on your own row; only the trigger enforced the extra restriction,
-- so dropping it is enough.
--
-- Note: this means any coach can now set their own NC Position to
-- "Owner"/"Internship" (granting themselves admin access to manage
-- customers within their own club), change their own sponsor, or move
-- themselves to a different Nutrition Club. The super admin can still
-- edit ANY coach's row via the separate Admin > Coaches page.

drop trigger if exists coaches_restrict_self_update on coaches;
drop function if exists restrict_coach_self_update();
