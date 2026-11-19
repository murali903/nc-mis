-- =============================================================================
-- Navyacon MIS v2  |  0001  Foundation
-- =============================================================================
-- For a NEW, EMPTY Supabase project (not the dev project of version 1).
--
-- Design in one paragraph: the database stores and protects data; the business
-- rules run in the application server (v2/server). The browser never talks to
-- these tables: both schemas are closed to the public API and every table has
-- row-level security switched on with no policies, so only the server (which
-- connects with the database's own credentials) can read or write.
--
-- Schemas:  core    shared by every MIS module (companies, people, places)
--           indent  the indent and purchase-order module
--
-- Run once. It refuses to run on a database that already has these schemas.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name IN ('core', 'indent')) THEN
        RAISE EXCEPTION 'This database already has a core or indent schema. Use a new, empty project for v2.';
    END IF;
END $$;

CREATE SCHEMA core;
CREATE SCHEMA indent;

-- updated_at kept current on every change
CREATE FUNCTION core.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- core: companies and places
-- ---------------------------------------------------------------------------
CREATE TABLE core.companies (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,5}$'),      -- 'NC': first part of every document number
    name        text NOT NULL,
    legal_name  text,
    gstin       text,
    pan         text,
    address     text,
    phone       text,
    email       text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.offices (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    code        text NOT NULL CHECK (code ~ '^[A-Z0-9]{2,5}$'),             -- 'HYD': used in PO numbers
    name        text NOT NULL,
    address     text,
    city        text,
    state       text,
    gstin       text,
    pan         text,
    phone       text,
    email       text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, code)
);

CREATE TABLE core.sites (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    office_id   uuid NOT NULL REFERENCES core.offices (id),
    code        text NOT NULL CHECK (code ~ '^[A-Z0-9]{2,5}$'),             -- 'GCB': used in indent and GRN numbers
    name        text NOT NULL,
    location    text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, code)
);

-- ---------------------------------------------------------------------------
-- core: roles and permissions
-- A role is a named set of permissions, defined per company, so a new role
-- (e.g. "General Manager") is data, not code.
-- ---------------------------------------------------------------------------
CREATE TABLE core.permissions (
    key          text PRIMARY KEY,                                           -- e.g. 'indent.approve'
    description  text NOT NULL
);

INSERT INTO core.permissions (key, description) VALUES
    ('indent.create',        'Raise indents'),
    ('indent.approve',       'Approve, return or reject indents waiting on them'),
    ('indent.view_company',  'See every indent in the company'),
    ('po.create',            'Raise purchase orders and dispatch without a PO'),
    ('po.approve',           'Approve or reject purchase orders within their limit'),
    ('po.close',             'Close or short-close purchase orders'),
    ('po.view_company',      'See every purchase order in the company'),
    ('receipt.record',       'Record material received at their sites'),
    ('vendor.manage',        'Add and edit vendors'),
    ('admin.manage',         'Manage users, sites, offices, roles and settings');

CREATE TABLE core.roles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    key         text NOT NULL,                                               -- 'project_manager'
    name        text NOT NULL,                                               -- 'Project Manager'
    -- Default ceiling for members with this role; a member can have their own.
    -- NULL = no ceiling, 0 = cannot approve or issue on their own authority.
    default_po_limit  numeric(14,2) DEFAULT 0 CHECK (default_po_limit IS NULL OR default_po_limit >= 0),
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, key)
);

CREATE TABLE core.role_permissions (
    role_id         uuid NOT NULL REFERENCES core.roles (id) ON DELETE CASCADE,
    permission_key  text NOT NULL REFERENCES core.permissions (key),
    PRIMARY KEY (role_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- core: people
-- A member is one person in one company. The login itself lives in Supabase
-- Auth (auth.users); the same login can be a member of more than one company.
-- ---------------------------------------------------------------------------
CREATE TABLE core.members (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    user_id     uuid NOT NULL REFERENCES auth.users (id),
    role_id     uuid NOT NULL REFERENCES core.roles (id),
    full_name   text NOT NULL,
    email       text NOT NULL,
    phone       text,
    designation text,
    -- Who this person reports to. NULL only for the person at the top.
    -- Approvals and escalations travel up this line; visibility travels down it.
    reports_to  uuid REFERENCES core.members (id),
    -- Own PO ceiling; NULL here means "use the role's default".
    po_limit    numeric(14,2) CHECK (po_limit IS NULL OR po_limit >= 0),
    po_limit_is_unlimited boolean NOT NULL DEFAULT false,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, user_id),
    CHECK (reports_to IS NULL OR reports_to <> id)
);
CREATE INDEX members_reports_to_idx ON core.members (reports_to);
CREATE INDEX members_user_idx ON core.members (user_id);

CREATE TABLE core.member_sites (
    member_id  uuid NOT NULL REFERENCES core.members (id) ON DELETE CASCADE,
    site_id    uuid NOT NULL REFERENCES core.sites (id) ON DELETE CASCADE,
    PRIMARY KEY (member_id, site_id)
);
CREATE INDEX member_sites_site_idx ON core.member_sites (site_id);

-- ---------------------------------------------------------------------------
-- core: vendors, materials, settings, numbering, events
-- ---------------------------------------------------------------------------
CREATE TABLE core.vendors (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES core.companies (id),
    name            text NOT NULL,
    category        text,
    contact_person  text,
    phone           text,
    email           text,
    gstin           text,
    pan             text,
    address         text,
    city            text,
    state           text,
    pincode         text,
    bank_name       text,
    bank_account    text,
    ifsc            text,
    payment_terms   text,
    notes           text,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vendors_company_idx ON core.vendors (company_id);

-- Materials a site may ask for (its bill of quantities)
CREATE TABLE core.site_materials (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    site_id     uuid NOT NULL REFERENCES core.sites (id),
    name        text NOT NULL,
    unit        text NOT NULL,
    hsn         text,
    boq_ref     text,
    boq_qty     numeric(14,3),
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_materials_site_idx ON core.site_materials (site_id);

CREATE TABLE core.settings (
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    key         text NOT NULL,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, key)
);

-- One row per number series, e.g. 'NC-PO-HYD-2627'. The server increments it in
-- the same transaction that creates the document: no gaps, no duplicates.
CREATE TABLE core.counters (
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    series      text NOT NULL,
    last_value  bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, series)
);

-- Append-only log of business events for other modules, automations and AI
CREATE TABLE core.events (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id    uuid NOT NULL REFERENCES core.companies (id),
    event_type    text NOT NULL,                 -- 'indent.approved', 'po.issued' ...
    entity_type   text NOT NULL,
    entity_id     uuid,
    actor_id      uuid REFERENCES core.members (id),
    payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    processed_at  timestamptz
);
CREATE INDEX events_unprocessed_idx ON core.events (id) WHERE processed_at IS NULL;
CREATE INDEX events_entity_idx ON core.events (entity_type, entity_id);

CREATE TABLE core.notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    member_id   uuid NOT NULL REFERENCES core.members (id),
    title       text NOT NULL,
    message     text NOT NULL,
    link        text,
    is_read     boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_member_idx ON core.notifications (member_id, is_read, created_at DESC);

-- ---------------------------------------------------------------------------
-- indent: indents
-- ---------------------------------------------------------------------------
CREATE TABLE indent.indents (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    uuid NOT NULL REFERENCES core.companies (id),
    site_id       uuid NOT NULL REFERENCES core.sites (id),
    number        text,                                   -- NC-IND-GCB-2627-0042, given on first submission
    status        text NOT NULL DEFAULT 'draft' CHECK (status IN (
                      'draft', 'pending_approval', 'returned', 'rejected', 'approved',
                      'in_procurement', 'completed', 'cancelled')),
    priority      text NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'low')),
    required_date date,
    remarks       text,
    created_by    uuid NOT NULL REFERENCES core.members (id),
    -- The one person who has to act next (approver, or the buyer once approved)
    waiting_on    uuid REFERENCES core.members (id),
    assigned_to   uuid REFERENCES core.members (id),     -- buyer handling it
    approved_by   uuid REFERENCES core.members (id),
    approved_at   timestamptz,
    submitted_at  timestamptz,
    completed_at  timestamptz,
    revision      integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, number)
);
CREATE INDEX indents_company_status_idx ON indent.indents (company_id, status, created_at DESC);
CREATE INDEX indents_site_idx ON indent.indents (site_id, created_at DESC);
CREATE INDEX indents_created_by_idx ON indent.indents (created_by);
CREATE INDEX indents_waiting_on_idx ON indent.indents (waiting_on) WHERE waiting_on IS NOT NULL;

-- Each item tracks what was asked, ordered, dispatched without a PO, and received.
-- One indent can therefore be served by several purchase orders.
CREATE TABLE indent.indent_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES core.companies (id),
    indent_id       uuid NOT NULL REFERENCES indent.indents (id) ON DELETE CASCADE,
    position        integer NOT NULL DEFAULT 0,
    material_id     uuid REFERENCES core.site_materials (id),
    description     text NOT NULL,
    unit            text NOT NULL,
    quantity        numeric(14,3) NOT NULL CHECK (quantity > 0),
    is_boq          boolean NOT NULL DEFAULT true,
    non_boq_reason  text,
    remarks         text,
    ordered_qty     numeric(14,3) NOT NULL DEFAULT 0 CHECK (ordered_qty >= 0),      -- on live POs
    dispatched_qty  numeric(14,3) NOT NULL DEFAULT 0 CHECK (dispatched_qty >= 0),   -- sent without a PO
    received_qty    numeric(14,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
    closed_short    boolean NOT NULL DEFAULT false                                   -- balance will not be supplied
);
CREATE INDEX indent_items_indent_idx ON indent.indent_items (indent_id);

-- ---------------------------------------------------------------------------
-- indent: purchase orders
-- ---------------------------------------------------------------------------
CREATE TABLE indent.purchase_orders (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       uuid NOT NULL REFERENCES core.companies (id),
    indent_id        uuid NOT NULL REFERENCES indent.indents (id),
    office_id        uuid NOT NULL REFERENCES core.offices (id),
    vendor_id        uuid NOT NULL REFERENCES core.vendors (id),
    number           text,                                -- NC-PO-HYD-2627-0042, given when first sent or issued
    status           text NOT NULL DEFAULT 'draft' CHECK (status IN (
                         'draft', 'pending_approval', 'approved', 'issued',
                         'partially_fulfilled', 'fulfilled', 'closed', 'cancelled')),
    version          integer NOT NULL DEFAULT 1,
    delivery_date    date,
    payment_terms    text,
    delivery_address text,
    remarks          text,
    no_quote_reason  text,
    total_amount     numeric(14,2) NOT NULL DEFAULT 0,    -- including GST; calculated by the server
    created_by       uuid NOT NULL REFERENCES core.members (id),
    waiting_on       uuid REFERENCES core.members (id),   -- approver it is with
    approved_by      uuid REFERENCES core.members (id),
    approval_remarks text,
    approval_route   text CHECK (approval_route IN ('direct', 'approved')),
    issued_by        uuid REFERENCES core.members (id),
    issued_at        timestamptz,
    closed_by        uuid REFERENCES core.members (id),
    closed_at        timestamptz,
    close_remarks    text,
    rejection_reason text,
    cancel_reason    text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, number)
);
CREATE INDEX po_company_status_idx ON indent.purchase_orders (company_id, status, created_at DESC);
CREATE INDEX po_indent_idx ON indent.purchase_orders (indent_id);
CREATE INDEX po_waiting_on_idx ON indent.purchase_orders (waiting_on) WHERE waiting_on IS NOT NULL;

CREATE TABLE indent.po_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES core.companies (id),
    po_id           uuid NOT NULL REFERENCES indent.purchase_orders (id) ON DELETE CASCADE,
    indent_item_id  uuid REFERENCES indent.indent_items (id),   -- NULL = added by procurement, not on the indent
    position        integer NOT NULL DEFAULT 0,
    description     text NOT NULL,
    unit            text NOT NULL,
    hsn             text,
    quantity        numeric(14,3) NOT NULL CHECK (quantity > 0),
    rate            numeric(14,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
    gst_percent     numeric(5,2) NOT NULL DEFAULT 18 CHECK (gst_percent >= 0),
    over_order_reason text,                                      -- required when more than the indent asked for
    received_qty    numeric(14,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0)
);
CREATE INDEX po_items_po_idx ON indent.po_items (po_id);
CREATE INDEX po_items_indent_item_idx ON indent.po_items (indent_item_id);

CREATE TABLE indent.po_versions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    uuid NOT NULL REFERENCES core.companies (id),
    po_id         uuid NOT NULL REFERENCES indent.purchase_orders (id) ON DELETE CASCADE,
    version       integer NOT NULL,
    snapshot      jsonb NOT NULL,                        -- the PO and its items as they stood
    changed_by    uuid REFERENCES core.members (id),
    reason        text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX po_versions_po_idx ON indent.po_versions (po_id, version);

-- ---------------------------------------------------------------------------
-- indent: dispatch without a PO, and receipts
-- ---------------------------------------------------------------------------
CREATE TABLE indent.dispatches (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid NOT NULL REFERENCES core.companies (id),
    indent_id      uuid NOT NULL REFERENCES indent.indents (id),
    source         text NOT NULL,                         -- vendor name, 'Own stock', another site
    expected_date  date,
    doc_reference  text,
    notes          text NOT NULL,
    created_by     uuid NOT NULL REFERENCES core.members (id),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE indent.dispatch_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES core.companies (id),
    dispatch_id     uuid NOT NULL REFERENCES indent.dispatches (id) ON DELETE CASCADE,
    indent_item_id  uuid NOT NULL REFERENCES indent.indent_items (id),
    quantity        numeric(14,3) NOT NULL CHECK (quantity > 0),
    received_qty    numeric(14,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0)
);

-- A receipt (goods receipt note) is against a PO or against a dispatch
CREATE TABLE indent.receipts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   uuid NOT NULL REFERENCES core.companies (id),
    site_id      uuid NOT NULL REFERENCES core.sites (id),
    number       text NOT NULL,                           -- NC-GRN-GCB-2627-0042
    po_id        uuid REFERENCES indent.purchase_orders (id),
    dispatch_id  uuid REFERENCES indent.dispatches (id),
    remarks      text,
    received_by  uuid NOT NULL REFERENCES core.members (id),
    received_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id, number),
    CHECK ((po_id IS NOT NULL) <> (dispatch_id IS NOT NULL))
);
CREATE INDEX receipts_po_idx ON indent.receipts (po_id);
CREATE INDEX receipts_site_idx ON indent.receipts (site_id, received_at DESC);

CREATE TABLE indent.receipt_items (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        uuid NOT NULL REFERENCES core.companies (id),
    receipt_id        uuid NOT NULL REFERENCES indent.receipts (id) ON DELETE CASCADE,
    po_item_id        uuid REFERENCES indent.po_items (id),
    dispatch_item_id  uuid REFERENCES indent.dispatch_items (id),
    quantity          numeric(14,3) NOT NULL CHECK (quantity > 0),
    condition         text NOT NULL DEFAULT 'Good' CHECK (condition IN ('Good', 'Damaged', 'Partially Damaged', 'Rejected')),
    quality_remarks   text,
    remarks           text,
    CHECK ((po_item_id IS NOT NULL) <> (dispatch_item_id IS NOT NULL))
);
CREATE INDEX receipt_items_receipt_idx ON indent.receipt_items (receipt_id);

-- ---------------------------------------------------------------------------
-- indent: files, comments, timeline
-- ---------------------------------------------------------------------------
CREATE TABLE indent.documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES core.companies (id),
    indent_id       uuid REFERENCES indent.indents (id) ON DELETE CASCADE,
    indent_item_id  uuid REFERENCES indent.indent_items (id) ON DELETE SET NULL,
    po_id           uuid REFERENCES indent.purchase_orders (id) ON DELETE CASCADE,
    receipt_id      uuid REFERENCES indent.receipts (id) ON DELETE CASCADE,
    category        text NOT NULL,                        -- Drawing, Sketch, Quotation, Photo ...
    file_name       text NOT NULL,
    storage_path    text NOT NULL,                        -- in the private bucket 'mis-files'
    mime_type       text,
    size_bytes      bigint,
    uploaded_by     uuid NOT NULL REFERENCES core.members (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (indent_id IS NOT NULL OR po_id IS NOT NULL OR receipt_id IS NOT NULL)
);
CREATE INDEX documents_indent_idx ON indent.documents (indent_id);
CREATE INDEX documents_po_idx ON indent.documents (po_id);

CREATE TABLE indent.comments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    indent_id   uuid NOT NULL REFERENCES indent.indents (id) ON DELETE CASCADE,
    author_id   uuid NOT NULL REFERENCES core.members (id),
    body        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_indent_idx ON indent.comments (indent_id, created_at);

-- Every action on an indent or PO, with who, when and their remarks
CREATE TABLE indent.activity (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_id  uuid NOT NULL REFERENCES core.companies (id),
    indent_id   uuid REFERENCES indent.indents (id) ON DELETE CASCADE,
    po_id       uuid REFERENCES indent.purchase_orders (id) ON DELETE CASCADE,
    action      text NOT NULL,                            -- 'submitted', 'approved', 'escalated' ...
    actor_id    uuid REFERENCES core.members (id),
    remarks     text,
    details     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_indent_idx ON indent.activity (indent_id, created_at);
CREATE INDEX activity_po_idx ON indent.activity (po_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
    FOR t IN
        SELECT table_schema, table_name FROM information_schema.columns
         WHERE table_schema IN ('core', 'indent') AND column_name = 'updated_at'
    LOOP
        EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I.%I
                        FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at()', t.table_schema, t.table_name);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Lock the door: nothing here is reachable from the browser
-- ---------------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
    FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('core', 'indent')
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    END LOOP;
END $$;

REVOKE ALL ON SCHEMA core, indent FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA core, indent FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA core, indent FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA core, indent FROM PUBLIC, anon, authenticated;

-- Private bucket for every attached file; the server hands out short-lived links
INSERT INTO storage.buckets (id, name, public) VALUES ('mis-files', 'mis-files', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
