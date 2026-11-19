-- =============================================================================
-- IndentFlow  |  Local purchases, POs without an indent, PO terms, company details
-- =============================================================================
-- Requires every earlier migration (up to 20261119_item_remarks.sql).
--
--   1. Local / emergency purchases: material bought at site without an indent
--      and recorded afterwards, item by item, with the bill. Recorded by a
--      storekeeper or the procurement manager, up to a limit (Rs. 10,000 to
--      start with, in Organisation Settings). The site's project manager
--      approves it afterwards; the MD is notified of every one.
--   2. A purchase order can be raised with no indent behind it. It needs a
--      reason and a site, can never be issued directly (always MD approval),
--      and can be linked to an approved indent later.
--   3. A PO carries its terms (freight, taxes, quality, site contact...) for the
--      printed order.
--   4. Navya Constructions' real company and office details.
--
-- Safe to run more than once.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Settings helper (works whether the value column is text or jsonb)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION indent_flow._set_setting(p_key text, p_value text, p_overwrite boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_type text;
    v_expr text;
BEGIN
    SELECT data_type INTO v_type FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = 'org_settings' AND column_name = 'value';
    v_expr := CASE WHEN v_type IN ('jsonb', 'json') THEN format('to_jsonb(%L::text)', p_value) ELSE format('%L', p_value) END;
    IF EXISTS (SELECT 1 FROM core.org_settings WHERE key = p_key) THEN
        IF p_overwrite THEN
            EXECUTE format('UPDATE core.org_settings SET value = %s WHERE key = %L', v_expr, p_key);
        END IF;
    ELSE
        EXECUTE format('INSERT INTO core.org_settings (key, value) VALUES (%L, %s)', p_key, v_expr);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION indent_flow._setting_number(p_key text, p_default numeric)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_text text;
BEGIN
    SELECT s.value::text INTO v_text FROM core.org_settings s WHERE s.key = p_key LIMIT 1;
    v_text := regexp_replace(COALESCE(v_text, ''), '[^0-9.]', '', 'g');
    IF v_text = '' OR v_text = '.' THEN
        RETURN p_default;
    END IF;
    RETURN v_text::numeric;
EXCEPTION WHEN OTHERS THEN
    RETURN p_default;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------
ALTER TABLE indent_flow.purchase_orders ADD COLUMN IF NOT EXISTS site_id          uuid;    -- for a PO with no indent
ALTER TABLE indent_flow.purchase_orders ADD COLUMN IF NOT EXISTS no_indent_reason text;
ALTER TABLE indent_flow.purchase_orders ADD COLUMN IF NOT EXISTS terms            jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE indent_flow.purchase_orders  ALTER COLUMN indent_id DROP NOT NULL;
ALTER TABLE indent_flow.indent_documents ALTER COLUMN indent_id DROP NOT NULL;              -- a quotation on a PO with no indent

-- ---------------------------------------------------------------------------
-- 2. Local purchases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indent_flow.local_purchases (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lp_number         text NOT NULL UNIQUE,                  -- LP-2026-00001
    site_id           uuid NOT NULL,
    vendor_id         uuid,                                  -- when it is a vendor we already know
    vendor_name       text NOT NULL,
    vendor_phone      text,
    vendor_gstin      text,
    vendor_address    text,
    bill_number       text NOT NULL,
    bill_date         date NOT NULL,
    reason            text NOT NULL,                         -- why it could not wait for an indent
    payment_mode      text NOT NULL,
    total_amount      numeric(14,2) NOT NULL,
    bill_files        jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{name, path}] in the indent-docs bucket
    status            text NOT NULL DEFAULT 'pending_approval'
                          CHECK (status IN ('pending_approval', 'approved', 'rejected')),
    created_by        uuid NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    decided_by        uuid,
    decided_at        timestamptz,
    decision_remarks  text
);

CREATE TABLE IF NOT EXISTS indent_flow.local_purchase_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lp_id         uuid NOT NULL REFERENCES indent_flow.local_purchases (id) ON DELETE CASCADE,
    position      integer NOT NULL DEFAULT 0,
    description   text NOT NULL,
    quantity      numeric(14,3) NOT NULL CHECK (quantity > 0),
    unit          text NOT NULL,
    rate          numeric(14,2) NOT NULL CHECK (rate > 0),
    gst_percent   numeric(5,2) NOT NULL DEFAULT 0 CHECK (gst_percent >= 0),
    amount        numeric(14,2) NOT NULL                      -- including GST
);
CREATE INDEX IF NOT EXISTS local_purchase_items_lp_idx ON indent_flow.local_purchase_items (lp_id);
CREATE INDEX IF NOT EXISTS local_purchases_site_idx ON indent_flow.local_purchases (site_id, created_at DESC);

-- Readable by signed-in users; written only by the functions below
ALTER TABLE indent_flow.local_purchases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE indent_flow.local_purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "local purchases read" ON indent_flow.local_purchases;
CREATE POLICY "local purchases read" ON indent_flow.local_purchases FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "local purchase items read" ON indent_flow.local_purchase_items;
CREATE POLICY "local purchase items read" ON indent_flow.local_purchase_items FOR SELECT TO authenticated USING (true);
REVOKE ALL ON indent_flow.local_purchases, indent_flow.local_purchase_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON indent_flow.local_purchases, indent_flow.local_purchase_items TO authenticated;
GRANT ALL    ON indent_flow.local_purchases, indent_flow.local_purchase_items TO service_role;

-- Records a local purchase. p is:
--   { "site_id", "vendor_id"?, "vendor_name", "vendor_phone"?, "vendor_gstin"?, "vendor_address"?,
--     "bill_number", "bill_date", "reason", "payment_mode",
--     "bill_files": [{"name", "path"}],
--     "items": [{"description", "quantity", "unit", "rate", "gst_percent"}] }
-- Returns { "id", "lp_number", "total_amount" }.
CREATE OR REPLACE FUNCTION indent_flow.local_purchase_record(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role     text;
    v_site_id  uuid := NULLIF(p ->> 'site_id', '')::uuid;
    v_site     text;
    v_vendor   text := btrim(COALESCE(p ->> 'vendor_name', ''));
    v_vendor_id uuid := NULLIF(p ->> 'vendor_id', '')::uuid;
    v_bill_no  text := btrim(COALESCE(p ->> 'bill_number', ''));
    v_bill_dt  date := NULLIF(p ->> 'bill_date', '')::date;
    v_reason   text := btrim(COALESCE(p ->> 'reason', ''));
    v_pay      text := btrim(COALESCE(p ->> 'payment_mode', ''));
    v_files    jsonb := COALESCE(p -> 'bill_files', '[]'::jsonb);
    v_items    jsonb := COALESCE(p -> 'items', '[]'::jsonb);
    v_item     record;
    v_total    numeric := 0;
    v_count    integer := 0;
    v_limit    numeric;
    v_id       uuid := gen_random_uuid();
    v_number   text;
    v_pm_count integer;
    v_link     text;
BEGIN
    v_role := indent_flow._require_role(
        ARRAY['storekeeper', 'procurement_manager', 'admin'], 'record a local purchase');

    IF v_site_id IS NULL THEN
        RAISE EXCEPTION 'Choose the site the material was bought for';
    END IF;
    SELECT name INTO v_site FROM core.sites WHERE id = v_site_id;
    IF v_site IS NULL THEN
        RAISE EXCEPTION 'Site not found';
    END IF;
    IF v_role = 'storekeeper' AND NOT EXISTS (
        SELECT 1 FROM core.site_assignments sa WHERE sa.user_id = auth.uid() AND sa.site_id = v_site_id
    ) THEN
        RAISE EXCEPTION 'You are not assigned to %', v_site;
    END IF;

    IF v_vendor_id IS NOT NULL AND v_vendor = '' THEN
        SELECT name INTO v_vendor FROM core.vendors WHERE id = v_vendor_id;
        v_vendor := COALESCE(v_vendor, '');
    END IF;
    IF v_vendor = '' THEN
        RAISE EXCEPTION 'Enter the shop or vendor the material was bought from';
    END IF;
    IF v_bill_no = '' THEN
        RAISE EXCEPTION 'Enter the bill / invoice number';
    END IF;
    IF v_bill_dt IS NULL THEN
        RAISE EXCEPTION 'Enter the bill date';
    END IF;
    IF v_bill_dt > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
        RAISE EXCEPTION 'The bill date cannot be in the future';
    END IF;
    IF v_reason = '' THEN
        RAISE EXCEPTION 'Say why this had to be bought locally';
    END IF;
    IF v_pay = '' THEN
        RAISE EXCEPTION 'Choose how it was paid for';
    END IF;
    IF jsonb_typeof(v_files) <> 'array' OR jsonb_array_length(v_files) = 0 THEN
        RAISE EXCEPTION 'Attach a photo or scan of the bill';
    END IF;
    IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'Enter the items on the bill';
    END IF;

    -- Check and total the items
    FOR v_item IN
        SELECT * FROM jsonb_to_recordset(v_items)
            AS x(description text, quantity numeric, unit text, rate numeric, gst_percent numeric)
    LOOP
        v_count := v_count + 1;
        IF btrim(COALESCE(v_item.description, '')) = '' THEN
            RAISE EXCEPTION 'Item %: enter what was bought', v_count;
        END IF;
        IF COALESCE(v_item.quantity, 0) <= 0 THEN
            RAISE EXCEPTION '%: enter a quantity above zero', v_item.description;
        END IF;
        IF btrim(COALESCE(v_item.unit, '')) = '' THEN
            RAISE EXCEPTION '%: choose a unit', v_item.description;
        END IF;
        IF COALESCE(v_item.rate, 0) <= 0 THEN
            RAISE EXCEPTION '%: enter the rate', v_item.description;
        END IF;
        IF COALESCE(v_item.gst_percent, 0) < 0 OR COALESCE(v_item.gst_percent, 0) > 28 THEN
            RAISE EXCEPTION '%: GST must be between 0 and 28 per cent', v_item.description;
        END IF;
        v_total := v_total + round(v_item.quantity * v_item.rate * (1 + COALESCE(v_item.gst_percent, 0) / 100.0), 2);
    END LOOP;

    v_limit := indent_flow._setting_number('local_purchase_limit', 10000);
    IF v_total > v_limit THEN
        RAISE EXCEPTION 'This bill is % but a local purchase can be at most %. Raise an indent for it instead.',
            indent_flow._money(v_total), indent_flow._money(v_limit);
    END IF;

    v_number := 'LP-' || to_char(now(), 'YYYY') || '-'
                || lpad(indent_flow._next_number('lp-' || to_char(now(), 'YYYY'))::text, 5, '0');

    INSERT INTO indent_flow.local_purchases
        (id, lp_number, site_id, vendor_id, vendor_name, vendor_phone, vendor_gstin, vendor_address,
         bill_number, bill_date, reason, payment_mode, total_amount, bill_files, created_by)
    VALUES
        (v_id, v_number, v_site_id, v_vendor_id, v_vendor,
         NULLIF(btrim(COALESCE(p ->> 'vendor_phone', '')), ''), NULLIF(btrim(COALESCE(p ->> 'vendor_gstin', '')), ''),
         NULLIF(btrim(COALESCE(p ->> 'vendor_address', '')), ''),
         v_bill_no, v_bill_dt, v_reason, v_pay, v_total, v_files, auth.uid());

    v_count := 0;
    FOR v_item IN
        SELECT * FROM jsonb_to_recordset(v_items)
            AS x(description text, quantity numeric, unit text, rate numeric, gst_percent numeric)
    LOOP
        v_count := v_count + 1;
        INSERT INTO indent_flow.local_purchase_items (lp_id, position, description, quantity, unit, rate, gst_percent, amount)
        VALUES (v_id, v_count, btrim(v_item.description), v_item.quantity, btrim(v_item.unit), v_item.rate,
                COALESCE(v_item.gst_percent, 0),
                round(v_item.quantity * v_item.rate * (1 + COALESCE(v_item.gst_percent, 0) / 100.0), 2));
    END LOOP;

    v_link := '#local-purchase/' || v_id::text;

    -- The site's project managers approve it; if the site has none, the MD does
    SELECT count(*) INTO v_pm_count
      FROM core.profiles pr JOIN core.site_assignments sa ON sa.user_id = pr.id
     WHERE pr.role::text = 'project_manager' AND COALESCE(pr.is_active, true) AND sa.site_id = v_site_id;
    PERFORM indent_flow._notify_site_role(v_site_id, 'project_manager', 'Local purchase to approve',
        v_number || ': ' || indent_flow._money(v_total) || ' from ' || v_vendor || ' for ' || v_site, v_link);
    PERFORM indent_flow._notify_role('md',
        CASE WHEN v_pm_count = 0 THEN 'Local purchase to approve' ELSE 'Local purchase recorded' END,
        v_number || ': ' || indent_flow._money(v_total) || ' from ' || v_vendor || ' for ' || v_site
            || ' — ' || left(v_reason, 120), v_link);

    PERFORM indent_flow._emit_event('local_purchase.recorded', 'local_purchase', v_id,
        jsonb_build_object('lp_number', v_number, 'site_id', v_site_id, 'vendor', v_vendor,
                           'total_amount', v_total, 'item_count', v_count));

    RETURN jsonb_build_object('id', v_id, 'lp_number', v_number, 'total_amount', v_total);
END;
$$;

-- The project manager of the site (or the MD) approves or rejects it afterwards.
CREATE OR REPLACE FUNCTION indent_flow.local_purchase_decide(p_id uuid, p_approve boolean, p_remarks text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role    text;
    v_lp      indent_flow.local_purchases%ROWTYPE;
    v_approve boolean := COALESCE(p_approve, false);
    v_remarks text := btrim(COALESCE(p_remarks, ''));
    v_status  text;
    v_link    text := '#local-purchase/' || p_id::text;
BEGIN
    v_role := indent_flow._require_role(ARRAY['project_manager', 'md', 'admin'], 'decide on a local purchase');

    SELECT * INTO v_lp FROM indent_flow.local_purchases WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Local purchase not found';
    END IF;
    IF v_lp.status <> 'pending_approval' THEN
        RAISE EXCEPTION '% has already been %', v_lp.lp_number, v_lp.status;
    END IF;
    IF v_lp.created_by = auth.uid() THEN
        RAISE EXCEPTION 'You recorded % yourself, so someone else has to decide it', v_lp.lp_number;
    END IF;
    IF v_role = 'project_manager' AND NOT EXISTS (
        SELECT 1 FROM core.site_assignments sa WHERE sa.user_id = auth.uid() AND sa.site_id = v_lp.site_id
    ) THEN
        RAISE EXCEPTION '% is for a site you are not assigned to', v_lp.lp_number;
    END IF;
    IF v_remarks = '' AND (NOT v_approve OR v_role = 'md') THEN
        RAISE EXCEPTION 'Remarks are required for this decision on %', v_lp.lp_number;
    END IF;

    v_status := CASE WHEN v_approve THEN 'approved' ELSE 'rejected' END;
    UPDATE indent_flow.local_purchases
       SET status = v_status, decided_by = auth.uid(), decided_at = now(), decision_remarks = v_remarks
     WHERE id = p_id;

    PERFORM indent_flow._notify(v_lp.created_by,
        CASE WHEN v_approve THEN 'Local purchase approved' ELSE 'Local purchase rejected' END,
        v_lp.lp_number || ' (' || indent_flow._money(v_lp.total_amount) || ') was ' || v_status
            || CASE WHEN v_remarks <> '' THEN ': ' || left(v_remarks, 160) ELSE '' END, v_link);
    IF NOT v_approve THEN
        PERFORM indent_flow._notify_role('md', 'Local purchase rejected',
            v_lp.lp_number || ' (' || indent_flow._money(v_lp.total_amount) || ') was rejected: ' || left(v_remarks, 160), v_link);
    END IF;

    PERFORM indent_flow._emit_event('local_purchase.' || v_status, 'local_purchase', p_id,
        jsonb_build_object('lp_number', v_lp.lp_number, 'site_id', v_lp.site_id,
                           'total_amount', v_lp.total_amount, 'remarks', v_remarks));
    RETURN v_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Purchase orders without an indent
-- ---------------------------------------------------------------------------

-- Links a PO that was raised without an indent to an approved indent.
CREATE OR REPLACE FUNCTION indent_flow.po_link_indent(p_po_id uuid, p_indent_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = indent_flow, core, public AS $$
DECLARE
    v_po     indent_flow.purchase_orders%ROWTYPE;
    v_ind    indent_flow.indents%ROWTYPE;
    v_status text;
BEGIN
    PERFORM indent_flow._require_role(
        ARRAY['procurement_manager', 'procurement_clerk', 'admin'], 'link a purchase order to an indent');

    SELECT * INTO v_po FROM indent_flow.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase order not found';
    END IF;
    IF v_po.indent_id IS NOT NULL THEN
        RAISE EXCEPTION 'PO % is already linked to an indent', v_po.po_number;
    END IF;
    IF v_po.status IN ('cancelled', 'closed') THEN
        RAISE EXCEPTION 'PO % is % and can no longer be linked', v_po.po_number, v_po.status;
    END IF;

    SELECT * INTO v_ind FROM indent_flow.indents WHERE id = p_indent_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Indent not found';
    END IF;
    IF v_ind.status NOT IN ('approved', 'in_procurement') THEN
        RAISE EXCEPTION 'Indent % is % and cannot take a purchase order (it must be approved and not yet ordered)',
            v_ind.indent_number, v_ind.status;
    END IF;

    v_status := CASE v_po.status
                    WHEN 'draft'            THEN 'po_draft'
                    WHEN 'pending_approval' THEN 'pending_md_po_approval'
                    WHEN 'approved'         THEN 'po_approved'
                    ELSE 'po_issued' END;

    UPDATE indent_flow.purchase_orders SET indent_id = p_indent_id, updated_at = now() WHERE id = p_po_id;
    UPDATE indent_flow.indents SET status = v_status, linked_po = p_po_id WHERE id = p_indent_id;
    -- Files already attached to the PO now show on the indent too
    UPDATE indent_flow.indent_documents SET indent_id = p_indent_id WHERE po_id = p_po_id AND indent_id IS NULL;

    PERFORM indent_flow._log_indent(p_indent_id, 'Linked to Purchase Order',
        'PO ' || v_po.po_number || ' (raised without an indent) was linked to this indent');
    PERFORM indent_flow._notify(v_ind.created_by, 'Indent linked to a purchase order',
        'Indent ' || v_ind.indent_number || ' is covered by PO ' || v_po.po_number, '#indent/' || p_indent_id::text);
    PERFORM indent_flow._emit_event('po.linked_to_indent', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', p_indent_id, 'indent_number', v_ind.indent_number));

    RETURN v_status;
END;
$$;

-- PO readiness check: a PO without an indent needs a reason and a site
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
    IF v_po.indent_id IS NULL AND btrim(COALESCE(v_po.no_indent_reason, '')) = '' THEN
        RAISE EXCEPTION 'PO %: say why this purchase order has no indent', v_po.po_number;
    END IF;
    IF v_po.indent_id IS NULL AND v_po.site_id IS NULL THEN
        RAISE EXCEPTION 'PO %: choose the site the material is for', v_po.po_number;
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

-- draft -> pending_approval: the MD is told when there is no indent behind it
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
        'PO ' || v_po.po_number || ' (' || indent_flow._money(v_total) || ') is awaiting your approval'
            || CASE WHEN v_po.indent_id IS NULL THEN ' — raised without an indent: ' || left(COALESCE(v_po.no_indent_reason, ''), 120) ELSE '' END,
        '#po/' || p_po_id::text);
    PERFORM indent_flow._emit_event('po.submitted', 'purchase_order', p_po_id,
        jsonb_build_object('po_number', v_po.po_number, 'indent_id', v_po.indent_id, 'total_amount', v_total));

    RETURN 'pending_approval';
END;
$$;

-- issue: a PO without an indent can never be issued directly
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

    IF v_po.status = 'draft' AND v_po.indent_id IS NULL THEN
        RAISE EXCEPTION 'PO % has no indent, so it needs MD approval before it can be issued', v_po.po_number;
    END IF;
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
    v_site_id := v_po.site_id;
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

-- receipt: the storekeeper's site check also works for a PO without an indent
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

    IF v_role = 'storekeeper' THEN
        v_site_id := v_po.site_id;
        IF v_po.indent_id IS NOT NULL THEN
            SELECT i.site_id INTO v_site_id FROM indent_flow.indents i WHERE i.id = v_po.indent_id;
        END IF;
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

-- guard: terms, site and the no-indent reason are editable on a draft
CREATE OR REPLACE FUNCTION indent_flow._guard_purchase_orders() RETURNS trigger
LANGUAGE plpgsql SET search_path = indent_flow, core, public AS $$
DECLARE
    v_role  text;
    v_brief record;
    v_free  text[] := ARRAY['vendor_id', 'delivery_date', 'payment_terms', 'delivery_address', 'notes',
                            'office_id', 'total_amount', 'remarks', 'version', 'updated_at', 'no_quote_reason',
                            'terms', 'site_id', 'no_indent_reason'];
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
-- 4. Company and office details (from the letterhead and the GST certificate)
-- ---------------------------------------------------------------------------
SELECT indent_flow._set_setting('company_name',        'Navya Constructions', true);
SELECT indent_flow._set_setting('company_tagline',     'Since 1997', true);
SELECT indent_flow._set_setting('company_address',     'Unit 332, Kokapet Terminal, Gandipet - Kokapet Road, Hyderabad 500 075', true);
SELECT indent_flow._set_setting('company_phone',       '+91 70327 03355', true);
SELECT indent_flow._set_setting('company_email',       'info@navyacon.com', true);
SELECT indent_flow._set_setting('company_website',     'navyacon.com', true);
SELECT indent_flow._set_setting('pan_number',          'AADFN7300H', true);
SELECT indent_flow._set_setting('local_purchase_limit', '10000', false);

-- The three offices on the letterhead, with their GSTINs (Odisha from the
-- registration certificate; Telangana and Andhra Pradesh confirmed by Murali).
INSERT INTO core.offices (id, name, city, state, address, gstin, pan, phone, email)
SELECT gen_random_uuid(), v.name, v.city, v.state, v.address, v.gstin, 'AADFN7300H', '+91 70327 03355', 'info@navyacon.com'
  FROM (VALUES
        ('Navya Constructions - Hyderabad',     'Hyderabad',     'Telangana',      'Unit 332, Kokapet Terminal, Gandipet - Kokapet Road, Hyderabad 500 075', '36AADFN7300H1ZI'),
        ('Navya Constructions - Visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', '5th Floor, Square Plaza, Madhurawada, Visakhapatnam 530 045',            '37AADFN7300H1ZG'),
        ('Navya Constructions - Bhubaneswar',   'Bhubaneswar',   'Odisha',         'Plot 178/1004, Lane 2, Millennium City, Pahala, Khordha 754 001',        '21AADFN7300H1ZT')
       ) AS v(name, city, state, address, gstin)
 WHERE NOT EXISTS (SELECT 1 FROM core.offices o WHERE o.name = v.name);

-- If the offices were created by an earlier run without these numbers
UPDATE core.offices SET gstin = '36AADFN7300H1ZI' WHERE name = 'Navya Constructions - Hyderabad'     AND COALESCE(gstin, '') = '';
UPDATE core.offices SET gstin = '37AADFN7300H1ZG' WHERE name = 'Navya Constructions - Visakhapatnam' AND COALESCE(gstin, '') = '';

-- ---------------------------------------------------------------------------
-- 5. Permissions
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION indent_flow._set_setting(text, text, boolean)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow._setting_number(text, numeric)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION indent_flow.local_purchase_record(jsonb)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.local_purchase_decide(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION indent_flow.po_link_indent(uuid, uuid)                 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION indent_flow.local_purchase_record(jsonb)               TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.local_purchase_decide(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION indent_flow.po_link_indent(uuid, uuid)                 TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
