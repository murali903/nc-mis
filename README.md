# nc-mis — IndentFlow

Material indent and purchase-order management for Navyacon Construction. First
module of the Navyacon MIS.

- **Live:** https://nc-mis.vercel.app
- **Dev / test address:** https://nc-mis-dev.vercel.app (same build and database)
- **Hosting:** Vercel, static files, deploys on every push to `main`
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions)

## How it is put together

```
Browser (static files in this repo)
  index.html          loads React, the Supabase client, css/ and js/ in order
  js/                 the app: screens, state, data access
        |
        |  workflow actions (submit, approve, issue, receive ...)
        v
Supabase database
  indent_flow.indent_*()   one function per indent action
  indent_flow.po_*()       one function per purchase-order action
        each function checks the caller's role and the record's status, then
        writes the record, its timeline, notifications and an event together
  indent_flow.events       append-only log of business events
        (indent.approved, po.issued, grn.recorded ...) for automations,
        other MIS modules and AI workflows to read
        |
Supabase Edge Functions (server side, hold the secret key)
  admin-create-user        creates login + profile + site assignments
```

The rule to keep: **business rules live in the database functions, not in the
browser.** The screens call a function and show the result. Anything else that
needs to perform an action (another module, a script, an AI agent) calls the
same function and gets the same checks.

## Folder guide

| Path | What is in it |
|---|---|
| `index.html` | Page shell. Lists the script files in load order. |
| `css/app.css` | All styles. |
| `js/config.js` | Supabase project address and public key; React hooks. |
| `js/data/transforms.js` | Converts database rows into the shapes the screens use. |
| `js/data/api.js` | Loading data, and helpers for calling the database. |
| `js/data/sync.js` | Saves each user action: calls the workflow function or writes the row. |
| `js/state/reducer.js` | In-memory app state and how each action changes it. |
| `js/lib/helpers.js` | Small shared helpers (names, numbers, printing a GRN). |
| `js/components/shell.js` | Login page, top bar with notifications, side menu, shared widgets. |
| `js/screens/*.js` | One file per area: admin, engineer, project manager, procurement, MD, store, reports, indent and PO detail pages. |
| `js/app.js` | Routing, the save queue, realtime refresh, app start-up. |
| `supabase/migrations/` | Every database change, in the order it was applied. |
| `supabase/functions/` | Edge Function source. |

The files in `js/` are plain scripts that share one global scope and **must load
in the order listed in `index.html`**. There is no build step yet.

## Database changes

1. Write the change as a new file in `supabase/migrations/`, named
   `YYYYMMDD<letter>_what_it_does.sql`.
2. Run it in the Supabase SQL editor.
3. Commit the file. The folder is the record of what the database contains.

Schemas: `core` holds data shared across MIS modules (profiles, sites, offices,
vendors, site assignments, settings). `indent_flow` holds this module's data.

## Roles

`admin`, `site_engineer`, `storekeeper`, `project_manager`,
`procurement_manager`, `procurement_clerk`, `md`. A user's role is in
`core.profiles.role` and is checked by every workflow function.

## Known limits

- All data is loaded at sign-in; fine for now, will need per-screen loading as
  volume grows.
- The screen updates before the save finishes. If the save is refused, an error
  is shown and the screen reloads from the database.
- No automated tests yet; flows are tested by hand on the dev address.
