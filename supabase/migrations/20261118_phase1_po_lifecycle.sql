-- =============================================================================
-- IndentFlow  |  Phase 1, slice 1: PO lifecycle as database functions + events
-- =============================================================================
-- What this does
--   * Adds indent_flow.events: an append-only log of business events
--     (po.submitted, po.approved, grn.recorded ...) for future workflows,
--     integrations and AI agents to read.
--   * Adds one function per PO action. Each function checks the caller's role
--     and the PO's current status, then updates the PO, the linked indent, the
--     indent timeline, notifications and the event log in a single transaction.
--
-- Safety
--   * Purely additive: no existing table, column, policy or trigger is changed.
--   * Runs in one transaction: if any statement fails, nothing is applied.
--   * Safe to run more than once.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Event log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indent_flow.events (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type   text        NOT NULL,          -- e.g. 'po.approved'
    entity_type  text        NOT NULL,          -- e.g. 'purchase_order'
    entity_id    uuid,
    actor_id     uuid,                          -- who did it (auth user id)
    payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz                    -- set by a future consumer
);

CREATE INDEX IF NOT EXISTS events_unprocessed_idx
    ON indent_flow.events (created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS events_entity_idx
    ON indent_flow.events (entity_type, entity_id);

CREATE SEQUENCE IF NOT EXISTS indent_flow.grn_number_seq;

-- ---------------------------------------------------------------------------
-- 2. Internal helpers (names start with "_": not meant to be called by the app)
-- ---------------------------------------------------------------------------

-- Role of the signed-in user, or NULL if unknown / inactive.
CREATE OR REPLACE FUNCTION indent_flow.actor_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
    SELECT p.role::text
      FROM core.profiles p
     WHERE p.id = auth.uid()
       AND COALESCE(p.is_active, true)
$$;

-- Stops the action unless the signed-in user has one of the allowed roles.
CREATE OR REPLACE FUNCTION indent_flow._require_role(p_allowed text[], p_action text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_role text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'You must be signed in to %', p_action;
    END IF;
    v_role := indent_flow.actor_role();
    IF v_role IS NULL OR NOT (v_role = ANY (p_allowed)) THEN
        RAISE EXCEPTION 'Your role (%) is not allowed to %', COALESCE(v_role, 'none'), p_action;
    END IF;
    RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION indent_flow._emit_event(
    p_event_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
    INSERT INTO indent_flow.events (event_type, entity_type, entity_id, actor_id, payload)
    VALUES (p_event_type, p_entity_type, p_entity_id, auth.uid(), COALESCE(p_payload, '{}'::jsonb));
$$;

-- One notification for one user. Never notifies the person doing the action.
CREATE OR REPLACE FUNCTION indent_flow._notify(
    p_user_id uuid, p_title text, p_message text, p_link text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
BEGIN
    IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
        RETURN;
    END IF;
    INSERT INTO indent_flow.notifications (id, user_id, title, message, link, is_read)
    VALUES (gen_random_uuid(), p_user_id, p_title, p_message, p_link, false);
END;
$$;

-- Notification for every active user holding a role.
CREATE OR REPLACE FUNCTION indent_flow._notify_role(
    p_role text, p_title text, p_message text, p_link text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_user uuid;
BEGIN
    FOR v_user IN
        SELECT p.id FROM core.profiles p
         WHERE p.role::text = p_role AND COALESCE(p.is_active, true)
    LOOP
        PERFORM indent_flow._notify(v_user, p_title, p_message, p_link);
    END LOOP;
END;
$$;

-- Moves the indent linked to a PO to a new status and adds a timeline entry.
CREATE OR REPLACE FUNCTION indent_flow._touch_indent_for_po(
    p_indent_id uuid, p_status text, p_action text, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
BEGIN
    IF p_indent_id IS NULL THEN
        RETURN;
    END IF;
    IF p_status IS NOT NULL THEN
        UPDATE indent_flow.indents SET status = p_status WHERE id = p_indent_id;
    END IF;
    INSERT INTO indent_flow.indent_activity (indent_id, action, user_id, note)
    VALUES (p_indent_id, p_action, auth.uid(), COALESCE(p_note, ''));
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. PO actions (called by the app through the API)
--    Each returns the PO's new status.
-- ---------------------------------------------------------------------------

-- draft -> pending_approval
CREATE OR REPLACE FUNCTION indent_flow.po_submit(p_po_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_po     indent_flow.purchase_orders%ROWTYPE;
    v_lines  integer;
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
    IF v_po.vendor_id IS NULL THEN
        RAISE EXCEPTION 'PO % has no vendor', v_po.po_number;
    END IF;
    SELECT count(*) INTO v_lines FROM indent_flow.po_line_items WHERE po_id = p_po_id;
    IF v_lines = 0 THEN
        RAISE EXCEPTION 'PO % has no line items', v_po.po_number;
    END IF;

    UPDATE indent_flow.purchase_orders
       SET status = 'pending_approval', updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'pending_md_po_approval', 'PO Submitted for MD Approval', 'PO ' || v_po.po_number);
    PERFORM indent_flow._notify_role(
        'md', 'PO approval needed', 'PO ' || v_po.po_number || ' is awaiting your approval', '#md-po-approvals');
    PERFORM indent_flow._emit_event('po.submitted', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id, 'total_amount', v_po.total_amount));

    RETURN 'pending_approval';
END;
$$;

-- pending_approval -> approved
CREATE OR REPLACE FUNCTION indent_flow.po_approve(p_po_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_po indent_flow.purchase_orders%ROWTYPE;
BEGIN
    PERFORM indent_flow._require_role(ARRAY['md', 'admin'], 'approve a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status <> 'pending_approval' THEN
        RAISE EXCEPTION 'PO % is % and is not waiting for approval', v_po.po_number, v_po.status;
    END IF;

    UPDATE indent_flow.purchase_orders
       SET status = 'approved', updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'po_approved', 'PO Approved by MD', 'PO ' || v_po.po_number);
    PERFORM indent_flow._notify(
        v_po.created_by, 'PO approved',
        'PO ' || v_po.po_number || ' was approved by MD and can be issued', '#po/' || p_po_id::text);
    PERFORM indent_flow._emit_event('po.approved', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id, 'total_amount', v_po.total_amount));

    RETURN 'approved';
END;
$$;

-- pending_approval -> draft (with reason)
CREATE OR REPLACE FUNCTION indent_flow.po_reject(p_po_id uuid, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
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
       SET status = 'draft', remarks = 'MD Rejected: ' || v_reason, updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'po_draft', 'PO Rejected by MD', v_reason);
    PERFORM indent_flow._notify(
        v_po.created_by, 'PO rejected',
        'PO ' || v_po.po_number || ' was rejected by MD: ' || v_reason, '#po/' || p_po_id::text);
    PERFORM indent_flow._emit_event('po.rejected', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id, 'reason', v_reason));

    RETURN 'draft';
END;
$$;

-- approved -> issued
CREATE OR REPLACE FUNCTION indent_flow.po_issue(p_po_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_po      indent_flow.purchase_orders%ROWTYPE;
    v_site_id uuid;
    v_user    uuid;
    v_msg     text;
BEGIN
    PERFORM indent_flow._require_role(
        ARRAY['procurement_manager', 'procurement_clerk', 'admin'], 'issue a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status <> 'approved' THEN
        RAISE EXCEPTION 'PO % is % and cannot be issued (it must be approved first)', v_po.po_number, v_po.status;
    END IF;

    UPDATE indent_flow.purchase_orders
       SET status = 'issued', issued_at = now(), updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'po_issued', 'PO Issued to Vendor', 'PO ' || v_po.po_number);

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

    PERFORM indent_flow._emit_event('po.issued', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id,
                           'vendor_id', v_po.vendor_id, 'delivery_date', v_po.delivery_date,
                           'total_amount', v_po.total_amount));

    RETURN 'issued';
END;
$$;

-- issued -> draft, version + 1, previous version kept in history
CREATE OR REPLACE FUNCTION indent_flow.po_amend(p_po_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_po       indent_flow.purchase_orders%ROWTYPE;
    v_received numeric;
BEGIN
    PERFORM indent_flow._require_role(
        ARRAY['procurement_manager', 'procurement_clerk', 'admin'], 'amend a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status <> 'issued' THEN
        RAISE EXCEPTION 'PO % is % and cannot be amended (only an issued PO can)', v_po.po_number, v_po.status;
    END IF;
    SELECT COALESCE(sum(COALESCE(received_qty, 0)), 0) INTO v_received
      FROM indent_flow.po_line_items WHERE po_id = p_po_id;
    IF v_received > 0 THEN
        RAISE EXCEPTION 'PO % already has goods received against it and cannot be amended', v_po.po_number;
    END IF;

    INSERT INTO indent_flow.po_version_history (po_id, version, edited_by, total_amount, changes_summary)
    VALUES (p_po_id, COALESCE(v_po.version, 1), auth.uid(), COALESCE(v_po.total_amount, 0), 'Amended after issue');

    UPDATE indent_flow.purchase_orders
       SET status = 'draft', version = COALESCE(version, 1) + 1, remarks = 'Amended', updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'po_draft', 'PO Amendment — Reverted to Draft',
        'PO ' || v_po.po_number || ' v' || (COALESCE(v_po.version, 1) + 1)::text || ' opened for editing');
    PERFORM indent_flow._emit_event('po.amended', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id,
                           'new_version', COALESCE(v_po.version, 1) + 1));

    RETURN 'draft';
END;
$$;

-- fulfilled / partially_fulfilled -> closed; the indent is completed
CREATE OR REPLACE FUNCTION indent_flow.po_close(p_po_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_po indent_flow.purchase_orders%ROWTYPE;
BEGIN
    PERFORM indent_flow._require_role(
        ARRAY['procurement_manager', 'procurement_clerk', 'admin'], 'close a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status NOT IN ('fulfilled', 'partially_fulfilled') THEN
        RAISE EXCEPTION 'PO % is % and cannot be closed (goods must be received first)', v_po.po_number, v_po.status;
    END IF;

    UPDATE indent_flow.purchase_orders
       SET status = 'closed', updated_at = now()
     WHERE id = p_po_id;

    PERFORM indent_flow._touch_indent_for_po(
        v_po.indent_id, 'completed',
        CASE WHEN v_po.status = 'fulfilled' THEN 'PO Closed — Indent Completed'
             ELSE 'PO Short-Closed — Indent Completed' END,
        'PO ' || v_po.po_number);
    PERFORM indent_flow._emit_event('po.closed', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id,
                           'short_closed', v_po.status = 'partially_fulfilled'));

    RETURN 'closed';
END;
$$;

-- draft -> cancelled; the indent goes back to procurement so a new PO can be raised
CREATE OR REPLACE FUNCTION indent_flow.po_cancel(p_po_id uuid, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = indent_flow, core, public
AS $$
DECLARE
    v_po     indent_flow.purchase_orders%ROWTYPE;
    v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
    PERFORM indent_flow._require_role(
        ARRAY['procurement_manager', 'procurement_clerk', 'admin'], 'cancel a purchase order');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.status <> 'draft' THEN
        RAISE EXCEPTION 'PO % is % and cannot be cancelled (only a draft can)', v_po.po_number, v_po.status;
    END IF;

    UPDATE indent_flow.purchase_orders
       SET status = 'cancelled', remarks = 'Cancelled: ' || v_reason, updated_at = now()
     WHERE id = p_po_id;

    IF v_po.indent_id IS NOT NULL THEN
        UPDATE indent_flow.indents
           SET status = 'in_procurement', linked_po = NULL
         WHERE id = v_po.indent_id
           AND linked_po::text = p_po_id::text;
        INSERT INTO indent_flow.indent_activity (indent_id, action, user_id, note)
        VALUES (v_po.indent_id, 'PO Cancelled', auth.uid(),
                'PO ' || v_po.po_number || CASE WHEN v_reason <> '' THEN ' — ' || v_reason ELSE '' END);
    END IF;

    PERFORM indent_flow._emit_event('po.cancelled', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id, 'reason', v_reason));

    RETURN 'cancelled';
END;
$$;

-- Goods receipt against an issued PO.
--   p_receipts: [{"line_item_id": uuid, "quantity": number, "condition": text,
--                 "quality_remarks": text, "remarks": text}, ...]
-- Returns {"grn_id", "grn_number", "po_status"}.
-- Received quantities and the PO status are applied by the existing trigger on
-- grn_items (trg_apply_grn_item).
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

    -- A storekeeper may only receive for a site they are assigned to
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

    v_grn_number := 'GRN-' || to_char(now(), 'YYYY') || '-'
                    || lpad(nextval('indent_flow.grn_number_seq')::text, 5, '0');

    INSERT INTO indent_flow.grns (id, grn_number, po_id, received_by, remarks, photo_url)
    VALUES (v_grn_id, v_grn_number, p_po_id, auth.uid(), COALESCE(p_remarks, ''), COALESCE(p_photo_url, ''));

    FOR v_r IN
        SELECT * FROM jsonb_to_recordset(p_receipts)
            AS x(line_item_id uuid, quantity numeric, condition text, quality_remarks text, remarks text)
    LOOP
        IF v_r.quantity IS NULL OR v_r.quantity = 0 THEN
            CONTINUE;
        END IF;

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

        v_cond := COALESCE(NULLIF(btrim(v_r.condition), ''), 'Good');
        v_qrem := btrim(COALESCE(v_r.quality_remarks, ''));
        IF v_cond <> 'Good' AND v_qrem = '' THEN
            RAISE EXCEPTION '%: describe the quality issue for a % item', v_line.description, v_cond;
        END IF;
        IF v_cond <> 'Good' THEN
            v_issues := v_issues || (v_line.description || ': ' || v_cond || ' (' || v_qrem || ')');
        END IF;

        INSERT INTO indent_flow.grn_items
            (id, grn_id, po_line_item_id, quantity_received, remarks, condition, quality_remarks)
        VALUES
            (gen_random_uuid(), v_grn_id, v_line.id, v_r.quantity, COALESCE(v_r.remarks, ''), v_cond, v_qrem);

        v_count := v_count + 1;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Enter at least one quantity to receive';
    END IF;

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
-- 4. Permissions
-- ---------------------------------------------------------------------------
ALTER TABLE indent_flow.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events readable by admin and md" ON indent_flow.events;
CREATE POLICY "events readable by admin and md" ON indent_flow.events
    FOR SELECT TO authenticated
    USING (indent_flow.actor_role() IN ('admin', 'md'));

GRANT SELECT ON indent_flow.events TO authenticated;

-- Helpers are internal: not callable through the API
REVOKE ALL ON FUNCTION indent_flow._require_role(text[], text)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._emit_event(text, text, uuid, jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._notify(uuid, text, text, text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._notify_role(text, text, text, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._touch_indent_for_po(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- The PO actions are callable by signed-in users only (each checks the role itself)
REVOKE ALL ON FUNCTION indent_flow.actor_role()                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_submit(uuid)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_approve(uuid)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_reject(uuid, text)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_issue(uuid)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_amend(uuid)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_close(uuid)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_cancel(uuid, text)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_receive(uuid, jsonb, text, text)  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION indent_flow.actor_role()                        TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_submit(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_approve(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_reject(uuid, text)               TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_issue(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_amend(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_close(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_cancel(uuid, text)               TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_receive(uuid, jsonb, text, text) TO authenticated;

COMMIT;

-- Make the API pick up the new functions straight away
NOTIFY pgrst, 'reload schema';
