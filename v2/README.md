# Navyacon MIS, version 2

A rebuild of IndentFlow on stronger foundations, developed beside version 1
without touching it. Start with `docs/design.md`.

| Folder | What is in it | State |
|---|---|---|
| `docs/design.md` | Decisions, structure, routing and visibility rules, number format, build order | written |
| `db/0001_foundation.sql` | Database structure for a new, empty Supabase project | written, not yet run |
| `server/app/domain/` | The business rules as plain Python functions | hierarchy, approvals, visibility, numbering done |
| `server/tests/` | Tests for the rules | 28 passing |
| `server/app/api`, `services`, `data` | The server around the rules | not started |

Run the rule tests (needs only Python 3.10+, nothing to install):

```
cd v2/server
python3 -m unittest discover -s tests -t .
```
