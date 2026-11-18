-- =============================================================================
-- IndentFlow  |  Approval rules, mandatory remarks, PO checks, attachments
-- =============================================================================
-- Requires the earlier 20261118* files.
--
-- What this changes
--   Indents
--     * A project manager cannot approve, reject or return an indent they raised
--       themselves; it has to be decided by the MD.
--     * The MD must give remarks on every decision (approve as well as reject).
--     * Whoever escalates an indent is recorded and is told the MD's decision.
--     * A receipt needs a photo or remarks. Procurement is told when material
--       is received against an indent.
--   Purchase orders
--     * Before a PO can be submitted or issued: vendor, delivery date, remarks,
--       and a quantity and rate above zero on every item. The total is
--       recalculated here, not taken from the browser.
--     * MD approval is compulsory only above a limit kept in the organisation
--       settings (po_md_approval_threshold, set to 50,000 here). At or below
--       it, the procurement manager may issue the PO directly.
--     * MD remarks are compulsory on approve and reject; remarks are compulsory
--       on close. Only the procurement manager (or admin) can close.
--     * A goods receipt needs a photo or remarks.
--   Attachments
--     * Private storage bucket "indent-docs" for drawings and sketches attached
--       to an indent; a document can point at one item of the indent.
--
-- Function signatures that change (the old ones are removed):
--     po_approve(uuid)            -> po_approve(uuid, text)
--     po_close(uuid)              -> po_close(uuid, text)
--     indent_receive(uuid, jsonb, text) -> indent_receive(uuid, jsonb, text, text)
--
-- Safety: one transaction; safe to run more than once.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
ALTER TABLE indent_flow.indents          ADD COLUMN IF NOT EXISTS escalated_by   uuid;
ALTER TABLE indent_flow.purchase_orders  ADD COLUMN IF NOT EXISTS md_remarks     text;
ALTER TABLE indent_flow.purchase_orders  ADD COLUMN IF NOT EXISTS close_remarks  text;
ALTER TABLE indent_flow.purchase_orders  ADD COLUMN IF NOT EXISTS approval_route text;   -- 'md' or 'direct'
ALTER TABLE indent_flow.indent_documents ADD COLUMN IF NOT EXISTS line_item_id   uuid;   -- item the file is about, if any

-- ---------------------------------------------------------------------------
-- 2. The MD approval limit (organisation setting)
-- ---------------------------------------------------------------------------
UPDATE core.org_settings SET value = '50000' WHERE key = 'po_md_approval_threshold';
-- (the row already exists; if it is ever missing the function below falls back to 50,000)

CREATE OR REPLACE FUNCTION indent_flow._po_md_threshold()
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_text text;
BEGIN
    SELECT s.value::text INTO v_text FROM core.org_settings s WHERE s.key = 'po_md_approval_threshold' LIMIT 1;
    v_text := regexp_replace(COALESCE(v_text, ''), '[^0-9.]', '', 'g');
    IF v_text = '' OR v_text = '.' THEN
        RETURN 50000;
    END IF;
    RETURN v_text::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN 50000;
END;
$$;

-- Rupee amount for messages, e.g. 1,25,000 is shown as 125,000
CREATE OR REPLACE FUNCTION indent_flow._money(p numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT 'Rs ' || btrim(to_char(round(COALESCE(p, 0)), '999,999,999,990'))
$$;

-- ---------------------------------------------------------------------------
-- 3. PO readiness check. Raises a plain-language error if anything is missing,
--    stores the recalculated total and returns it.
-- ---------------------------------------------------------------------------
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

-- Value that is compared with the MD limit: this PO plus every other live PO
-- on the same indent (so an order cannot be split to stay under the limit).
CREATE OR REPLACE FUNCTION indent_flow._po_value_for_limit(p_po_id uuid, p_total numeric)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
    SELECT COALESCE(p_total, 0) + COALESCE((
        SELECT sum(COALESCE(o.total_amount, 0))
          FROM indent_flow.purchase_orders o
          JOIN indent_flow.purchase_orders me ON me.id = p_po_id
         WHERE o.indent_id = me.indent_id
           AND o.id <> p_po_id
           AND o.status <> 'cancelled'), 0)
$$;

-- ---------------------------------------------------------------------------
-- 4. Indent actions
-- ---------------------------------------------------------------------------

-- pending_approval -> approved
CREATE OR REPLACE FUNCTION indent_flow.indent_approve(p_indent_id uuid, p_note text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role text;
    v_ind  indent_flow.indents%ROWTYPE;
    v_note text := btrim(COALESCE(p_note, ''));
    v_link text := '#indent/' || p_indent_id::text;
BEGIN
    v_role := indent_flow._require_role(ARRAY['project_manager', 'md', 'admin'], 'approve an indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status <> 'pending_approval' THEN
        RAISE EXCEPTION 'Indent % is % and is not waiting for approval', v_ind.indent_number, v_ind.status;
    END IF;
    IF v_role = 'project_manager' AND v_ind.created_by = auth.uid() THEN
        RAISE EXCEPTION 'You raised indent % yourself, so it has to be approved by the MD', v_ind.indent_number;
    END IF;
    IF v_role = 'md' AND v_note = '' THEN
        RAISE EXCEPTION 'Remarks are required to approve indent %', v_ind.indent_number;
    END IF;

    UPDATE indent_flow.indents
       SET status = 'approved', approved_by = auth.uid()
     WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id,
        CASE WHEN v_role = 'md' THEN 'Approved by MD' ELSE 'Approved' END, v_note);
    PERFORM indent_flow._notify(v_ind.created_by, 'Indent approved',
        'Indent ' || v_ind.indent_number || ' was approved'
            || CASE WHEN v_note <> '' THEN ': ' || left(v_note, 160) ELSE '' END, v_link);
    PERFORM indent_flow._notify_role('procurement_manager', 'Indent ready for procurement',
        'Indent ' || v_ind.indent_number || ' is approved and ready for procurement', v_link);
    PERFORM indent_flow._emit_event('indent.approved', 'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id,
                           'approved_by_role', v_role, 'note', v_note));

    RETURN 'approved';
END;
$$;

-- pending_approval -> rejected, or -> returned_for_revision when p_return is true
CREATE OR REPLACE FUNCTION indent_flow.indent_reject(p_indent_id uuid, p_reason text, p_return boolean)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role   text;
    v_ind    indent_flow.indents%ROWTYPE;
    v_reason text := btrim(COALESCE(p_reason, ''));
    v_return boolean := COALESCE(p_return, false);
    v_status text;
    v_link   text := '#indent/' || p_indent_id::text;
BEGIN
    v_role := indent_flow._require_role(ARRAY['project_manager', 'md', 'admin'], 'reject or return an indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status <> 'pending_approval' THEN
        RAISE EXCEPTION 'Indent % is % and is not waiting for approval', v_ind.indent_number, v_ind.status;
    END IF;
    IF v_role = 'project_manager' AND v_ind.created_by = auth.uid() THEN
        RAISE EXCEPTION 'You raised indent % yourself, so it has to be decided by the MD', v_ind.indent_number;
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required for indent %', v_ind.indent_number;
    END IF;

    v_status := CASE WHEN v_return THEN 'returned_for_revision' ELSE 'rejected' END;

    UPDATE indent_flow.indents
       SET status = v_status,
           rejection_reason = v_reason,
           return_reason = CASE WHEN v_return THEN v_reason ELSE return_reason END
     WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id,
        CASE WHEN v_return THEN 'Returned for Revision' ELSE 'Rejected' END, v_reason);
    PERFORM indent_flow._notify(v_ind.created_by,
        CASE WHEN v_return THEN 'Indent returned for revision' ELSE 'Indent rejected' END,
        'Indent ' || v_ind.indent_number
            || CASE WHEN v_return THEN ' was returned for revision: ' ELSE ' was rejected: ' END || v_reason,
        v_link);
    PERFORM indent_flow._emit_event(
        CASE WHEN v_return THEN 'indent.returned' ELSE 'indent.rejected' END, 'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id, 'reason', v_reason));

    RETURN v_status;
END;
$$;

-- pending_approval (project manager) or approved / in_procurement (procurement)
-- -> escalated_to_md. Records who escalated.
CREATE OR REPLACE FUNCTION indent_flow.indent_escalate(p_indent_id uuid, p_remarks text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role    text;
    v_ind     indent_flow.indents%ROWTYPE;
    v_remarks text := btrim(COALESCE(p_remarks, ''));
BEGIN
    v_role := indent_flow._require_role(
        ARRAY['project_manager', 'procurement_manager', 'procurement_clerk', 'admin'], 'escalate an indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status NOT IN ('pending_approval', 'approved', 'in_procurement') THEN
        RAISE EXCEPTION 'Indent % is % and cannot be escalated', v_ind.indent_number, v_ind.status;
    END IF;
    IF v_role = 'project_manager' AND v_ind.status <> 'pending_approval' THEN
        RAISE EXCEPTION 'Indent % is % and is no longer waiting for your approval', v_ind.indent_number, v_ind.status;
    END IF;
    IF v_role IN ('procurement_manager', 'procurement_clerk') AND v_ind.status = 'pending_approval' THEN
        RAISE EXCEPTION 'Indent % has not been approved yet', v_ind.indent_number;
    END IF;

    UPDATE indent_flow.indents
       SET status = 'escalated_to_md', escalation_remarks = v_remarks, escalated_by = auth.uid()
     WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id, 'Escalated to MD', v_remarks);
    PERFORM indent_flow._notify_role('md', 'Indent escalated to you',
        'Indent ' || v_ind.indent_number || ' needs your decision'
            || CASE WHEN v_remarks <> '' THEN ': ' || left(v_remarks, 120) ELSE '' END,
        '#indent/' || p_indent_id::text);
    PERFORM indent_flow._emit_event('indent.escalated', 'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id,
                           'from_status', v_ind.status, 'remarks', v_remarks));

    RETURN 'escalated_to_md';
END;
$$;

-- escalated_to_md -> in_procurement (approve) or returned_for_revision (dismiss).
-- Remarks are compulsory either way; the person who escalated is told.
CREATE OR REPLACE FUNCTION indent_flow.indent_escalation_decide(
    p_indent_id uuid, p_approve boolean, p_remarks text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_ind     indent_flow.indents%ROWTYPE;
    v_approve boolean := COALESCE(p_approve, false);
    v_remarks text := btrim(COALESCE(p_remarks, ''));
    v_status  text;
    v_link    text := '#indent/' || p_indent_id::text;
    v_msg     text;
BEGIN
    PERFORM indent_flow._require_role(ARRAY['md', 'admin'], 'decide on an escalated indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status <> 'escalated_to_md' THEN
        RAISE EXCEPTION 'Indent % is % and is not waiting for an MD decision', v_ind.indent_number, v_ind.status;
    END IF;
    IF v_remarks = '' THEN
        RAISE EXCEPTION 'Remarks are required for the decision on indent %', v_ind.indent_number;
    END IF;

    v_status := CASE WHEN v_approve THEN 'in_procurement' ELSE 'returned_for_revision' END;

    UPDATE indent_flow.indents
       SET status = v_status,
           approved_by = CASE WHEN v_approve THEN auth.uid() ELSE approved_by END,
           md_escalation_result = CASE WHEN v_approve THEN 'approved' ELSE 'dismissed' END,
           md_remarks = v_remarks
     WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id,
        CASE WHEN v_approve THEN 'MD Escalation Approved' ELSE 'MD Returned for Revision' END, v_remarks);

    IF v_approve THEN
        v_msg := 'MD approved indent ' || v_ind.indent_number || ': ' || left(v_remarks, 160);
        PERFORM indent_flow._notify_role('procurement_manager', 'MD approved escalation',
            v_msg || ' — proceed with procurement', v_link);
        PERFORM indent_flow._notify(v_ind.created_by, 'Indent approved by MD', v_msg, v_link);
    ELSE
        v_msg := 'MD returned indent ' || v_ind.indent_number || ' for revision: ' || left(v_remarks, 160);
        PERFORM indent_flow._notify(v_ind.created_by, 'Indent returned by MD', v_msg, v_link);
    END IF;
    -- The person who escalated (if it was not the creator) hears the outcome too
    IF v_ind.escalated_by IS NOT NULL AND v_ind.escalated_by IS DISTINCT FROM v_ind.created_by THEN
        PERFORM indent_flow._notify(v_ind.escalated_by,
            CASE WHEN v_approve THEN 'MD approved your escalation' ELSE 'MD returned the indent you escalated' END,
            v_msg, v_link);
    END IF;

    PERFORM indent_flow._emit_event(
        CASE WHEN v_approve THEN 'indent.escalation_approved' ELSE 'indent.escalation_dismissed' END,
        'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id, 'remarks', v_remarks));

    RETURN v_status;
END;
$$;

-- Receipt of material against an indent (no PO in this system).
--   p_items: [{"line_item_id": uuid, "quantity": number received now,
--              "condition": text, "quality_remarks": text}, ...]
-- A photo or remarks is compulsory.
DROP FUNCTION IF EXISTS indent_flow.indent_receive(uuid, jsonb, text);
CREATE OR REPLACE FUNCTION indent_flow.indent_receive(
    p_indent_id uuid, p_items jsonb, p_photo_url text, p_remarks text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role    text;
    v_ind     indent_flow.indents%ROWTYPE;
    v_r       record;
    v_line    indent_flow.indent_line_items%ROWTYPE;
    v_ordered numeric;
    v_done    numeric;
    v_cond    text;
    v_qrem    text;
    v_count   integer := 0;
    v_parts   text[] := ARRAY[]::text[];
    v_issues  text[] := ARRAY[]::text[];
    v_open    integer;
    v_status  text;
    v_note    text;
    v_photo   text := btrim(COALESCE(p_photo_url, ''));
    v_remarks text := btrim(COALESCE(p_remarks, ''));
    v_anyrem  boolean := false;
    v_link    text := '#indent/' || p_indent_id::text;
    v_msg     text;
BEGIN
    v_role := indent_flow._require_role(ARRAY['storekeeper', 'admin'], 'record a receipt');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status NOT IN ('approved', 'in_procurement', 'dispatched') THEN
        RAISE EXCEPTION 'Indent % is % and cannot receive material', v_ind.indent_number, v_ind.status;
    END IF;
    IF v_role = 'storekeeper' AND NOT EXISTS (
        SELECT 1 FROM core.site_assignments sa
         WHERE sa.user_id = auth.uid() AND sa.site_id = v_ind.site_id
    ) THEN
        RAISE EXCEPTION 'You are not assigned to the site indent % is for', v_ind.indent_number;
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Please receive at least one item';
    END IF;

    FOR v_r IN
        SELECT * FROM jsonb_to_recordset(p_items)
            AS x(line_item_id uuid, quantity numeric, condition text, quality_remarks text)
    LOOP
        IF v_r.quantity IS NULL OR v_r.quantity = 0 THEN
            CONTINUE;
        END IF;

        SELECT * INTO v_line
          FROM indent_flow.indent_line_items
         WHERE id = v_r.line_item_id AND indent_id = p_indent_id
           FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A receipt line does not belong to indent %', v_ind.indent_number;
        END IF;

        v_ordered := COALESCE(v_line.qty, v_line.quantity, 0);
        v_done    := COALESCE(v_line.received, 0);

        IF v_r.quantity < 0 THEN
            RAISE EXCEPTION '%: quantity cannot be negative', v_line.description;
        END IF;
        IF v_r.quantity > v_ordered - v_done THEN
            RAISE EXCEPTION '%: only % still to be received (you entered %)',
                v_line.description, v_ordered - v_done, v_r.quantity;
        END IF;

        v_cond := COALESCE(NULLIF(btrim(v_r.condition), ''), 'Good');
        v_qrem := btrim(COALESCE(v_r.quality_remarks, ''));
        IF v_cond <> 'Good' AND v_qrem = '' THEN
            RAISE EXCEPTION '%: describe the quality issue for a % item', v_line.description, v_cond;
        END IF;
        IF v_qrem <> '' THEN
            v_anyrem := true;
        END IF;

        UPDATE indent_flow.indent_line_items
           SET received = v_done + v_r.quantity,
               received_qty = v_done + v_r.quantity
         WHERE id = v_line.id;

        v_parts := v_parts || (v_line.description || ': ' || v_r.quantity::text || ' '
                               || COALESCE(v_line.unit, '') || ' received, ' || v_cond
                               || CASE WHEN v_qrem <> '' THEN ' (' || v_qrem || ')' ELSE '' END);
        IF v_cond <> 'Good' THEN
            v_issues := v_issues || (v_line.description || ': ' || v_cond || ' (' || v_qrem || ')');
        END IF;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Please receive at least one item';
    END IF;
    IF v_photo = '' AND v_remarks = '' AND NOT v_anyrem THEN
        RAISE EXCEPTION 'Add a photo or remarks to record this receipt';
    END IF;

    SELECT count(*) INTO v_open
      FROM indent_flow.indent_line_items
     WHERE indent_id = p_indent_id
       AND COALESCE(received, 0) < COALESCE(qty, quantity, 0);

    v_status := CASE WHEN v_open = 0 THEN 'completed' ELSE v_ind.status END;
    IF v_status <> v_ind.status THEN
        UPDATE indent_flow.indents SET status = v_status WHERE id = p_indent_id;
    END IF;

    v_note := array_to_string(v_parts, '; ')
              || CASE WHEN v_remarks <> '' THEN ' | Remarks: ' || v_remarks ELSE '' END
              || CASE WHEN v_photo <> '' THEN ' | Photo: ' || v_photo ELSE '' END;
    PERFORM indent_flow._log_indent(p_indent_id,
        CASE WHEN v_open = 0 THEN 'Completed' ELSE 'Items Received (Partial)' END, v_note);

    IF array_length(v_issues, 1) > 0 THEN
        PERFORM indent_flow._notify_role('procurement_manager', 'Quality issue on receipt',
            'Quality issue on receipt for indent ' || v_ind.indent_number || ': ' || array_to_string(v_issues, '; '),
            v_link);
    END IF;

    -- Procurement hears about every receipt (the assignee, or all managers)
    v_msg := 'Indent ' || v_ind.indent_number
             || CASE WHEN v_open = 0 THEN ': all material received at site' ELSE ': part of the material received at site' END;
    IF v_ind.assigned_to IS NOT NULL THEN
        PERFORM indent_flow._notify(v_ind.assigned_to, 'Material received', v_msg, v_link);
    ELSE
        PERFORM indent_flow._notify_role('procurement_manager', 'Material received', v_msg, v_link);
    END IF;

    IF v_open = 0 THEN
        PERFORM indent_flow._notify(v_ind.created_by, 'Indent completed',
            'Indent ' || v_ind.indent_number || ' is completed — all items received', v_link);
        PERFORM indent_flow._notify_site_role(v_ind.site_id, 'project_manager', 'Indent completed',
            'Indent ' || v_ind.indent_number || ' is completed', v_link);
    END IF;

    PERFORM indent_flow._emit_event('indent.received', 'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id,
                           'completed', v_open = 0, 'line_count', v_count,
                           'quality_issues', to_jsonb(v_issues), 'photo_url', v_photo, 'remarks', v_remarks));

    RETURN v_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Purchase order actions
-- ---------------------------------------------------------------------------

-- draft -> pending_approval. Always allowed for a complete PO, whatever its value.
CREATE OR REPLACE FUNCTION indent_flow.po_submit(p_po_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_po    indent_flow.purchase_orders%ROWTYPE;
    v_total numeric;
BEGIN
    PERFORM indent_flow._require_role(
        ARRAY['procurement_manager', 'procurement_clerk', 'admin'], 'submit a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status <> 'draft' THEN
        RAISE EXCEPTION 'PO % is % and cannot be submitted (only a draft can)', v_po.po_number, v_po.status;
    END IF;

    v_total := indent_flow._po_check_ready(p_po_id);

    UPDATE indent_flow.purchase_orders
       SET status = 'pending_approval',
           approval_route = 'md',
           remarks = CASE WHEN remarks LIKE 'MD Rejected:%' OR remarks = 'Amended' THEN NULL ELSE remarks END,
           updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'pending_md_po_approval', 'PO Submitted for MD Approval',
        'PO ' || v_po.po_number || ' — ' || indent_flow._money(v_total));
    PERFORM indent_flow._notify_role(
        'md', 'PO approval needed',
        'PO ' || v_po.po_number || ' (' || indent_flow._money(v_total) || ') is awaiting your approval',
        '#po/' || p_po_id::text);
    PERFORM indent_flow._emit_event('po.submitted', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id, 'total_amount', v_total));

    RETURN 'pending_approval';
END;
$$;

-- pending_approval -> approved. MD remarks are compulsory.
DROP FUNCTION IF EXISTS indent_flow.po_approve(uuid);
CREATE OR REPLACE FUNCTION indent_flow.po_approve(p_po_id uuid, p_remarks text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_po      indent_flow.purchase_orders%ROWTYPE;
    v_remarks text := btrim(COALESCE(p_remarks, ''));
BEGIN
    PERFORM indent_flow._require_role(ARRAY['md', 'admin'], 'approve a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status <> 'pending_approval' THEN
        RAISE EXCEPTION 'PO % is % and is not waiting for approval', v_po.po_number, v_po.status;
    END IF;
    IF v_remarks = '' THEN
        RAISE EXCEPTION 'Remarks are required to approve PO %', v_po.po_number;
    END IF;

    UPDATE indent_flow.purchase_orders
       SET status = 'approved', md_remarks = v_remarks, updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'po_approved', 'PO Approved by MD', 'PO ' || v_po.po_number || ' — ' || v_remarks);
    PERFORM indent_flow._notify(
        v_po.created_by, 'PO approved',
        'PO ' || v_po.po_number || ' was approved by MD and can be issued: ' || left(v_remarks, 160),
        '#po/' || p_po_id::text);
    PERFORM indent_flow._emit_event('po.approved', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id,
                           'total_amount', v_po.total_amount, 'remarks', v_remarks));

    RETURN 'approved';
END;
$$;

-- pending_approval -> draft (with reason)
CREATE OR REPLACE FUNCTION indent_flow.po_reject(p_po_id uuid, p_reason text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_po     indent_flow.purchase_orders%ROWTYPE;
    v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
    PERFORM indent_flow._require_role(ARRAY['md', 'admin'], 'reject a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status <> 'pending_approval' THEN
        RAISE EXCEPTION 'PO % is % and is not waiting for approval', v_po.po_number, v_po.status;
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required to reject PO %', v_po.po_number;
    END IF;

    UPDATE indent_flow.purchase_orders
       SET status = 'draft', remarks = 'MD Rejected: ' || v_reason, md_remarks = v_reason, updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'po_draft', 'PO Rejected by MD', 'PO ' || v_po.po_number || ' — ' || v_reason);
    PERFORM indent_flow._notify(
        v_po.created_by, 'PO rejected',
        'PO ' || v_po.po_number || ' was rejected by MD: ' || v_reason, '#po/' || p_po_id::text);
    PERFORM indent_flow._emit_event('po.rejected', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id, 'reason', v_reason));

    RETURN 'draft';
END;
$$;

-- approved -> issued (any procurement user), or
-- draft -> issued directly by the procurement manager when the value is within
-- the MD approval limit.
CREATE OR REPLACE FUNCTION indent_flow.po_issue(p_po_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role    text;
    v_po      indent_flow.purchase_orders%ROWTYPE;
    v_site_id uuid;
    v_user    uuid;
    v_msg     text;
    v_total   numeric;
    v_limit   numeric;
    v_value   numeric;
    v_direct  boolean := false;
BEGIN
    v_role := indent_flow._require_role(
        ARRAY['procurement_manager', 'procurement_clerk', 'admin'], 'issue a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status NOT IN ('approved', 'draft') THEN
        RAISE EXCEPTION 'PO % is % and cannot be issued', v_po.po_number, v_po.status;
    END IF;

    v_total := indent_flow._po_check_ready(p_po_id);

    IF v_po.status = 'draft' THEN
        v_direct := true;
        v_limit  := indent_flow._po_md_threshold();
        v_value  := indent_flow._po_value_for_limit(p_po_id, v_total);
        IF v_value > v_limit THEN
            RAISE EXCEPTION 'PO % needs MD approval: its value (%) is above the % limit',
                v_po.po_number, indent_flow._money(v_value), indent_flow._money(v_limit);
        END IF;
        IF v_role = 'procurement_clerk' THEN
            RAISE EXCEPTION 'PO % can be issued without MD approval only by the procurement manager', v_po.po_number;
        END IF;
    END IF;

    UPDATE indent_flow.purchase_orders
       SET status = 'issued', issued_at = now(), updated_at = now(),
           approval_route = CASE WHEN v_direct THEN 'direct' ELSE COALESCE(approval_route, 'md') END,
           remarks = CASE WHEN remarks LIKE 'MD Rejected:%' OR remarks = 'Amended' THEN NULL ELSE remarks END
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'po_issued', 'PO Issued to Vendor',
        'PO ' || v_po.po_number || ' — ' || indent_flow._money(v_total)
            || CASE WHEN v_direct THEN ' (within the ' || indent_flow._money(v_limit) || ' limit, MD approval not required)' ELSE '' END);

    -- Tell the storekeepers of the indent's site that a delivery is expected
    v_msg := 'PO ' || v_po.po_number || ' issued';
    IF v_po.delivery_date IS NOT NULL THEN
        v_msg := v_msg || ' — delivery expected ' || v_po.delivery_date::text;
    END IF;
    IF v_po.indent_id IS NOT NULL THEN
        SELECT i.site_id INTO v_site_id FROM indent_flow.indents i WHERE i.id = v_po.indent_id;
    END IF;
    FOR v_user IN
        SELECT p.id
          FROM core.profiles p
          JOIN core.site_assignments sa ON sa.user_id = p.id
         WHERE p.role::text = 'storekeeper'
           AND COALESCE(p.is_active, true)
           AND sa.site_id = v_site_id
    LOOP
        PERFORM indent_flow._notify(v_user, 'Delivery expected', v_msg, '#po/' || p_po_id::text);
    END LOOP;

    -- The MD is kept informed of POs issued without their approval
    IF v_direct THEN
        PERFORM indent_flow._notify_role('md', 'PO issued without MD approval',
            'PO ' || v_po.po_number || ' (' || indent_flow._money(v_total) || ') was issued within the '
                || indent_flow._money(v_limit) || ' limit', '#po/' || p_po_id::text);
    END IF;

    PERFORM indent_flow._emit_event('po.issued', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id,
                           'vendor_id', v_po.vendor_id, 'delivery_date', v_po.delivery_date,
                           'total_amount', v_total, 'direct', v_direct));

    RETURN 'issued';
END;
$$;

-- fulfilled / partially_fulfilled -> closed; the indent is completed.
-- Remarks are compulsory. Procurement manager or admin only.
DROP FUNCTION IF EXISTS indent_flow.po_close(uuid);
CREATE OR REPLACE FUNCTION indent_flow.po_close(p_po_id uuid, p_remarks text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_po      indent_flow.purchase_orders%ROWTYPE;
    v_remarks text := btrim(COALESCE(p_remarks, ''));
BEGIN
    PERFORM indent_flow._require_role(ARRAY['procurement_manager', 'admin'], 'close a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status NOT IN ('fulfilled', 'partially_fulfilled') THEN
        RAISE EXCEPTION 'PO % is % and cannot be closed (goods must be received first)', v_po.po_number, v_po.status;
    END IF;
    IF v_remarks = '' THEN
        RAISE EXCEPTION 'Remarks are required to close PO %', v_po.po_number;
    END IF;

    UPDATE indent_flow.purchase_orders
       SET status = 'closed', close_remarks = v_remarks, updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'completed',
        CASE WHEN v_po.status = 'fulfilled' THEN 'PO Closed — Indent Completed'
             ELSE 'PO Short-Closed — Indent Completed' END,
        'PO ' || v_po.po_number || ' — ' || v_remarks);
    PERFORM indent_flow._emit_event('po.closed', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id,
                           'short_closed', v_po.status = 'partially_fulfilled', 'remarks', v_remarks));

    RETURN 'closed';
END;
$$;

-- Goods receipt against an issued PO. A photo or remarks is compulsory.
CREATE OR REPLACE FUNCTION indent_flow.po_receive(
    p_po_id uuid, p_receipts jsonb, p_remarks text, p_photo_url text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role       text;
    v_po         indent_flow.purchase_orders%ROWTYPE;
    v_site_id    uuid;
    v_grn_id     uuid := gen_random_uuid();
    v_grn_number text;
    v_r          record;
    v_line       indent_flow.po_line_items%ROWTYPE;
    v_cond       text;
    v_qrem       text;
    v_count      integer := 0;
    v_issues     text[] := ARRAY[]::text[];
    v_new_status text;
    v_anyrem     boolean := false;
BEGIN
    v_role := indent_flow._require_role(
        ARRAY['storekeeper', 'procurement_manager', 'procurement_clerk', 'admin'], 'record a goods receipt');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status NOT IN ('issued', 'partially_fulfilled') THEN
        RAISE EXCEPTION 'PO % is % and cannot receive goods (it must be issued)', v_po.po_number, v_po.status;
    END IF;

    IF v_role = 'storekeeper' AND v_po.indent_id IS NOT NULL THEN
        SELECT i.site_id INTO v_site_id FROM indent_flow.indents i WHERE i.id = v_po.indent_id;
        IF v_site_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM core.site_assignments sa
             WHERE sa.user_id = auth.uid() AND sa.site_id = v_site_id
        ) THEN
            RAISE EXCEPTION 'You are not assigned to the site this PO is for';
        END IF;
    END IF;

    IF p_receipts IS NULL OR jsonb_typeof(p_receipts) <> 'array' OR jsonb_array_length(p_receipts) = 0 THEN
        RAISE EXCEPTION 'Enter at least one quantity to receive';
    END IF;

    -- Pass 1: check every line before anything is written
    FOR v_r IN
        SELECT x.line_item_id, sum(x.quantity) AS quantity,
               max(x.condition) AS condition, max(x.quality_remarks) AS quality_remarks,
               max(x.remarks) AS remarks
          FROM jsonb_to_recordset(p_receipts)
               AS x(line_item_id uuid, quantity numeric, condition text, quality_remarks text, remarks text)
         WHERE x.quantity IS NOT NULL AND x.quantity <> 0
         GROUP BY x.line_item_id
    LOOP
        SELECT * INTO v_line
          FROM indent_flow.po_line_items
         WHERE id = v_r.line_item_id AND po_id = p_po_id
           FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A receipt line does not belong to PO %', v_po.po_number;
        END IF;
        IF v_r.quantity < 0 THEN
            RAISE EXCEPTION '%: quantity cannot be negative', v_line.description;
        END IF;
        IF v_r.quantity > COALESCE(v_line.quantity, 0) - COALESCE(v_line.received_qty, 0) THEN
            RAISE EXCEPTION '%: only % still to be received (you entered %)',
                v_line.description,
                COALESCE(v_line.quantity, 0) - COALESCE(v_line.received_qty, 0),
                v_r.quantity;
        END IF;
        IF COALESCE(NULLIF(btrim(v_r.condition), ''), 'Good') <> 'Good'
           AND btrim(COALESCE(v_r.quality_remarks, '')) = '' THEN
            RAISE EXCEPTION '%: describe the quality issue for a % item', v_line.description, btrim(v_r.condition);
        END IF;
        IF btrim(COALESCE(v_r.quality_remarks, '')) <> '' OR btrim(COALESCE(v_r.remarks, '')) <> '' THEN
            v_anyrem := true;
        END IF;
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Enter at least one quantity to receive';
    END IF;
    IF btrim(COALESCE(p_photo_url, '')) = '' AND btrim(COALESCE(p_remarks, '')) = '' AND NOT v_anyrem THEN
        RAISE EXCEPTION 'Add a photo or remarks to record this receipt';
    END IF;

    -- Pass 2: number the GRN and write it
    v_grn_number := 'GRN-' || to_char(now(), 'YYYY') || '-'
                    || lpad(indent_flow._next_number('grn-' || to_char(now(), 'YYYY'))::text, 5, '0');

    INSERT INTO indent_flow.grns (id, grn_number, po_id, received_by, remarks, photo_url)
    VALUES (v_grn_id, v_grn_number, p_po_id, auth.uid(), COALESCE(p_remarks, ''), COALESCE(p_photo_url, ''));

    v_count := 0;
    FOR v_r IN
        SELECT * FROM jsonb_to_recordset(p_receipts)
            AS x(line_item_id uuid, quantity numeric, condition text, quality_remarks text, remarks text)
    LOOP
        IF v_r.quantity IS NULL OR v_r.quantity = 0 THEN
            CONTINUE;
        END IF;

        SELECT * INTO v_line FROM indent_flow.po_line_items WHERE id = v_r.line_item_id AND po_id = p_po_id;

        v_cond := COALESCE(NULLIF(btrim(v_r.condition), ''), 'Good');
        v_qrem := btrim(COALESCE(v_r.quality_remarks, ''));
        IF v_cond <> 'Good' THEN
            v_issues := v_issues || (v_line.description || ': ' || v_cond || ' (' || v_qrem || ')');
        END IF;

        INSERT INTO indent_flow.grn_items
            (id, grn_id, po_line_item_id, quantity_received, remarks, condition, quality_remarks)
        VALUES
            (gen_random_uuid(), v_grn_id, v_line.id, v_r.quantity, COALESCE(v_r.remarks, ''), v_cond, v_qrem);

        v_count := v_count + 1;
    END LOOP;

    SELECT status INTO v_new_status FROM indent_flow.purchase_orders WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, NULL,
        CASE WHEN v_new_status = 'fulfilled' THEN 'PO Fully Received' ELSE 'PO Partial Receipt' END,
        v_grn_number || ' recorded for PO ' || v_po.po_number);

    IF array_length(v_issues, 1) > 0 THEN
        PERFORM indent_flow._notify_role(
            'procurement_manager', 'Quality issue on receipt',
            'Quality issue in ' || v_grn_number || ' for PO ' || v_po.po_number || ': '
                || array_to_string(v_issues, '; '),
            '#po/' || p_po_id::text);
    END IF;

    -- The buyer hears about every receipt against their PO
    PERFORM indent_flow._notify(v_po.created_by, 'Goods received',
        v_grn_number || ': ' || CASE WHEN v_new_status = 'fulfilled' THEN 'all goods' ELSE 'part of the goods' END
            || ' received for PO ' || v_po.po_number, '#po/' || p_po_id::text);

    PERFORM indent_flow._emit_event('grn.recorded', 'grn', v_grn_id,
        jsonb_build_object('grn_number', v_grn_number, 'po_id', p_po_id, 'po_number', v_po.po_number,
                           'po_status', v_new_status, 'line_count', v_count,
                           'quality_issues', to_jsonb(v_issues)));

    RETURN jsonb_build_object('grn_id', v_grn_id, 'grn_number', v_grn_number, 'po_status', v_new_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. PO guard: only these columns may be edited directly, and only on a draft
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow._guard_purchase_orders() RETURNS trigger
LANGUAGE plpgsql SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role  text;
    v_brief record;
    v_free  text[] := ARRAY['vendor_id', 'delivery_date', 'payment_terms', 'delivery_address', 'notes',
                            'office_id', 'total_amount', 'remarks', 'version', 'updated_at'];
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

-- ---------------------------------------------------------------------------
-- 7. Attachments: private bucket + who may add a document row
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('indent-docs', 'indent-docs', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "indent docs upload" ON storage.objects;
CREATE POLICY "indent docs upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'indent-docs');
DROP POLICY IF EXISTS "indent docs read" ON storage.objects;
CREATE POLICY "indent docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'indent-docs');
DROP POLICY IF EXISTS "indent documents add own" ON indent_flow.indent_documents;
CREATE POLICY "indent documents add own" ON indent_flow.indent_documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
DROP POLICY IF EXISTS "indent documents read" ON indent_flow.indent_documents;
CREATE POLICY "indent documents read" ON indent_flow.indent_documents FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "indent documents delete own" ON indent_flow.indent_documents;
CREATE POLICY "indent documents delete own" ON indent_flow.indent_documents FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 8. Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION indent_flow._po_md_threshold()                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._money(numeric)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._po_check_ready(uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._po_value_for_limit(uuid, numeric) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION indent_flow.po_approve(uuid, text)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_close(uuid, text)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.indent_receive(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION indent_flow.po_approve(uuid, text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_close(uuid, text)                    TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.indent_receive(uuid, jsonb, text, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
