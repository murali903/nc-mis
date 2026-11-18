-- =============================================================================
-- IndentFlow  |  Allow the new attachment types (Drawing, Shop Drawing, Sketch...)
-- =============================================================================
-- indent_documents.category was limited to the old procurement document types,
-- so attaching a drawing or sketch to an indent was refused. The list of types
-- is kept in the app (js/components/list-controls.js); the column is free text.
-- Safe to run more than once.
-- =============================================================================
ALTER TABLE indent_flow.indent_documents DROP CONSTRAINT IF EXISTS indent_documents_category_check;
