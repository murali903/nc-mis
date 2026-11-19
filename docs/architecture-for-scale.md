# Architecture for scale

What has to change so IndentFlow is a sound base for the Navyacon MIS, not a
prototype. Written 18 Nov 2026. This is a proposal for decision, not a record of
decisions; the open ones are listed at the end.

## The target

| | Now | Design for |
|---|---|---|
| Companies | 1 | 1, with the door open to several |
| Sites | 3 test sites | 30 |
| Users | 8 test users | 200 |
| Per role | one of each | several PMs, procurement managers and clerks; 2 to 3 general managers holding what the MD holds today |
| Records | ~70 indents | tens of thousands of indents and POs over a few years |
| Modules | indents and POs | stores/inventory, then others |

## Where the logic runs today

```
Browser            screens, forms, lists. Convenience checks only.
   |
   |  "approve this indent", "issue this PO"
   v
Database           one function per action (indent_approve, po_issue ...).
(Postgres)         Checks who is asking and whether it is allowed, then writes
                   the record, timeline, notifications and event together.
                   Guard triggers refuse any write that goes around them.
   |
Edge Functions     small server programs holding the secret key
                   (today: creating a user).
```

The business rules are **not** in the browser. They run on the server, inside
the database. The browser cannot approve, issue or receive anything on its own;
this was tested by trying.

What *is* in the browser and should not stay there: fetching all data at
sign-in, working out PO numbers, and assembling screens from one large shared
copy of everything.

## The application-server question

"Should there be an application server, in Python or similar, holding the
business logic?" Three ways to answer it.

| | A. As now | B. Thin service beside the database | C. Full application server |
|---|---|---|---|
| Rules live in | Database functions | Database functions | Python or TypeScript service |
| Service does | nothing | integrations, imports, email, AI, scheduled jobs, reports | everything; database only stores |
| Browser talks to | database API | database API, and the service for the above | the service only |
| Rules can be bypassed | No | No | Only if every path goes through the service |
| A hired developer finds it | Unusual (rules in SQL) | Familiar for new work | Most familiar |
| Cost to get there | none | small, added as needed | rewrite of ~3,000 lines of rules, plus every screen's data calls |
| Running cost | Supabase + Vercel | plus one small service | plus a service that must never be down |

**Recommendation: B, and soon.** Reasons:

- At 200 users the database is nowhere near its limit. Moving rules to Python
  would not make anything faster; an action already runs as one transaction next
  to the data, which is the fastest and safest place for it.
- What a server is truly needed for is everything the database is bad at:
  talking to Tally or email, reading a quotation with AI, importing a
  spreadsheet, nightly reports. Those are coming, and they belong in a service.
- It is the honest answer to the hiring concern as well. A developer can build
  all new work in a mainstream language in the service, and treat the rule
  functions as a stable, tested core.
- C stays open. If the rule set outgrows SQL (it may, when inventory and
  accounts arrive), rules can move into the service one action at a time, behind
  the same action names, with the tests proving nothing changed. Doing C now
  would spend weeks rewriting working, tested rules for no visible gain.

Language for the service: Python if AI and data work will dominate (likely);
TypeScript if one language across browser and server matters more. Decide with
the developer who will maintain it.

## What will actually break first, in order

These matter more than the server question.

### 1. Loading everything at sign-in
Every user downloads every indent, PO, GRN and timeline, then again after each
action. Fine at 70 indents; slow at 5,000; unusable at 50,000.
**Change:** each screen asks for what it shows, a page at a time, with search and
sort done by the database. This is the largest single piece of work.

### 2. Who can see what
With 30 sites, a PM should see their sites, not all. Today most roles can read
everything.
**Change:** visibility by site assignment, enforced in the database for reading
as it already is for writing. Procurement, GMs and admin see all.

### 3. Roles and approval authority
One role per user, and "the MD" is written into the rules as a role name.
**Change:**
- Roles become sets of permissions (approve indent, approve PO, issue PO...),
  so "general manager" is a role with the MD's permissions, created without
  code.
- Approval authority becomes a table: who may approve what, up to what value,
  for which sites or offices. The Rs. 50,000 limit becomes one row among several
  (e.g. GM up to 5 lakh, MD above).
- A person can hold more than one role.

### 4. Company as a first-class thing
Nothing in the data says which company a record belongs to.
**Change:** a `company_id` on every table and in every visibility rule. With no
real data yet this is a few days' work. After go-live it is a migration of live
data. Do it before production even if a second company is years away.

### 5. Numbering
PO numbers are worked out in the browser; two buyers at once can collide.
**Change:** all document numbers from database counters, per company, office and
financial year (e.g. `NC/HYD/26-27/PO/0042`), format set by the admin.

### 6. The front end as a codebase
12,000 lines of plain script files sharing one global space, no build step, no
type checking. It works; it is hard for a second person to change safely.
**Change:** a standard project (TypeScript, a build tool, components per file,
shared table/form parts). Best done together with item 1, screen by screen, not
as one rewrite.

### 7. Tests that run themselves
See the next section.

### 8. Background work
Emails to vendors, reminders for indents waiting too long, daily digests. The
event log exists; nothing reads it yet.
**Change:** the service from option B consumes events and does the slow or
external work, with retries.

## Automated testing, plainly

**Today:** after each change, the flows are clicked through by hand, role by
role. A full pass takes about an hour and depends on remembering every case.
The system now has around 30 rules and 21 statuses; the number of combinations
grows faster than anyone can click.

**What "does not scale" means:** every new rule can break an old one. To be sure
it has not, every old rule must be re-checked after every change. By hand that
means either hours per change, or skipping checks and hoping. Both end badly.

**The fix:** write each check once as a small script, e.g.

> sign in as the PM, raise an indent, try to approve it, expect the refusal
> "has to be approved by the MD"

and have a machine run all of them, in about a minute, every time anything
changes. If one fails, the change does not go to production.

**Three layers, cheapest first:**

1. **Rule tests** against a test database: each business rule, each refusal,
   each status change. This is where most of the value is, and the checks run
   on 18 Nov are already written in this form; they need a home and a runner.
2. **Screen smoke test:** open every screen as every role and click every
   button, looking for crashes. A version of this exists and found real bugs.
3. **A few full journeys** in a real browser: the dozen scenarios in the
   tester's briefing.

**Needs:** a separate test database that can be wiped and rebuilt (which the
production roadmap requires anyway), and the tests wired to run on every push.

## Supabase: stay or move

**Stay.** Underneath, Supabase is ordinary Postgres: the tables and every rule
function would run unchanged on any Postgres host. That is the exit route, and it
is a good one. What is specific to Supabase is sign-in, file storage and the API
the browser uses; those are the parts that would need replacing if we ever left.

Replacing it now would mean running our own database, sign-in, file storage and
API, which is more to operate and more to get wrong, for no gain at this size.

What to do instead of hoping it does not break:
- A paid plan for production (backups, no pausing). Check current plan terms.
- Restore a backup into a spare project once a quarter.
- A weekly structure-and-data export kept somewhere outside Supabase.
- Keep every database change in `supabase/migrations/`, so the database can be
  rebuilt anywhere.

## Suggested order

Before production:

1. Full database structure into migrations; throwaway rebuild test.
2. `company_id` everywhere (item 4).
3. Roles, permissions and the approval matrix (item 3), including general
   manager.
4. Visibility by site (item 2).
5. Database-assigned numbering (item 5).
6. Rule tests running automatically (item 7, layer 1).
7. Separate production environment (see `production-roadmap.md`).

During the pilot:

8. Per-screen loading and the front-end project (items 1 and 6), busiest
   screens first.
9. The service (option B) with its first two jobs: spreadsheet import and
   emailing the PO on issue.

After:

10. One indent, many POs.
11. Stores and inventory as the second module, on the same foundations.

## Decisions (taken 18 Nov 2026)

1. **Option C: full application server**, in Python, on a small host. This
   overrides the recommendation of option B above.
2. Reporting hierarchy: every person reports to another; approvals and
   escalations travel up that line; visibility follows it.
3. A PM sees only their own sites.
4. Document numbers of the form `NC-IND-GCB-2627-0042`.
5. Multi-company from the start.
6. Built as version 2 in the `v2/` folder with its own Supabase project, leaving
   version 1 and the dev site untouched.

The design that follows from these is in `v2/docs/design.md`.
