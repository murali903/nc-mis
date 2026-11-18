


// ============================================================================
// Shared procurement pieces
// ============================================================================

// Dispatch without a PO: vendor, expected date and notes / document reference
function DispatchModal({ indentId, onClose }) {
    const [state, dispatch] = React.useContext(AppContext);
    const [vendor, setVendor] = useState('');
    const [eta, setEta] = useState('');
    const [notes, setNotes] = useState('');
    const [docRef, setDocRef] = useState('');
    const indent = state.indents.find(i => i.id === indentId);

    const confirm = () => {
        const err = (m) => dispatch({ type: 'SHOW_TOAST', payload: { message: m, type: 'error' } });
        if (!vendor.trim()) return err('Vendor / supplier name is required');
        if (!eta) return err('Expected delivery date is required');
        if (!notes.trim()) return err('Dispatch notes are required');
        dispatch({ type: 'MARK_DISPATCHED', payload: { indentId, vendorName: vendor.trim(), expectedDelivery: eta, notes: notes.trim(), docReference: docRef.trim() } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent dispatched — the storekeeper has been told', type: 'success' } });
        onClose();
    };

    return React.createElement('div', {
        style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }
    },
        React.createElement('div', { role: 'dialog', 'aria-label': 'Dispatch details', style: { background: '#fff', borderRadius: '12px', padding: '24px', width: '500px', maxWidth: '90vw' } },
            React.createElement('h3', { style: { marginBottom: '8px', fontSize: '18px', fontWeight: '700' } },
                'Dispatch without a PO' + (indent ? ' — ' + getIndentDisplayId(indent, state.indents) : '')),
            React.createElement('p', { style: { fontSize: '13px', color: '#64748b', marginBottom: '16px' } },
                'Use this when material is sent to site without raising a purchase order here. The storekeeper will record the receipt against the indent.'),
            React.createElement('div', { style: { display: 'grid', gap: '12px' } },
                React.createElement('div', null,
                    React.createElement('label', { className: 'form-label' }, 'Vendor / Supplier Name *'),
                    React.createElement('input', { type: 'text', className: 'form-input', value: vendor, onChange: (e) => setVendor(e.target.value), placeholder: 'Vendor, or "Own stock" / "Other site"' })
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'form-label' }, 'Expected Delivery Date *'),
                    React.createElement('input', { type: 'date', className: 'form-input', value: eta, onChange: (e) => setEta(e.target.value), min: new Date().toISOString().split('T')[0] })
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'form-label' }, 'Document / Invoice Reference'),
                    React.createElement('input', { type: 'text', className: 'form-input', value: docRef, onChange: (e) => setDocRef(e.target.value), placeholder: 'Invoice no., DC no., etc.' })
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'form-label' }, 'Dispatch Notes *'),
                    React.createElement('textarea', { className: 'form-textarea', value: notes, onChange: (e) => setNotes(e.target.value), placeholder: 'Why no PO, transport details, quantity dispatched, etc.', style: { minHeight: '80px' } })
                )
            ),
            React.createElement('div', { style: { marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
                React.createElement('button', { className: 'btn btn-secondary', onClick: onClose }, 'Cancel'),
                React.createElement('button', { className: 'btn btn-success', onClick: confirm }, 'Confirm Dispatch')
            )
        )
    );
}

// Table of indents for the procurement work lists.
//   actions(indent) -> buttons for the last column (optional)
function IndentWorkTable({ indents, emptyText, actions }) {
    const [state] = React.useContext(AppContext);
    const headers = ['Indent No.', 'Description', 'Site', 'Raised By', 'Items', 'Stage', 'PO', 'Assigned To', 'Created'];
    if (actions) headers.push('Actions');
    return React.createElement('table', { className: 'table' },
        React.createElement('thead', null,
            React.createElement('tr', null, headers.map(h => React.createElement('th', { key: h }, h)))
        ),
        React.createElement('tbody', null,
            indents.length === 0
                ? React.createElement('tr', null,
                    React.createElement('td', { colSpan: String(headers.length), style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, emptyText))
                : indents.map(indent => {
                    const pos = (state.purchaseOrders || []).filter(po => po.indentId === indent.id && po.status !== 'cancelled');
                    return React.createElement('tr', { key: indent.id },
                        React.createElement('td', null,
                            React.createElement('a', { href: '#indent/' + indent.id, style: { textDecoration: 'none', color: '#2563eb', fontWeight: 600 } }, getIndentDisplayId(indent, state.indents))),
                        React.createElement('td', null, (indent.lineItems || []).map(li => li.name || li.description).join(', ')),
                        React.createElement('td', null, getSiteName(indent.siteId, state.sites)),
                        React.createElement('td', null, getUserName(indent.createdBy, state.users)),
                        React.createElement('td', null, (indent.lineItems || []).length),
                        React.createElement('td', null, React.createElement(StatusBadge, { status: indent.status })),
                        React.createElement('td', null,
                            pos.length === 0 ? '-' : pos.map(po =>
                                React.createElement('div', { key: po.id },
                                    React.createElement('a', { href: '#po/' + po.id, style: { textDecoration: 'none', color: '#2563eb' } }, getPODisplayId(po)),
                                    React.createElement('span', { style: { fontSize: 11, color: '#64748b' } }, ' (' + statusLabel(po.status) + ')')))),
                        React.createElement('td', null, indent.assignedTo ? getUserName(indent.assignedTo, state.users) : '-'),
                        React.createElement('td', null, new Date(indent.createdAt).toLocaleDateString()),
                        actions ? React.createElement('td', null, actions(indent)) : null
                    );
                })
        )
    );
}

var PROCUREMENT_OPEN_STAGES = ['po_draft', 'pending_md_po_approval', 'po_approved', 'po_issued', 'dispatched'];

// ============================================================================
// 1. ESCALATED SCREEN
// ============================================================================

function EscalatedScreen() {
    const [state] = React.useContext(AppContext);
    const [filters, setFilters] = useState({});

    const getHoursPending = (createdAt) => {
        const now = new Date();
        const created = new Date(createdAt);
        return Math.floor((now - created) / (1000 * 60 * 60));
    };

    const allEscalated = state.indents.filter(i => {
        if (i.status !== 'pending_approval') return false;
        const hoursPending = getHoursPending(i.createdAt);
        return hoursPending > 36;
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const list = useListControls(applyIndentFilters(allEscalated, filters), indentListFields(state));
    const escalatedIndents = list.rows;

    return (
        React.createElement('div', null,
            React.createElement(IndentFilterBar, { sites: state.sites, users: state.users, filters, setFilters, totalCount: allEscalated.length, filteredCount: escalatedIndents.length }),
            list.bar,
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-header' },
                    React.createElement('div', { className: 'card-title' }, 'Escalated Indents (Pending >36h)')
                ),
                React.createElement('table', { className: 'table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            React.createElement('th', null, 'Indent No.'),
                            React.createElement('th', null, 'Description'),
                            React.createElement('th', null, 'Site'),
                            React.createElement('th', null, 'Engineer'),
                            React.createElement('th', null, 'Items'),
                            React.createElement('th', null, 'Hours Overdue')
                        )
                    ),
                    React.createElement('tbody', null,
                        escalatedIndents.length === 0
                            ? React.createElement('tr', null,
                                React.createElement('td', { colSpan: '6', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No escalated indents at this time')
                            )
                            : escalatedIndents.map(indent => {
                                const hoursPending = getHoursPending(indent.createdAt);
                                return React.createElement('tr', {
                                    key: indent.id,
                                    style: { cursor: 'pointer' },
                                    onClick: () => { window.location.hash = '#indent/' + indent.id; }
                                },
                                    React.createElement('td', null,
                                        React.createElement('a', { href: '#indent/' + indent.id, style: { textDecoration: 'none', color: '#2563eb' } }, getIndentDisplayId(indent, state.indents))
                                    ),
                                    React.createElement('td', null, indent.lineItems.map(li => li.name || li.description).join(', ')),
                                    React.createElement('td', null, getSiteName(indent.siteId, state.sites)),
                                    React.createElement('td', null, getUserName(indent.createdBy, state.users)),
                                    React.createElement('td', null, indent.lineItems.length),
                                    React.createElement('td', { style: { color: '#ef4444', fontWeight: '600' } }, (hoursPending - 24) + 'h')
                                );
                            })
                    )
                )
            )
        )
    );
}

// ============================================================================
// 2. PROCUREMENT APPROVED SCREEN
// ============================================================================

function ProcurementApprovedScreen() {
    const [state, dispatch] = React.useContext(AppContext);
    const [selectedIndentId, setSelectedIndentId] = useState(null);
    const [selectedClerk, setSelectedClerk] = useState('');
    const [filters, setFilters] = useState({});
    const currentUser = state.users.find(u => u.id === state.currentUserId);
    const isProcurementManager = currentUser && currentUser.role === 'procurement_manager';

    const allApproved = state.indents.filter(i => i.status === 'approved').sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const list = useListControls(applyIndentFilters(allApproved, filters), indentListFields(state));
    const approvedIndents = list.rows;
    const clerkUsers = state.users.filter(u => u.role === 'procurement_clerk');
    const [dispatchIndentId, setDispatchIndentId] = useState(null);

    const handleAssign = (indentId) => {
        if (!selectedClerk) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please select a clerk', type: 'error' } });
            return;
        }
        dispatch({ type: 'ASSIGN_INDENT', payload: { indentId, userId: selectedClerk } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent assigned to clerk', type: 'success' } });
        setSelectedIndentId(null);
        setSelectedClerk('');
    };

    const handleSelfAssign = (indentId) => {
        dispatch({ type: 'ASSIGN_INDENT', payload: { indentId, userId: state.currentUserId } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent self-assigned', type: 'success' } });
    };

    const [escalateIndentId, setEscalateIndentId] = useState(null);
    const [escalateRemarks, setEscalateRemarks] = useState('');

    const handleEscalateToMD = () => {
        if (!escalateRemarks.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please provide remarks for the escalation', type: 'error' } });
            return;
        }
        dispatch({ type: 'ESCALATE_TO_MD', payload: { indentId: escalateIndentId, remarks: escalateRemarks, escalatedBy: state.currentUserId } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent escalated to MD', type: 'success' } });
        setEscalateIndentId(null);
        setEscalateRemarks('');
    };

    // Dispatch without a PO always goes through the details form (vendor, date, notes)
    const handleDirectFulfill = (indentId) => setDispatchIndentId(indentId);

    return (
        React.createElement('div', null,
            escalateIndentId ? React.createElement('div', {
                style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }
            },
                React.createElement('div', {
                    style: { background: '#fff', borderRadius: '12px', padding: '24px', width: '480px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }
                },
                    React.createElement('h3', { style: { marginBottom: '16px', fontSize: '16px' } }, 'Escalate to MD'),
                    React.createElement('p', { style: { fontSize: '13px', color: '#64748b', marginBottom: '12px' } }, 'Explain why this indent needs MD attention:'),
                    React.createElement('textarea', {
                        className: 'form-textarea',
                        value: escalateRemarks,
                        onChange: (e) => setEscalateRemarks(e.target.value),
                        placeholder: 'Remarks for MD...',
                        style: { minHeight: '80px', marginBottom: '16px', width: '100%' }
                    }),
                    React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
                        React.createElement('button', { className: 'btn btn-secondary', onClick: () => { setEscalateIndentId(null); setEscalateRemarks(''); } }, 'Cancel'),
                        React.createElement('button', { className: 'btn btn-primary', onClick: handleEscalateToMD }, 'Escalate')
                    )
                )
            ) : null,
            dispatchIndentId ? React.createElement(DispatchModal, { indentId: dispatchIndentId, onClose: () => setDispatchIndentId(null) }) : null,
            React.createElement(IndentFilterBar, { sites: state.sites, users: state.users, filters, setFilters, totalCount: allApproved.length, filteredCount: approvedIndents.length }),
            list.bar,
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-header' },
                    React.createElement('div', { className: 'card-title' }, 'Approved Indents for Procurement')
                ),
                React.createElement('table', { className: 'table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            React.createElement('th', null, 'Indent No.'),
                            React.createElement('th', null, 'Description'),
                            React.createElement('th', null, 'Site'),
                            React.createElement('th', null, 'Engineer'),
                            React.createElement('th', null, 'Items'),
                            React.createElement('th', null, 'Approved Date'),
                            React.createElement('th', null, 'Actions')
                        )
                    ),
                    React.createElement('tbody', null,
                        approvedIndents.length === 0
                            ? React.createElement('tr', null,
                                React.createElement('td', { colSpan: '7', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No approved indents')
                            )
                            : approvedIndents.map(indent =>
                                React.createElement('tr', { key: indent.id },
                                    React.createElement('td', null,
                                        React.createElement('a', { href: '#indent/' + indent.id, style: { textDecoration: 'none', color: '#2563eb' } }, getIndentDisplayId(indent, state.indents))
                                    ),
                                    React.createElement('td', null, indent.lineItems.map(li => li.name || li.description).join(', ')),
                                    React.createElement('td', null, getSiteName(indent.siteId, state.sites)),
                                    React.createElement('td', null, getUserName(indent.createdBy, state.users)),
                                    React.createElement('td', null, indent.lineItems.length),
                                    React.createElement('td', null, new Date(indent.createdAt).toLocaleDateString()),
                                    React.createElement('td', null,
                                        React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                                            React.createElement('select', {
                                                className: 'form-select',
                                                style: { padding: '6px 8px', fontSize: '12px' },
                                                value: selectedIndentId === indent.id ? selectedClerk : '',
                                                onChange: (e) => { setSelectedIndentId(indent.id); setSelectedClerk(e.target.value); }
                                            },
                                                React.createElement('option', { value: '' }, 'Select clerk...'),
                                                clerkUsers.map(clerk =>
                                                    React.createElement('option', { key: clerk.id, value: clerk.id }, clerk.name)
                                                )
                                            ),
                                            React.createElement('button', {
                                                className: 'btn btn-sm btn-primary',
                                                onClick: () => handleAssign(indent.id),
                                                style: { whiteSpace: 'nowrap' }
                                            }, 'Assign'),
                                            isProcurementManager && React.createElement('button', {
                                                className: 'btn btn-sm btn-secondary',
                                                onClick: () => handleSelfAssign(indent.id),
                                                style: { whiteSpace: 'nowrap' }
                                            }, 'Self Assign'),
                                            React.createElement('button', {
                                                className: 'btn btn-sm',
                                                style: { backgroundColor: '#f59e0b', color: 'white', fontSize: '12px', whiteSpace: 'nowrap' },
                                                onClick: () => setEscalateIndentId(indent.id)
                                            }, 'Escalate to MD'),
                                            React.createElement('button', {
                                                className: 'btn btn-sm',
                                                style: { backgroundColor: '#10b981', color: 'white', fontSize: '12px', whiteSpace: 'nowrap' },
                                                onClick: () => handleDirectFulfill(indent.id)
                                            }, 'Dispatch without PO')
                                        )
                                    )
                                )
                            )
                    )
                )
            )
        )
    );
}

// ============================================================================
// 3. PROCUREMENT PROGRESS SCREEN
// ============================================================================

function ProcurementProgressScreen() {
    const [state, dispatch] = React.useContext(AppContext);
    const [activeTab, setActiveTab] = useState('my-work');
    const [dispatchIndentId, setDispatchIndentId] = useState(null);
    const newestFirst = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

    // To do: assigned to me, or not assigned to anyone yet (e.g. approved by the MD on escalation)
    const myWork = state.indents.filter(i =>
        i.status === 'in_procurement' && (i.assignedTo === state.currentUserId || !i.assignedTo)
    ).sort(newestFirst);

    const clerkWork = state.indents.filter(i => {
        if (i.status !== 'in_procurement') return false;
        const assignee = state.users.find(u => u.id === i.assignedTo);
        return assignee && assignee.role === 'procurement_clerk' && i.assignedTo !== state.currentUserId;
    }).sort(newestFirst);

    // Everything procurement has acted on that is not finished: PO in draft, with the MD,
    // approved, issued; dispatched without a PO; or escalated to the MD by procurement
    const ordered = state.indents.filter(i =>
        PROCUREMENT_OPEN_STAGES.includes(i.status) || (i.status === 'escalated_to_md' && i.approvedBy)
    ).sort(newestFirst);

    const completed = state.indents.filter(i => i.status === 'completed').sort(newestFirst);

    const fields = indentListFields(state);
    const lists = {
        'my-work': useListControls(myWork, fields),
        'clerk-work': useListControls(clerkWork, fields),
        'ordered': useListControls(ordered, fields),
        'completed': useListControls(completed, fields),
    };

    const renderTab = (label, tabKey, count) => {
        return React.createElement('button', {
            onClick: () => setActiveTab(tabKey),
            style: {
                padding: '12px 20px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '14px',
                fontWeight: activeTab === tabKey ? '600' : '500',
                color: activeTab === tabKey ? '#2563eb' : '#64748b',
                borderBottom: activeTab === tabKey ? '3px solid #2563eb' : '3px solid transparent',
            }
        }, label + ' (' + count + ')');
    };

    const workActions = (indent) => React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        React.createElement('button', {
            className: 'btn btn-sm btn-primary',
            onClick: () => { window.location.hash = '#create-po/' + indent.id; }
        }, 'Create PO'),
        React.createElement('button', {
            className: 'btn btn-sm btn-success',
            onClick: () => setDispatchIndentId(indent.id)
        }, 'Dispatch without PO')
    );

    const empty = {
        'my-work': 'Nothing waiting for you',
        'clerk-work': 'No work with the clerks',
        'ordered': 'No indents with a PO or dispatch in progress',
        'completed': 'No completed indents yet',
    };
    const active = lists[activeTab];

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'Indents in Procurement')
        ),
        React.createElement('div', { style: { borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap' } },
            renderTab('My Work', 'my-work', myWork.length),
            renderTab('Clerk Work', 'clerk-work', clerkWork.length),
            renderTab('Ordered / Dispatched', 'ordered', ordered.length),
            renderTab('Completed', 'completed', completed.length)
        ),
        React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, active.bar),
        React.createElement(IndentWorkTable, {
            indents: active.rows,
            emptyText: active.term ? 'No indents match your search' : empty[activeTab],
            actions: activeTab === 'my-work' ? workActions : null,
        }),
        dispatchIndentId ? React.createElement(DispatchModal, { indentId: dispatchIndentId, onClose: () => setDispatchIndentId(null) }) : null
    );
}

// ============================================================================
// 4. CLERK ASSIGNED SCREEN
// ============================================================================

function ClerkAssignedScreen() {
    const [state, dispatch] = React.useContext(AppContext);
    const [activeTab, setActiveTab] = useState('todo');
    const [dispatchIndentId, setDispatchIndentId] = useState(null);
    const newestFirst = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

    const mine = state.indents.filter(i => i.assignedTo === state.currentUserId);
    const todo = mine.filter(i => i.status === 'in_procurement').sort(newestFirst);
    const ordered = mine.filter(i => PROCUREMENT_OPEN_STAGES.includes(i.status) || i.status === 'escalated_to_md').sort(newestFirst);
    const completed = mine.filter(i => i.status === 'completed').sort(newestFirst);

    const fields = indentListFields(state);
    const lists = {
        todo: useListControls(todo, fields),
        ordered: useListControls(ordered, fields),
        completed: useListControls(completed, fields),
    };

    const renderTab = (label, tabKey, count) => React.createElement('button', {
        onClick: () => setActiveTab(tabKey),
        style: {
            padding: '12px 20px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '14px',
            fontWeight: activeTab === tabKey ? '600' : '500',
            color: activeTab === tabKey ? '#2563eb' : '#64748b',
            borderBottom: activeTab === tabKey ? '3px solid #2563eb' : '3px solid transparent',
        }
    }, label + ' (' + count + ')');

    const workActions = (indent) => React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        React.createElement('button', {
            className: 'btn btn-sm btn-primary',
            onClick: () => { window.location.hash = '#create-po/' + indent.id; }
        }, 'Create PO'),
        React.createElement('button', {
            className: 'btn btn-sm btn-success',
            onClick: () => setDispatchIndentId(indent.id)
        }, 'Dispatch without PO')
    );

    const empty = { todo: 'No indents assigned to you', ordered: 'None of your indents has a PO or dispatch in progress', completed: 'No completed indents yet' };
    const active = lists[activeTab];

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'My Assigned Indents')
        ),
        React.createElement('div', { style: { borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap' } },
            renderTab('To Do', 'todo', todo.length),
            renderTab('Ordered / Dispatched', 'ordered', ordered.length),
            renderTab('Completed', 'completed', completed.length)
        ),
        React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, active.bar),
        React.createElement(IndentWorkTable, {
            indents: active.rows,
            emptyText: active.term ? 'No indents match your search' : empty[activeTab],
            actions: activeTab === 'todo' ? workActions : null,
        }),
        dispatchIndentId ? React.createElement(DispatchModal, { indentId: dispatchIndentId, onClose: () => setDispatchIndentId(null) }) : null
    );
}

// ============================================================================
// 5. PROCUREMENT DASHBOARD SCREEN (NEW)
// ============================================================================

function ProcurementDashboardScreen() {
    const [state] = React.useContext(AppContext);

    var _filterStatus = useState('all');
    var filterStatus = _filterStatus[0];
    var setFilterStatus = _filterStatus[1];

    var _filterSite = useState('all');
    var filterSite = _filterSite[0];
    var setFilterSite = _filterSite[1];

    var _filterPriority = useState('all');
    var filterPriority = _filterPriority[0];
    var setFilterPriority = _filterPriority[1];

    var dashFiltered = (state.indents || []).filter(function(indent) {
        if (filterStatus !== 'all' && indent.status !== filterStatus) return false;
        if (filterSite !== 'all' && indent.siteId !== filterSite) return false;
        if (filterPriority !== 'all' && indent.priority !== filterPriority) return false;
        return true;
    }).sort(function(a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
    var dashList = useListControls(dashFiltered, indentListFields(state));

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalApproved = state.indents.filter(i => i.status === 'approved').length;
    const inProcurement = state.indents.filter(i => i.status === 'in_procurement').length;
    const posPendingMD = state.purchaseOrders.filter(po => po.status === 'pending_approval').length;
    const posIssuedThisMonth = state.purchaseOrders.filter(po =>
        po.status === 'issued' && new Date(po.createdAt) >= thisMonthStart
    ).length;
    const dispatchedThisMonth = state.indents.filter(i => {
        if (i.status !== 'dispatched' && i.status !== 'completed') return false;
        const dispatchLog = (i.activityLog || []).find(l => l.action === 'Dispatched');
        return dispatchLog && new Date(dispatchLog.at) >= thisMonthStart;
    }).length;

    const recentActivity = state.indents
        .filter(i => i.activityLog && i.activityLog.length > 0)
        .map(i => {
            const lastLog = i.activityLog[i.activityLog.length - 1];
            return { indent: i, lastAction: lastLog.action, lastAt: lastLog.at, lastBy: lastLog.by };
        })
        .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt))
        .slice(0, 10);

    const summaryCards = [
        { label: 'Awaiting Procurement', value: totalApproved, color: '#2563eb', route: '#procurement-approved' },
        { label: 'In Procurement', value: inProcurement, color: '#f59e0b', route: '#procurement-progress' },
        { label: 'POs Pending MD', value: posPendingMD, color: '#ef4444', route: '#procurement-pos' },
        { label: 'POs Issued (Month)', value: posIssuedThisMonth, color: '#10b981', route: '#procurement-pos' },
        { label: 'Dispatched (Month)', value: dispatchedThisMonth, color: '#8b5cf6', route: '#procurement-progress' },
    ];

    return React.createElement('div', null,
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' } },
            summaryCards.map(card =>
                React.createElement('div', {
                    key: card.label,
                    className: 'card',
                    style: { textAlign: 'center', borderTop: '4px solid ' + card.color, cursor: 'pointer', transition: 'transform 0.15s ease' },
                    onClick: function() { window.location.hash = card.route; }
                },
                    React.createElement('div', { style: { fontSize: '32px', fontWeight: '700', color: card.color } }, card.value),
                    React.createElement('div', { style: { fontSize: '13px', color: '#64748b', marginTop: '4px' } }, card.label)
                )
            )
        ),
        // Filter bar
        React.createElement('div', {
          style: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px', padding: '12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }
        },
          React.createElement('div', null,
            React.createElement('label', { style: { fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px', color: '#374151' } }, 'Status'),
            React.createElement('select', {
              value: filterStatus,
              onChange: function(e) { setFilterStatus(e.target.value); },
              style: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }
            },
              React.createElement('option', { value: 'all' }, 'All Statuses'),
              ['pending_approval', 'approved', 'escalated_to_md', 'in_procurement', 'po_draft', 'pending_md_po_approval',
               'po_approved', 'po_issued', 'dispatched', 'completed', 'rejected', 'returned_for_revision']
                .map(function(st) { return React.createElement('option', { key: st, value: st }, statusLabel(st)); })
            )
          ),
          React.createElement('div', null,
            React.createElement('label', { style: { fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px', color: '#374151' } }, 'Site'),
            React.createElement('select', {
              value: filterSite,
              onChange: function(e) { setFilterSite(e.target.value); },
              style: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }
            },
              React.createElement('option', { value: 'all' }, 'All Sites'),
              (state.sites || []).map(function(site) {
                return React.createElement('option', { key: site.id, value: site.id }, site.name);
              })
            )
          ),
          React.createElement('div', null,
            React.createElement('label', { style: { fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px', color: '#374151' } }, 'Priority'),
            React.createElement('select', {
              value: filterPriority,
              onChange: function(e) { setFilterPriority(e.target.value); },
              style: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }
            },
              React.createElement('option', { value: 'all' }, 'All Priorities'),
              React.createElement('option', { value: 'urgent' }, 'Urgent'),
              React.createElement('option', { value: 'normal' }, 'Normal'),
              React.createElement('option', { value: 'low' }, 'Low')
            )
          ),
          React.createElement('div', { style: { alignSelf: 'flex-end' } },
            React.createElement('button', {
              className: 'btn btn-secondary',
              style: { fontSize: '13px', padding: '6px 12px' },
              onClick: function() {
                setFilterStatus('all');
                setFilterSite('all');
                setFilterPriority('all');
              }
            }, 'Reset Filters')
          )
        ),

        // Filtered indent list
        (function() {
          var filteredIndents = dashList.rows;

          return React.createElement('div', { className: 'card', style: { marginBottom: '24px' } },
            React.createElement('div', { className: 'card-header' },
              React.createElement('div', { className: 'card-title' }, 'All Indents (' + filteredIndents.length + ')')
            ),
            React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, dashList.bar),
            React.createElement('table', { className: 'table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, 'Indent'),
                  React.createElement('th', null, 'Site'),
                  React.createElement('th', null, 'Priority'),
                  React.createElement('th', null, 'Status'),
                  React.createElement('th', null, 'Created'),
                  React.createElement('th', null, 'By')
                )
              ),
              React.createElement('tbody', null,
                filteredIndents.length === 0
                  ? React.createElement('tr', null,
                      React.createElement('td', { colSpan: '6', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No indents match filters')
                    )
                  : filteredIndents.slice(0, 200).map(function(item) {
                      return React.createElement('tr', {
                        key: item.id,
                        style: { cursor: 'pointer' },
                        onClick: function() { window.location.hash = '#indent/' + item.id; }
                      },
                        React.createElement('td', null,
                          React.createElement('a', { href: '#indent/' + item.id, style: { textDecoration: 'none', color: '#2563eb' } }, getIndentDisplayId(item, state.indents))
                        ),
                        React.createElement('td', null, getSiteName(item.siteId, state.sites)),
                        React.createElement('td', null, React.createElement(PriorityBadge, { priority: item.priority })),
                        React.createElement('td', null, React.createElement(StatusBadge, { status: item.status })),
                        React.createElement('td', null, new Date(item.createdAt).toLocaleDateString()),
                        React.createElement('td', null, getUserName(item.createdBy, state.users))
                      );
                    })
              )
            )
          );
        })(),

        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Recent Activity (Last 10)')
            ),
            React.createElement('table', { className: 'table' },
                React.createElement('thead', null,
                    React.createElement('tr', null,
                        React.createElement('th', null, 'Indent'),
                        React.createElement('th', null, 'Site'),
                        React.createElement('th', null, 'Status'),
                        React.createElement('th', null, 'Last Action'),
                        React.createElement('th', null, 'By'),
                        React.createElement('th', null, 'When')
                    )
                ),
                React.createElement('tbody', null,
                    recentActivity.length === 0
                        ? React.createElement('tr', null,
                            React.createElement('td', { colSpan: '6', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No recent activity')
                        )
                        : recentActivity.map(item =>
                            React.createElement('tr', {
                                key: item.indent.id,
                                style: { cursor: 'pointer' },
                                onClick: () => { window.location.hash = '#indent/' + item.indent.id; }
                            },
                                React.createElement('td', null,
                                    React.createElement('a', { href: '#indent/' + item.indent.id, style: { textDecoration: 'none', color: '#2563eb' } }, getIndentDisplayId(item.indent, state.indents))
                                ),
                                React.createElement('td', null, getSiteName(item.indent.siteId, state.sites)),
                                React.createElement('td', null, React.createElement(StatusBadge, { status: item.indent.status })),
                                React.createElement('td', null, item.lastAction),
                                React.createElement('td', null, getUserName(item.lastBy, state.users)),
                                React.createElement('td', null, new Date(item.lastAt).toLocaleString())
                            )
                        )
                )
            )
        )
    );
}

// ============================================================================
// 6. CREATE PO SCREEN (MODIFIED - GST, Payment Terms, Rate History, Full Vendor)
// ============================================================================

function CreatePOScreen({ indentId }) {
    const [state, dispatch] = React.useContext(AppContext);
    const indent = state.indents.find(i => i.id === indentId);
    const [vendorId, setVendorId] = useState('');
    const [showNewVendor, setShowNewVendor] = useState(false);
    const [newVendor, setNewVendor] = useState({
        name: '', contactPerson: '', phone: '', email: '', gstin: '', pan: '',
        address: '', city: '', state: '', pincode: '',
        bankAccount: '', bankName: '', ifsc: '',
        defaultPaymentTerms: 30, category: '', notes: ''
    });
    const [deliveryDate, setDeliveryDate] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('');
    const [remarks, setRemarks] = useState('');
    const [itemRates, setItemRates] = useState({});
    const [itemGst, setItemGst] = useState({});
    const [quotes, setQuotes] = useState([]);
    const [noQuote, setNoQuote] = useState(false);
    const [noQuoteReason, setNoQuoteReason] = useState('');
    const [uploading, setUploading] = useState(false);

    if (!indent) return React.createElement('div', { className: 'placeholder-screen' }, 'Indent not found');

    const site = state.sites.find(s => s.id === indent.siteId);
    const getNextPONumber = () => {
        // Number from the PO number (po.id is a UUID), within the current year
        const year = new Date().getFullYear();
        const existing = (state.purchaseOrders || []).map(po => {
            const match = String(po.poNumber || '').match(/^PO-(\d{4})-(\d{4,})$/);
            return match && parseInt(match[1]) === year ? parseInt(match[2]) : 0;
        });
        const maxNum = existing.length > 0 ? Math.max(...existing) : 0;
        return 'PO-' + year + '-' + String(maxNum + 1).padStart(4, '0');
    };
    const poNumber = getNextPONumber();

    const GST_OPTIONS = [0, 5, 12, 18, 28];
    const PAYMENT_TERMS_OPTIONS = ['Advance', '7 days', '15 days', '21 days', '30 days', '45 days', '60 days', '90 days'];

    const handleRateChange = (liId, rate) => {
        setItemRates({ ...itemRates, [liId]: parseFloat(rate) || 0 });
    };

    const handleGstChange = (liId, gst) => {
        setItemGst({ ...itemGst, [liId]: parseInt(gst) });
    };

    const getGstPercent = (liId) => {
        return itemGst[liId] !== undefined ? itemGst[liId] : 18;
    };

    const getRateHistory = (description) => {
        for (let i = state.purchaseOrders.length - 1; i >= 0; i--) {
            const po = state.purchaseOrders[i];
            const matchingItem = (po.lineItems || []).find(item => item.description === description);
            if (matchingItem && matchingItem.rate > 0) {
                return matchingItem.rate;
            }
        }
        return null;
    };

    const getLineCalcs = (li) => {
        const rate = itemRates[li.id] || 0;
        const baseAmount = li.qty * rate;
        const gstPct = getGstPercent(li.id);
        const gstAmount = baseAmount * gstPct / 100;
        const totalWithGst = baseAmount + gstAmount;
        return { baseAmount, gstPct, gstAmount, totalWithGst };
    };

    const subtotal = indent.lineItems.reduce((sum, li) => sum + getLineCalcs(li).baseAmount, 0);
    const totalGst = indent.lineItems.reduce((sum, li) => sum + getLineCalcs(li).gstAmount, 0);
    const grandTotal = subtotal + totalGst;

    const handleVendorChange = (vid) => {
        if (vid === '__new__') {
            setShowNewVendor(true);
            setVendorId('');
        } else {
            setVendorId(vid);
            setShowNewVendor(false);
            const vendor = state.vendors.find(v => v.id === vid);
            if (vendor && vendor.defaultPaymentTerms) {
                setPaymentTerms(vendor.defaultPaymentTerms + ' days');
            }
        }
    };

    const handleAddNewVendor = () => {
        if (!newVendor.name.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Vendor name is required', type: 'error' } });
            return;
        }
        const vendorObj = {
            id: genUUID(),
            ...newVendor,
            defaultPaymentTerms: parseInt(newVendor.defaultPaymentTerms) || 30
        };
        dispatch({ type: 'ADD_VENDOR', payload: vendorObj });
        setVendorId(vendorObj.id);
        setShowNewVendor(false);
        if (vendorObj.defaultPaymentTerms) {
            setPaymentTerms(vendorObj.defaultPaymentTerms + ' days');
        }
        setNewVendor({
            name: '', contactPerson: '', phone: '', email: '', gstin: '', pan: '',
            address: '', city: '', state: '', pincode: '',
            bankAccount: '', bankName: '', ifsc: '',
            defaultPaymentTerms: 30, category: '', notes: ''
        });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Vendor added', type: 'success' } });
    };

    const buildPO = () => {
        const vendor = state.vendors.find(v => v.id === vendorId);
        const poUUID = crypto.randomUUID ? crypto.randomUUID() : ('po-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
        return {
            id: poUUID,
            poNumber: poNumber,
            indentId: indent.id,
            vendorId: vendorId,
            vendorName: vendor ? vendor.name : 'Unknown',
            createdBy: state.currentUserId,
            createdAt: new Date().toISOString(),
            deliveryDate,
            paymentTerms,
            deliveryAddress: site ? site.name + ', ' + site.location : '',
            notes: remarks.trim(),
            noQuoteReason: noQuote ? noQuoteReason.trim() : '',
            status: 'draft',
            totalAmount: grandTotal,
            lineItems: indent.lineItems.map(li => {
                const calcs = getLineCalcs(li);
                return {
                    id: li.id,
                    description: li.description,
                    qty: li.qty,
                    quantity: li.qty,
                    unit: li.unit,
                    rate: itemRates[li.id] || 0,
                    unitPrice: itemRates[li.id] || 0,
                    amount: calcs.baseAmount,
                    gstPercent: calcs.gstPct,
                    gstAmount: calcs.gstAmount,
                    amountWithGst: calcs.totalWithGst,
                };
            }),
        };
    };

    const currentUser = state.users.find(u => u.id === state.currentUserId);
    const isManager = currentUser && (currentUser.role === 'procurement_manager' || currentUser.role === 'admin');
    const mdLimit = poApprovalLimit(state);
    // Compared with the limit: this PO plus any other live PO on the same indent
    const valueForLimit = poValueForLimit({ id: null, indentId: indent.id }, state, grandTotal);
    const needsMD = valueForLimit > mdLimit;

    const fail = (message) => { dispatch({ type: 'SHOW_TOAST', payload: { message, type: 'error' } }); return false; };

    // Everything a PO needs before it can go to the MD or to the vendor
    const checkComplete = () => {
        if (!vendorId) return fail('Please select a vendor');
        if (!indent.lineItems || indent.lineItems.length === 0) return fail('Cannot create PO — indent has no line items');
        if (!deliveryDate) return fail('Delivery date is required');
        if (!paymentTerms || paymentTerms.trim() === 'Custom:') return fail('Payment terms are required');
        const noRate = indent.lineItems.find(li => !(itemRates[li.id] > 0));
        if (noRate) return fail('Enter a rate for "' + noRate.description + '"');
        if (!remarks.trim()) return fail('Remarks are required');
        const hasQuote = quotes.some(q => QUOTE_CATEGORIES.includes(q.category));
        if (noQuote && !noQuoteReason.trim()) return fail('Say why no quotation is available');
        if (!noQuote && !hasQuote) return fail('Attach a quotation, or tick "No quotation is available" and say why');
        return true;
    };

    // Uploads the quotations (if any), then saves the PO and runs the next step.
    // Nothing is saved if an upload fails.
    const savePO = (afterCreate, doneMessage) => {
        const po = buildPO();
        const finish = (docs) => {
            po.documents = docs.map(d => { d.uploadedBy = state.currentUserId; return d; });
            dispatch({ type: 'CREATE_PO', payload: { po, indentId: indent.id } });
            if (afterCreate) afterCreate(po);
            dispatch({ type: 'SHOW_TOAST', payload: { message: doneMessage, type: 'success' } });
            window.location.hash = '#procurement-pos';
        };
        if (quotes.length === 0) { finish([]); return; }
        setUploading(true);
        uploadPickedFiles(indent.id, quotes, null, po.id).then(docs => {
            setUploading(false);
            finish(docs);
        }).catch(err => {
            setUploading(false);
            fail((err.message || 'Could not upload the quotations') + '. The PO was not saved.');
        });
    };

    const handleSaveDraft = () => {
        if (!vendorId) { fail('Please select a vendor'); return; }
        if (!indent.lineItems || indent.lineItems.length === 0) { fail('Cannot create PO — indent has no line items'); return; }
        savePO(null, 'PO draft saved');
    };

    const handleRequestApproval = () => {
        if (!checkComplete()) return;
        savePO(po => dispatch({ type: 'REQUEST_MD_PO_APPROVAL', payload: { poId: po.id, indentId: indent.id } }), 'PO sent for MD approval');
    };

    // Within the limit: the procurement manager may issue without MD approval
    const handleIssueDirect = () => {
        if (!checkComplete()) return;
        if (!window.confirm('Issue this PO to the vendor now, without MD approval?\n\nValue: ' + formatRs(grandTotal) + ' (limit ' + formatRs(mdLimit) + ')')) return;
        savePO(po => dispatch({ type: 'ISSUE_PO', payload: { poId: po.id } }), 'PO issued to vendor');
    };

    const vendorField = (label, field, required) => {
        return React.createElement('div', null,
            React.createElement('label', { className: 'form-label' }, label + (required ? ' *' : '')),
            React.createElement('input', {
                type: 'text', className: 'form-input',
                value: newVendor[field],
                onChange: (e) => setNewVendor({ ...newVendor, [field]: e.target.value })
            })
        );
    };

    return React.createElement('div', null,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Create Purchase Order for ' + getIndentDisplayId(indent, state.indents))
            ),

            // PO info
            React.createElement('div', { className: 'info-grid', style: { marginBottom: '24px' } },
                React.createElement('div', { className: 'info-field' },
                    React.createElement('div', { className: 'info-label' }, 'PO Number'),
                    React.createElement('div', { className: 'info-value', style: { fontWeight: '700', color: '#2563eb' } }, poNumber)
                ),
                React.createElement('div', { className: 'info-field' },
                    React.createElement('div', { className: 'info-label' }, 'Indent'),
                    React.createElement('div', { className: 'info-value' }, getIndentDisplayId(indent, state.indents))
                )
            ),

            // Vendor + Delivery Date + Payment Terms
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' } },
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', { className: 'form-label' }, 'Vendor *'),
                    React.createElement('select', {
                        className: 'form-select', value: vendorId,
                        onChange: (e) => handleVendorChange(e.target.value)
                    },
                        React.createElement('option', { value: '' }, 'Select Vendor'),
                        state.vendors.map(v =>
                            React.createElement('option', { key: v.id, value: v.id }, v.name + ' (' + v.category + ')')
                        ),
                        React.createElement('option', { value: '__new__' }, '+ Add New Vendor')
                    )
                ),
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', { className: 'form-label' }, 'Delivery Date / ETA *'),
                    React.createElement('input', {
                        type: 'date', className: 'form-input', value: deliveryDate,
                        min: new Date().toISOString().split('T')[0],
                        onChange: (e) => setDeliveryDate(e.target.value)
                    })
                ),
                React.createElement('div', { className: 'form-group' },
                    React.createElement('label', { className: 'form-label' }, 'Payment Terms *'),
                    React.createElement('select', {
                        className: 'form-select',
                        value: PAYMENT_TERMS_OPTIONS.includes(paymentTerms) ? paymentTerms : (paymentTerms ? '__custom__' : ''),
                        onChange: (e) => setPaymentTerms(e.target.value === '__custom__' ? 'Custom: ' : e.target.value)
                    },
                        React.createElement('option', { value: '' }, 'Select Payment Terms'),
                        PAYMENT_TERMS_OPTIONS.map(pt =>
                            React.createElement('option', { key: pt, value: pt }, pt)
                        ),
                        React.createElement('option', { value: '__custom__' }, 'Custom...')
                    ),
                    !PAYMENT_TERMS_OPTIONS.includes(paymentTerms) && paymentTerms
                        ? React.createElement('input', {
                            type: 'text',
                            className: 'form-input',
                            style: { marginTop: '8px' },
                            value: paymentTerms,
                            onChange: (e) => setPaymentTerms(e.target.value),
                            placeholder: 'Enter custom payment terms (e.g. 50% advance, 50% on delivery)'
                        })
                        : null
                )
            ),

            // New vendor form
            showNewVendor ? React.createElement('div', {
                style: { padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '6px', marginBottom: '24px', border: '1px solid #bbf7d0' }
            },
                React.createElement('h4', { style: { fontSize: '14px', fontWeight: '600', marginBottom: '12px' } }, 'New Vendor'),
                React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' } },
                    vendorField('Name', 'name', true),
                    vendorField('Contact Person', 'contactPerson', false),
                    vendorField('Phone', 'phone', false),
                    vendorField('Email', 'email', false),
                    vendorField('GSTIN', 'gstin', false),
                    vendorField('PAN', 'pan', false),
                    vendorField('Address', 'address', false),
                    vendorField('City', 'city', false),
                    vendorField('State', 'state', false),
                    vendorField('Pincode', 'pincode', false),
                    vendorField('Bank Account', 'bankAccount', false),
                    vendorField('Bank Name', 'bankName', false),
                    vendorField('IFSC', 'ifsc', false),
                    React.createElement('div', null,
                        React.createElement('label', { className: 'form-label' }, 'Default Payment Terms (days)'),
                        React.createElement('input', {
                            type: 'number', className: 'form-input',
                            value: newVendor.defaultPaymentTerms,
                            onChange: (e) => setNewVendor({ ...newVendor, defaultPaymentTerms: e.target.value })
                        })
                    ),
                    vendorField('Category', 'category', false),
                    React.createElement('div', null,
                        React.createElement('label', { className: 'form-label' }, 'Notes'),
                        React.createElement('textarea', {
                            className: 'form-textarea',
                            value: newVendor.notes,
                            onChange: (e) => setNewVendor({ ...newVendor, notes: e.target.value }),
                            style: { minHeight: '60px' }
                        })
                    )
                ),
                React.createElement('div', { style: { marginTop: '12px', display: 'flex', gap: '8px' } },
                    React.createElement('button', { className: 'btn btn-sm btn-success', onClick: handleAddNewVendor }, 'Add Vendor'),
                    React.createElement('button', { className: 'btn btn-sm btn-secondary', onClick: () => setShowNewVendor(false) }, 'Cancel')
                )
            ) : null,

            // Delivery address
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', { className: 'form-label' }, 'Delivery Address'),
                React.createElement('div', {
                    style: { padding: '8px 12px', backgroundColor: '#f1f5f9', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }
                }, site ? site.name + ', ' + site.location : '-')
            ),

            // Items table with GST
            React.createElement('div', { style: { marginBottom: '24px' } },
                React.createElement('label', { className: 'form-label' }, 'Items'),
                React.createElement('table', { className: 'line-items-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            React.createElement('th', null, 'Material'),
                            React.createElement('th', null, 'Qty'),
                            React.createElement('th', null, 'Unit'),
                            React.createElement('th', null, 'Unit Rate (Rs.) *'),
                            React.createElement('th', null, 'Amount'),
                            React.createElement('th', null, 'GST %'),
                            React.createElement('th', null, 'GST Amount'),
                            React.createElement('th', null, 'Total with GST')
                        )
                    ),
                    React.createElement('tbody', null,
                        indent.lineItems.map(li => {
                            const calcs = getLineCalcs(li);
                            const lastRate = getRateHistory(li.description);
                            return React.createElement('tr', { key: li.id },
                                React.createElement('td', null, li.description),
                                React.createElement('td', null, li.qty),
                                React.createElement('td', null, li.unit),
                                React.createElement('td', null,
                                    React.createElement('input', {
                                        type: 'number', className: 'form-input',
                                        style: { width: '100px' }, min: '0',
                                        value: itemRates[li.id] || '',
                                        onChange: (e) => handleRateChange(li.id, e.target.value),
                                        placeholder: '0.00'
                                    }),
                                    lastRate !== null
                                        ? React.createElement('div', { style: { fontSize: '11px', color: '#6b7280', marginTop: '2px' } },
                                            'Last: Rs. ' + lastRate.toLocaleString()
                                        )
                                        : null
                                ),
                                React.createElement('td', { style: { fontWeight: '600' } }, 'Rs. ' + calcs.baseAmount.toLocaleString()),
                                React.createElement('td', null,
                                    React.createElement('select', {
                                        className: 'form-select',
                                        style: { width: '80px', padding: '4px' },
                                        value: calcs.gstPct,
                                        onChange: (e) => handleGstChange(li.id, e.target.value)
                                    },
                                        GST_OPTIONS.map(g =>
                                            React.createElement('option', { key: g, value: g }, g + '%')
                                        )
                                    )
                                ),
                                React.createElement('td', null, 'Rs. ' + calcs.gstAmount.toLocaleString()),
                                React.createElement('td', { style: { fontWeight: '600' } }, 'Rs. ' + calcs.totalWithGst.toLocaleString())
                            );
                        }),
                        // Subtotal row
                        React.createElement('tr', { style: { backgroundColor: '#f8fafc' } },
                            React.createElement('td', { colSpan: '4', style: { textAlign: 'right', fontWeight: '600' } }, 'Subtotal:'),
                            React.createElement('td', { style: { fontWeight: '600' } }, 'Rs. ' + subtotal.toLocaleString()),
                            React.createElement('td', null, ''),
                            React.createElement('td', { style: { fontWeight: '600' } }, 'Rs. ' + totalGst.toLocaleString()),
                            React.createElement('td', null, '')
                        ),
                        // Grand total row
                        React.createElement('tr', { style: { backgroundColor: '#f0fdf4', fontWeight: '700' } },
                            React.createElement('td', { colSpan: '7', style: { textAlign: 'right' } }, 'Grand Total:'),
                            React.createElement('td', { style: { color: '#15803d', fontSize: '16px' } }, 'Rs. ' + grandTotal.toLocaleString())
                        )
                    )
                )
            ),

            // Remarks
            React.createElement('div', { className: 'form-group' },
                React.createElement('label', { className: 'form-label' }, 'Remarks *'),
                React.createElement('textarea', {
                    className: 'form-textarea', value: remarks,
                    onChange: (e) => setRemarks(e.target.value),
                    placeholder: 'Basis of the rate, quotations compared, how the negotiation went, delivery instructions...',
                    style: { minHeight: '80px' }
                })
            ),

            // Quotations
            React.createElement(AttachmentPicker, {
                files: quotes, setFiles: setQuotes, hideItems: true,
                title: 'Quotations',
                help: 'Attach the quotation(s) received — the chosen vendor\'s and any you compared against (PDF, image, Excel, Word; up to 15 MB each). The MD sees these when approving.',
                categories: ['Quotation', 'Comparative Statement', 'Proforma Invoice', 'Estimate', 'Other'],
                defaultCategory: 'Quotation',
            }),

            // Declaration when there is no quotation
            React.createElement('div', { style: { margin: '-12px 0 24px 0', padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 } },
                React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' } },
                    React.createElement('input', { type: 'checkbox', checked: noQuote, onChange: (e) => setNoQuote(e.target.checked) }),
                    'No quotation is available for this order'
                ),
                noQuote ? React.createElement('textarea', {
                    className: 'form-textarea', value: noQuoteReason,
                    onChange: (e) => setNoQuoteReason(e.target.value),
                    'aria-label': 'Why no quotation is available',
                    placeholder: 'Declaration: why there is no quotation (e.g. rate contract, verbal / phone rate, single source, emergency purchase)...',
                    style: { minHeight: '60px', marginTop: 8 }
                }) : React.createElement('div', { style: { fontSize: 12, color: '#64748b', marginTop: 4 } },
                    'A PO needs a quotation (PDF or image) or this declaration before it can be sent to the MD or issued.')
            ),

            // Approval route for this value
            React.createElement('div', {
                style: { padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
                         background: needsMD ? '#fef2f2' : '#f0fdf4', border: '1px solid ' + (needsMD ? '#fecaca' : '#bbf7d0'), color: '#1e293b' }
            },
                grandTotal <= 0
                    ? 'Enter the rates to see whether this order needs MD approval (limit ' + formatRs(mdLimit) + ').'
                    : needsMD
                    ? 'This order (' + formatRs(valueForLimit) + (valueForLimit !== grandTotal ? ' including other POs on this indent' : '') + ') is above the ' + formatRs(mdLimit) + ' limit: MD approval is required.'
                    : 'This order (' + formatRs(valueForLimit) + ') is within the ' + formatRs(mdLimit) + ' limit: '
                        + (isManager ? 'you can issue it directly, or send it to the MD if you prefer.' : 'the procurement manager can issue it directly, or you can send it to the MD.')
            ),

            // Action buttons
            React.createElement('div', { className: 'action-buttons' },
                uploading && React.createElement('span', { style: { fontSize: 13, color: '#64748b', alignSelf: 'center' } }, 'Uploading quotations...'),
                React.createElement('button', { className: 'btn btn-secondary', onClick: handleSaveDraft, disabled: uploading }, 'Save as Draft PO'),
                (!needsMD && isManager && grandTotal > 0) && React.createElement('button', { className: 'btn btn-success', onClick: handleIssueDirect, disabled: uploading }, 'Issue to Vendor'),
                React.createElement('button', { className: 'btn btn-primary', onClick: handleRequestApproval, disabled: uploading }, needsMD ? 'Send for MD Approval' : 'Send for MD Approval anyway'),
                React.createElement('button', { className: 'btn btn-secondary', onClick: () => { window.location.hash = '#procurement-progress'; } }, 'Cancel')
            )
        )
    );
}

// ============================================================================
// 7. PROCUREMENT POs SCREEN (MODIFIED - Print PO)
// ============================================================================

function ProcurementPOsScreen() {
    const [state, dispatch] = React.useContext(AppContext);

    var _statusFilter = useState('');
    var statusFilter = _statusFilter[0];
    var setStatusFilter = _statusFilter[1];

    var allPOs = (state.purchaseOrders || []).slice().sort(function(a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
    var poList = useListControls(statusFilter ? allPOs.filter(function(po) { return po.status === statusFilter; }) : allPOs, poListFields(state));
    var myPOs = poList.rows;
    var currentUser = state.users.find(function(u) { return u.id === state.currentUserId; });
    var isManager = currentUser && (currentUser.role === 'procurement_manager' || currentUser.role === 'admin');
    // Only procurement acts on POs here; the MD and others get a read-only list
    var canManage = currentUser && (currentUser.role === 'procurement_manager' || currentUser.role === 'procurement_clerk' || currentUser.role === 'admin');

    // Send a draft to the MD, or issue it; the screen says what is missing first
    const sendOrIssue = (po, direct) => {
        var missing = poMissingFields(po, state);
        if (missing.length > 0) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: getPODisplayId(po) + ' is missing: ' + missing.slice(0, 3).join(', ') + '. Open the PO and edit it.', type: 'error' } });
            return;
        }
        if (direct) {
            if (!window.confirm('Issue ' + getPODisplayId(po) + ' (' + formatRs(po.totalAmount) + ') to the vendor' + (po.status === 'draft' ? ' without MD approval' : '') + '?')) return;
            dispatch({ type: 'ISSUE_PO', payload: { poId: po.id } });
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO issued to vendor', type: 'success' } });
        } else {
            dispatch({ type: 'SUBMIT_PO_FOR_APPROVAL', payload: { poId: po.id } });
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO sent for MD approval', type: 'success' } });
        }
    };

    const handlePrintPO = (po) => {
        const vendor = state.vendors.find(v => v.id === po.vendorId);
        const printContent = [
            '<html><head><title>Purchase Order - ' + getPODisplayId(po) + '</title>',
            '<style>',
            'body { font-family: Arial, sans-serif; padding: 40px; color: #333; }',
            'h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; }',
            '.info-row { display: flex; justify-content: space-between; margin: 8px 0; }',
            '.info-label { font-weight: bold; }',
            'table { width: 100%; border-collapse: collapse; margin: 20px 0; }',
            'th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }',
            'th { background: #f0f0f0; }',
            '.total-row { font-weight: bold; background: #f9f9f9; }',
            '@media print { body { padding: 20px; } }',
            '</style></head><body>',
            '<h1>PURCHASE ORDER</h1>',
            '<div class="info-row"><span class="info-label">PO Number:</span><span>' + getPODisplayId(po) + '</span></div>',
            '<div class="info-row"><span class="info-label">Date:</span><span>' + new Date(po.createdAt).toLocaleDateString() + '</span></div>',
            '<div class="info-row"><span class="info-label">Vendor:</span><span>' + po.vendorName + '</span></div>',
            vendor ? '<div class="info-row"><span class="info-label">Vendor GSTIN:</span><span>' + (vendor.gstin || 'N/A') + '</span></div>' : '',
            '<div class="info-row"><span class="info-label">Delivery Address:</span><span>' + (po.deliveryAddress || 'N/A') + '</span></div>',
            po.deliveryDate ? '<div class="info-row"><span class="info-label">Delivery Date:</span><span>' + po.deliveryDate + '</span></div>' : '',
            po.paymentTerms ? '<div class="info-row"><span class="info-label">Payment Terms:</span><span>' + po.paymentTerms + '</span></div>' : '',
            '<table>',
            '<thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th><th>GST%</th><th>GST Amt</th><th>Total</th></tr></thead>',
            '<tbody>',
            (po.lineItems || []).map(item =>
                '<tr><td>' + item.description + '</td><td>' + item.qty + '</td><td>' + item.unit + '</td>' +
                '<td>Rs. ' + (item.rate || 0).toLocaleString() + '</td>' +
                '<td>Rs. ' + (item.amount || 0).toLocaleString() + '</td>' +
                '<td>' + (item.gstPercent || 0) + '%</td>' +
                '<td>Rs. ' + (item.gstAmount || 0).toLocaleString() + '</td>' +
                '<td>Rs. ' + (item.amountWithGst || item.amount || 0).toLocaleString() + '</td></tr>'
            ).join(''),
            '<tr class="total-row"><td colspan="7" style="text-align:right">Grand Total:</td><td>Rs. ' + (po.totalAmount || 0).toLocaleString() + '</td></tr>',
            '</tbody></table>',
            po.notes ? '<p><strong>Remarks:</strong> ' + escapeHtml(po.notes) + '</p>' : '',
            '</body></html>'
        ].join('');

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'The browser blocked the print window. Allow pop-ups for this site and try again.', type: 'error' } });
            return;
        }
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'Purchase Orders'),
            React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                React.createElement('select', {
                    value: statusFilter,
                    onChange: function(e) { setStatusFilter(e.target.value); },
                    style: { padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 },
                },
                    React.createElement('option', { value: '' }, 'All Statuses'),
                    ['draft', 'pending_approval', 'approved', 'issued', 'partially_fulfilled', 'fulfilled', 'closed', 'cancelled'].map(function(s) {
                        return React.createElement('option', { key: s, value: s }, statusLabel(s));
                    })
                )
            )
        ),
        React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, poList.bar),
        React.createElement('table', { className: 'table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', null, 'PO Number'),
                    React.createElement('th', null, 'Vendor'),
                    React.createElement('th', null, 'Indent No.'),
                    React.createElement('th', null, 'Items'),
                    React.createElement('th', null, 'Total Amount'),
                    React.createElement('th', null, 'Status'),
                    React.createElement('th', null, 'Date'),
                    React.createElement('th', null, 'Actions')
                )
            ),
            React.createElement('tbody', null,
                myPOs.length === 0
                    ? React.createElement('tr', null,
                        React.createElement('td', { colSpan: '8', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, (poList.term || statusFilter) ? 'No purchase orders match' : 'No purchase orders yet')
                    )
                    : myPOs.map(po =>
                        React.createElement('tr', { key: po.id },
                            React.createElement('td', { style: { fontWeight: '600' } }, React.createElement('a', { href: '#po/' + po.id, style: { color: '#3b82f6', textDecoration: 'none' } }, getPODisplayId(po))),
                            React.createElement('td', null, po.vendorName),
                            React.createElement('td', null,
                                React.createElement('a', { href: '#indent/' + po.indentId, style: { textDecoration: 'none', color: '#2563eb' } }, getIndentDisplayId((state.indents || []).find(function(i) { return i.id === po.indentId; }) || { id: po.indentId }, state.indents))
                            ),
                            React.createElement('td', null, (po.lineItems || []).length),
                            React.createElement('td', { style: { fontWeight: '600' } }, 'Rs. ' + (po.totalAmount || 0).toLocaleString()),
                            React.createElement('td', null, React.createElement(StatusBadge, { status: po.status })),
                            React.createElement('td', null, new Date(po.createdAt).toLocaleDateString()),
                            React.createElement('td', null,
                                React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
                                    // Draft within the limit: the manager may issue it directly
                                    (po.status === 'draft' && isManager && !poNeedsMD(po, state)) && React.createElement('button', {
                                        className: 'btn btn-sm btn-success',
                                        onClick: function() { sendOrIssue(po, true); }
                                    }, 'Issue to Vendor'),
                                    (canManage && po.status === 'draft') && React.createElement('button', {
                                        className: 'btn btn-sm btn-primary',
                                        onClick: function() { sendOrIssue(po, false); }
                                    }, 'Send to MD'),
                                    (canManage && po.status === 'approved') && React.createElement('button', {
                                        className: 'btn btn-sm btn-success',
                                        onClick: function() { sendOrIssue(po, true); }
                                    }, 'Issue to Vendor'),
                                    (po.status === 'issued' || po.status === 'partially_fulfilled')
                                        ? React.createElement('button', {
                                            className: 'btn btn-sm btn-primary',
                                            onClick: () => handlePrintPO(po),
                                        }, 'Print')
                                        : null,
                                    (po.status === 'draft' && /^MD Rejected/.test(po.mdRejectReason || ''))
                                        ? React.createElement('span', { style: { fontSize: '12px', color: '#991b1b' } }, po.mdRejectReason)
                                        : null,
                                    React.createElement('a', {
                                        href: '#po/' + po.id,
                                        className: 'btn btn-sm btn-secondary',
                                        style: { textDecoration: 'none' },
                                    }, 'View')
                                )
                            )
                        )
                    )
            )
        )
    );
}

// ============================================================================
// 8. VENDOR SCREEN (MODIFIED - Expanded fields, Edit, Delete)
// ============================================================================

function VendorScreen() {
    const [state, dispatch] = React.useContext(AppContext);
    const [showForm, setShowForm] = useState(false);
    const vendorList = useListControls(state.vendors || [], [
        { key: 'name', label: 'Name', get: v => v.name },
        { key: 'category', label: 'Category', get: v => v.category },
        { key: 'city', label: 'City', get: v => v.city },
        { key: 'contact', label: 'Contact person', get: v => [v.contactPerson, v.phone, v.email] },
        { key: 'gstin', label: 'GSTIN', get: v => v.gstin },
    ], { placeholder: 'Search vendor name, category, city, contact, GSTIN…' });
    const [editingId, setEditingId] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const emptyVendor = {
        name: '', contactPerson: '', phone: '', email: '', gstin: '', pan: '',
        address: '', city: '', state: '', pincode: '',
        bankAccount: '', bankName: '', ifsc: '',
        defaultPaymentTerms: 30, category: '', notes: ''
    };
    const [formData, setFormData] = useState({ ...emptyVendor });

    const handleAddVendor = () => {
        if (!formData.name.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Vendor name is required', type: 'error' } });
            return;
        }
        const vendorObj = {
            id: genUUID(),
            ...formData,
            defaultPaymentTerms: parseInt(formData.defaultPaymentTerms) || 30
        };
        dispatch({ type: 'ADD_VENDOR', payload: vendorObj });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Vendor added', type: 'success' } });
        setShowForm(false);
        setFormData({ ...emptyVendor });
    };

    const handleStartEdit = (vendor) => {
        setEditingId(vendor.id);
        setFormData({
            name: vendor.name || '',
            contactPerson: vendor.contactPerson || '',
            phone: vendor.phone || '',
            email: vendor.email || '',
            gstin: vendor.gstin || '',
            pan: vendor.pan || '',
            address: vendor.address || '',
            city: vendor.city || '',
            state: vendor.state || '',
            pincode: vendor.pincode || '',
            bankAccount: vendor.bankAccount || '',
            bankName: vendor.bankName || '',
            ifsc: vendor.ifsc || '',
            defaultPaymentTerms: vendor.defaultPaymentTerms || 30,
            category: vendor.category || '',
            notes: vendor.notes || '',
        });
    };

    const handleSaveEdit = () => {
        if (!formData.name.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Vendor name is required', type: 'error' } });
            return;
        }
        dispatch({
            type: 'EDIT_VENDOR',
            payload: {
                vendorId: editingId,
                updates: { ...formData, defaultPaymentTerms: parseInt(formData.defaultPaymentTerms) || 30 }
            }
        });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Vendor updated', type: 'success' } });
        setEditingId(null);
        setFormData({ ...emptyVendor });
    };

    const handleDelete = (vendorId) => {
        const currentUser = state.users.find(u => u.id === state.currentUserId);
        if (!currentUser || (currentUser.role !== 'md' && currentUser.role !== 'admin')) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Only MD or Admin can delete vendors', type: 'error' } });
            return;
        }
        if (window.confirm('Are you sure you want to delete this vendor?')) {
            dispatch({ type: 'DELETE_VENDOR', payload: vendorId });
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Vendor deleted', type: 'success' } });
        }
    };

    const renderVendorForm = (isEdit) => {
        const field = (label, key, required) => {
            return React.createElement('div', { key: key },
                React.createElement('label', { className: 'form-label' }, label + (required ? ' *' : '')),
                key === 'notes'
                    ? React.createElement('textarea', {
                        className: 'form-textarea', value: formData[key],
                        onChange: (e) => setFormData({ ...formData, [key]: e.target.value }),
                        style: { minHeight: '60px' }
                    })
                    : React.createElement('input', {
                        type: key === 'defaultPaymentTerms' ? 'number' : 'text',
                        className: 'form-input', value: formData[key],
                        onChange: (e) => setFormData({ ...formData, [key]: e.target.value })
                    })
            );
        };

        return React.createElement('div', {
            style: { padding: '16px', borderBottom: '1px solid #e5e7eb', backgroundColor: isEdit ? '#eff6ff' : '#f9fafb' }
        },
            React.createElement('h4', { style: { fontSize: '14px', fontWeight: '600', marginBottom: '12px' } },
                isEdit ? 'Edit Vendor' : 'Add New Vendor'
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' } },
                field('Name', 'name', true),
                field('Contact Person', 'contactPerson', false),
                field('Phone', 'phone', false),
                field('Email', 'email', false),
                field('GSTIN', 'gstin', false),
                field('PAN', 'pan', false),
                field('Address', 'address', false),
                field('City', 'city', false),
                field('State', 'state', false),
                field('Pincode', 'pincode', false),
                field('Bank Account', 'bankAccount', false),
                field('Bank Name', 'bankName', false),
                field('IFSC', 'ifsc', false),
                field('Default Payment Terms (days)', 'defaultPaymentTerms', false),
                field('Category', 'category', false),
                field('Notes', 'notes', false)
            ),
            React.createElement('div', { style: { marginTop: '12px', display: 'flex', gap: '8px' } },
                React.createElement('button', {
                    className: 'btn btn-primary',
                    onClick: isEdit ? handleSaveEdit : handleAddVendor
                }, isEdit ? 'Save Changes' : 'Save Vendor'),
                React.createElement('button', {
                    className: 'btn btn-secondary',
                    onClick: () => {
                        if (isEdit) setEditingId(null);
                        else setShowForm(false);
                        setFormData({ ...emptyVendor });
                    }
                }, 'Cancel')
            )
        );
    };

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'Vendors'),
            React.createElement('button', { className: 'btn btn-primary', onClick: () => { setShowForm(!showForm); setEditingId(null); } }, 'Add Vendor')
        ),

        showForm && !editingId ? renderVendorForm(false) : null,
        editingId && !showForm ? renderVendorForm(true) : null,

        React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, vendorList.bar),
        React.createElement('table', { className: 'table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', null, 'Name'),
                    React.createElement('th', null, 'Contact Person'),
                    React.createElement('th', null, 'Phone'),
                    React.createElement('th', null, 'Category'),
                    React.createElement('th', null, 'City'),
                    React.createElement('th', null, 'GSTIN'),
                    React.createElement('th', null, 'Actions')
                )
            ),
            React.createElement('tbody', null,
                vendorList.rows.map(v =>
                    React.createElement(React.Fragment, { key: v.id },
                        React.createElement('tr', null,
                            React.createElement('td', { style: { fontWeight: '600' } }, v.name),
                            React.createElement('td', null, v.contactPerson || '-'),
                            React.createElement('td', null, v.phone || '-'),
                            React.createElement('td', null, v.category || '-'),
                            React.createElement('td', null, v.city || '-'),
                            React.createElement('td', { style: { fontSize: '12px' } }, v.gstin || '-'),
                            React.createElement('td', null,
                                React.createElement('div', { style: { display: 'flex', gap: '4px' } },
                                    React.createElement('button', {
                                        className: 'btn btn-sm btn-secondary',
                                        onClick: () => setExpandedId(expandedId === v.id ? null : v.id)
                                    }, expandedId === v.id ? 'Collapse' : 'Details'),
                                    React.createElement('button', {
                                        className: 'btn btn-sm btn-primary',
                                        onClick: () => { handleStartEdit(v); setShowForm(false); }
                                    }, 'Edit'),
                                    React.createElement('button', {
                                        className: 'btn btn-sm btn-danger',
                                        onClick: () => handleDelete(v.id)
                                    }, 'Delete')
                                )
                            )
                        ),
                        expandedId === v.id
                            ? React.createElement('tr', null,
                                React.createElement('td', { colSpan: '7', style: { backgroundColor: '#f8fafc', padding: '16px' } },
                                    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '13px' } },
                                        React.createElement('div', null,
                                            React.createElement('strong', null, 'Email: '), v.email || '-'
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('strong', null, 'PAN: '), v.pan || '-'
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('strong', null, 'Address: '), v.address || '-'
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('strong', null, 'State: '), v.state || '-'
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('strong', null, 'Pincode: '), v.pincode || '-'
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('strong', null, 'Bank: '), v.bankName || '-'
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('strong', null, 'Account: '), v.bankAccount || '-'
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('strong', null, 'IFSC: '), v.ifsc || '-'
                                        ),
                                        React.createElement('div', null,
                                            React.createElement('strong', null, 'Payment Terms: '), (v.defaultPaymentTerms || '-') + ' days'
                                        ),
                                        React.createElement('div', { style: { gridColumn: 'span 3' } },
                                            React.createElement('strong', null, 'Notes: '), v.notes || '-'
                                        )
                                    )
                                )
                            )
                            : null
                    )
                )
            )
        )
    );
}
