// Smoke test: draws every screen as every role and presses every button once,
// looking for crashes. It does not check that the rules are right (the database
// does that); it checks that no screen falls over.
//   node tests/smoke/test.js
const { sandbox: S, React, setCtx, loadErrors } = require('./run.js');
const uid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const roles = ['admin', 'site_engineer', 'storekeeper', 'project_manager', 'procurement_manager', 'procurement_clerk', 'md'];
const users = roles.map((r, i) => ({ id: uid(i + 1), name: r + ' user', email: r + '@x.com', role: r, phone: '' }));
const U = Object.fromEntries(users.map(u => [u.role, u.id]));
const sites = [{ id: uid(101), name: 'Site A', location: 'Hyd', officeId: uid(201) }, { id: uid(102), name: 'Site B', location: 'Vizag', officeId: uid(201) }];
const statuses = ['draft', 'pending_approval', 'approved', 'rejected', 'returned_for_revision', 'escalated_to_md', 'in_procurement', 'po_draft', 'pending_md_po_approval', 'po_approved', 'po_issued', 'dispatched', 'completed'];
let n = 300;
const now = () => new Date().toISOString();
const mkIndent = (status, createdBy, i) => ({
  id: uid(n++), displayNumber: 'IND-' + String(i).padStart(3, '0'), siteId: sites[i % 2].id, createdBy, createdAt: new Date(Date.now() - i * 36e5 * 30).toISOString(),
  status, priority: ['urgent', 'normal', 'low'][i % 3], requiredDate: i % 2 ? '2026-12-0' + (1 + i % 8) : undefined,
  assignedTo: ['in_procurement', 'po_draft', 'dispatched', 'completed'].includes(status) && i % 2 ? U.procurement_clerk : (status === 'in_procurement' ? U.procurement_manager : undefined),
  rejectionReason: status === 'rejected' ? 'no' : undefined, returnReason: status === 'returned_for_revision' ? 'fix' : undefined,
  escalationRemarks: status === 'escalated_to_md' ? 'pls' : undefined, escalatedBy: status === 'escalated_to_md' ? U.project_manager : undefined,
  approvedBy: ['approved', 'in_procurement', 'po_draft', 'completed'].includes(status) ? U.project_manager : undefined,
  mdRemarks: i % 4 === 0 ? 'md says' : undefined, mdEscalationResult: i % 4 === 0 ? 'dismissed' : undefined, revisionCount: 0, description: 'desc ' + i, remarks: 'rem ' + i, notes: '',
  lineItems: [{ id: uid(n++), name: 'Cement', description: 'Cement', qty: 10, unit: 'Bags', received: status === 'completed' ? 10 : (i % 3 === 0 ? 4 : 0), isBoq: true, remarks: 'for slab' },
              { id: uid(n++), name: 'Steel', description: 'Steel 12mm', qty: 2.5, unit: 'MT', received: status === 'completed' ? 2.5 : 0, isBoq: false }],
  comments: [{ id: uid(n++), author: createdBy, text: 'hello', createdAt: now() }],
  activityLog: [{ action: 'Created', by: createdBy, at: now(), note: '' }, { action: 'Dispatched', by: U.procurement_manager, at: now(), note: 'x' }],
  documents: [{ id: uid(n++), name: 'dwg.pdf', category: 'Drawing', storagePath: 'a/b.pdf', uploadedBy: createdBy, uploadedAt: now(), size: 1234, mimeType: 'application/pdf', lineItemId: null, poId: null }],
});
const indents = []; let k = 1;
for (const st of statuses) for (const creator of [U.site_engineer, U.project_manager, U.storekeeper]) indents.push(mkIndent(st, creator, k++));
const poStatuses = ['draft', 'pending_approval', 'approved', 'issued', 'partially_fulfilled', 'fulfilled', 'closed', 'cancelled'];
const purchaseOrders = poStatuses.flatMap((st, i) => [0, 1, 2].map(j => {
  const ind = indents[(i * 2 + j) * 2 % indents.length]; const rate = j ? 100 : 9000; const direct = j === 2;
  return {
    id: uid(n++), poNumber: 'PO-2026-' + String(i * 3 + j + 1).padStart(4, '0'), indentId: direct ? null : ind.id, siteId: direct ? sites[0].id : null,
    noIndentReason: direct ? 'rate contract' : '', vendorId: j ? uid(401) : (i === 0 ? '' : uid(401)), status: st, createdAt: new Date(Date.now() - i * 864e5).toISOString(),
    createdBy: U.procurement_manager, version: 1 + (j === 1 ? 1 : 0), deliveryDate: j ? '2026-12-05' : '', paymentTerms: '30 days', deliveryAddress: 'Site A, Hyd', notes: j ? 'ok' : '',
    officeId: '', remarks: st === 'draft' && j ? 'MD Rejected: too high' : '', mdRemarks: '', closeRemarks: st === 'closed' ? 'done' : '', approvalRoute: st === 'issued' ? (j ? 'direct' : 'md') : '',
    noQuoteReason: j === 1 ? 'rate contract' : '', terms: j ? { freight: 'Delivered to site; freight included in the rates', warranty: 'custom text', siteContact: 'Ravi', sitePhone: '99', special: 'call first' } : {},
    documents: direct ? [{ id: uid(n++), name: 'q.pdf', category: 'Quotation', storagePath: 'po/q.pdf', uploadedBy: U.procurement_manager, uploadedAt: now(), size: 5, mimeType: 'application/pdf', poId: 'x' }] : undefined,
    vendorName: 'Vendor X', totalAmount: 10 * rate * 1.18,
    lineItems: [{ id: direct ? uid(n++) : ind.lineItems[0].id, name: 'Cement', description: 'Cement', quantity: 10, qty: 10, unit: 'Bags', rate: (i === 0 && !j) ? 0 : rate, unitPrice: rate, amount: 10 * rate,
                  gstPercent: 18, gstAmount: 10 * rate * .18, amountWithGst: 10 * rate * 1.18, receivedQty: st === 'fulfilled' || st === 'closed' ? 10 : (st === 'partially_fulfilled' ? 4 : 0), hsn: '2523' }],
    versionHistory: [{ version: 1, editedBy: U.procurement_manager, editedAt: now(), totalAmount: 5, changesSummary: 'x' }],
  };
}));
const grns = purchaseOrders.filter(p => ['partially_fulfilled', 'fulfilled', 'closed'].includes(p.status)).map((p, i) => ({
  id: uid(n++), grnNumber: 'GRN-2026-0000' + i, poId: p.id, receivedBy: U.storekeeper, remarks: 'ok', createdAt: now(), photoUrl: '',
  items: [{ id: uid(n++), poLineItemId: p.lineItems[0].id, quantityReceived: 4, remarks: '', condition: 'Good', qualityRemarks: '' }] }));
const localPurchases = ['pending_approval', 'approved', 'rejected'].flatMap((st, i) => [U.storekeeper, U.procurement_manager].map((by, j) => ({
  id: uid(n++), lpNumber: 'LP-2026-0000' + (i * 2 + j + 1), siteId: sites[j].id, vendorId: null, vendorName: 'Sri Hardware', vendorPhone: '98', vendorGstin: '', vendorAddress: 'Kokapet',
  billNumber: 'B-' + i, billDate: '2026-11-18', reason: 'ran out', paymentMode: 'Cash from site imprest', totalAmount: 2360, billFiles: [{ name: 'bill.jpg', path: 'local-purchases/x/bill.jpg' }],
  status: st, createdBy: by, createdAt: now(), decidedBy: st === 'pending_approval' ? null : U.project_manager, decidedAt: st === 'pending_approval' ? null : now(), decisionRemarks: st === 'rejected' ? 'not needed' : '',
  items: [{ id: uid(n++), description: 'Cutting wheel 4 inch', quantity: 20, unit: 'Nos', rate: 100, gstPercent: 18, amount: 2360 }] })));
const base = {
  users, sites, indents, purchaseOrders, grns, localPurchases,
  vendors: [{ id: uid(401), name: 'Vendor X', contactPerson: 'A', phone: '1', email: 'v@x.com', gstin: 'G', category: 'Cement', city: 'Hyd', address: 'Road 1', state: 'TS', pincode: '500', defaultPaymentTerms: 30 }],
  offices: [{ id: uid(201), name: 'Navya Constructions - Hyderabad', city: 'Hyderabad', state: 'TS', address: 'Unit 332, Kokapet Terminal, Hyderabad 500 075', gstin: '36X', pan: 'P', phone: '1', email: 'e' }],
  siteAssignments: Object.fromEntries(users.map(u => [u.id, [sites[0].id, sites[1].id]])),
  boqLists: { [sites[0].id]: [{ id: uid(501), name: 'OPC Cement', unit: 'Bags', hsn: '2523' }], [sites[1].id]: [] },
  orgSettings: { companyName: 'Navya Constructions', companyTagline: 'Since 1997', poMdApprovalThreshold: '50000', localPurchaseLimit: '10000', companyPhone: '+91', companyWebsite: 'navyacon.com' },
  notifications: [], toast: null, isAuthenticated: true, isLoading: false, savingCount: 0, isOffline: false, appLogs: [], systemLogs: [] };

let errors = loadErrors, rendered = 0, handlers = 0; const actions = {};
function render(el, trail) {
  if (el === null || el === undefined || typeof el === 'boolean' || typeof el === 'string' || typeof el === 'number') return;
  if (Array.isArray(el)) { el.forEach(e => render(e, trail)); return; }
  if (typeof el !== 'object') return;
  const t = el.type;
  if (typeof t === 'function') {
    if (/^class /.test(Function.prototype.toString.call(t))) return;
    let out; rendered++;
    try { out = t(Object.assign({}, el.props, { children: el.children })); }
    catch (e) { errors++; console.log('ERROR in <' + (t.name || '?') + '> via ' + trail + ': ' + e.message + '\n   ' + String(e.stack).split('\n').slice(1, 3).join('\n   ')); return; }
    render(out, trail + '>' + t.name); return;
  }
  if (el.props) for (const key of ['onClick', 'onChange']) {
    const h = el.props[key];
    if (typeof h === 'function') {
      handlers++;
      try { const r = h({ target: { value: '3', files: [], checked: true }, stopPropagation() {}, preventDefault() {} }); if (r && r.catch) r.catch(() => {}); }
      catch (e) { errors++; console.log('HANDLER ERROR ' + key + ' in ' + trail + ' [' + (typeof el.children[0] === 'string' ? el.children[0] : el.type) + ']: ' + e.message + '\n   ' + String(e.stack).split('\n').slice(1, 3).join('\n   ')); }
    }
  }
  render(el.children, trail);
  if (el.props && el.props.children) render(el.props.children, trail);
}
const routes = {
  admin: ['UserManagementScreen', 'SitesScreen', 'OfficeManagementScreen', 'AssignmentsScreen', 'OrgSettingsScreen', 'SystemLogsScreen', 'LocalPurchasesScreen', 'LocalPurchaseNewScreen'],
  site_engineer: ['MyIndentsScreen', 'CreateIndentScreen', 'CompletedOrdersScreen'],
  storekeeper: ['StoreDashboardScreen', 'StoreExpectedDeliveriesScreen', 'StorePendingScreen', 'StoreNewIndentScreen', 'MyIndentsScreen', 'StoreHistoryScreen', 'StoreGRNHistoryScreen', 'StoreAllScreen', 'LocalPurchasesScreen', 'LocalPurchaseNewScreen'],
  project_manager: ['DashboardScreen', 'CreateIndentScreen', 'MyIndentsScreen', 'ApprovalsScreen', 'ApprovedScreen', 'AllIndentsScreen', 'ReportsScreen', 'EscalatedScreen', 'LocalPurchasesScreen', 'LocalPurchaseNewScreen'],
  procurement_manager: ['ProcurementDashboardScreen', 'ProcurementApprovedScreen', 'ProcurementProgressScreen', 'VendorScreen', 'ProcurementPOsScreen', 'LocalPurchasesScreen', 'LocalPurchaseNewScreen', 'CreateDirectPOScreen'],
  procurement_clerk: ['ClerkAssignedScreen', 'ProcurementPOsScreen', 'CreateDirectPOScreen'],
  md: ['DashboardScreen', 'ApprovalsScreen', 'MDEscalationsScreen', 'MDPOApprovalsScreen', 'AllIndentsScreen', 'ProcurementPOsScreen', 'ReportsScreen', 'LocalPurchasesScreen', 'CreateDirectPOScreen'],
};
for (const variant of ['', 'approve', 'reject', 'return', 'escalate', 'md_approve', 'md_return', 'close', 'cancel']) {
  global.__variant = variant;
  for (const role of roles) {
    const me = users.find(u => u.role === role);
    const state = Object.assign({}, base, { currentUserId: me.id, currentUser: me, currentRoute: '#dashboard' });
    setCtx([state, (a) => { actions[a.type] = (actions[a.type] || 0) + 1; }]);
    for (const name of routes[role]) {
      if (typeof S[name] !== 'function') { errors++; console.log('NO COMPONENT', name); continue; }
      render(React.createElement(S[name], null), role + ':' + name);
    }
    for (const ind of indents) {
      render(React.createElement(S.IndentDetail, { indentId: ind.id }), role + ':IndentDetail(' + ind.status + ')');
      if (ind.createdBy === me.id) { render(React.createElement(S.ReviseIndentScreen, { indentId: ind.id }), role + ':Revise'); render(React.createElement(S.EditDraftScreen, { indentId: ind.id }), role + ':EditDraft'); }
      if (role === 'storekeeper') render(React.createElement(S.ReceiptEntryScreen, { indent: ind, currentUserId: me.id }), role + ':Receipt');
      if (role.startsWith('procurement')) render(React.createElement(S.CreatePOScreen, { indentId: ind.id }), role + ':CreatePO');
    }
    for (const po of purchaseOrders) render(React.createElement(S.PODetailScreen, { poId: po.id }), role + ':PODetail(' + po.status + (po.indentId ? '' : ',no indent') + ')');
    for (const lp of localPurchases) render(React.createElement(S.LocalPurchaseDetailScreen, { id: lp.id }), role + ':LocalPurchase(' + lp.status + ')');
    render(React.createElement(S.Sidebar, null), role + ':Sidebar'); render(React.createElement(S.Navbar, null), role + ':Navbar');
  }
}
global.__variant = '';

// A few direct checks of shared helpers
const chk = (c, m) => { if (!c) { errors++; console.log('FAIL', m); } };
const t = S.textMatches;
chk(t('IND-033', '*33') && !t('IND-330', '*33') && t('IND-330', '33') && t('IND-033', 'ind-0*'), 'search wildcards');
chk(S.poApprovalLimit({ orgSettings: { poMdApprovalThreshold: '50000' } }) === 50000 && S.poApprovalLimit({ orgSettings: { poMdApprovalThreshold: '0' } }) === 0 && S.poApprovalLimit({ orgSettings: {} }) === 50000, 'PO limit');
chk(S.localPurchaseLimit({ orgSettings: {} }) === 10000 && S.localPurchaseLimit({ orgSettings: { localPurchaseLimit: '2500' } }) === 2500, 'local purchase limit');
chk(S.rupeesInWords(118000) === 'Rupees One Lakh Eighteen Thousand Only' && S.rupeesInWords(10.05) === 'Rupees Ten and Five Paise Only', 'amount in words');
chk(S.poMissingFields(purchaseOrders[2], base).includes('the reason there is no indent') === false, 'no-indent PO with a reason');
chk(S.nextPONumber({ purchaseOrders: [{ poNumber: 'PO-' + new Date().getFullYear() + '-0041' }] }).endsWith('-0042'), 'next PO number');
for (const po of purchaseOrders) { try { chk(S.printPurchaseOrder(po, base) === true, 'print ' + po.poNumber); } catch (e) { errors++; console.log('PRINT ERROR', po.poNumber, e.message); } }

console.log('components drawn: ' + rendered + '   buttons and fields exercised: ' + handlers + '   problems: ' + errors);
console.log('actions sent: ' + Object.keys(actions).sort().join(', '));
process.exit(errors ? 1 : 0);
