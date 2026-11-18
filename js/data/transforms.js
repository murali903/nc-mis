

// ============================================================================
// DATA LAYER (Supabase-backed)
// ============================================================================

// Helper: convert snake_case DB rows to camelCase app state
function snakeToCamel(str) {
    return str.replace(/_([a-z])/g, function(m, p1) { return p1.toUpperCase(); });
}

function transformRow(row) {
    if (!row || typeof row !== 'object') return row;
    if (Array.isArray(row)) return row.map(function(r) { return transformRow(r); });
    var result = {};
    var keys = Object.keys(row);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var camelKey = snakeToCamel(key);
        var val = row[key];
        // Don't recurse into nested arrays/objects that are already transformed by Supabase joins
        if (Array.isArray(val)) {
            result[camelKey] = val.map(function(item) {
                return typeof item === 'object' && item !== null ? transformRow(item) : item;
            });
        } else if (val && typeof val === 'object' && !(val instanceof Date)) {
            result[camelKey] = transformRow(val);
        } else {
            result[camelKey] = val;
        }
    }
    return result;
}

function transformProfile(row) {
    return {
        id: row.id,
        name: row.full_name || row.name || '',
        email: row.email || '',
        role: row.role || 'site_engineer',
        phone: row.phone || '',
    };
}

function transformSite(row) {
    return {
        id: row.id,
        name: row.name,
        location: row.location || '',
        officeId: row.office_id || '',
    };
}

function transformVendor(row) {
    return {
        id: row.id,
        name: row.name || '',
        contactPerson: row.contact_person || '',
        phone: row.phone || '',
        email: row.email || '',
        gstin: row.gstin || '',
        pan: row.pan || '',
        address: row.address || '',
        city: row.city || '',
        state: row.state || '',
        pincode: row.pincode || '',
        bankAccount: row.bank_account || '',
        bankName: row.bank_name || '',
        ifsc: row.ifsc || '',
        defaultPaymentTerms: row.default_payment_terms || 30,
        category: row.category || '',
        notes: row.notes || '',
    };
}

function transformIndent(row) {
    var indent = {
        id: row.id,
        displayNumber: row.indent_number || '',
        siteId: row.site_id,
        createdBy: row.created_by,
        createdAt: row.created_at,
        status: row.status,
        priority: row.priority || 'normal',
        requiredDate: row.required_date || undefined,
        assignedTo: row.assigned_to || undefined,
        submittedAt: row.submitted_at || undefined,
        rejectionReason: row.rejection_reason || undefined,
        returnReason: row.return_reason || undefined,
        escalationRemarks: row.escalation_remarks || undefined,
        escalatedBy: row.escalated_by || undefined,
        approvedBy: row.approved_by || undefined,
        mdRemarks: row.md_remarks || undefined,
        mdEscalationResult: row.md_escalation_result || undefined,
        linkedPO: row.linked_po || undefined,
        externalPO: row.external_po || undefined,
        isRevised: row.is_revised || undefined,
        revisionCount: row.revision_count || 0,
        description: row.description || '',
        remarks: row.notes || row.description || '',
        notes: row.notes || '',
        lineItems: (row.indent_line_items || []).map(function(li) {
            return {
                id: li.id,
                name: li.description || '',
                description: li.description || '',
                qty: li.qty || li.quantity || 0,
                unit: li.unit || '',
                received: li.received || 0,
                isBoq: li.is_boq !== undefined ? li.is_boq : true,
                isBoqItem: li.is_boq !== undefined ? li.is_boq : true,
                nonBoqReason: li.non_boq_reason || undefined,
            };
        }),
        comments: (row.indent_comments || []).map(function(c) {
            return {
                id: c.id,
                author: c.author || c.user_id,
                text: c.text || c.content || '',
                createdAt: c.created_at,
            };
        }),
        activityLog: (row.indent_activity || []).map(function(a) {
            return {
                action: a.action,
                by: a.by || a.user_id,
                at: a.at || a.created_at,
                note: a.note || '',
            };
        }),
        documents: (row.indent_documents || []).map(function(d) {
            return {
                id: d.id,
                name: d.name || d.file_name || '',
                category: d.category || '',
                storagePath: d.storage_path || '',
                uploadedBy: d.uploaded_by || '',
                uploadedAt: d.uploaded_at || d.created_at || '',
                size: d.size || 0,
                mimeType: d.mime_type || '',
                lineItemId: d.line_item_id || null,
                poId: d.po_id || null,
            };
        }),
    };
    return indent;
}

// POs loaded from the DB carry only vendor_id; fill in the vendor name and a
// total (from line items when the stored total is missing) for display.
// GST-inclusive total for a PO line (falls back to amount for older in-memory items)
function lineTotal(li) {
    if (!li) return 0;
    return (li.amountWithGst !== undefined && li.amountWithGst !== null) ? (Number(li.amountWithGst) || 0) : (Number(li.amount) || 0);
}

function hydratePOs(pos, vendors) {
    return (pos || []).map(function(po) {
        var patch = {};
        if (!po.vendorName) {
            var v = (vendors || []).find(function(x) { return x.id === po.vendorId; });
            if (v) patch.vendorName = v.name;
        }
        if (!po.totalAmount && po.lineItems && po.lineItems.length) {
            patch.totalAmount = po.lineItems.reduce(function(sum, li) { return sum + (li.amountWithGst || 0); }, 0);
        }
        return (patch.vendorName !== undefined || patch.totalAmount !== undefined) ? Object.assign({}, po, patch) : po;
    });
}

function transformPO(row) {
    return {
        id: row.id,
        poNumber: row.po_number || row.id,
        indentId: row.indent_id,
        vendorId: row.vendor_id,
        status: row.status || 'draft',
        createdAt: row.created_at,
        createdBy: row.created_by,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
        submittedAt: row.submitted_at,
        submittedBy: row.submitted_by,
        approvedAt: row.approved_at,
        approvedBy: row.approved_by,
        issuedAt: row.issued_at,
        issuedBy: row.issued_by,
        closedAt: row.closed_at,
        closedBy: row.closed_by,
        cancelledAt: row.cancelled_at,
        cancelledBy: row.cancelled_by,
        cancelReason: row.cancel_reason || '',
        rejectReason: row.reject_reason || '',
        mdRejectReason: row.remarks || '',
        version: row.version || 1,
        deliveryDate: row.delivery_date || '',
        paymentTerms: row.payment_terms || '',
        deliveryAddress: row.delivery_address || '',
        notes: row.notes || '',
        officeId: row.office_id || '',
        remarks: row.remarks || '',
        mdRemarks: row.md_remarks || '',
        closeRemarks: row.close_remarks || '',
        approvalRoute: row.approval_route || '',
        noQuoteReason: row.no_quote_reason || '',
        vendorName: row.vendor_name || '',
        totalAmount: Number(row.total_amount) || 0,
        lineItems: (row.po_line_items || []).slice().sort(function(a, b) {
            return (a.sort_order || 0) - (b.sort_order || 0);
        }).map(function(li) {
            // The DB stores only quantity, unit price and GST %; amounts are derived here
            var _qty = Number(li.quantity || li.qty) || 0;
            var _rate = Number(li.unit_price || li.rate) || 0;
            var _gstPct = (li.gst_percent !== undefined && li.gst_percent !== null) ? Number(li.gst_percent) : 18;
            var _base = _qty * _rate;
            var _gstAmt = _base * _gstPct / 100;
            return {
                id: li.id,
                name: li.description || '',
                description: li.description || '',
                quantity: _qty,
                qty: _qty,
                unit: li.unit || '',
                rate: _rate,
                unitPrice: _rate,
                amount: _base, // before GST; amountWithGst is the line total
                gstPercent: _gstPct,
                gstAmount: _gstAmt,
                amountWithGst: _base + _gstAmt,
                receivedQty: Number(li.received_qty) || 0,
                hsn: li.hsn || '',
            };
        }),
        versionHistory: (row.po_version_history || []).slice().sort(function(a, b) {
            return (a.version || 0) - (b.version || 0);
        }).map(function(v) {
            return {
                version: v.version,
                editedBy: v.edited_by,
                editedAt: v.created_at,
                totalAmount: Number(v.total_amount) || 0,
                changesSummary: v.changes_summary || '',
            };
        }),
    };
}

function transformGRN(row) {
    return {
        id: row.id,
        grnNumber: row.grn_number || '',
        poId: row.po_id,
        receivedBy: row.received_by,
        remarks: row.remarks || '',
        createdAt: row.created_at,
        photoUrl: row.photo_url || '',
        items: (row.grn_items || []).map(function(gi) {
            return {
                id: gi.id,
                poLineItemId: gi.po_line_item_id,
                quantityReceived: gi.quantity_received || 0,
                remarks: gi.remarks || '',
                condition: gi.condition || 'Good',
                qualityRemarks: gi.quality_remarks || '',
            };
        }),
        // Legacy flat fields for backward compat
        lineItemId: row.line_item_id,
        quantityReceived: row.quantity_received || 0,
        receivedAt: row.received_at || row.created_at,
    };
}

function transformOffice(row) {
    return {
        id: row.id,
        name: row.name || '',
        city: row.city || '',
        state: row.state || '',
        address: row.address || '',
        gstin: row.gstin || '',
        pan: row.pan || '',
        phone: row.phone || '',
        email: row.email || '',
    };
}

// DB key -> settings form field (and back) for the Organisation Settings screen
var ORG_SETTING_FIELDS = {
    company_name: 'companyName',
    company_email: 'senderEmail',
    company_address: 'companyAddress',
    company_gstin: 'companyGSTIN',
    company_phone: 'companyPhone',
    pan_number: 'companyPAN',
};
var ORG_SETTING_KEYS = {};
Object.keys(ORG_SETTING_FIELDS).forEach(function(k) { ORG_SETTING_KEYS[ORG_SETTING_FIELDS[k]] = k; });

function transformOrgSettings(rows) {
    var result = {};
    if (Array.isArray(rows)) {
        rows.forEach(function(row) {
            if (row.key && row.value !== undefined) {
                result[snakeToCamel(row.key)] = row.value;
                // Form field names that do not match the automatic key conversion
                if (ORG_SETTING_FIELDS[row.key]) result[ORG_SETTING_FIELDS[row.key]] = row.value;
            }
        });
    }
    return result;
}

function transformSiteAssignments(rows) {
    var result = {};
    if (Array.isArray(rows)) {
        rows.forEach(function(row) {
            var userId = row.user_id || row.userId;
            var siteId = row.site_id || row.siteId;
            if (!result[userId]) result[userId] = [];
            if (siteId && result[userId].indexOf(siteId) === -1) {
                result[userId].push(siteId);
            }
        });
    }
    return result;
}

function transformBoqLists(rows) {
    var result = {};
    if (Array.isArray(rows)) {
        rows.forEach(function(row) {
            var siteId = row.site_id || row.siteId;
            if (!result[siteId]) result[siteId] = [];
            result[siteId].push({
                id: row.id,
                name: row.name || row.description || '',
                unit: row.unit || '',
                category: row.category || '',
                hsn: row.hsn || row.serial_no || '',
                rate: row.rate || 0,
            });
        });
    }
    return result;
}
