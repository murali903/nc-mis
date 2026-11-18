
// ============================================================================
// 11a. STORE DASHBOARD SCREEN
// ============================================================================

function StoreDashboardScreen() {
    var _ctx = React.useContext(AppContext);
    var state = _ctx[0];
    var storePOs = getStorePOs(state);
    var userSites = getUserSites(state.currentUserId, state.sites, state.siteAssignments);
    var siteIds = userSites.map(function(s) { return s.id; });
    var today = new Date().toISOString().split('T')[0];

    // Summary metrics
    var activePOs = storePOs.filter(function(po) { return po.status === 'issued' || po.status === 'partially_fulfilled'; });
    var pendingIndents = state.indents.filter(function(i) {
        if (!siteIds.includes(i.siteId)) return false;
        if (!['approved', 'in_procurement', 'dispatched'].includes(i.status)) return false;
        return i.lineItems.some(function(li) { return li.received < li.qty; });
    });
    var thisMonth = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    var monthGrns = (state.grns || []).filter(function(g) {
        if (!storePOs.find(function(po) { return po.id === g.poId; })) return false;
        return (g.createdAt || g.receivedAt || '').startsWith(thisMonth);
    });
    var overduePOs = activePOs.filter(function(po) { return po.deliveryDate && po.deliveryDate < today; });

    var cardStyle = { flex: '1 1 180px', background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' };
    var cardNum = { fontSize: '28px', fontWeight: 700, marginBottom: '4px' };
    var cardLabel = { fontSize: '13px', color: '#64748b' };

    return React.createElement('div', null,
        React.createElement('h2', { style: { fontSize: '18px', fontWeight: 700, marginBottom: '16px' } }, 'Store Dashboard'),

        // Summary Cards
        React.createElement('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' } },
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: Object.assign({}, cardNum, { color: '#2563eb' }) }, activePOs.length),
                React.createElement('div', { style: cardLabel }, 'Active POs')
            ),
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: Object.assign({}, cardNum, { color: '#f59e0b' }) }, pendingIndents.length),
                React.createElement('div', { style: cardLabel }, 'Pending Receipts')
            ),
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: Object.assign({}, cardNum, { color: '#10b981' }) }, monthGrns.length),
                React.createElement('div', { style: cardLabel }, 'GRNs This Month')
            ),
            React.createElement('div', { style: Object.assign({}, cardStyle, overduePOs.length > 0 ? { border: '2px solid #ef4444' } : {}) },
                React.createElement('div', { style: Object.assign({}, cardNum, { color: overduePOs.length > 0 ? '#ef4444' : '#6b7280' }) }, overduePOs.length),
                React.createElement('div', { style: cardLabel }, 'Overdue Deliveries')
            )
        ),

        // Delivery Alerts
        overduePOs.length > 0 ? React.createElement('div', { className: 'card', style: { marginBottom: '20px', borderLeft: '4px solid #ef4444' } },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title', style: { color: '#ef4444' } }, '⚠ Overdue Deliveries')
            ),
            React.createElement('table', { className: 'table' },
                React.createElement('thead', null,
                    React.createElement('tr', null,
                        React.createElement('th', null, 'PO Number'),
                        React.createElement('th', null, 'Vendor'),
                        React.createElement('th', null, 'Delivery Date'),
                        React.createElement('th', null, 'Days Overdue'),
                        React.createElement('th', null, 'Status')
                    )
                ),
                React.createElement('tbody', null,
                    overduePOs.map(function(po) {
                        var vendor = (state.vendors || []).find(function(v) { return v.id === po.vendorId; });
                        var daysOverdue = Math.floor((new Date() - new Date(po.deliveryDate)) / (1000 * 60 * 60 * 24));
                        return React.createElement('tr', { key: po.id, style: { cursor: 'pointer' }, onClick: function() { window.location.hash = '#po/' + po.id; } },
                            React.createElement('td', null,
                                React.createElement('a', { href: '#po/' + po.id, style: { textDecoration: 'none', color: '#2563eb' } }, getPODisplayId(po))
                            ),
                            React.createElement('td', null, vendor ? vendor.name : ''),
                            React.createElement('td', { style: { color: '#ef4444', fontWeight: 600 } }, new Date(po.deliveryDate).toLocaleDateString('en-IN')),
                            React.createElement('td', null,
                                React.createElement('span', { style: { background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '13px' } }, daysOverdue + ' days')
                            ),
                            React.createElement('td', null, React.createElement(StatusBadge, { status: po.status }))
                        );
                    })
                )
            )
        ) : null,

        // Recent GRN Activity
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Recent GRN Activity')
            ),
            (function() {
                var storeGrns = (state.grns || []).filter(function(g) {
                    return storePOs.find(function(po) { return po.id === g.poId; });
                }).sort(function(a, b) { return (b.createdAt || b.receivedAt || '').localeCompare(a.createdAt || a.receivedAt || ''); }).slice(0, 5);
                if (storeGrns.length === 0) {
                    return React.createElement('div', { style: { padding: '20px', textAlign: 'center', color: '#64748b' } }, 'No recent GRN activity');
                }
                return React.createElement('table', { className: 'table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            React.createElement('th', null, 'GRN Number'),
                            React.createElement('th', null, 'PO'),
                            React.createElement('th', null, 'Items'),
                            React.createElement('th', null, 'Received By'),
                            React.createElement('th', null, 'Date')
                        )
                    ),
                    React.createElement('tbody', null,
                        storeGrns.map(function(grn) {
                            var po = storePOs.find(function(p) { return p.id === grn.poId; });
                            var totalItems = (grn.items || []).reduce(function(sum, gi) { return sum + (gi.quantityReceived || 0); }, 0);
                            if (totalItems === 0) totalItems = grn.quantityReceived || 0;
                            return React.createElement('tr', { key: grn.id },
                                React.createElement('td', { style: { fontFamily: 'monospace', fontSize: '13px' } }, grn.grnNumber || grn.id),
                                React.createElement('td', null, po ? React.createElement('a', { href: '#po/' + po.id, style: { textDecoration: 'none', color: '#2563eb' } }, getPODisplayId(po)) : ''),
                                React.createElement('td', null, totalItems + ' units'),
                                React.createElement('td', null, getUserName(grn.receivedBy, state.users)),
                                React.createElement('td', null, new Date(grn.createdAt || grn.receivedAt).toLocaleDateString('en-IN'))
                            );
                        })
                    )
                );
            })()
        )
    );
}

// ============================================================================
// 11b. STORE EXPECTED DELIVERIES SCREEN
// ============================================================================

function StoreExpectedDeliveriesScreen() {
    var _ctx = React.useContext(AppContext);
    var state = _ctx[0];
    var storePOs = getStorePOs(state);
    var today = new Date().toISOString().split('T')[0];

    var allExpected = storePOs.filter(function(po) {
        return po.status === 'issued' || po.status === 'partially_fulfilled';
    }).sort(function(a, b) {
        return (a.deliveryDate || '9999').localeCompare(b.deliveryDate || '9999');
    });
    var expectedList = useListControls(allExpected, poListFields(state));
    var expectedPOs = expectedList.rows;

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'Expected Deliveries'),
            React.createElement('span', { style: { fontSize: '13px', color: '#64748b' } }, 'Purchase orders issued to vendors — goods on the way')
        ),
        React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, expectedList.bar),
        React.createElement('table', { className: 'table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', null, 'PO Number'),
                    React.createElement('th', null, 'Vendor'),
                    React.createElement('th', null, 'Delivery Date'),
                    React.createElement('th', null, 'Status'),
                    React.createElement('th', null, 'Items'),
                    React.createElement('th', null, 'Actions')
                )
            ),
            React.createElement('tbody', null,
                expectedPOs.length === 0
                    ? React.createElement('tr', null,
                        React.createElement('td', { colSpan: '6', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No expected deliveries')
                    )
                    : expectedPOs.map(function(po) {
                        var vendor = (state.vendors || []).find(function(v) { return v.id === po.vendorId; });
                        var isOverdue = po.deliveryDate && po.deliveryDate < today;
                        var daysOverdue = isOverdue ? Math.floor((new Date() - new Date(po.deliveryDate)) / (1000 * 60 * 60 * 24)) : 0;
                        var itemsSummary = (po.lineItems || []).map(function(li) { return (li.description || li.name || ''); }).join(', ');
                        return React.createElement('tr', { key: po.id, style: isOverdue ? { backgroundColor: '#fef2f2' } : {} },
                            React.createElement('td', null,
                                React.createElement('a', { href: '#po/' + po.id, style: { textDecoration: 'none', color: '#2563eb', fontWeight: 600 } }, getPODisplayId(po))
                            ),
                            React.createElement('td', null, vendor ? vendor.name : ''),
                            React.createElement('td', null,
                                React.createElement('span', { style: { color: isOverdue ? '#dc2626' : '#1e293b', fontWeight: isOverdue ? 600 : 400 } },
                                    po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString('en-IN') : 'Not set'
                                ),
                                isOverdue ? React.createElement('span', { style: { display: 'block', fontSize: '11px', color: '#dc2626', fontWeight: 600 } }, daysOverdue + ' days overdue') : null
                            ),
                            React.createElement('td', null, React.createElement(StatusBadge, { status: po.status })),
                            React.createElement('td', { style: { fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, itemsSummary),
                            React.createElement('td', null,
                                React.createElement('a', { href: '#po/' + po.id, style: { textDecoration: 'none' } },
                                    React.createElement('button', { className: 'btn btn-sm btn-success' }, 'Record Receipt')
                                )
                            )
                        );
                    })
            )
        )
    );
}

// ============================================================================
// 11c. STORE GRN HISTORY SCREEN
// ============================================================================

function StoreGRNHistoryScreen() {
    var _ctx = React.useContext(AppContext);
    var state = _ctx[0];
    var storePOs = getStorePOs(state);
    var storePOIds = storePOs.map(function(po) { return po.id; });

    var allStoreGrns = (state.grns || []).filter(function(g) {
        return storePOIds.includes(g.poId);
    }).sort(function(a, b) {
        return (b.createdAt || b.receivedAt || '').localeCompare(a.createdAt || a.receivedAt || '');
    });
    var poOfGrn = function(g) { return storePOs.find(function(po) { return po.id === g.poId; }); };
    var grnList = useListControls(allStoreGrns, [
        { key: 'number', label: 'GRN number', get: function(g) { return g.grnNumber || ''; } },
        { key: 'po', label: 'PO number', get: function(g) { var po = poOfGrn(g); return po ? getPODisplayId(po) : ''; } },
        { key: 'date', label: 'Date', type: 'date', get: function(g) { return g.createdAt || g.receivedAt; } },
        { key: 'vendor', label: 'Vendor', get: function(g) { var po = poOfGrn(g); return po ? (po.vendorName || '') : ''; } },
        { key: 'by', label: 'Received by', get: function(g) { return getUserName(g.receivedBy, state.users); } },
        { key: 'items', label: 'Number of items', type: 'number', noSearch: true, get: function(g) { return (g.items || []).length; } },
        { key: 'desc', label: 'Description', get: function(g) {
            var po = poOfGrn(g);
            return [g.remarks].concat(po ? (po.lineItems || []).map(function(l) { return l.description; }) : []);
          } },
    ]);
    var storeGrns = grnList.rows;

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'GRN History')
        ),
        React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, grnList.bar),
        React.createElement('table', { className: 'table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', null, 'GRN Number'),
                    React.createElement('th', null, 'PO Number'),
                    React.createElement('th', null, 'Vendor'),
                    React.createElement('th', null, 'Items Received'),
                    React.createElement('th', null, 'Received By'),
                    React.createElement('th', null, 'Date'),
                    React.createElement('th', null, 'Actions')
                )
            ),
            React.createElement('tbody', null,
                storeGrns.length === 0
                    ? React.createElement('tr', null,
                        React.createElement('td', { colSpan: '7', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No GRN records')
                    )
                    : storeGrns.map(function(grn) {
                        var po = storePOs.find(function(p) { return p.id === grn.poId; });
                        var vendor = po ? (state.vendors || []).find(function(v) { return v.id === po.vendorId; }) : null;
                        var grnItems = grn.items || [];
                        var totalQty = grnItems.reduce(function(sum, gi) { return sum + (gi.quantityReceived || 0); }, 0);
                        if (totalQty === 0) totalQty = grn.quantityReceived || 0;
                        var hasIssues = grnItems.some(function(gi) { return gi.condition && gi.condition !== 'Good'; });

                        return React.createElement('tr', { key: grn.id },
                            React.createElement('td', null,
                                React.createElement('span', { style: { fontFamily: 'monospace', fontSize: '13px' } }, grn.grnNumber || grn.id),
                                hasIssues ? React.createElement('span', { style: { display: 'block', fontSize: '11px', color: '#dc2626', fontWeight: 600 } }, '⚠ Quality Issue') : null
                            ),
                            React.createElement('td', null, po ? React.createElement('a', { href: '#po/' + po.id, style: { textDecoration: 'none', color: '#2563eb' } }, getPODisplayId(po)) : ''),
                            React.createElement('td', null, vendor ? vendor.name : ''),
                            React.createElement('td', null,
                                totalQty + ' units',
                                grnItems.length > 0 ? React.createElement('span', { style: { display: 'block', fontSize: '11px', color: '#64748b' } }, grnItems.length + ' line items') : null
                            ),
                            React.createElement('td', null, getUserName(grn.receivedBy, state.users)),
                            React.createElement('td', null, new Date(grn.createdAt || grn.receivedAt).toLocaleDateString('en-IN')),
                            React.createElement('td', null,
                                React.createElement('button', {
                                    className: 'btn btn-sm btn-secondary',
                                    onClick: function() { printGRN(grn, po, state); }
                                }, 'Print')
                            )
                        );
                    })
            )
        )
    );
}

// ============================================================================
// 11. STORE PENDING SCREEN
// ============================================================================

function StorePendingScreen() {
    const [state] = React.useContext(AppContext);
    const storeKeeperSites = getUserSites(state.currentUserId, state.sites, state.siteAssignments);
    const siteIds = storeKeeperSites.map(s => s.id);

    const allPendingReceipt = state.indents.filter(i => {
        if (!siteIds.includes(i.siteId)) return false;
        if (!['approved', 'in_procurement', 'dispatched'].includes(i.status)) return false;
        return i.lineItems.some(li => li.received < li.qty);
    }).sort((a, b) => {
        // Dispatched (on its way) first, then newest
        const d = (a.status === 'dispatched' ? 0 : 1) - (b.status === 'dispatched' ? 0 : 1);
        return d !== 0 ? d : new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    const pendingList = useListControls(allPendingReceipt, indentListFields(state));
    const pendingIndents = pendingList.rows;

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'Pending Receipt'),
            React.createElement('span', { style: { fontSize: '13px', color: '#64748b' } }, 'Indents for your site where material is still to be received without a PO')
        ),
        React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, pendingList.bar),
        React.createElement('table', { className: 'table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', null, 'Indent No.'),
                    React.createElement('th', null, 'Description'),
                    React.createElement('th', null, 'Status'),
                    React.createElement('th', null, 'Items'),
                    React.createElement('th', null, 'Created Date'),
                    React.createElement('th', null, 'Actions')
                )
            ),
            React.createElement('tbody', null,
                pendingIndents.length === 0
                    ? React.createElement('tr', null,
                        React.createElement('td', { colSpan: '6', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No pending receipts')
                    )
                    : pendingIndents.map(indent =>
                        React.createElement('tr', { key: indent.id },
                            React.createElement('td', null,
                                React.createElement('a', { href: '#receipt/' + indent.id, style: { textDecoration: 'none', color: '#2563eb' } }, getIndentDisplayId(indent, state.indents))
                            ),
                            React.createElement('td', null, indent.lineItems.map(li => li.name || li.description).join(', ')),
                            React.createElement('td', null, React.createElement(StatusBadge, { status: indent.status })),
                            React.createElement('td', null, indent.lineItems.length),
                            React.createElement('td', null, new Date(indent.createdAt).toLocaleDateString()),
                            React.createElement('td', null,
                                React.createElement('a', { href: '#receipt/' + indent.id, style: { textDecoration: 'none' } },
                                    React.createElement('button', { className: 'btn btn-sm btn-primary' }, 'Record Receipt')
                                )
                            )
                        )
                    )
            )
        )
    );
}

// ============================================================================
// 12. STORE NEW INDENT SCREEN (MODIFIED - priority dropdown)
// ============================================================================

function StoreNewIndentScreen() {
    const [state, dispatch] = React.useContext(AppContext);
    const currentUserId = state.currentUserId;
    const userSites = getUserSites(currentUserId, state.sites, state.siteAssignments);
    const selectedSite = userSites[0]?.id || '';
    const [description, setDescription] = useState('');
    const [notes, setNotes] = useState('');
    const [requiredDate, setRequiredDate] = useState('');
    const [priority, setPriority] = useState('normal');
    const [lineItems, setLineItems] = useState(() => [{
        id: genUUID(), description: '', qty: '', unit: 'Bags', priority: 'medium',
        isBoq: true, boqItemId: '', nonBoqReason: '', clientApproval: false, trackCostImpact: false
    }]);
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);

    const boqItems = state.boqLists[selectedSite] || [];

    const handleAddLineItem = () => {
        const newId = genUUID();
        setLineItems([...lineItems, {
            id: newId, description: '', qty: '', unit: 'Bags', priority: 'medium',
            isBoq: true, boqItemId: '', nonBoqReason: '', clientApproval: false, trackCostImpact: false
        }]);
    };

    const handleRemoveLineItem = (id) => {
        if (lineItems.length > 1) {
            setLineItems(lineItems.filter(li => li.id !== id));
        }
    };

    const handleLineItemChange = (id, field, value) => {
        setLineItems(lineItems.map(li => {
            if (li.id !== id) return li;
            const updated = { ...li, [field]: value };
            if (field === 'boqItemId' && value) {
                const boqItem = boqItems.find(b => b.id === value);
                if (boqItem) { updated.description = boqItem.name; updated.unit = boqItem.unit; }
            }
            if (field === 'isBoq') {
                updated.boqItemId = '';
                if (value) { updated.nonBoqReason = ''; updated.clientApproval = false; updated.trackCostImpact = false; }
            }
            return updated;
        }));
    };

    const createIndentObject = (status) => {
        return {
            id: genUUID(),
            siteId: selectedSite,
            createdBy: currentUserId,
            createdAt: new Date().toISOString(),
            requiredDate: requiredDate || undefined,
            status: status,
            priority: priority,
            description: description,
            notes: notes,
            lineItems: lineItems.map(li => ({
                id: li.id, description: li.description, qty: parseFloat(li.qty), unit: li.unit, received: 0, priority: li.priority,
                isBoq: li.isBoq, boqItemId: li.boqItemId || undefined, nonBoqReason: li.nonBoqReason || undefined,
                clientApproval: li.clientApproval || false, trackCostImpact: li.trackCostImpact || false,
            })),
            comments: [],
            submittedAt: status === 'pending_approval' ? new Date().toISOString() : undefined
        };
    };

    const handleSubmit = () => {
        if (!selectedSite) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'Site is required', type: 'error' } }); return; }
        if (!description.trim()) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'Description is required', type: 'error' } }); return; }
        if (lineItems.some(li => !li.description.trim() || !li.qty)) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'All line items must have description and quantity', type: 'error' } }); return; }
        if (lineItems.some(li => parseFloat(li.qty) <= 0 || li.qty === '')) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'All items must have a quantity above zero', type: 'error' } }); return; }
        if (lineItems.some(li => !li.isBoq && !li.nonBoqReason.trim())) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'Non-BOQ items require a reason', type: 'error' } }); return; }

        var invalidItems = lineItems.filter(function(li) {
            if (li.isBoq && !li.boqItemId) return true;
            if (!li.isBoq && (!li.description || !li.description.trim())) return true;
            if (!li.unit) return true;
            if (!li.qty || parseFloat(li.qty) <= 0) return true;
            return false;
        });
        if (invalidItems.length > 0) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'All items must have Description, Unit, and Qty > 0', type: 'error' } });
            return;
        }

        saveIndent('pending_approval');
    };

    // Uploads any attachments, then saves the indent (not saved if an upload fails)
    const saveIndent = (status) => {
        const newIndent = createIndentObject(status);
        const finish = (docs) => {
            newIndent.documents = docs.map(d => { d.uploadedBy = currentUserId; return d; });
            dispatch({ type: 'CREATE_INDENT', payload: newIndent });
            dispatch({ type: 'SHOW_TOAST', payload: { message: status === 'draft' ? 'Draft saved' : 'Indent submitted for approval', type: 'success' } });
            window.location.hash = '#my-indents';
        };
        if (attachments.length === 0) { finish([]); return; }
        setUploading(true);
        uploadPickedFiles(newIndent.id, attachments, lineItems.map(li => li.id)).then(docs => {
            setUploading(false);
            finish(docs);
        }).catch(err => {
            setUploading(false);
            dispatch({ type: 'SHOW_TOAST', payload: { message: (err.message || 'Could not upload the attachments') + '. The indent was not saved.', type: 'error' } });
        });
    };

    const handleSaveDraft = () => {
        if (!selectedSite) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'Site is required', type: 'error' } }); return; }
        if (lineItems.some(li => !li.description.trim() || !li.qty)) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'All line items must have description and quantity', type: 'error' } }); return; }
        if (lineItems.some(li => parseFloat(li.qty) <= 0 || li.qty === '')) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'All items must have a quantity above zero', type: 'error' } }); return; }

        saveIndent('draft');
    };

    return React.createElement('div', null,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Create New Indent')
            ),

            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' } },
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', { className: 'form-label' }, 'Site'),
                    React.createElement('div', {
                        style: { padding: '8px 12px', backgroundColor: '#f1f5f9', borderRadius: '6px', border: '1px solid #e2e8f0' }
                    }, userSites.length > 0 ? getSiteName(selectedSite, state.sites) : 'No site assigned')
                ),
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', { className: 'form-label' }, 'Required Date'),
                    React.createElement('input', {
                        type: 'date', className: 'form-input', value: requiredDate,
                        onChange: (e) => setRequiredDate(e.target.value),
                        min: new Date().toISOString().split('T')[0]
                    })
                ),
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', { className: 'form-label' }, 'Priority'),
                    React.createElement('select', {
                        className: 'form-select', value: priority,
                        onChange: (e) => setPriority(e.target.value)
                    },
                        React.createElement('option', { value: 'low' }, 'Low'),
                        React.createElement('option', { value: 'normal' }, 'Normal'),
                        React.createElement('option', { value: 'urgent' }, 'Urgent')
                    )
                )
            ),

            React.createElement('div', { className: 'form-group' },
                React.createElement('label', { className: 'form-label' }, 'Description'),
                React.createElement('textarea', {
                    className: 'form-textarea', value: description,
                    onChange: (e) => setDescription(e.target.value),
                    placeholder: 'Enter indent description...'
                })
            ),

            React.createElement('div', { className: 'form-group' },
                React.createElement('label', { className: 'form-label' }, 'Notes'),
                React.createElement('textarea', {
                    className: 'form-textarea', value: notes,
                    onChange: (e) => setNotes(e.target.value),
                    placeholder: 'Describe what you need, where, and why',
                    style: { minHeight: '80px' }
                })
            ),

            React.createElement('div', { className: 'form-group' },
                React.createElement('label', { className: 'form-label' }, 'Line Items'),
                lineItems.map((li, idx) =>
                    React.createElement('div', {
                        key: li.id,
                        style: { border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '12px', backgroundColor: '#fafbfc' }
                    },
                        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
                            React.createElement('span', { style: { fontWeight: '600', fontSize: '13px', color: '#475569' } }, 'Item ' + (idx + 1)),
                            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' } },
                                    React.createElement('input', { type: 'radio', name: 'boq-' + li.id, checked: li.isBoq, onChange: () => handleLineItemChange(li.id, 'isBoq', true) }), ' BOQ'
                                ),
                                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' } },
                                    React.createElement('input', { type: 'radio', name: 'boq-' + li.id, checked: !li.isBoq, onChange: () => handleLineItemChange(li.id, 'isBoq', false) }), ' Non-BOQ'
                                ),
                                lineItems.length > 1
                                    ? React.createElement('button', { className: 'btn btn-sm btn-danger', onClick: () => handleRemoveLineItem(li.id) }, 'Remove')
                                    : null
                            )
                        ),
                        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px' } },
                            li.isBoq
                                ? React.createElement('div', null,
                                    React.createElement('label', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' } }, 'BOQ Material'),
                                    React.createElement('select', {
                                        className: 'form-select', value: li.boqItemId,
                                        onChange: (e) => handleLineItemChange(li.id, 'boqItemId', e.target.value)
                                    },
                                        React.createElement('option', { value: '' }, 'Select BOQ item...'),
                                        boqItems.map(b =>
                                            React.createElement('option', { key: b.id, value: b.id }, b.name + ' (' + b.unit + ')')
                                        )
                                    )
                                )
                                : React.createElement('div', null,
                                    React.createElement('label', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' } }, 'Material Name'),
                                    React.createElement('input', {
                                        type: 'text', className: 'form-input', value: li.description,
                                        onChange: (e) => handleLineItemChange(li.id, 'description', e.target.value),
                                        placeholder: 'Material name'
                                    })
                                ),
                            React.createElement('div', null,
                                React.createElement('label', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' } }, 'Qty'),
                                React.createElement('input', {
                                    type: 'number', className: 'form-input', value: li.qty,
                                    onChange: (e) => handleLineItemChange(li.id, 'qty', e.target.value), min: '0', step: 'any'
                                })
                            ),
                            React.createElement('div', null,
                                React.createElement('label', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' } }, 'Unit'),
                                React.createElement('select', {
                                    className: 'form-select', value: li.unit,
                                    onChange: (e) => handleLineItemChange(li.id, 'unit', e.target.value),
                                    disabled: li.isBoq && li.boqItemId
                                },
                                    unitOptionElements(li.unit)
                                )
                            ),
                            React.createElement('div', null,
                                React.createElement('label', { style: { fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' } }, 'Priority'),
                                React.createElement('select', {
                                    className: 'form-select', value: li.priority,
                                    onChange: (e) => handleLineItemChange(li.id, 'priority', e.target.value)
                                },
                                    React.createElement('option', { value: 'low' }, 'Low'),
                                    React.createElement('option', { value: 'medium' }, 'Medium'),
                                    React.createElement('option', { value: 'high' }, 'High')
                                )
                            )
                        ),
                        !li.isBoq
                            ? React.createElement('div', {
                                style: { marginTop: '12px', padding: '12px', backgroundColor: '#fff7ed', borderRadius: '6px', border: '1px solid #fed7aa' }
                            },
                                React.createElement('div', { style: { marginBottom: '8px' } },
                                    React.createElement('label', { style: { fontSize: '12px', color: '#9a3412', fontWeight: '600', marginBottom: '4px', display: 'block' } }, 'Reason for requirement *'),
                                    React.createElement('input', {
                                        type: 'text', className: 'form-input', value: li.nonBoqReason,
                                        onChange: (e) => handleLineItemChange(li.id, 'nonBoqReason', e.target.value),
                                        placeholder: 'Why is this non-BOQ item needed?'
                                    })
                                ),
                                React.createElement('div', { style: { display: 'flex', gap: '16px' } },
                                    React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' } },
                                        React.createElement('input', {
                                            type: 'checkbox', checked: li.clientApproval,
                                            onChange: (e) => handleLineItemChange(li.id, 'clientApproval', e.target.checked)
                                        }), ' Client approval needed?'
                                    ),
                                    React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' } },
                                        React.createElement('input', {
                                            type: 'checkbox', checked: li.trackCostImpact,
                                            onChange: (e) => handleLineItemChange(li.id, 'trackCostImpact', e.target.checked)
                                        }), ' Track cost impact?'
                                    )
                                )
                            )
                            : null
                    )
                ),
                React.createElement('button', { className: 'btn btn-secondary', onClick: handleAddLineItem, style: { marginTop: '8px' } }, 'Add Line Item')
            ),

            React.createElement(AttachmentPicker, { files: attachments, setFiles: setAttachments, items: lineItems }),

            React.createElement('div', { className: 'action-buttons' },
                React.createElement('button', { className: 'btn btn-primary', onClick: handleSubmit, disabled: uploading }, uploading ? 'Uploading...' : 'Submit Indent'),
                React.createElement('button', { className: 'btn btn-secondary', onClick: handleSaveDraft, disabled: uploading }, 'Save as Draft'),
                React.createElement('button', { className: 'btn btn-secondary', onClick: () => { window.location.hash = '#store-pending'; } }, 'Cancel')
            )
        )
    );
}

// ============================================================================
// 13. STORE HISTORY SCREEN
// ============================================================================

function StoreHistoryScreen() {
    const [state] = React.useContext(AppContext);
    const storeKeeperSites = getUserSites(state.currentUserId, state.sites, state.siteAssignments);
    const siteIds = storeKeeperSites.map(s => s.id);

    const allHistory = state.indents.filter(i => {
        if (!siteIds.includes(i.siteId)) return false;
        return i.lineItems.some(li => li.received > 0);
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const historyList = useListControls(allHistory, indentListFields(state));
    const historyIndents = historyList.rows;

    const getReceiptStatus = (indent) => {
        return indent.lineItems.every(li => li.received >= li.qty) ? 'Complete' : 'Partial';
    };

    const getReceiptStatusColor = (indent) => {
        return indent.lineItems.every(li => li.received >= li.qty) ? '#10b981' : '#f59e0b';
    };

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'Indent History')
        ),
        React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, historyList.bar),
        React.createElement('table', { className: 'table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', null, 'Indent No.'),
                    React.createElement('th', null, 'Description'),
                    React.createElement('th', null, 'Receipt Status')
                )
            ),
            React.createElement('tbody', null,
                historyIndents.length === 0
                    ? React.createElement('tr', null,
                        React.createElement('td', { colSpan: '3', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No receipt history')
                    )
                    : historyIndents.map(indent =>
                        React.createElement('tr', { key: indent.id },
                            React.createElement('td', null,
                                React.createElement('a', { href: '#indent/' + indent.id, style: { textDecoration: 'none', color: '#2563eb' } }, getIndentDisplayId(indent, state.indents))
                            ),
                            React.createElement('td', null, indent.lineItems.map(li => li.name || li.description).join(', ')),
                            React.createElement('td', null,
                                React.createElement('span', {
                                    className: 'status-badge',
                                    style: { backgroundColor: getReceiptStatusColor(indent), color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500' }
                                }, getReceiptStatus(indent))
                            )
                        )
                    )
            )
        )
    );
}

// ============================================================================
// 14. STORE ALL SCREEN
// ============================================================================

function StoreAllScreen() {
    const [state] = React.useContext(AppContext);
    const storeKeeperSites = getUserSites(state.currentUserId, state.sites, state.siteAssignments);
    const siteIds = storeKeeperSites.map(s => s.id);
    const [filters, setFilters] = useState({});

    const allSiteIndentsRaw = state.indents.filter(i => siteIds.includes(i.siteId));
    const allList = useListControls(
        applyIndentFilters(allSiteIndentsRaw, filters).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
        indentListFields(state));
    const allSiteIndents = allList.rows;

    return React.createElement('div', null,
        React.createElement(IndentFilterBar, {
            sites: storeKeeperSites, users: state.users, filters, setFilters,
            totalCount: allSiteIndentsRaw.length, filteredCount: allSiteIndents.length
        }),
        allList.bar,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'All Indents for My Store')
            ),
            React.createElement('table', { className: 'table' },
                React.createElement('thead', null,
                    React.createElement('tr', null,
                        React.createElement('th', null, 'Indent No.'),
                        React.createElement('th', null, 'Description'),
                        React.createElement('th', null, 'Status'),
                        React.createElement('th', null, 'Items'),
                        React.createElement('th', null, 'Created Date')
                    )
                ),
                React.createElement('tbody', null,
                    allSiteIndents.length === 0
                        ? React.createElement('tr', null,
                            React.createElement('td', { colSpan: '5', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No indents for your store')
                        )
                        : allSiteIndents.map(indent =>
                            React.createElement('tr', {
                                key: indent.id,
                                style: { cursor: 'pointer' },
                                onClick: () => { window.location.hash = '#indent/' + indent.id; }
                            },
                                React.createElement('td', null,
                                    React.createElement('a', { href: '#indent/' + indent.id, style: { textDecoration: 'none', color: '#2563eb' } }, getIndentDisplayId(indent, state.indents))
                                ),
                                React.createElement('td', null, indent.lineItems.map(li => li.name || li.description).join(', ')),
                                React.createElement('td', null, React.createElement(StatusBadge, { status: indent.status })),
                                React.createElement('td', null, indent.lineItems.length),
                                React.createElement('td', null, new Date(indent.createdAt).toLocaleDateString())
                            )
                        )
                )
            )
        )
    );
}

// ============================================================================
// 15. RECEIPT ENTRY SCREEN
// ============================================================================

function ReceiptEntryScreen({ indent, currentUserId }) {
    var _ctx = React.useContext(AppContext);
    var state = _ctx[0];
    var dispatch = _ctx[1];
    // What is typed (kept as text so decimals such as 2.5 can be entered) ...
    var _receivingRaw = useState({});
    var receivingRaw = _receivingRaw[0];
    var setReceivingRaw = _receivingRaw[1];
    // ... and the same as numbers
    var receivingNow = {};
    Object.keys(receivingRaw).forEach(function(k) { receivingNow[k] = parseFloat(receivingRaw[k]) || 0; });
    var _conditions = useState({});
    var conditions = _conditions[0];
    var setConditions = _conditions[1];
    var _qualityRemarks = useState({});
    var qualityRemarks = _qualityRemarks[0];
    var setQualityRemarks = _qualityRemarks[1];
    var _photoFile = useState(null);
    var photoFile = _photoFile[0];
    var setPhotoFile = _photoFile[1];
    var _photoPreview = useState(null);
    var photoPreview = _photoPreview[0];
    var setPhotoPreview = _photoPreview[1];
    var _uploading = useState(false);
    var uploading = _uploading[0];
    var setUploading = _uploading[1];
    var _receiptRemarks = useState('');
    var receiptRemarks = _receiptRemarks[0];
    var setReceiptRemarks = _receiptRemarks[1];

    var handleReceivingNowChange = function(lineItemId, value) {
        var li = indent.lineItems.find(function(l) { return l.id === lineItemId; });
        var remaining = (li ? li.qty : 0) - (li ? li.received : 0);
        var n = parseFloat(value);
        var text = value;
        if (!isNaN(n) && n > remaining) text = String(remaining);
        if (!isNaN(n) && n < 0) text = '0';
        setReceivingRaw(Object.assign({}, receivingRaw, { [lineItemId]: text }));
    };

    var handlePhotoChange = function(e) {
        var file = e.target.files[0];
        if (file) {
            setPhotoFile(file);
            var reader = new FileReader();
            reader.onload = function(event) { setPhotoPreview(event.target.result); };
            reader.readAsDataURL(file);
        }
    };

    var handleSaveReceipt = async function() {
        var lineItemUpdates = {};
        var hasAnyReceived = false;

        indent.lineItems.forEach(function(li) {
            var newAmount = receivingNow[li.id] || 0;
            if (newAmount > 0) {
                lineItemUpdates[li.id] = li.received + newAmount;
                hasAnyReceived = true;
            } else {
                lineItemUpdates[li.id] = li.received;
            }
        });

        if (!hasAnyReceived) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please receive at least one item', type: 'error' } });
            return;
        }
        // A quality flag needs an explanation (the database refuses it otherwise)
        var missingRemarks = indent.lineItems.find(function(li) {
            return (receivingNow[li.id] || 0) > 0 && (conditions[li.id] || 'Good') !== 'Good' && !(qualityRemarks[li.id] || '').trim();
        });
        if (missingRemarks) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: (missingRemarks.name || missingRemarks.description || 'Item') + ': describe the quality issue for a ' + conditions[missingRemarks.id] + ' item', type: 'error' } });
            return;
        }

        // A receipt needs evidence: a photo, or remarks
        var anyRemark = receiptRemarks.trim() !== '' || indent.lineItems.some(function(li) {
            return (receivingNow[li.id] || 0) > 0 && (qualityRemarks[li.id] || '').trim() !== '';
        });
        if (!photoFile && !anyRemark) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Add a photo or remarks to record this receipt', type: 'error' } });
            return;
        }

        // Upload photo if present
        var photoUrl = '';
        if (photoFile) {
            setUploading(true);
            try {
                var filePath = 'indent-receipts/' + indent.id + '/' + Date.now() + '-' + photoFile.name;
                var uploadResult = await supabaseClient.storage.from('receipts').upload(filePath, photoFile);
                if (uploadResult.error) {
                    console.warn('[NC_MIS] Photo upload failed:', uploadResult.error.message);
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'Photo could not be uploaded (' + uploadResult.error.message + '). The receipt will be saved without it.', type: 'error' } });
                } else {
                    var urlResult = supabaseClient.storage.from('receipts').getPublicUrl(filePath);
                    photoUrl = urlResult.data ? urlResult.data.publicUrl : '';
                }
            } catch (uploadErr) {
                console.warn('[NC_MIS] Photo upload error:', uploadErr);
            }
            setUploading(false);
        }

        if (!photoUrl && !anyRemark) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'The photo was not uploaded. Add remarks, or try the photo again.', type: 'error' } });
            return;
        }

        // Summarise what was received, in what condition, so it is kept with the indent
        var receipts = [];
        var receiptLines = [];
        var qualityIssues = [];
        indent.lineItems.forEach(function(li) {
            var qtyNow = receivingNow[li.id] || 0;
            if (qtyNow > 0) {
                var cond = conditions[li.id] || 'Good';
                var qr = (qualityRemarks[li.id] || '').trim();
                var itemName = li.name || li.description || 'Item';
                receipts.push({ lineItemId: li.id, quantity: qtyNow, condition: cond, qualityRemarks: qr });
                receiptLines.push(itemName + ': ' + qtyNow + ' ' + (li.unit || '') + ' received, ' + cond + (qr ? ' (' + qr + ')' : ''));
                if (cond !== 'Good') qualityIssues.push(itemName + ': ' + cond + (qr ? ' (' + qr + ')' : ''));
            }
        });
        var receiptNote = receiptLines.join('; ') + (photoUrl ? ' | Photo: ' + photoUrl : '');

        dispatch({ type: 'RECEIVE_ITEMS', payload: { indentId: indent.id, lineItemUpdates, receipts: receipts, photoUrl: photoUrl, remarks: receiptRemarks.trim(), receiptNote: receiptNote, qualityIssues: qualityIssues } });

        var allFullyReceived = indent.lineItems.every(function(li) { return (lineItemUpdates[li.id] || li.received) >= li.qty; });
        var message = allFullyReceived ? 'Receipt saved - Indent completed' : 'Receipt saved successfully';
        dispatch({ type: 'SHOW_TOAST', payload: { message: message, type: 'success' } });
        window.location.hash = '#store-pending';
    };

    return React.createElement('div', null,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Record Receipt for ' + getIndentDisplayId(indent, state.indents))
            ),
            React.createElement('div', { className: 'info-grid' },
                React.createElement('div', { className: 'info-field' },
                    React.createElement('div', { className: 'info-label' }, 'Site'),
                    React.createElement('div', { className: 'info-value' }, getSiteName(indent.siteId, state.sites))
                ),
                React.createElement('div', { className: 'info-field' },
                    React.createElement('div', { className: 'info-label' }, 'Created By'),
                    React.createElement('div', { className: 'info-value' }, getUserName(indent.createdBy, state.users))
                ),
                React.createElement('div', { className: 'info-field' },
                    React.createElement('div', { className: 'info-label' }, 'Status'),
                    React.createElement('div', { className: 'info-value' }, React.createElement(StatusBadge, { status: indent.status }))
                )
            )
        ),

        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Line Items - Record Receipts')
            ),
            React.createElement('div', { style: { overflowX: 'auto' } },
                React.createElement('table', { className: 'line-items-table', style: { minWidth: '800px' } },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            React.createElement('th', null, 'Material'),
                            React.createElement('th', null, 'Qty'),
                            React.createElement('th', null, 'Received'),
                            React.createElement('th', null, 'Remaining'),
                            React.createElement('th', null, 'Unit'),
                            React.createElement('th', null, 'Receiving Now'),
                            React.createElement('th', null, 'Condition'),
                            React.createElement('th', null, 'Quality Remarks')
                        )
                    ),
                    React.createElement('tbody', null,
                        indent.lineItems.map(function(li) {
                            var remaining = li.qty - li.received;
                            var receivingAmount = receivingRaw[li.id] !== undefined ? receivingRaw[li.id] : '';
                            return React.createElement('tr', { key: li.id },
                                React.createElement('td', null, li.description),
                                React.createElement('td', null, li.qty),
                                React.createElement('td', null, li.received),
                                React.createElement('td', null, remaining),
                                React.createElement('td', null, li.unit),
                                React.createElement('td', null,
                                    React.createElement('input', {
                                        type: 'number', className: 'form-input',
                                        style: { width: '80px' }, min: '0', max: remaining, step: 'any',
                                        value: receivingAmount,
                                        onChange: function(e) { handleReceivingNowChange(li.id, e.target.value); },
                                        placeholder: '0'
                                    })
                                ),
                                React.createElement('td', null,
                                    React.createElement('select', {
                                        value: conditions[li.id] || 'Good',
                                        onChange: function(e) { setConditions(Object.assign({}, conditions, { [li.id]: e.target.value })); },
                                        style: { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px',
                                            backgroundColor: (conditions[li.id] && conditions[li.id] !== 'Good') ? '#fef2f2' : '#fff',
                                            color: (conditions[li.id] && conditions[li.id] !== 'Good') ? '#dc2626' : '#1e293b' }
                                    },
                                        React.createElement('option', { value: 'Good' }, 'Good'),
                                        React.createElement('option', { value: 'Damaged' }, 'Damaged'),
                                        React.createElement('option', { value: 'Partially Damaged' }, 'Partially Damaged'),
                                        React.createElement('option', { value: 'Rejected' }, 'Rejected')
                                    )
                                ),
                                React.createElement('td', null,
                                    conditions[li.id] && conditions[li.id] !== 'Good'
                                        ? React.createElement('input', {
                                            type: 'text',
                                            value: qualityRemarks[li.id] || '',
                                            onChange: function(e) { setQualityRemarks(Object.assign({}, qualityRemarks, { [li.id]: e.target.value })); },
                                            style: { width: '100%', padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fef2f2' },
                                            placeholder: 'Describe issue...',
                                        })
                                        : null
                                )
                            );
                        })
                    )
                )
            )
        ),

        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Photo or Remarks (at least one is required)')
            ),
            React.createElement('div', { style: { padding: '16px' } },
                React.createElement('label', { className: 'form-label', htmlFor: 'receipt-remarks' }, 'Remarks'),
                React.createElement('textarea', {
                    id: 'receipt-remarks', className: 'form-textarea', value: receiptRemarks,
                    onChange: function(e) { setReceiptRemarks(e.target.value); },
                    placeholder: 'Vehicle / challan number, who delivered, anything noticed...',
                    style: { minHeight: '60px', marginBottom: '16px' }
                }),
                React.createElement('label', {
                    htmlFor: 'photo-upload',
                    style: {
                        display: 'block', border: '2px dashed #cbd5e1', borderRadius: '8px',
                        padding: '32px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#f8fafc'
                    }
                },
                    React.createElement('div', { style: { fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' } }, 'Upload Photo'),
                    React.createElement('div', { style: { fontSize: '12px', color: '#64748b' } }, 'Invoice or delivery photo'),
                    React.createElement('input', {
                        id: 'photo-upload', type: 'file', accept: 'image/*',
                        onChange: handlePhotoChange, style: { display: 'none' }
                    })
                ),
                photoPreview
                    ? React.createElement('div', { style: { marginTop: '16px' } },
                        React.createElement('img', {
                            src: photoPreview, alt: 'Photo preview',
                            style: { maxWidth: '200px', maxHeight: '200px', borderRadius: '6px', border: '1px solid #e2e8f0' }
                        }),
                        React.createElement('div', { style: { marginTop: '8px', fontSize: '12px', color: '#64748b' } },
                            photoFile ? photoFile.name : ''
                        )
                    )
                    : null
            )
        ),

        React.createElement('div', { className: 'action-buttons' },
            React.createElement('button', { className: 'btn btn-success', onClick: handleSaveReceipt, disabled: uploading }, uploading ? 'Uploading...' : 'Save Receipt'),
            React.createElement('button', { className: 'btn btn-secondary', onClick: function() { window.location.hash = '#store-pending'; } }, 'Cancel')
        )
    );
}
