-- =============================================================================
-- IndentFlow  |  Lock down direct table writes
-- =============================================================================
-- Requires the earlier 20261118* files.
--
-- Why: the workflow functions (indent_* / po_*) check role and status, but the
-- tables themselves still accepted direct writes through the API. In testing a
-- site engineer set their own indent to "approved" and a storekeeper set an
-- indent to "completed" that way.
--
-- What this does: adds guard triggers so that, for requests coming through the
-- API as a signed-in user,
--   * status, links, approver, assignee and received quantities can only be
--     changed by the workflow functions;
--   * an indent's contents can only be edited by its creator while it is a
--     draft, rejected or returned;
--   * a PO's contents can only be edited by procurement while it is a draft;
--   * GRNs can only be created by the receipt function;
--   * a deactivated user cannot write anything.
-- It also: links an indent to a new PO in the database, keeps the indent's own
-- received quantity in step with PO receipts, and clears an old "MD Rejected"
-- note when a PO is submitted again.
--
-- The workflow functions are unaffected: they run as the database owner, and
-- the guards only apply to the API roles (authenticated / anon).
--
-- Safety: one transaction; safe to run more than once.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Small lookups used by the guards (run as owner so RLS cannot hide a row)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow._indent_brief(p_id uuid, OUT status text, OUT created_by uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
    SELECT i.status::text, i.created_by FROM indent_flow.indents i WHERE i.id = p_id
$$;

CREATE OR REPLACE FUNCTION indent_flow._po_status(p_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
    SELECT p.status::text FROM indent_flow.purchase_orders p WHERE p.id = p_id
$$;

-- ---------------------------------------------------------------------------
-- 2. Guard: indents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow._guard_indents() RETURNS trigger
LANGUAGE plpgsql SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role text;
    -- the only columns a user may edit directly
    v_free text[] := ARRAY['description', 'notes', 'priority', 'required_date', 'site_id',
                           'is_revised', 'revision_count', 'updated_at'];
BEGIN
    -- Only requests arriving through the API are restricted
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_role := indent_flow.actor_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Your account is not active';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status IS DISTINCT FROM 'draft' THEN
            RAISE EXCEPTION 'A new indent must start as a draft';
        END IF;
        IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'An indent can only be created in your own name';
        END IF;
        IF NEW.linked_po IS NOT NULL OR NEW.approved_by IS NOT NULL OR NEW.assigned_to IS NOT NULL THEN
            RAISE EXCEPTION 'A new indent cannot be created already linked, approved or assigned';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' OR (OLD.created_by IS DISTINCT FROM auth.uid() AND v_role <> 'admin') THEN
            RAISE EXCEPTION 'Only your own draft indent can be deleted';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE (compared as JSON so a column that does not exist is simply ignored)
    IF (to_jsonb(NEW) - v_free) IS DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
        RAISE EXCEPTION 'Indent status and approval details can only be changed through the workflow actions';
    END IF;
    IF OLD.status NOT IN ('draft', 'rejected', 'returned_for_revision') THEN
        RAISE EXCEPTION 'Indent % can no longer be edited (status: %)', OLD.indent_number, OLD.status;
    END IF;
    IF OLD.created_by IS DISTINCT FROM auth.uid() AND v_role <> 'admin' THEN
        RAISE EXCEPTION 'Only the person who raised indent % can edit it', OLD.indent_number;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_indents ON indent_flow.indents;
CREATE TRIGGER trg_guard_indents BEFORE INSERT OR UPDATE OR DELETE ON indent_flow.indents
    FOR EACH ROW EXECUTE FUNCTION indent_flow._guard_indents();

-- ---------------------------------------------------------------------------
-- 3. Guard: indent line items
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow._guard_indent_line_items() RETURNS trigger
LANGUAGE plpgsql SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role   text;
    v_indent uuid;
    v_brief  record;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_role := indent_flow.actor_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Your account is not active';
    END IF;

    v_indent := CASE WHEN TG_OP = 'DELETE' THEN OLD.indent_id ELSE NEW.indent_id END;
    SELECT * INTO v_brief FROM indent_flow._indent_brief(v_indent);

    -- When the parent indent is being deleted (cascade) it is already gone: allow
    IF v_brief.status IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF v_brief.status NOT IN ('draft', 'rejected', 'returned_for_revision') THEN
        RAISE EXCEPTION 'The items of this indent can no longer be edited (status: %)', v_brief.status;
    END IF;
    IF v_brief.created_by IS DISTINCT FROM auth.uid() AND v_role <> 'admin' THEN
        RAISE EXCEPTION 'Only the person who raised this indent can edit its items';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF COALESCE(NEW.received, 0) <> 0 OR COALESCE(NEW.received_qty, 0) <> 0 THEN
            RAISE EXCEPTION 'Received quantities can only be recorded through a receipt';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF COALESCE(NEW.received, 0) <> COALESCE(OLD.received, 0)
           OR COALESCE(NEW.received_qty, 0) <> COALESCE(OLD.received_qty, 0) THEN
            RAISE EXCEPTION 'Received quantities can only be recorded through a receipt';
        END IF;
        RETURN NEW;
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_indent_line_items ON indent_flow.indent_line_items;
CREATE TRIGGER trg_guard_indent_line_items BEFORE INSERT OR UPDATE OR DELETE ON indent_flow.indent_line_items
    FOR EACH ROW EXECUTE FUNCTION indent_flow._guard_indent_line_items();

-- ---------------------------------------------------------------------------
-- 4. Guard: purchase orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow._guard_purchase_orders() RETURNS trigger
LANGUAGE plpgsql SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role   text;
    v_brief  record;
    -- columns only the workflow functions may change
    v_locked text[] := ARRAY['id', 'status', 'po_number', 'indent_id', 'created_by', 'created_at', 'issued_at'];
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
    IF (SELECT jsonb_object_agg(k, to_jsonb(NEW) -> k) FROM unnest(v_locked) AS k)
       IS DISTINCT FROM
       (SELECT jsonb_object_agg(k, to_jsonb(OLD) -> k) FROM unnest(v_locked) AS k) THEN
        RAISE EXCEPTION 'Purchase order status can only be changed through the workflow actions';
    END IF;
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'PO % can no longer be edited (status: %)', OLD.po_number, OLD.status;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_purchase_orders ON indent_flow.purchase_orders;
CREATE TRIGGER trg_guard_purchase_orders BEFORE INSERT OR UPDATE OR DELETE ON indent_flow.purchase_orders
    FOR EACH ROW EXECUTE FUNCTION indent_flow._guard_purchase_orders();

-- A new PO links its indent and moves it to "PO draft" (was done by the app)
CREATE OR REPLACE FUNCTION indent_flow._link_indent_to_new_po() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
BEGIN
    IF NEW.indent_id IS NOT NULL THEN
        UPDATE indent_flow.indents
           SET status = 'po_draft', linked_po = NEW.id
         WHERE id = NEW.indent_id
           AND status IN ('approved', 'in_procurement');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_indent_to_new_po ON indent_flow.purchase_orders;
CREATE TRIGGER trg_link_indent_to_new_po AFTER INSERT ON indent_flow.purchase_orders
    FOR EACH ROW EXECUTE FUNCTION indent_flow._link_indent_to_new_po();

-- ---------------------------------------------------------------------------
-- 5. Guard: PO line items
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow._guard_po_line_items() RETURNS trigger
LANGUAGE plpgsql SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role   text;
    v_status text;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_role := indent_flow.actor_role();
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Your account is not active';
    END IF;
    IF v_role NOT IN ('procurement_manager', 'procurement_clerk', 'admin') THEN
        RAISE EXCEPTION 'Your role (%) is not allowed to edit purchase order items', v_role;
    END IF;

    v_status := indent_flow._po_status(CASE WHEN TG_OP = 'DELETE' THEN OLD.po_id ELSE NEW.po_id END);
    IF v_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'The items of this purchase order can no longer be edited (status: %)', COALESCE(v_status, 'not found');
    END IF;

    IF TG_OP = 'INSERT' AND COALESCE(NEW.received_qty, 0) <> 0 THEN
        RAISE EXCEPTION 'Received quantities can only be recorded through a goods receipt';
    END IF;
    IF TG_OP = 'UPDATE' AND COALESCE(NEW.received_qty, 0) <> COALESCE(OLD.received_qty, 0) THEN
        RAISE EXCEPTION 'Received quantities can only be recorded through a goods receipt';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_po_line_items ON indent_flow.po_line_items;
CREATE TRIGGER trg_guard_po_line_items BEFORE INSERT OR UPDATE OR DELETE ON indent_flow.po_line_items
    FOR EACH ROW EXECUTE FUNCTION indent_flow._guard_po_line_items();

-- ---------------------------------------------------------------------------
-- 6. Guard: goods receipts (only the receipt function may write them)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow._guard_function_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = indent_flow, core, public AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        RAISE EXCEPTION 'Goods receipts can only be recorded through the receipt action';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_grns ON indent_flow.grns;
CREATE TRIGGER trg_guard_grns BEFORE INSERT OR UPDATE OR DELETE ON indent_flow.grns
    FOR EACH ROW EXECUTE FUNCTION indent_flow._guard_function_only();

DROP TRIGGER IF EXISTS trg_guard_grn_items ON indent_flow.grn_items;
CREATE TRIGGER trg_guard_grn_items BEFORE INSERT OR UPDATE OR DELETE ON indent_flow.grn_items
    FOR EACH ROW EXECUTE FUNCTION indent_flow._guard_function_only();

-- ---------------------------------------------------------------------------
-- 7. Guard: comments, documents, timeline — active users only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow._guard_active_user() RETURNS trigger
LANGUAGE plpgsql SET search_path = indent_flow, core, public AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') AND indent_flow.actor_role() IS NULL THEN
        RAISE EXCEPTION 'Your account is not active';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_indent_comments ON indent_flow.indent_comments;
CREATE TRIGGER trg_guard_indent_comments BEFORE INSERT OR UPDATE OR DELETE ON indent_flow.indent_comments
    FOR EACH ROW EXECUTE FUNCTION indent_flow._guard_active_user();

DROP TRIGGER IF EXISTS trg_guard_indent_documents ON indent_flow.indent_documents;
CREATE TRIGGER trg_guard_indent_documents BEFORE INSERT OR UPDATE OR DELETE ON indent_flow.indent_documents
    FOR EACH ROW EXECUTE FUNCTION indent_flow._guard_active_user();

DROP TRIGGER IF EXISTS trg_guard_indent_activity ON indent_flow.indent_activity;
CREATE TRIGGER trg_guard_indent_activity BEFORE INSERT OR UPDATE OR DELETE ON indent_flow.indent_activity
    FOR EACH ROW EXECUTE FUNCTION indent_flow._guard_active_user();

-- ---------------------------------------------------------------------------
-- 8. A PO receipt also updates the indent's own received quantity
--    (a PO line keeps the id of the indent line it was raised from)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow.apply_grn_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE v_po uuid; v_all boolean; v_any boolean;
BEGIN
  UPDATE indent_flow.po_line_items
     SET received_qty = COALESCE(received_qty, 0) + COALESCE(NEW.quantity_received, 0)
   WHERE id = NEW.po_line_item_id
  RETURNING po_id INTO v_po;
  IF v_po IS NULL THEN RETURN NEW; END IF;

  UPDATE indent_flow.indent_line_items
     SET received     = COALESCE(received, 0) + COALESCE(NEW.quantity_received, 0),
         received_qty = COALESCE(received, 0) + COALESCE(NEW.quantity_received, 0)
   WHERE id = NEW.po_line_item_id;

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

-- Bring existing indents in step with what was already received against their POs
UPDATE indent_flow.indent_line_items ili
   SET received = pli.received_qty, received_qty = pli.received_qty
  FROM indent_flow.po_line_items pli
 WHERE pli.id = ili.id
   AND COALESCE(pli.received_qty, 0) > COALESCE(ili.received, 0);

-- ---------------------------------------------------------------------------
-- 9. po_submit: clear an old "MD Rejected" note when the PO is sent again
-- ---------------------------------------------------------------------------
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
       SET status = 'pending_approval',
           remarks = CASE WHEN remarks LIKE 'MD Rejected:%' OR remarks = 'Amended' THEN NULL ELSE remarks END,
           updated_at = now()
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

-- ---------------------------------------------------------------------------
-- 10. Permissions for the new helpers
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION indent_flow._indent_brief(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow._po_status(uuid)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION indent_flow._indent_brief(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow._po_status(uuid)    TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
