
// ============ DATA LOADING ============
async function loadAllData(userId) {
    var results = await Promise.all([
        supabaseClient.schema('core').from('profiles').select('*').eq('is_active', true),
        supabaseClient.schema('core').from('offices').select('*').eq('is_active', true),
        supabaseClient.schema('core').from('sites').select('*').eq('is_active', true),
        supabaseClient.schema('core').from('site_assignments').select('*'),
        supabaseClient.schema('core').from('vendors').select('*').eq('is_active', true),
        supabaseClient.schema('core').from('boq_lists').select('*'),
        supabaseClient.schema('indent_flow').from('indents').select('*, indent_line_items(*), indent_activity(*), indent_comments(*), indent_documents(*)'),
        supabaseClient.schema('indent_flow').from('purchase_orders').select('*, po_line_items(*), po_version_history(*)'),
        supabaseClient.schema('indent_flow').from('grns').select('*, grn_items(*)'),
        supabaseClient.schema('indent_flow').from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabaseClient.schema('core').from('org_settings').select('*'),
    ]);

    var profilesRes = results[0];
    var officesRes = results[1];
    var sitesRes = results[2];
    var assignmentsRes = results[3];
    var vendorsRes = results[4];
    var boqRes = results[5];
    var indentsRes = results[6];
    var posRes = results[7];
    var grnsRes = results[8];
    var notifsRes = results[9];
    var settingsRes = results[10];

    // Log any errors
    var allRes = [profilesRes, officesRes, sitesRes, assignmentsRes, vendorsRes, boqRes, indentsRes, posRes, grnsRes, notifsRes, settingsRes];
    var tableNames = ['profiles', 'offices', 'sites', 'site_assignments', 'vendors', 'boq_lists', 'indents', 'purchase_orders', 'grns', 'notifications', 'org_settings'];
    for (var ri = 0; ri < allRes.length; ri++) {
        if (allRes[ri].error) {
            console.error('[NC_MIS] Error loading ' + tableNames[ri] + ':', allRes[ri].error.message);
        }
    }

    return {
        users: (profilesRes.data || []).map(transformProfile),
        offices: (officesRes.data || []).map(transformOffice),
        sites: (sitesRes.data || []).map(transformSite),
        siteAssignments: transformSiteAssignments(assignmentsRes.data || []),
        vendors: (vendorsRes.data || []).map(transformVendor),
        boqLists: transformBoqLists(boqRes.data || []),
        indents: (indentsRes.data || []).map(transformIndent),
        purchaseOrders: (posRes.data || []).map(transformPO),
        grns: (grnsRes.data || []).map(transformGRN),
        notifications: (notifsRes.data || []).map(function(n) {
            return {
                id: n.id,
                userId: n.user_id,
                // The notifications table has link/is_read (no indent_id/read columns)
                indentId: (n.link && n.link.indexOf('#indent/') === 0) ? n.link.slice(8) : null,
                link: n.link || '',
                title: n.title || '',
                message: n.message,
                read: n.is_read || false,
                createdAt: n.created_at,
            };
        }),
        orgSettings: transformOrgSettings(settingsRes.data || []),
    };
}

// ============ UUID GENERATOR ============
function genUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0;
        return (c === 'x' ? r : (r&0x3|0x8)).toString(16);
    });
}

// ============ SUPABASE SYNC LAYER ============
// Helper: Supabase client returns {data, error} and NEVER throws.
// This helper checks the error and throws so our catch block fires.
function sbCheck(result, label) {
    if (result.error) {
        console.error('[NC_MIS] Supabase error in ' + label + ':', result.error);
        throw new Error(label + ': ' + result.error.message + (result.error.details ? ' (' + result.error.details + ')' : ''));
    }
    return result;
}

// Safe update helper: tries update, if column-missing error, strips optional fields and retries
// This prevents the entire update from failing when optional columns haven't been added to DB yet
// PostgREST error messages:
//   - "Could not find the 'col_name' column of 'table' in the schema cache"
//   - "column table.col_name does not exist"
function extractMissingColumn(errMsg) {
    var m = errMsg.match(/find the '(\w+)' column/) || errMsg.match(/column\s+\w+\.(\w+)\s+does not exist/);
    return m ? m[1] : null;
}

async function safeIndentUpdate(indentId, fields, label) {
    var res = await supabaseClient.schema('indent_flow').from('indents')
        .update(fields).eq('id', indentId);
    if (res.error) {
        var errMsg = res.error.message || '';
        var missingCol = extractMissingColumn(errMsg);
        if (missingCol && fields[missingCol] !== undefined) {
            console.warn('[NC_MIS] Column "' + missingCol + '" missing in DB, retrying without it. Label: ' + label);
            var retryFields = Object.assign({}, fields);
            delete retryFields[missingCol];
            res = await supabaseClient.schema('indent_flow').from('indents')
                .update(retryFields).eq('id', indentId);
            // If STILL failing with another missing column, try stripping that too
            if (res.error) {
                var missingCol2 = extractMissingColumn(res.error.message || '');
                if (missingCol2 && retryFields[missingCol2] !== undefined) {
                    console.warn('[NC_MIS] Column "' + missingCol2 + '" also missing, retrying. Label: ' + label);
                    delete retryFields[missingCol2];
                    res = await supabaseClient.schema('indent_flow').from('indents')
                        .update(retryFields).eq('id', indentId);
                }
                // If STILL failing, last resort: status only
                if (res.error && extractMissingColumn(res.error.message || '')) {
                    console.warn('[NC_MIS] Multiple columns missing, keeping only status. Label: ' + label);
                    if (fields.status) {
                        res = await supabaseClient.schema('indent_flow').from('indents')
                            .update({ status: fields.status }).eq('id', indentId);
                    }
                }
            }
        }
    }
    sbCheck(res, label);
    return res;
}

// Updates a PO row and fails loudly when nothing was updated (row missing because an
// earlier save failed, or the signed-in role is not allowed to change it). Without the
// row check Supabase reports success for an update that touched zero rows.
async function updatePO(poId, fields, label) {
    var res = await supabaseClient.schema('indent_flow').from('purchase_orders')
        .update(fields).eq('id', poId).select('id');
    sbCheck(res, label);
    if (!res.data || res.data.length === 0) {
        throw new Error(label + ': purchase order was not updated in the database (it was not saved, or your role cannot change it)');
    }
    return res;
}

// Records the version a PO is leaving (before an edit or amendment) in po_version_history.
// Logged, not fatal: the PO change itself has already been saved.
async function savePOVersionHistory(po, userId, summary) {
    if (!po) return;
    var res = await supabaseClient.schema('indent_flow').from('po_version_history').insert({
        po_id: po.id,
        version: po.version || 1,
        edited_by: userId,
        total_amount: Number(po.totalAmount) || 0,
        changes_summary: summary || null,
    });
    if (res.error) console.error('[NC_MIS] Could not save PO version history:', res.error);
}

// Calls one workflow function (indent_* or po_*) in the database. The message of a refused action
// (wrong role, wrong status, over-receipt ...) comes straight from the function.
async function callFlow(fnName, args) {
    var res = await supabaseClient.schema('indent_flow').rpc(fnName, args);
    if (res.error) {
        console.error('[NC_MIS] ' + fnName + ' refused:', res.error);
        throw new Error(res.error.message || (fnName + ' failed'));
    }
    return res.data;
}
