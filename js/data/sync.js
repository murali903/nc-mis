
async function supabaseSync(action, state, postState) {
    try {
        switch (action.type) {
            case 'CREATE_INDENT': {
                var indent = action.payload;
                var indentRow = {
                    id: indent.id,
                    site_id: indent.siteId,
                    created_by: indent.createdBy,
                    created_at: indent.createdAt,
                    status: 'draft',   // submission is done by indent_flow.indent_submit below
                    priority: indent.priority || 'normal',
                    required_date: indent.requiredDate || null,
                    submitted_at: null,
                    description: indent.remarks || indent.description || '',
                    notes: indent.remarks || indent.notes || '',
                };
                // Try insert; if column missing, retry without problematic columns
                var indentRes = await supabaseClient.schema('indent_flow').from('indents').insert(indentRow);
                if (indentRes.error && indentRes.error.message && indentRes.error.code === 'PGRST204') {
                    var missingCol = indentRes.error.message;
                    console.warn('[NC_MIS] Column not found, retrying without it:', missingCol);
                    // Remove columns that might not exist yet
                    if (missingCol.indexOf('required_date') !== -1) delete indentRow.required_date;
                    if (missingCol.indexOf('submitted_at') !== -1) delete indentRow.submitted_at;
                    indentRes = await supabaseClient.schema('indent_flow').from('indents').insert(indentRow);
                    // If still failing with another missing column, try removing both
                    if (indentRes.error && indentRes.error.code === 'PGRST204') {
                        console.warn('[NC_MIS] Still failing, removing all optional columns');
                        delete indentRow.required_date;
                        delete indentRow.submitted_at;
                        indentRes = await supabaseClient.schema('indent_flow').from('indents').insert(indentRow);
                    }
                }
                sbCheck(indentRes, 'insert indent');

                if (indent.lineItems && indent.lineItems.length > 0) {
                    var liRows = indent.lineItems.map(function(li) {
                        return {
                            id: li.id,
                            indent_id: indent.id,
                            description: li.name || li.description,
                            qty: li.qty,
                            unit: li.unit,
                            received: li.received || 0,
                            is_boq: li.isBoqItem !== false && li.isBoq !== false,
                            non_boq_reason: li.nonBoqReason || null,
                        };
                    });
                    sbCheck(await supabaseClient.schema('indent_flow').from('indent_line_items').insert(liRows), 'insert line items');
                }

                sbCheck(await supabaseClient.schema('indent_flow').from('indent_activity').insert({
                    indent_id: indent.id,
                    action: 'Created',
                    user_id: indent.createdBy,
                    note: '',
                }), 'insert activity');

                if (indent.status === 'pending_approval') {
                    await callFlow('indent_submit', { p_indent_id: indent.id });
                }
                console.log('[NC_MIS] Indent ' + indent.id + ' synced to Supabase successfully');
                break;
            }

            // ── Indent lifecycle: every status change is one database function
            // (indent_flow.indent_*), which checks role and status and writes the
            // indent, its timeline, notifications and the event log together.
            case 'SUBMIT_INDENT': {
                await callFlow('indent_submit', { p_indent_id: action.payload.indentId });
                break;
            }

            case 'APPROVE_INDENT': {
                await callFlow('indent_approve', { p_indent_id: action.payload.indentId, p_note: action.payload.note || '' });
                break;
            }

            case 'REJECT_INDENT': {
                await callFlow('indent_reject', {
                    p_indent_id: action.payload.indentId,
                    p_reason: action.payload.reason || '',
                    p_return: !!action.payload.returnForRevision,
                });
                break;
            }

            case 'ESCALATE_TO_MD': {
                await callFlow('indent_escalate', { p_indent_id: action.payload.indentId, p_remarks: action.payload.remarks || '' });
                break;
            }

            case 'ASSIGN_INDENT': {
                await callFlow('indent_assign', { p_indent_id: action.payload.indentId, p_user_id: action.payload.userId });
                break;
            }

            case 'REVISE_RESUBMIT': {
                await safeIndentUpdate(action.payload.indentId, {
                    is_revised: true,
                    revision_count: (action.payload.revisionCount || 0) + 1,
                    notes: action.payload.notes || '',
                }, 'revise indent');

                // Delete old line items and insert new ones
                sbCheck(await supabaseClient.schema('indent_flow').from('indent_line_items')
                    .delete().eq('indent_id', action.payload.indentId), 'delete old line items');

                if (action.payload.lineItems && action.payload.lineItems.length > 0) {
                    var revLiRows = action.payload.lineItems.map(function(li) {
                        return {
                            id: li.id,
                            indent_id: action.payload.indentId,
                            description: li.name || li.description,
                            qty: li.qty,
                            unit: li.unit,
                            received: li.received || 0,
                            is_boq: li.isBoqItem !== false && li.isBoq !== false,
                            non_boq_reason: li.nonBoqReason || null,
                        };
                    });
                    sbCheck(await supabaseClient.schema('indent_flow').from('indent_line_items').insert(revLiRows), 'insert revised line items');
                }


                if (action.payload.remarks) {
                    sbCheck(await supabaseClient.schema('indent_flow').from('indent_comments').insert({
                        indent_id: action.payload.indentId,
                        user_id: action.payload.revisedBy,
                        content: action.payload.remarks,
                    }), 'revise comment');
                }

                // Status change, timeline entry and notifications
                await callFlow('indent_submit', { p_indent_id: action.payload.indentId });
                break;
            }

            case 'ADD_COMMENT': {
                sbCheck(await supabaseClient.schema('indent_flow').from('indent_comments').insert({
                    indent_id: action.payload.indentId,
                    user_id: action.payload.author,
                    content: action.payload.text,
                }), 'add comment');
                break;
            }

            case 'ADD_DOCUMENT': {
                var doc = action.payload.document;
                sbCheck(await supabaseClient.schema('indent_flow').from('indent_documents').insert({
                    id: doc.id,
                    indent_id: action.payload.indentId,
                    file_name: doc.name,
                    category: doc.category || '',
                    storage_path: doc.storagePath || doc.data || '',
                    uploaded_by: state.currentUserId,
                    size: doc.size || 0,
                    mime_type: doc.mimeType || '',
                }), 'add document');

                sbCheck(await supabaseClient.schema('indent_flow').from('indent_activity').insert({
                    indent_id: action.payload.indentId,
                    action: 'Document Uploaded',
                    user_id: state.currentUserId,
                    note: doc.name + ' (' + (doc.category || 'general') + ')',
                }), 'doc upload activity');
                break;
            }

            case 'DELETE_DOCUMENT': {
                sbCheck(await supabaseClient.schema('indent_flow').from('indent_documents')
                    .delete().eq('id', action.payload.documentId), 'delete document');

                sbCheck(await supabaseClient.schema('indent_flow').from('indent_activity').insert({
                    indent_id: action.payload.indentId,
                    action: 'Document Removed',
                    user_id: state.currentUserId,
                    note: action.payload.documentName || '',
                }), 'doc delete activity');
                break;
            }

            case 'CREATE_PO': {
                var po = action.payload.po;
                var poRow = {
                    id: po.id,
                    po_number: po.poNumber || ('PO-' + po.id.slice(0, 8).toUpperCase()),
                    indent_id: action.payload.indentId,
                    vendor_id: po.vendorId,
                    status: po.status || 'draft',
                    created_by: state.currentUserId,
                    version: 1,
                    delivery_date: po.deliveryDate || null,
                    payment_terms: po.paymentTerms || '',
                    delivery_address: po.deliveryAddress || '',
                    notes: po.notes || '',
                    office_id: po.officeId || null,
                    total_amount: po.totalAmount || 0,
                };
                sbCheck(await supabaseClient.schema('indent_flow').from('purchase_orders').insert(poRow), 'insert PO');

                if (po.lineItems && po.lineItems.length > 0) {
                    var poLiRows = po.lineItems.map(function(li) {
                        return {
                            id: li.id,
                            po_id: po.id,
                            description: li.description || '',
                            quantity: Number(li.quantity || li.qty) || 0,
                            unit: li.unit || '',
                            unit_price: Number(li.rate !== undefined ? li.rate : li.unitPrice) || 0,
                            gst_percent: li.gstPercent !== undefined ? li.gstPercent : 18,
                            hsn: li.hsn || '',
                        };
                    });
                    sbCheck(await supabaseClient.schema('indent_flow').from('po_line_items').insert(poLiRows), 'insert PO line items');
                }

                await safeIndentUpdate(action.payload.indentId,
                    { status: 'po_draft', linked_po: po.id },
                    'link PO to indent');

                sbCheck(await supabaseClient.schema('indent_flow').from('indent_activity').insert({
                    indent_id: action.payload.indentId,
                    action: 'PO Created',
                    user_id: state.currentUserId,
                    note: 'PO ' + (po.poNumber || po.id) + ' created',
                }), 'PO create activity');
                break;
            }

            case 'UPDATE_PO': {
                var updates = action.payload.updates || {};
                var dbUpdates = {};
                if (updates.vendorId !== undefined) dbUpdates.vendor_id = updates.vendorId;
                if (updates.deliveryDate !== undefined) dbUpdates.delivery_date = updates.deliveryDate;
                if (updates.paymentTerms !== undefined) dbUpdates.payment_terms = updates.paymentTerms;
                if (updates.deliveryAddress !== undefined) dbUpdates.delivery_address = updates.deliveryAddress;
                if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
                if (updates.officeId !== undefined) dbUpdates.office_id = updates.officeId || null;
                if (updates.totalAmount !== undefined) dbUpdates.total_amount = updates.totalAmount || 0;
                if (updates.remarks !== undefined) dbUpdates.remarks = updates.remarks;
                // The reducer bumps the version on every edit; persist it (state is pre-reducer)
                var _updPo = (state.purchaseOrders || []).find(function(p) { return p.id === action.payload.poId; });
                if (_updPo) dbUpdates.version = (_updPo.version || 1) + 1;
                dbUpdates.updated_at = new Date().toISOString();

                await updatePO(action.payload.poId, dbUpdates, 'update PO');
                await savePOVersionHistory(_updPo, state.currentUserId, action.payload.note || 'Edited');

                if (updates.lineItems) {
                    sbCheck(await supabaseClient.schema('indent_flow').from('po_line_items')
                        .delete().eq('po_id', action.payload.poId), 'delete old PO line items');
                    var updPoLi = updates.lineItems.map(function(li) {
                        return {
                            id: li.id,
                            po_id: action.payload.poId,
                            description: li.description || '',
                            quantity: Number(li.quantity || li.qty) || 0,
                            unit: li.unit || '',
                            unit_price: Number(li.rate !== undefined ? li.rate : li.unitPrice) || 0,
                            gst_percent: li.gstPercent !== undefined ? li.gstPercent : 18,
                            hsn: li.hsn || '',
                        };
                    });
                    sbCheck(await supabaseClient.schema('indent_flow').from('po_line_items').insert(updPoLi), 'insert updated PO line items');
                }
                break;
            }

            // ── PO lifecycle: every action is one database function (indent_flow.po_*).
            // The function checks role and status and writes the PO, the linked indent,
            // the timeline, notifications and the event log in a single transaction.
            case 'SUBMIT_PO_FOR_APPROVAL':
            case 'REQUEST_MD_PO_APPROVAL': {
                await callFlow('po_submit', { p_po_id: action.payload.poId });
                break;
            }

            case 'MD_APPROVE_PO':
            case 'APPROVE_PO': {
                await callFlow('po_approve', { p_po_id: action.payload.poId });
                break;
            }

            case 'MD_REJECT_PO':
            case 'REJECT_PO': {
                await callFlow('po_reject', { p_po_id: action.payload.poId, p_reason: action.payload.reason || '' });
                break;
            }

            case 'ISSUE_PO':
            case 'FINALIZE_PO': {
                await callFlow('po_issue', { p_po_id: action.payload.poId });
                break;
            }

            case 'AMEND_PO': {
                await callFlow('po_amend', { p_po_id: action.payload.poId });
                break;
            }

            case 'CLOSE_PO': {
                await callFlow('po_close', { p_po_id: action.payload.poId });
                break;
            }

            case 'CANCEL_PO': {
                await callFlow('po_cancel', { p_po_id: action.payload.poId, p_reason: action.payload.reason || '' });
                break;
            }

            case 'RECEIVE_AGAINST_PO': {
                await callFlow('po_receive', {
                    p_po_id: action.payload.poId,
                    p_receipts: (action.payload.receipts || []).map(function(r) {
                        return {
                            line_item_id: r.lineItemId,
                            quantity: parseFloat(r.quantityReceived) || 0,
                            condition: r.condition || 'Good',
                            quality_remarks: r.qualityRemarks || '',
                            remarks: r.remarks || '',
                        };
                    }),
                    p_remarks: action.payload.remarks || '',
                    p_photo_url: action.payload.photoUrl || '',
                });
                // The GRN number is assigned by the database: reload so the screen shows it
                action._reload = true;
                break;
            }

            case 'MARK_DISPATCHED': {
                var _md = (typeof action.payload === 'string') ? { indentId: action.payload } : (action.payload || {});
                await callFlow('indent_dispatch', {
                    p_indent_id: _md.indentId,
                    p_vendor: _md.vendorName || _md.dispatchVendor || '',
                    p_expected_delivery: _md.expectedDelivery || _md.dispatchETA || '',
                    p_doc_reference: _md.docReference || '',
                    p_notes: _md.notes || _md.dispatchNotes || '',
                });
                break;
            }

            case 'RECEIVE_ITEMS': {
                await callFlow('indent_receive', {
                    p_indent_id: action.payload.indentId,
                    p_items: (action.payload.receipts || []).map(function(r) {
                        return {
                            line_item_id: r.lineItemId,
                            quantity: parseFloat(r.quantity) || 0,
                            condition: r.condition || 'Good',
                            quality_remarks: r.qualityRemarks || '',
                        };
                    }),
                    p_photo_url: action.payload.photoUrl || '',
                });
                action._reload = true;
                break;
            }

            case 'SUBMIT_DRAFT': {
                var draftId = typeof action.payload === 'string' ? action.payload : action.payload.indentId;
                await callFlow('indent_submit', { p_indent_id: draftId });
                break;
            }

            case 'UPDATE_DRAFT': {
                await safeIndentUpdate(action.payload.indentId,
                    { description: action.payload.description || '', notes: action.payload.notes || '' },
                    'update draft');

                // Replace line items
                sbCheck(await supabaseClient.schema('indent_flow').from('indent_line_items')
                    .delete().eq('indent_id', action.payload.indentId), 'delete draft line items');

                if (action.payload.lineItems && action.payload.lineItems.length > 0) {
                    var draftLiRows = action.payload.lineItems.map(function(li) {
                        return {
                            id: li.id,
                            indent_id: action.payload.indentId,
                            description: li.name || li.description,
                            qty: li.qty,
                            unit: li.unit,
                            received: 0,
                        };
                    });
                    sbCheck(await supabaseClient.schema('indent_flow').from('indent_line_items').insert(draftLiRows), 'insert draft line items');
                }
                break;
            }

            case 'CLONE_INDENT': {
                // Copies an existing indent's items into a new draft. The new id and
                // number come from this insert, so the screen reloads afterwards.
                var sourceIndent = (state.indents || []).find(function(i) { return i.id === action.payload.sourceIndentId; });
                if (sourceIndent) {
                    var clonedBy = action.payload.clonedBy || state.currentUserId;
                    var cloneId = genUUID();
                    sbCheck(await supabaseClient.schema('indent_flow').from('indents').insert({
                        id: cloneId,
                        site_id: sourceIndent.siteId,
                        created_by: clonedBy,
                        status: 'draft',
                        priority: sourceIndent.priority || 'normal',
                    }), 'clone indent');

                    var cloneLiRows = sourceIndent.lineItems.map(function(li, idx) {
                        return {
                            id: genUUID(),
                            indent_id: cloneId,
                            description: li.name || li.description,
                            qty: li.qty,
                            unit: li.unit,
                            received: 0,
                        };
                    });
                    if (cloneLiRows.length > 0) {
                        sbCheck(await supabaseClient.schema('indent_flow').from('indent_line_items').insert(cloneLiRows), 'clone line items');
                    }

                    sbCheck(await supabaseClient.schema('indent_flow').from('indent_activity').insert({
                        indent_id: cloneId,
                        action: 'Created',
                        user_id: clonedBy,
                        note: 'Copied from ' + (sourceIndent.displayNumber || 'another indent'),
                    }), 'clone activity');
                    action._reload = true;
                } else {
                    throw new Error('The indent to copy from was not found');
                }
                break;
            }

            case 'BULK_APPROVE': {
                var ids = action.payload.indentIds || [];
                for (var bi = 0; bi < ids.length; bi++) {
                    await callFlow('indent_approve', { p_indent_id: ids[bi], p_note: 'Bulk approved with ' + (ids.length - 1) + ' other indent(s)' });
                }
                action._reload = true;
                break;
            }

            case 'ADD_OFFICE': {
                var officeRow = {
                    id: action.payload.id,
                    name: action.payload.name || '',
                    city: action.payload.city || '',
                    state: action.payload.state || '',
                    address: action.payload.address || '',
                    gstin: action.payload.gstin || '',
                    pan: action.payload.pan || '',
                    phone: action.payload.phone || '',
                    email: action.payload.email || '',
                };
                sbCheck(await supabaseClient.schema('core').from('offices').insert(officeRow), 'save ' + action.type);
                break;
            }

            case 'UPDATE_OFFICE': {
                var officeUpdates = {};
                var oUpd = action.payload.updates || {};
                if (oUpd.name !== undefined) officeUpdates.name = oUpd.name;
                if (oUpd.city !== undefined) officeUpdates.city = oUpd.city;
                if (oUpd.state !== undefined) officeUpdates.state = oUpd.state;
                if (oUpd.address !== undefined) officeUpdates.address = oUpd.address;
                if (oUpd.gstin !== undefined) officeUpdates.gstin = oUpd.gstin;
                if (oUpd.pan !== undefined) officeUpdates.pan = oUpd.pan;
                if (oUpd.phone !== undefined) officeUpdates.phone = oUpd.phone;
                if (oUpd.email !== undefined) officeUpdates.email = oUpd.email;
                sbCheck(await supabaseClient.schema('core').from('offices')
                    .update(officeUpdates).eq('id', action.payload.officeId), 'save ' + action.type);
                break;
            }

            case 'DELETE_OFFICE': {
                sbCheck(await supabaseClient.schema('core').from('offices')
                    .update({ is_active: false }).eq('id', action.payload), 'save ' + action.type);
                break;
            }

            case 'UPDATE_ORG_SETTINGS': {
                var settingsKeys = Object.keys(action.payload);
                for (var sk = 0; sk < settingsKeys.length; sk++) {
                    var settKey = settingsKeys[sk];
                    // Convert camelCase to snake_case for DB key
                    var dbKey = ORG_SETTING_KEYS[settKey] || settKey.replace(/([A-Z]+)/g, function(m) { return '_' + m.toLowerCase(); });
                    if (action.payload[settKey] === undefined || action.payload[settKey] === null) continue;
                    sbCheck(await supabaseClient.schema('core').from('org_settings')
                        .upsert({ key: dbKey, value: action.payload[settKey] }, { onConflict: 'key' }), 'save ' + action.type);
                }
                break;
            }

            case 'ADD_NOTIFICATION':
            case 'MARK_NOTIFICATION_READ': {
                if (action.type === 'MARK_NOTIFICATION_READ') {
                    sbCheck(await supabaseClient.schema('indent_flow').from('notifications')
                        .update({ is_read: true }).eq('id', action.payload), 'save ' + action.type);
                }
                break;
            }

            case 'ADD_VENDOR': {
                var v = action.payload;
                sbCheck(await supabaseClient.schema('core').from('vendors').insert({
                    id: v.id,
                    name: v.name || '',
                    contact_person: v.contactPerson || '',
                    phone: v.phone || '',
                    email: v.email || '',
                    gstin: v.gstin || '',
                    pan: v.pan || '',
                    address: v.address || '',
                    city: v.city || '',
                    state: v.state || '',
                    pincode: v.pincode || '',
                    bank_account: v.bankAccount || '',
                    bank_name: v.bankName || '',
                    ifsc: v.ifsc || '',
                    default_payment_terms: v.defaultPaymentTerms || 30,
                    category: v.category || '',
                    notes: v.notes || '',
                }), 'save ' + action.type);
                break;
            }

            case 'EDIT_VENDOR': {
                var vUpd = action.payload.updates || {};
                var vDbUpd = {};
                if (vUpd.name !== undefined) vDbUpd.name = vUpd.name;
                if (vUpd.contactPerson !== undefined) vDbUpd.contact_person = vUpd.contactPerson;
                if (vUpd.phone !== undefined) vDbUpd.phone = vUpd.phone;
                if (vUpd.email !== undefined) vDbUpd.email = vUpd.email;
                if (vUpd.gstin !== undefined) vDbUpd.gstin = vUpd.gstin;
                if (vUpd.pan !== undefined) vDbUpd.pan = vUpd.pan;
                if (vUpd.address !== undefined) vDbUpd.address = vUpd.address;
                if (vUpd.city !== undefined) vDbUpd.city = vUpd.city;
                if (vUpd.state !== undefined) vDbUpd.state = vUpd.state;
                if (vUpd.pincode !== undefined) vDbUpd.pincode = vUpd.pincode;
                if (vUpd.bankAccount !== undefined) vDbUpd.bank_account = vUpd.bankAccount;
                if (vUpd.bankName !== undefined) vDbUpd.bank_name = vUpd.bankName;
                if (vUpd.ifsc !== undefined) vDbUpd.ifsc = vUpd.ifsc;
                if (vUpd.defaultPaymentTerms !== undefined) vDbUpd.default_payment_terms = vUpd.defaultPaymentTerms;
                if (vUpd.category !== undefined) vDbUpd.category = vUpd.category;
                if (vUpd.notes !== undefined) vDbUpd.notes = vUpd.notes;
                sbCheck(await supabaseClient.schema('core').from('vendors')
                    .update(vDbUpd).eq('id', action.payload.vendorId), 'save ' + action.type);
                break;
            }

            case 'DELETE_VENDOR': {
                sbCheck(await supabaseClient.schema('core').from('vendors')
                    .update({ is_active: false }).eq('id', action.payload), 'save ' + action.type);
                break;
            }

            case 'ADD_SITE': {
                var siteRow = {
                    id: action.payload.id,
                    name: action.payload.name || '',
                    location: action.payload.location || '',
                    office_id: action.payload.officeId || null,
                };
                sbCheck(await supabaseClient.schema('core').from('sites').insert(siteRow), 'save ' + action.type);
                break;
            }

            case 'EDIT_SITE': {
                var siteUpd = {};
                if (action.payload.name !== undefined) siteUpd.name = action.payload.name;
                if (action.payload.location !== undefined) siteUpd.location = action.payload.location;
                if (action.payload.officeId) siteUpd.office_id = action.payload.officeId;
                sbCheck(await supabaseClient.schema('core').from('sites')
                    .update(siteUpd).eq('id', action.payload.siteId), 'save ' + action.type);
                break;
            }

            case 'DELETE_SITE': {
                sbCheck(await supabaseClient.schema('core').from('sites')
                    .update({ is_active: false }).eq('id', action.payload), 'save ' + action.type);
                break;
            }

            case 'TOGGLE_SITE_ASSIGNMENT':
            case 'ASSIGN_SITE':
            case 'UNASSIGN_SITE': {
                var saUserId = action.payload.userId;
                var saSiteId = action.payload.siteId;
                if (action.type === 'UNASSIGN_SITE') {
                    sbCheck(await supabaseClient.schema('core').from('site_assignments')
                        .delete().eq('user_id', saUserId).eq('site_id', saSiteId), 'save ' + action.type);
                } else if (action.type === 'ASSIGN_SITE') {
                    sbCheck(await supabaseClient.schema('core').from('site_assignments')
                        .upsert({ user_id: saUserId, site_id: saSiteId }, { onConflict: 'user_id,site_id' }), 'save ' + action.type);
                } else {
                    // TOGGLE
                    var currentAssigns = (state.siteAssignments || {})[saUserId] || [];
                    if (currentAssigns.indexOf(saSiteId) !== -1) {
                        sbCheck(await supabaseClient.schema('core').from('site_assignments')
                            .delete().eq('user_id', saUserId).eq('site_id', saSiteId), 'save ' + action.type);
                    } else {
                        sbCheck(await supabaseClient.schema('core').from('site_assignments')
                            .insert({ user_id: saUserId, site_id: saSiteId }), 'save ' + action.type);
                    }
                }
                break;
            }

            case 'MD_ESCALATION_APPROVE':
            case 'MD_ESCALATION_DISMISS': {
                await callFlow('indent_escalation_decide', {
                    p_indent_id: action.payload.indentId,
                    p_approve: action.type === 'MD_ESCALATION_APPROVE',
                    p_remarks: action.payload.remarks || '',
                });
                break;
            }

            // MD_APPROVE_PO, MD_REJECT_PO, and FINALIZE_PO are handled in the var-based section above

            case 'ATTACH_EXTERNAL_PO': {
                await safeIndentUpdate(action.payload.indentId,
                    { status: 'po_issued', external_po: action.payload.fileName, linked_po: 'external' },
                    'attach external PO');
                break;
            }

            case 'RETURN_FOR_REVISION': {
                await callFlow('indent_reject', { p_indent_id: action.payload.indentId, p_reason: action.payload.reason || '', p_return: true });
                break;
            }

            case 'LOG_ACTIVITY': {
                // Nothing to save: every action that is followed by LOG_ACTIVITY (create,
                // escalate, return, bulk approve) already writes its own activity row, so
                // saving this one too would duplicate it in the indent's timeline.
                break;
            }

            // Cases that don't need DB sync
            case 'LOGIN_AS_USER':
            case 'LOGOUT':
            case 'NAVIGATE':
            case 'SHOW_TOAST':
            case 'HIDE_TOAST':
            case 'LOAD_DATA':
            case 'SET_LOADING':
            case 'SET_AUTHENTICATED':
            case 'SET_OFFLINE':
                break;

            // User management syncs
            case 'ADD_USER': {
                // Server-side function: creates the login, profile and site assignments.
                var newUser = action.payload.user;
                var _newPassword = action.payload.password || '';
                delete action.payload.password;   // never keep it in the action (error logs record the payload)
                var fnRes = await supabaseClient.functions.invoke('admin-create-user', {
                    body: {
                        email: newUser.email,
                        full_name: newUser.name,
                        role: newUser.role,
                        phone: newUser.phone || '',
                        site_ids: action.payload.siteIds || [],
                        password: _newPassword || undefined,
                    },
                });
                if (fnRes.error) {
                    var fnMsg = fnRes.error.message || 'Could not create the user';
                    try {
                        if (fnRes.error.context && typeof fnRes.error.context.json === 'function') {
                            var fnBody = await fnRes.error.context.json();
                            if (fnBody && fnBody.error) fnMsg = fnBody.error;
                        }
                    } catch (parseErr) { /* keep the generic message */ }
                    throw new Error(fnMsg);
                }
                // The server assigned the real user id: reload so the list shows it
                action._reload = true;
                break;
            }

            case 'EDIT_USER': {
                var userUpd = {};
                if (action.payload.name !== undefined) userUpd.full_name = action.payload.name;
                if (action.payload.email !== undefined) userUpd.email = action.payload.email;
                if (action.payload.role !== undefined) userUpd.role = action.payload.role;
                if (action.payload.phone !== undefined) userUpd.phone = action.payload.phone;
                sbCheck(await supabaseClient.schema('core').from('profiles')
                    .update(userUpd).eq('id', action.payload.userId), 'save ' + action.type);
                break;
            }

            case 'DELETE_USER': {
                sbCheck(await supabaseClient.schema('core').from('profiles')
                    .update({ is_active: false }).eq('id', action.payload), 'save ' + action.type);
                break;
            }

            case 'UPDATE_USER': {
                var updFields = {
                    full_name: action.payload.name,
                    phone: action.payload.phone,
                    role: action.payload.role,
                    is_active: action.payload.isActive
                };
                sbCheck(await supabaseClient.schema('core').from('profiles')
                    .update(updFields).eq('id', action.payload.userId), 'save ' + action.type);
                break;
            }

            case 'DEACTIVATE_USER': {
                sbCheck(await supabaseClient.schema('core').from('profiles')
                    .update({ is_active: action.payload.isActive }).eq('id', action.payload.userId), 'save ' + action.type);
                break;
            }

            case 'UPDATE_SITE_ASSIGNMENTS': {
                // Delete existing assignments for this user
                sbCheck(await supabaseClient.schema('core').from('site_assignments')
                    .delete().eq('user_id', action.payload.userId), 'save ' + action.type);
                // Insert new ones
                if (action.payload.siteIds && action.payload.siteIds.length > 0) {
                    var siteAssignRows = action.payload.siteIds.map(function(siteId) {
                        return { user_id: action.payload.userId, site_id: siteId };
                    });
                    sbCheck(await supabaseClient.schema('core').from('site_assignments').insert(siteAssignRows), 'save ' + action.type);
                }
                break;
            }

            default:
                console.log('[NC_MIS] No sync handler for action:', action.type);
                break;
        }

        // Notifications are created by the database functions (indent_* / po_*), so
        // nothing is written here for the in-memory ones the reducer produces.

    } catch (err) {
        console.error('[NC_MIS] Sync error for ' + action.type + ':', err);
        // Log error to app_logs table
        try {
            await supabaseClient.schema('indent_flow').from('app_logs').insert({
                user_id: state.currentUserId,
                action_type: action.type,
                error_message: err.message || String(err),
                details: JSON.stringify(action.payload || {}),
            });
        } catch (logErr) {
            console.error('[NC_MIS] Could not write to app_logs:', logErr);
        }
        // Re-throw so the caller can tell the user and put the screen back in step
        // with the database (this used to be swallowed, hiding every failed save).
        throw err;
    }
}
