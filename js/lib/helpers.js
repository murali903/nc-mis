
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getUserSites(userId, sites, siteAssignments) {
    const assignedIds = siteAssignments[userId] || [];
    return sites.filter(s => assignedIds.includes(s.id));
}

function getUserName(userId, users) {
    const user = users.find(u => u.id === userId);
    return user ? user.name : 'Unknown';
}

function getRoleBadge(role) {
    const labels = {
        admin: 'Admin',
        site_engineer: 'Engineer',
        storekeeper: 'Storekeeper',
        project_manager: 'PM',
        md: 'MD',
        procurement_manager: 'Proc. Manager',
        procurement_clerk: 'Clerk'
    };
    return labels[role] || role;
}

function getSiteName(siteId, sites) {
    const site = sites.find(s => s.id === siteId);
    return site ? `${site.name} (${site.location})` : 'Unknown';
}

var NEW_INDENT_LABEL = 'IND-NEW';

function getIndentDisplayId(indent, allIndents) {
  if (!indent) return '';
  // The number is assigned by the database (indent_number). A brand-new indent shows
  // this placeholder for a moment until its saved number comes back.
  return indent.displayNumber || NEW_INDENT_LABEL;
}

function getPODisplayId(po) {
  if (!po) return '';
  if (po.poNumber) return po.poNumber;
  // Fallback: if id looks like PO-YYYY-NNNN use it, otherwise show truncated UUID
  if (po.id && /^PO-/.test(po.id)) return po.id;
  return 'PO-' + (po.id || '').slice(0, 8).toUpperCase();
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Print GRN receipt
function printGRN(grn, po, state) {
  var grnItems = grn.items || [];
  if (grnItems.length === 0 && grn.lineItemId) {
    grnItems = [{ poLineItemId: grn.lineItemId, quantityReceived: grn.quantityReceived || 0, remarks: grn.remarks || '', condition: 'Good' }];
  }
  var vendor = po ? (state.vendors || []).find(function(v) { return v.id === po.vendorId; }) : null;
  var itemsHtml = grnItems.map(function(gi) {
    var li = po ? po.lineItems.find(function(l) { return l.id === gi.poLineItemId; }) : null;
    return '<tr><td style="padding:6px 10px;border:1px solid #ddd">' + escapeHtml(li ? (li.description || li.name || '') : '') +
      '</td><td style="padding:6px 10px;border:1px solid #ddd;text-align:center">' + (gi.quantityReceived || 0) +
      '</td><td style="padding:6px 10px;border:1px solid #ddd">' + escapeHtml(gi.condition || 'Good') +
      '</td><td style="padding:6px 10px;border:1px solid #ddd">' + escapeHtml([gi.remarks, gi.qualityRemarks].filter(Boolean).join(' | ') || '-') +
      '</td></tr>';
  }).join('');
  var html = '<html><head><title>GRN - ' + escapeHtml(grn.grnNumber || grn.id) + '</title>' +
    '<style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}' +
    'th{background:#f1f5f9;padding:8px 10px;border:1px solid #ddd;text-align:left;font-size:13px}' +
    'td{font-size:13px}h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;color:#6b7280;margin-top:0}' +
    '.info{display:flex;gap:24px;flex-wrap:wrap;margin:12px 0;font-size:13px}.info div{margin-bottom:4px}' +
    '.info strong{display:block;font-size:11px;color:#6b7280;text-transform:uppercase}' +
    '@media print{body{padding:0}}</style></head><body>' +
    '<h1>Goods Received Note</h1><h2>' + escapeHtml(grn.grnNumber || grn.id) + '</h2>' +
    '<div class="info">' +
    '<div><strong>PO Number</strong>' + escapeHtml(po ? getPODisplayId(po) : '') + '</div>' +
    '<div><strong>Vendor</strong>' + escapeHtml(vendor ? vendor.name : '') + '</div>' +
    '<div><strong>Received By</strong>' + escapeHtml(getUserName(grn.receivedBy, state.users)) + '</div>' +
    '<div><strong>Date</strong>' + new Date(grn.createdAt || grn.receivedAt).toLocaleDateString('en-IN') + '</div>' +
    '</div>' +
    (grn.remarks ? '<p style="font-size:13px"><strong>Remarks:</strong> ' + escapeHtml(grn.remarks) + '</p>' : '') +
    '<table><thead><tr><th>Item</th><th style="text-align:center">Qty Received</th><th>Condition</th><th>Remarks</th></tr></thead><tbody>' +
    itemsHtml + '</tbody></table>' +
    '<div style="margin-top:40px;display:flex;justify-content:space-between;font-size:13px">' +
    '<div><strong>Received By:</strong><br><br>_________________________</div>' +
    '<div><strong>Verified By:</strong><br><br>_________________________</div>' +
    '</div></body></html>';
  var win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}

// Helper to get POs for storekeeper's sites
function getStorePOs(state) {
  var userSites = getUserSites(state.currentUserId, state.sites, state.siteAssignments);
  var siteIds = userSites.map(function(s) { return s.id; });
  return (state.purchaseOrders || []).filter(function(po) {
    // Find the linked indent to check siteId
    var indent = state.indents.find(function(i) { return i.id === po.indentId || i.linkedPO === po.id; });
    if (indent) return siteIds.includes(indent.siteId);
    // A PO raised without an indent names its site itself
    return !!po.siteId && siteIds.includes(po.siteId);
  });
}
