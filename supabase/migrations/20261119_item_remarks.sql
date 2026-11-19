-- =============================================================================
-- IndentFlow  |  Item-wise remarks on indents
-- =============================================================================
-- The remarks typed against each item of an indent were never saved: the table
-- had no column for them. (Reported in the team session of 19 Nov 2026.)
-- Safe to run more than once.
-- =============================================================================
ALTER TABLE indent_flow.indent_line_items ADD COLUMN IF NOT EXISTS remarks text;

NOTIFY pgrst, 'reload schema';
