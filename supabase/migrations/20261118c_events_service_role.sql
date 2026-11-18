-- Lets server-side functions (Edge Functions using the secret key) write to and
-- read the event log. Run after 20261118_phase1_po_lifecycle.sql.
GRANT SELECT, INSERT ON indent_flow.events TO service_role;
