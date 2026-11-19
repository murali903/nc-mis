# Going to production

How to stand up a clean production system with no test data, and what has to be
true before real users are let in. Written 18 Nov 2026. Status of each step is
tracked in the checklists; tick them here as they are done.

## Where we are

| | Dev (today) | Production (to build) |
|---|---|---|
| Web address | nc-mis-dev.vercel.app | to be chosen, e.g. mis.navyacon.com |
| Database | Supabase project `ttnmuhhikupimebvvrhc` | a second, separate Supabase project |
| Data | test data, shared with nc-mis.vercel.app | empty, then seeded |
| Who deploys | every push to `main` goes live at once | only a deliberate release |

Dev and "live" currently share one database. Until production has its own, there
is no production.

## Phase 0: before anything is created (blockers)

- [ ] **Capture the full database structure in the repository.** The files in
      `supabase/migrations/` only hold changes made since 17 Nov. The original
      tables, row-level-security policies, triggers and the `core` schema were
      created earlier and exist only in the dev database. Take a structure-only
      export of dev (no data) and commit it as the first migration. Without it a
      new database cannot be built.
- [ ] **Rebuild test.** Create a throwaway Supabase project, run the migrations
      in order, and confirm the app works against it. This proves the migrations
      are complete. Delete the throwaway project afterwards.
- [ ] **Move the connection settings out of the code.** `js/config.js` has the
      dev project's address and key written in. Production needs its own values
      without editing code: one config file per environment, chosen at deploy.
- [ ] **PO numbers assigned by the database.** Today the browser picks the next
      PO number, so two buyers working at once can collide. Move it to the same
      counter mechanism GRN numbers use.
- [ ] **Decide the release rule.** Recommended: `main` deploys to dev; a
      `production` branch deploys to production; changes reach production only
      by merging after testing on dev.
- [ ] **Sign-off of the business rules** from the joint test session
      (`IndentFlow: tester's briefing`).

## Phase 1: create the production environment

1. **New Supabase project** in the Mumbai region, on a paid plan (daily backups
   and point-in-time recovery; the free plan pauses idle projects).
2. **Run the migrations** in filename order in the SQL editor.
3. **Authentication settings:** turn off public sign-up (users are created only
   by an admin), set the site URL to the production address, set password rules,
   set the sender name and wording of the invitation email.
4. **Deploy the Edge Function** `admin-create-user` to the new project.
5. **Storage:** the buckets `receipts` and `indent-docs` are created by the
   migrations; confirm they exist and that `indent-docs` is private.
6. **New Vercel project** (or production branch) pointing at the production
   config, with the production web address attached.
7. **Smoke test** with a temporary admin: sign in, create a site, create a user.

## Phase 2: seed data, in this order

Each step depends on the one before it.

| # | What | How | Who provides it |
|---|---|---|---|
| 1 | First admin user | Created by hand: the login in the Supabase dashboard, then one SQL statement giving it the admin role. The only user ever created this way | Murali |
| 2 | Organisation settings | Admin screen: company name, address, GSTIN, PAN, PO approval limit | Murali |
| 3 | Offices | Admin screen. Each has its own address and GSTIN (printed on POs) | Accounts |
| 4 | Sites | Admin screen. Each site belongs to one office | Projects |
| 5 | Users | Admin screen, one per person, with role. Invite by email so each sets their own password | HR / Murali |
| 6 | Site assignments | Admin screen: which engineer, storekeeper and PM belongs to which site | Projects |
| 7 | Vendors | Procurement screen, or bulk load from a spreadsheet | Procurement |
| 8 | BOQ / material list per site | Bulk load from a spreadsheet (no screen for this yet) | Projects / QS |
| 9 | Opening numbers | Starting PO, indent and GRN numbers if they must continue an existing series | Accounts |

To build before go-live: a spreadsheet import for vendors, BOQ items and users,
so 30 sites and 200 users are not typed in one by one.

## Phase 3: pilot

- One site, real indents, for four weeks. Paper continues in parallel for the
  first two.
- One named person per role at that site; a 30-minute walkthrough each, using the
  user guide.
- A single channel for problems (one WhatsApp group or one email address), with
  the four facts from the tester's briefing.
- Weekly review: bugs, rule questions, things that were hard to use.
- Exit test: a full month with every indent at that site raised and closed in the
  system, and no rule bypassed on paper.

## Phase 4: roll out

- Sites in batches of five, each with its users and assignments seeded first.
- Paper indents stop at a site on its go-live date; open paper indents are either
  finished on paper or re-entered, never both.

## Operating it once live

- **Backups:** daily by Supabase. Once a quarter, restore the latest backup into
  a throwaway project and open the app against it. A backup that has never been
  restored is a hope, not a backup.
- **Releases:** tested on dev, then merged to production at a quiet time, with a
  one-line note of what changed. Database changes always as a migration file,
  run on dev first.
- **Access:** admin rights for two people, not one. A leaver's account is
  deactivated the same day.
- **Monitoring:** the System Logs screen for errors; Supabase and Vercel usage
  dashboards monthly.

## Go-live checklist

- [ ] Phase 0 complete; rebuild test passed
- [ ] Production database built from migrations only
- [ ] No test users, sites, vendors or documents in production
- [ ] Public sign-up off; invitation email tested
- [ ] A backup restored successfully at least once
- [ ] Automated rule tests passing (see `architecture-for-scale.md`)
- [ ] User guide issued; pilot users walked through it
- [ ] Two admins named
- [ ] Rollback plan: the previous release can be redeployed in minutes
