-- =============================================================================
-- IndentFlow  |  Database changes applied by hand on 17-18 Nov 2026
-- =============================================================================
-- These statements were run one at a time in the Supabase SQL editor before the
-- migrations folder existed. They are recorded here so the database can be
-- rebuilt from the repository. They are ALREADY APPLIED on the dev project;
-- every statement is written so that running it again is harmless.
-- Order matters relative to the other files: this one comes first.
-- =============================================================================

-- 1. Indent statuses the app uses (adds pending_md_po_approval and po_issued)
ALTER TABLE indent_flow.indents DROP CONSTRAINT IF EXISTS indents_status_check;
ALTER TABLE indent_flow.indents ADD CONSTRAINT indents_status_check CHECK (status IN (
  'draft','pending_approval','approved','rejected','returned_for_revision',
  'escalated_to_md','in_procurement','po_draft','pending_md_po_approval',
  'po_approved','po_issued','dispatched','completed','cancelled'));

-- 2. Goods receipt: photo, condition and quality remarks
ALTER TABLE indent_flow.grns      ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE indent_flow.grn_items ADD COLUMN IF NOT EXISTS condition text DEFAULT 'Good';
ALTER TABLE indent_flow.grn_items ADD COLUMN IF NOT EXISTS quality_remarks text;

-- 3. Storage bucket for receipt photos (public: the app stores a public link)
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true)
  ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "receipts upload" ON storage.objects;
CREATE POLICY "receipts upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');
DROP POLICY IF EXISTS "receipts read" ON storage.objects;
CREATE POLICY "receipts read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

-- 4. A GRN line updates the PO line's received quantity and the PO status
CREATE OR REPLACE FUNCTION indent_flow.apply_grn_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, public AS $$
DECLARE v_po uuid; v_all boolean; v_any boolean;
BEGIN
  UPDATE indent_flow.po_line_items
     SET received_qty = COALESCE(received_qty, 0) + COALESCE(NEW.quantity_received, 0)
   WHERE id = NEW.po_line_item_id
  RETURNING po_id INTO v_po;
  IF v_po IS NULL THEN RETURN NEW; END IF;
  SELECT bool_and(COALESCE(received_qty, 0) >= COALESCE(quantity, 0)),
         bool_or(COALESCE(received_qty, 0) > 0)
    INTO v_all, v_any
    FROM indent_flow.po_line_items WHERE po_id = v_po;
  UPDATE indent_flow.purchase_orders
     SET status = CASE WHEN v_all THEN 'fulfilled' WHEN v_any THEN 'partially_fulfilled' ELSE status END,
         updated_at = now()
   WHERE id = v_po AND status IN ('issued', 'partially_fulfilled');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_grn_item ON indent_flow.grn_items;
CREATE TRIGGER trg_apply_grn_item AFTER INSERT ON indent_flow.grn_items
  FOR EACH ROW EXECUTE FUNCTION indent_flow.apply_grn_item();

-- 5. Vendor details the app collects
ALTER TABLE core.vendors
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS ifsc text,
  ADD COLUMN IF NOT EXISTS default_payment_terms integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS notes text;

NOTIFY pgrst, 'reload schema';
