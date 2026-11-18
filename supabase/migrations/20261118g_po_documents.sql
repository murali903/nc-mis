-- =============================================================================
-- IndentFlow  |  Quotations on purchase orders
-- =============================================================================
-- Requires 20261118e_approval_rules.sql.
--
--   * A document row can point at the PO it belongs to (po_id). It still belongs
--     to the PO's indent, so it also shows on the indent page. Files live in the
--     same private "indent-docs" bucket.
--   * Before a PO can be sent to the MD or issued it needs a quotation attached
--     (PDF or image), or a written declaration of why no quotation is available
--     (purchase_orders.no_quote_reason).
--
-- Safe to run more than once.
-- =============================================================================

BEGIN;

ALTER TABLE indent_flow.indent_documents ADD COLUMN IF NOT EXISTS po_id uuid;
CREATE INDEX IF NOT EXISTS indent_documents_po_idx ON indent_flow.indent_documents (po_id);
ALTER TABLE indent_flow.purchase_orders  ADD COLUMN IF NOT EXISTS no_quote_reason text;

-- PO readiness check, now including the quotation rule
CREATE OR REPLACE FUNCTION indent_flow._po_check_ready(p_po_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_po    indent_flow.purchase_orders%ROWTYPE;
    v_line  record;
    v_count integer := 0;
    v_total numeric := 0;
    v_price numeric;
BEGIN
    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.vendor_id IS NULL THEN
        RAISE EXCEPTION 'PO %: select a vendor', v_po.po_number;
    END IF;
    IF v_po.delivery_date IS NULL THEN
        RAISE EXCEPTION 'PO %: the required / delivery date is missing', v_po.po_number;
    END IF;
    IF btrim(COALESCE(v_po.notes, '')) = '' THEN
        RAISE EXCEPTION 'PO %: remarks are required', v_po.po_number;
    END IF;
    -- A quotation (PDF or image), or a declaration that none is available
    IF btrim(COALESCE(v_po.no_quote_reason, '')) = '' AND NOT EXISTS (
        SELECT 1 FROM indent_flow.indent_documents d
         WHERE d.po_id = p_po_id
           AND d.category IN ('Quotation', 'Comparative Statement', 'Proforma Invoice', 'Estimate')
    ) THEN
        RAISE EXCEPTION 'PO %: attach a quotation, or declare why no quotation is available', v_po.po_number;
    END IF;

    FOR v_line IN
        SELECT description, quantity, unit_price, rate, gst_percent
          FROM indent_flow.po_line_items WHERE po_id = p_po_id
    LOOP
        v_count := v_count + 1;
        v_price := COALESCE(v_line.unit_price, v_line.rate, 0);
        IF COALESCE(v_line.quantity, 0) <= 0 THEN
            RAISE EXCEPTION 'PO %: "%" has no quantity', v_po.po_number, COALESCE(v_line.description, 'item');
        END IF;
        IF v_price <= 0 THEN
            RAISE EXCEPTION 'PO %: "%" has no rate', v_po.po_number, COALESCE(v_line.description, 'item');
        END IF;
        v_total := v_total + v_line.quantity * v_price * (1 + COALESCE(v_line.gst_percent, 0) / 100.0);
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'PO % has no items', v_po.po_number;
    END IF;
    v_total := round(v_total, 2);
    IF v_total <= 0 THEN
        RAISE EXCEPTION 'PO % has a total of zero', v_po.po_number;
    END IF;

    UPDATE indent_flow.purchase_orders SET total_amount = v_total WHERE id = p_po_id;
    RETURN v_total;
END;
$$;

-- PO guard: the declaration can be edited on a draft like the other details
CREATE OR REPLACE FUNCTION indent_flow._guard_purchase_orders() RETURNS trigger
LANGUAGE plpgsql SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role  text;
    v_brief record;
    v_free  text[] := ARRAY['vendor_id', 'delivery_date', 'payment_terms', 'delivery_address', 'notes',
                            'office_id', 'total_amount', 'remarks', 'version', 'updated_at', 'no_quote_reason'];
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_role := indent_flow.actor_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Your account is not active';
    END IF;
    IF v_role NOT IN ('procurement_manager', 'procurement_clerk', 'admin') THEN
        RAISE EXCEPTION 'Your role (%) is not allowed to create or edit purchase orders', v_role;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Purchase orders cannot be deleted; cancel the draft instead';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status IS DISTINCT FROM 'draft' THEN
            RAISE EXCEPTION 'A new purchase order must start as a draft';
        END IF;
        IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'A purchase order can only be created in your own name';
        END IF;
        IF NEW.md_remarks IS NOT NULL OR NEW.close_remarks IS NOT NULL OR NEW.approval_route IS NOT NULL
           OR NEW.issued_at IS NOT NULL THEN
            RAISE EXCEPTION 'A new purchase order cannot be created already approved or issued';
        END IF;
        IF NEW.indent_id IS NOT NULL THEN
            SELECT * INTO v_brief FROM indent_flow._indent_brief(NEW.indent_id);
            IF v_brief.status IS NULL THEN
                RAISE EXCEPTION 'The indent for this purchase order was not found';
            END IF;
            IF v_brief.status NOT IN ('approved', 'in_procurement') THEN
                RAISE EXCEPTION 'A purchase order can only be raised for an approved indent (this one is %)', v_brief.status;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF (to_jsonb(NEW) - v_free) IS DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
        RAISE EXCEPTION 'Purchase order status and approval details can only be changed through the workflow actions';
    END IF;
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'PO % can no longer be edited (status: %)', OLD.po_number, OLD.status;
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
