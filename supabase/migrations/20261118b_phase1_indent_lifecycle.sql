-- =============================================================================
-- IndentFlow  |  Phase 1, slice 2: indent lifecycle as database functions
-- =============================================================================
-- Requires: 20261118_phase1_po_lifecycle.sql (events table and helper functions).
--
-- What this does
--   * Adds one function per indent action (submit, approve, reject / return,
--     escalate, MD decision on an escalation, assign, dispatch, receive).
--     Each checks the caller's role and the indent's status, then updates the
--     indent, its timeline, notifications and the event log in one transaction.
--   * Makes GRN numbers gap-free (a refused receipt no longer skips a number).
--
-- Safety
--   * Additive: no existing table, column, policy or trigger is changed. The
--     only replaced object is the po_receive function from slice 1.
--   * Runs in one transaction: if any statement fails, nothing is applied.
--   * Safe to run more than once.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Gap-free document counters (the row lock rolls back with the transaction,
--    unlike a sequence)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indent_flow.counters (
    name   text    PRIMARY KEY,
    value  bigint  NOT NULL DEFAULT 0
);
ALTER TABLE indent_flow.counters ENABLE ROW LEVEL SECURITY;   -- no policies: functions only

CREATE OR REPLACE FUNCTION indent_flow._next_number(p_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_value bigint;
BEGIN
    INSERT INTO indent_flow.counters AS c (name, value) VALUES (p_name, 1)
    ON CONFLICT (name) DO UPDATE SET value = c.value + 1
    RETURNING c.value INTO v_value;
    RETURN v_value;
END;
$$;

-- Start the GRN counter after the numbers already used by slice 1 (GRN-YYYY-0000N)
INSERT INTO indent_flow.counters (name, value)
SELECT 'grn-' || to_char(now(), 'YYYY'),
       COALESCE(max(substring(grn_number FROM '^GRN-[0-9]{4}-([0-9]{5})$')::bigint), 0)
  FROM indent_flow.grns
 WHERE grn_number ~ ('^GRN-' || to_char(now(), 'YYYY') || '-[0-9]{5}$')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Notification for every active user with a role who is assigned to a site.
CREATE OR REPLACE FUNCTION indent_flow._notify_site_role(
    p_site_id uuid, p_role text, p_title text, p_message text, p_link text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_user uuid;
BEGIN
    IF p_site_id IS NULL THEN
        RETURN;
    END IF;
    FOR v_user IN
        SELECT p.id
          FROM core.profiles p
          JOIN core.site_assignments sa ON sa.user_id = p.id
         WHERE p.role::text = p_role
           AND COALESCE(p.is_active, true)
           AND sa.site_id = p_site_id
    LOOP
        PERFORM indent_flow._notify(v_user, p_title, p_message, p_link);
    END LOOP;
END;
$$;

-- Adds a timeline entry to an indent.
CREATE OR REPLACE FUNCTION indent_flow._log_indent(p_indent_id uuid, p_action text, p_note text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
    INSERT INTO indent_flow.indent_activity (indent_id, action, user_id, note)
    VALUES (p_indent_id, p_action, auth.uid(), COALESCE(p_note, ''));
$$;

-- ---------------------------------------------------------------------------
-- 3. Indent actions (called by the app through the API).
--    Each returns the indent's new status.
-- ---------------------------------------------------------------------------

-- draft / rejected / returned_for_revision -> pending_approval
CREATE OR REPLACE FUNCTION indent_flow.indent_submit(p_indent_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_role     text;
    v_ind      indent_flow.indents%ROWTYPE;
    v_lines    integer;
    v_resubmit boolean;
    v_link     text := '#indent/' || p_indent_id::text;
    v_msg      text;
BEGIN
    v_role := indent_flow._require_role(
        ARRAY['site_engineer', 'storekeeper', 'project_manager', 'admin'], 'submit an indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_role <> 'admin' AND v_ind.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Only the person who raised indent % can submit it', v_ind.indent_number;
    END IF;
    IF v_ind.status NOT IN ('draft', 'rejected', 'returned_for_revision') THEN
        RAISE EXCEPTION 'Indent % is % and cannot be submitted', v_ind.indent_number, v_ind.status;
    END IF;
    SELECT count(*) INTO v_lines FROM indent_flow.indent_line_items WHERE indent_id = p_indent_id;
    IF v_lines = 0 THEN
        RAISE EXCEPTION 'Indent % has no line items', v_ind.indent_number;
    END IF;

    v_resubmit := v_ind.status <> 'draft';

    UPDATE indent_flow.indents
       SET status = 'pending_approval', submitted_at = now()
     WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id,
        CASE WHEN v_resubmit THEN 'Revised & Resubmitted' ELSE 'Submitted for Approval' END, '');

    v_msg := 'Indent ' || v_ind.indent_number
             || CASE WHEN v_resubmit THEN ' was resubmitted and is pending approval' ELSE ' is pending approval' END;
    PERFORM indent_flow._notify_site_role(v_ind.site_id, 'project_manager', 'Indent approval needed', v_msg, v_link);
    PERFORM indent_flow._notify_role('md', 'Indent approval needed', v_msg, v_link);

    PERFORM indent_flow._emit_event('indent.submitted', 'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id,
                           'priority', v_ind.priority, 'resubmitted', v_resubmit));

    RETURN 'pending_approval';
END;
$$;

-- pending_approval -> approved
CREATE OR REPLACE FUNCTION indent_flow.indent_approve(p_indent_id uuid, p_note text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_ind  indent_flow.indents%ROWTYPE;
    v_link text := '#indent/' || p_indent_id::text;
BEGIN
    PERFORM indent_flow._require_role(ARRAY['project_manager', 'md', 'admin'], 'approve an indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status <> 'pending_approval' THEN
        RAISE EXCEPTION 'Indent % is % and is not waiting for approval', v_ind.indent_number, v_ind.status;
    END IF;

    UPDATE indent_flow.indents
       SET status = 'approved', approved_by = auth.uid()
     WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id, 'Approved', p_note);
    PERFORM indent_flow._notify(v_ind.created_by, 'Indent approved',
        'Indent ' || v_ind.indent_number || ' was approved', v_link);
    PERFORM indent_flow._notify_role('procurement_manager', 'Indent ready for procurement',
        'Indent ' || v_ind.indent_number || ' is approved and ready for procurement', v_link);
    PERFORM indent_flow._emit_event('indent.approved', 'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id));

    RETURN 'approved';
END;
$$;

-- pending_approval -> rejected, or -> returned_for_revision when p_return is true
CREATE OR REPLACE FUNCTION indent_flow.indent_reject(p_indent_id uuid, p_reason text, p_return boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_ind    indent_flow.indents%ROWTYPE;
    v_reason text := btrim(COALESCE(p_reason, ''));
    v_return boolean := COALESCE(p_return, false);
    v_status text;
    v_link   text := '#indent/' || p_indent_id::text;
BEGIN
    PERFORM indent_flow._require_role(ARRAY['project_manager', 'md', 'admin'], 'reject or return an indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status <> 'pending_approval' THEN
        RAISE EXCEPTION 'Indent % is % and is not waiting for approval', v_ind.indent_number, v_ind.status;
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
-- -> escalated_to_md
CREATE OR REPLACE FUNCTION indent_flow.indent_escalate(p_indent_id uuid, p_remarks text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
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
       SET status = 'escalated_to_md', escalation_remarks = v_remarks
     WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id, 'Escalated to MD', v_remarks);
    PERFORM indent_flow._notify_role('md', 'Indent escalated to you',
        'Indent ' || v_ind.indent_number || ' needs your decision'
            || CASE WHEN v_remarks <> '' THEN ': ' || left(v_remarks, 120) ELSE '' END,
        '#md-escalations');
    PERFORM indent_flow._emit_event('indent.escalated', 'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id,
                           'from_status', v_ind.status, 'remarks', v_remarks));

    RETURN 'escalated_to_md';
END;
$$;

-- escalated_to_md -> in_procurement (approve) or returned_for_revision (dismiss)
CREATE OR REPLACE FUNCTION indent_flow.indent_escalation_decide(
    p_indent_id uuid, p_approve boolean, p_remarks text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_ind     indent_flow.indents%ROWTYPE;
    v_approve boolean := COALESCE(p_approve, false);
    v_remarks text := btrim(COALESCE(p_remarks, ''));
    v_status  text;
    v_link    text := '#indent/' || p_indent_id::text;
BEGIN
    PERFORM indent_flow._require_role(ARRAY['md', 'admin'], 'decide on an escalated indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status <> 'escalated_to_md' THEN
        RAISE EXCEPTION 'Indent % is % and is not waiting for an MD decision', v_ind.indent_number, v_ind.status;
    END IF;

    v_status := CASE WHEN v_approve THEN 'in_procurement' ELSE 'returned_for_revision' END;

    UPDATE indent_flow.indents
       SET status = v_status,
           md_escalation_result = CASE WHEN v_approve THEN 'approved' ELSE 'dismissed' END,
           md_remarks = v_remarks
     WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id,
        CASE WHEN v_approve THEN 'MD Escalation Approved' ELSE 'MD Escalation Dismissed' END, v_remarks);

    IF v_approve THEN
        PERFORM indent_flow._notify_role('procurement_manager', 'MD approved escalation',
            'MD approved the escalation for indent ' || v_ind.indent_number || ' — proceed with procurement', v_link);
    ELSE
        PERFORM indent_flow._notify(v_ind.created_by, 'Indent returned by MD',
            'Indent ' || v_ind.indent_number || ' was returned for revision by MD'
                || CASE WHEN v_remarks <> '' THEN ': ' || v_remarks ELSE '' END,
            v_link);
    END IF;

    PERFORM indent_flow._emit_event(
        CASE WHEN v_approve THEN 'indent.escalation_approved' ELSE 'indent.escalation_dismissed' END,
        'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id, 'remarks', v_remarks));

    RETURN v_status;
END;
$$;

-- approved / in_procurement -> in_procurement, assigned to a procurement user
CREATE OR REPLACE FUNCTION indent_flow.indent_assign(p_indent_id uuid, p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_ind       indent_flow.indents%ROWTYPE;
    v_assignee  core.profiles%ROWTYPE;
BEGIN
    PERFORM indent_flow._require_role(
        ARRAY['procurement_manager', 'procurement_clerk', 'admin'], 'assign an indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status NOT IN ('approved', 'in_procurement') THEN
        RAISE EXCEPTION 'Indent % is % and cannot be assigned (it must be approved)', v_ind.indent_number, v_ind.status;
    END IF;

    SELECT * INTO v_assignee FROM core.profiles WHERE id = p_user_id;
    IF NOT FOUND OR NOT COALESCE(v_assignee.is_active, true)
       OR v_assignee.role::text NOT IN ('procurement_manager', 'procurement_clerk') THEN
        RAISE EXCEPTION 'Indents can only be assigned to an active procurement user';
    END IF;

    UPDATE indent_flow.indents
       SET status = 'in_procurement', assigned_to = p_user_id
     WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id, 'Assigned to Procurement',
        'Assigned to ' || COALESCE(v_assignee.full_name, 'procurement'));
    PERFORM indent_flow._notify(p_user_id, 'Indent assigned to you',
        'Indent ' || v_ind.indent_number || ' was assigned to you', '#indent/' || p_indent_id::text);
    PERFORM indent_flow._emit_event('indent.assigned', 'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id, 'assigned_to', p_user_id));

    RETURN 'in_procurement';
END;
$$;

-- approved / in_procurement -> dispatched (material sent without a PO in this system)
CREATE OR REPLACE FUNCTION indent_flow.indent_dispatch(
    p_indent_id uuid, p_vendor text, p_expected_delivery text, p_doc_reference text, p_notes text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_ind    indent_flow.indents%ROWTYPE;
    v_vendor text := btrim(COALESCE(p_vendor, ''));
    v_eta    text := btrim(COALESCE(p_expected_delivery, ''));
    v_doc    text := btrim(COALESCE(p_doc_reference, ''));
    v_notes  text := btrim(COALESCE(p_notes, ''));
    v_lines  integer;
BEGIN
    PERFORM indent_flow._require_role(
        ARRAY['procurement_manager', 'procurement_clerk', 'admin'], 'dispatch an indent');

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status NOT IN ('approved', 'in_procurement') THEN
        RAISE EXCEPTION 'Indent % is % and cannot be dispatched', v_ind.indent_number, v_ind.status;
    END IF;
    IF v_vendor = '' THEN
        RAISE EXCEPTION 'Vendor name is required to dispatch indent %', v_ind.indent_number;
    END IF;
    SELECT count(*) INTO v_lines FROM indent_flow.indent_line_items WHERE indent_id = p_indent_id;
    IF v_lines = 0 THEN
        RAISE EXCEPTION 'Indent % has no line items to dispatch', v_ind.indent_number;
    END IF;

    UPDATE indent_flow.indents SET status = 'dispatched' WHERE id = p_indent_id;

    PERFORM indent_flow._log_indent(p_indent_id, 'Dispatched',
        'Vendor: ' || v_vendor || ' | ETA: ' || v_eta || ' | Ref: ' || v_doc || ' | Notes: ' || v_notes);
    PERFORM indent_flow._notify_site_role(v_ind.site_id, 'storekeeper', 'Material dispatched to your site',
        'Indent ' || v_ind.indent_number || ' was dispatched to your site'
            || CASE WHEN v_eta <> '' THEN ' — expected ' || v_eta ELSE '' END,
        '#receipt/' || p_indent_id::text);
    PERFORM indent_flow._emit_event('indent.dispatched', 'indent', p_indent_id,
        jsonb_build_object('indent_number', v_ind.indent_number, 'site_id', v_ind.site_id,
                           'vendor', v_vendor, 'expected_delivery', v_eta, 'doc_reference', v_doc));

    RETURN 'dispatched';
END;
$$;

-- Receipt of material against an indent (no PO in this system).
--   p_items: [{"line_item_id": uuid, "quantity": number received now,
--              "condition": text, "quality_remarks": text}, ...]
-- Allowed while the indent is approved, in procurement or dispatched (material
-- sometimes arrives before anyone marks the dispatch).
CREATE OR REPLACE FUNCTION indent_flow.indent_receive(p_indent_id uuid, p_items jsonb, p_photo_url text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
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
    v_link    text := '#indent/' || p_indent_id::text;
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

    SELECT count(*) INTO v_open
      FROM indent_flow.indent_line_items
     WHERE indent_id = p_indent_id
       AND COALESCE(received, 0) < COALESCE(qty, quantity, 0);

    v_status := CASE WHEN v_open = 0 THEN 'completed' ELSE v_ind.status END;
    IF v_status <> v_ind.status THEN
        UPDATE indent_flow.indents SET status = v_status WHERE id = p_indent_id;
    END IF;

    v_note := array_to_string(v_parts, '; ')
              || CASE WHEN btrim(COALESCE(p_photo_url, '')) <> '' THEN ' | Photo: ' || p_photo_url ELSE '' END;
    PERFORM indent_flow._log_indent(p_indent_id,
        CASE WHEN v_open = 0 THEN 'Completed' ELSE 'Items Received (Partial)' END, v_note);

    IF array_length(v_issues, 1) > 0 THEN
        PERFORM indent_flow._notify_role('procurement_manager', 'Quality issue on receipt',
            'Quality issue on receipt for indent ' || v_ind.indent_number || ': ' || array_to_string(v_issues, '; '),
            v_link);
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
                           'quality_issues', to_jsonb(v_issues), 'photo_url', p_photo_url));

    RETURN v_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. po_receive again, now with a gap-free GRN number taken after all checks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow.po_receive(
    p_po_id uuid, p_receipts jsonb, p_remarks text, p_photo_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
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
               max(x.condition) AS condition, max(x.quality_remarks) AS quality_remarks
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
        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Enter at least one quantity to receive';
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

    PERFORM indent_flow._emit_event('grn.recorded', 'grn', v_grn_id,
        jsonb_build_object('grn_number', v_grn_number, 'po_id', p_po_id, 'po_number', v_po.po_number,
                           'po_status', v_new_status, 'line_count', v_count,
                           'quality_issues', to_jsonb(v_issues)));

    RETURN jsonb_build_object('grn_id', v_grn_id, 'grn_number', v_grn_number, 'po_status', v_new_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION indent_flow._next_number(text)                               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._notify_site_role(uuid, text, text, text, text)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._log_indent(uuid, text, text)                    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION indent_flow.indent_submit(uuid)                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.indent_approve(uuid, text)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.indent_reject(uuid, text, boolean)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.indent_escalate(uuid, text)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.indent_escalation_decide(uuid, boolean, text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.indent_assign(uuid, uuid)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.indent_dispatch(uuid, text, text, text, text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.indent_receive(uuid, jsonb, text)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_receive(uuid, jsonb, text, text)                FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION indent_flow.indent_submit(uuid)                             TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.indent_approve(uuid, text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.indent_reject(uuid, text, boolean)              TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.indent_escalate(uuid, text)                     TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.indent_escalation_decide(uuid, boolean, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.indent_assign(uuid, uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.indent_dispatch(uuid, text, text, text, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.indent_receive(uuid, jsonb, text)               TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_receive(uuid, jsonb, text, text)             TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
