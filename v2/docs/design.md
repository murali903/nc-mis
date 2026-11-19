# Navyacon MIS v2: design

Decisions taken 18 Nov 2026 and what follows from them. Version 1 (the `js/`
and `supabase/` folders) stays untouched and keeps running on the dev site while
this is built beside it.

## Decisions

| # | Decision | Taken by |
|---|---|---|
| 1 | Full application server: all business rules run in the server, not the database or the browser | Murali |
| 2 | Server in Python (FastAPI), on a small hosting service, deployed from GitHub on every push | Murali |
| 3 | Built as a separate track with its own new Supabase project; dev is not touched | Murali |
| 4 | Every person reports to another person. Approvals and escalations go up that line | Murali |
| 5 | Visibility follows the hierarchy and site assignment; a PM sees only their sites | Murali |
| 6 | Multi-company from the start: every record carries its company | Murali |
| 7 | Document numbers: `NC-IND-GCB-2627-0042` (see below) | Claude, as asked |
| 8 | One indent can have several POs, built into v2 from the start | follows from earlier request |

## Shape

```
Browser  (screens only)
   |   HTTPS, with the user's sign-in token
   v
Application server  (Python, FastAPI)            v2/server
   api/        one endpoint per action: "approve indent", "issue PO" ...
   services/   one use-case per action: load, check rules, save, notify,
               all inside one database transaction
   domain/     the rules themselves, as plain functions with no database or
               web code in them, so each can be tested in isolation
   data/       reading and writing the database
   |
   v
Database  (Postgres on Supabase)                 v2/db
   stores data; enforces only what can never be false
   (required fields, valid statuses, unique numbers)
   closed to the browser entirely

Supabase Auth      sign-in, passwords, invitations (the server checks the token)
Supabase Storage   private bucket; the server issues short-lived file links
```

Why the rules sit in `domain/` as plain functions: they can be run and tested
without a database or a server. The 28 tests in `v2/server/tests` already do
this for the hierarchy, routing, visibility and numbering rules.

## People, roles and the reporting line

- **Company → offices → sites.** A site belongs to an office; an office to a
  company. Each has a short code used in document numbers.
- **Member** = one person in one company, with one role, the sites they are
  assigned to, and the person they report to.
- **Role** = a named set of permissions, defined per company. "General Manager"
  is created as data: a role with the approval permissions and a PO limit.
- **Reports to**: exactly one other member; empty only for the person at the
  top. The system refuses a line that loops, crosses companies, or points at an
  inactive user. If a manager is deactivated, their work passes to the next
  person up until the admin reassigns their team.

Starting roles (the admin can add or change them):

| Role | Can | PO limit |
|---|---|---|
| Site engineer | raise indents | none |
| Storekeeper | raise indents, record receipts | none |
| Project manager | raise and approve indents | none |
| Procurement clerk | raise POs; sees all indents and POs | none |
| Procurement manager | raise, approve and close POs; vendors; sees all | Rs. 50,000 |
| General manager | approve indents and POs; sees all | Rs. 5,00,000 (to confirm) |
| Managing director | approve indents and POs; sees all | no ceiling |
| Admin | users, sites, offices, roles, settings | none |

## One routing rule for everything

> A decision goes to the nearest person above you in the reporting line who is
> allowed to make it. If your boss cannot, it passes to their boss, and so on up.

| Situation | Who it goes to |
|---|---|
| Engineer or storekeeper submits an indent | their PM |
| PM submits their own indent | whoever that PM reports to: a GM or the MD |
| PM escalates an indent | the PM's boss |
| GM escalates | the GM's boss |
| Top person escalates | refused: nobody above |
| Buyer raises a PO within their own limit | may issue it directly, or send it up |
| Buyer raises a PO above their limit | first person above whose limit covers it |
| Clerk raises a PO of Rs. 20,000 | procurement manager (limit Rs. 50,000) |
| Clerk raises a PO of Rs. 2,00,000 | passes over the procurement manager to the GM |
| PO of Rs. 7,50,000 | passes over the GM to the MD |
| Nobody above has the authority | refused, telling the admin to fix the limits |

Unchanged from version 1: nobody decides their own indent or PO; every decision
by an approver needs written remarks; the person who escalated and the creator
are told the outcome.

Each indent and PO records the one person it is **waiting on**. Only that person
(or someone above them, by taking it over) can decide it. This is also what
drives each user's "waiting for me" list.

## Who sees what

A person sees an indent, and its POs and receipts, when at least one is true:

1. they raised it;
2. it is for a site they are assigned to;
3. the person who raised it reports to them, directly or through others;
4. it is waiting on them, assigned to them, or they have acted on it;
5. their role sees the whole company (procurement, GM, MD, admin).

So a PM sees their own sites; a GM sees everything under their PMs; an engineer
sees their site. Nobody sees another company's records. Rates and vendor details
on a PO are shown to procurement and approvers only; site staff see items and
quantities (to confirm).

## Document numbers

```
NC-IND-GCB-2627-0042
|  |   |   |    |
|  |   |   |    running number, restarts every financial year
|  |   |   financial year April to March (2026-27)
|  |   place: the site for indents and receipts, the office for POs
|  type: IND indent, PO purchase order, GRN goods receipt
company
```

- Read aloud it says what it is, where, and when, without looking anything up.
- Hyphens, not slashes, so the number is safe in file names and web addresses.
- Each site and office has its own unbroken series, so a missing number is
  noticeable locally.
- A number is given when a document first leaves draft, so abandoned drafts do
  not use numbers.
- Taken from a database counter inside the same transaction: no duplicates when
  two people save at once, and no gaps.

## Indent and PO in v2

An indent no longer copies its PO's status. It has six of its own: draft,
pending approval, returned, rejected, approved / in procurement, completed.
Progress is tracked per item:

| Per indent item | Meaning |
|---|---|
| quantity | what the site asked for |
| ordered | on live POs (one or several) |
| dispatched | sent without a PO |
| received | arrived at site |
| closed short | the balance will not be supplied |

An indent completes when every item is fully received or closed short. Buyers
pick which items, and how much of each, go on each PO. Ordering more than asked
needs a reason, shown to the approver. PO statuses are as in version 1.

## How it will be tested

| Layer | What | Where it runs |
|---|---|---|
| Rule tests | every rule in `domain/`, in milliseconds | anywhere; 28 pass today |
| Service tests | each action against a real, empty test database | GitHub, on every push |
| Journey tests | the scenarios from the tester's briefing, in a browser | against the deployed v2 |

A push that fails any test is not deployed.

## Build order

1. Foundation: database structure, rule functions for hierarchy, routing,
   visibility and numbering. **Done, not yet run on a database.**
2. Server skeleton: sign-in check, company and member loading, admin endpoints
   for offices, sites, roles, members and reporting lines; first deployment.
3. Indents: create, submit, approve, return, reject, escalate, attachments.
4. Purchase orders: several per indent, quotations, routing by limit, issue,
   amend, cancel.
5. Receipts and closing; dispatch without PO.
6. New screens, role by role, on a proper front-end project.
7. Import of seed data from spreadsheets; cut-over plan from version 1.

Version 1 keeps running for testing rules and training until step 6 is usable.

## What is needed from Murali to continue

1. A new Supabase project (free plan is fine for now), Mumbai region.
2. A hosting account for the server (Render or Railway), linked to the GitHub
   repository.
3. Answers to the open points below.

## Open points

1. General manager's PO limit (Rs. 5,00,000 is a placeholder).
2. Can a manager act on something waiting on a person below them (take over)
   when that person is away? Proposed: yes, and it is recorded as such.
3. Should site staff see rates on a PO?
4. Short codes for the company, each office and each site.
5. Does the financial year for numbering follow April to March? (assumed yes)
