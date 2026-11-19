-- =============================================================================
-- IndentFlow  |  Item remarks column; real offices take over from the test ones
-- =============================================================================
-- 1. indent_line_items.remarks was missing on the dev database, so saving an
--    indent failed once the screens started sending item remarks.
-- 2. The sites still pointed at the three old test offices ("Navyacon ..."),
--    so a PO printed the test address and a made-up GSTIN. Sites are moved to
--    the real "Navya Constructions - <city>" offices and the old ones retired.
-- Safe to run more than once.
-- =============================================================================
BEGIN;

ALTER TABLE indent_flow.indent_line_items ADD COLUMN IF NOT EXISTS remarks text;

UPDATE core.sites s
   SET office_id = n.id
  FROM core.offices o
  JOIN core.offices n ON n.city = o.city AND n.name LIKE 'Navya Constructions - %'
 WHERE s.office_id = o.id
   AND o.name NOT LIKE 'Navya Constructions - %';

UPDATE core.offices SET is_active = false
 WHERE name LIKE 'Navyacon%' AND name NOT LIKE 'Navya Constructions - %';

COMMIT;

NOTIFY pgrst, 'reload schema';
