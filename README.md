# NC Daily Gauge

A daily check-in and reporting app for a nutrition club: coach onboarding, customer
management, cup check-ins, a daily report, and monthly metrics — built on Next.js
(Vercel) + Supabase, entirely on their free tiers.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a free project.
2. In the SQL Editor, paste and run the contents of [`supabase/schema.sql`](supabase/schema.sql).
   This creates all tables, enums, Row Level Security policies, and the RPC functions
   the app calls (check-in, corrections, daily/monthly reports).
3. In **Authentication → Sign In / Providers**:
   - Email/password is enabled by default. For a first pass, you can turn off
     "Confirm email" under Authentication → Settings so sign-up logs the coach in
     immediately (otherwise they must click a confirmation email first).
   - To enable **Google sign-in**: Authentication → Providers → Google, add your
     Google OAuth client ID/secret (create one in the
     [Google Cloud Console](https://console.cloud.google.com/apis/credentials)),
     and set the authorized redirect URI to the one Supabase shows on that page
     (`https://<project-ref>.supabase.co/auth/v1/callback`).
4. In **Project Settings → API**, copy the Project URL and anon public key.

## 2. Configure the app

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Then install and run:

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you'll land on `/login`. Sign up as the first coach,
and on the onboarding form check "I'm the founding coach — no sponsor" since the
coach list will be empty.

### Timezone

The Daily Report and check-in date default to the server's local date
(`new Date()`), and the DB's `monthly_totals`/`monthly_coach_cups` use
`current_date`. Both Vercel and Supabase run in UTC by default. If your club
operates in a different timezone, set a `TZ` environment variable on Vercel
(e.g. `TZ=Asia/Kuala_Lumpur`) so "today" lines up with your local calendar day
near midnight. This isn't strictly required — checked-in cups are always dated
by the client's local day at submission time — but it affects what date the
report pages default to on load.

## 3. Deploy

- **Supabase**: nothing more to do — the free tier project you created is your
  production database.
- **Vercel**: `vercel` CLI or import the repo at [vercel.com/new](https://vercel.com/new),
  set the two `NEXT_PUBLIC_SUPABASE_*` env vars in the project settings, deploy.

### Free tier notes

- **Supabase Free**: 500MB database, 1GB storage, 50k monthly active auth users —
  comfortably enough for a single club. The one gotcha: a free project **pauses
  after ~1 week with no API traffic**. If the club is used daily this never
  happens; if you expect a dormant week, you'll need to manually resume the
  project from the Supabase dashboard (or add a trivial daily cron ping).
- **Vercel Hobby**: fine for this traffic level. Hobby's terms are scoped to
  non-commercial personal use — if this club is a commercial operation, a Pro
  plan is the "by the book" choice, though plenty of small internal tools run
  on Hobby regardless.

## How it's organized

- `supabase/schema.sql` — the entire database: tables, enums, RLS policies, and
  the RPC functions (`record_checkin`, `correct_checkin`, `void_checkin`,
  `daily_totals`, `daily_coach_cups`, `upcoming_birthdays`, `monthly_totals`,
  `monthly_coach_cups`). Business rules (cup-counting eligibility, sponsor-chain
  visibility, averaging) live here so every page reads consistent numbers.
- `src/app/login`, `src/app/signup`, `src/app/auth/callback` — coach
  authentication (email/password + Google).
- `src/app/onboarding` — one-time coach profile completion after sign-up.
- `src/app/(app)` — everything behind a completed coach profile: dashboard,
  check-in, admin customer management, daily report, NC metrics. The layout at
  `src/app/(app)/layout.tsx` gates access and renders the nav bar.

## Assumptions made where the spec was ambiguous

- **Multi-club visibility**: the app is built for one club now, but a coach who
  is an Owner can also see the Daily Report / NC Metrics of any other club
  whose Owner named them (directly, or transitively) as their sponsor — see
  `visible_club_ids()` in the schema. Admin write access (customer management)
  stays scoped to your own club only.
- **Customer removal is a soft delete** (`customers.active = false`): a hard
  delete would break the foreign key from their check-in history, and you'd
  lose their name from past Daily Reports / NC Metrics.
- **Check-in corrections**: admins (Owner/Internship) can change the cup count
  or consumption type on a check-in, or void it entirely, and every change is
  logged to `checkin_edits` with who/what/why. Corrections adjust the
  customer's balance accordingly.
- **"Average NC Cups" / "Average Coach Cups"** = total cups ÷ days elapsed so
  far in the month (for the current month) or ÷ full days in the month (for a
  past month) — not divided by a flat 30.
- **Coach's Cup grouping** ("categories by same sponsor" in the spec) groups
  by the coach the customer was originally invited by, counting only
  customers with a non-null Member ID and Member Type in (MB, SC, SB), per
  spec.
- **Upcoming birthdays** are relative to real "today", independent of whatever
  date is selected on the Daily Report page.
- **Sponsor is nullable at the database level** so the very first ("founding")
  coach can register with no sponsor; the onboarding form still requires an
  explicit choice (pick a sponsor, or confirm "founding coach") for everyone.
- **Nutrition Club is treated as required** during onboarding even though the
  original field list didn't mark it with an asterisk — customers, check-ins,
  and every report are scoped to a club, so the app can't function without one.
