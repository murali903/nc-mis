
// ============================================================================
// 9. MD ESCALATIONS SCREEN
// ============================================================================

function MDEscalationsScreen() {
    const [state, dispatch] = React.useContext(AppContext);
    const [actionIndentId, setActionIndentId] = useState(null);
    const [actionType, setActionType] = useState(null);
    const [mdRemarks, setMdRemarks] = useState('');

    const allEscalated = state.indents.filter(i => i.status === 'escalated_to_md')
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const list = useListControls(allEscalated, indentListFields(state));
    const escalatedIndents = list.rows;

    const handleApprove = (indentId) => {
        if (!mdRemarks.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please provide remarks', type: 'error' } });
            return;
        }
        dispatch({ type: 'MD_ESCALATION_APPROVE', payload: { indentId, remarks: mdRemarks } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Escalation approved - indent back in procurement', type: 'success' } });
        setActionIndentId(null);
        setMdRemarks('');
    };

    const handleDismiss = (indentId) => {
        if (!mdRemarks.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please provide remarks', type: 'error' } });
            return;
        }
        dispatch({ type: 'MD_ESCALATION_DISMISS', payload: { indentId, remarks: mdRemarks } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Escalation dismissed - returned for revision', type: 'success' } });
        setActionIndentId(null);
        setMdRemarks('');
    };

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'Indents Escalated to MD (' + allEscalated.length + ')')
        ),
        allEscalated.length > 0 ? React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, list.bar) : null,
        escalatedIndents.length === 0
            ? React.createElement('div', { style: { textAlign: 'center', padding: '40px', color: '#64748b' } }, allEscalated.length === 0 ? 'No pending escalations' : 'No indents match your search')
            : escalatedIndents.map(indent =>
                React.createElement('div', { key: indent.id, style: { padding: '20px', borderBottom: '1px solid #e2e8f0' } },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' } },
                        React.createElement('div', null,
                            React.createElement('a', { href: '#indent/' + indent.id, style: { fontSize: '16px', fontWeight: '600', color: '#2563eb', textDecoration: 'none' } }, getIndentDisplayId(indent, state.indents)),
                            React.createElement('div', { style: { fontSize: '13px', color: '#64748b', marginTop: '4px' } },
                                'Site: ' + getSiteName(indent.siteId, state.sites) + ' | By: ' + getUserName(indent.createdBy, state.users) + ' | Items: ' + indent.lineItems.length
                            )
                        ),
                        React.createElement(StatusBadge, { status: indent.status })
                    ),
                    indent.escalationRemarks
                        ? React.createElement('div', { className: 'alert alert-warning', style: { margin: '8px 0' } },
                            React.createElement('strong', null, (indent.escalatedBy ? getUserName(indent.escalatedBy, state.users) : 'Escalation') + ' remarks: '), indent.escalationRemarks
                        )
                        : null,
                    React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
                        React.createElement('button', {
                            className: 'btn btn-sm btn-success',
                            onClick: () => { setActionIndentId(indent.id); setActionType('approve'); setMdRemarks(''); }
                        }, 'Approve - OK to Proceed'),
                        React.createElement('button', {
                            className: 'btn btn-sm btn-danger',
                            onClick: () => { setActionIndentId(indent.id); setActionType('dismiss'); setMdRemarks(''); }
                        }, 'Return for Revision'),
                        React.createElement('a', { href: '#indent/' + indent.id, className: 'btn btn-sm btn-secondary', style: { textDecoration: 'none' } }, 'Open Indent')
                    ),
                    actionIndentId === indent.id
                        ? React.createElement('div', {
                            style: { marginTop: '12px', padding: '16px', backgroundColor: actionType === 'approve' ? '#f0fdf4' : '#fef2f2', borderRadius: '6px' }
                        },
                            React.createElement('label', { className: 'form-label' }, 'MD Remarks (required)'),
                            React.createElement('textarea', {
                                className: 'form-textarea', value: mdRemarks,
                                onChange: (e) => setMdRemarks(e.target.value),
                                placeholder: 'Your remarks...',
                                style: { minHeight: '60px' }
                            }),
                            React.createElement('div', { style: { marginTop: '8px', display: 'flex', gap: '8px' } },
                                actionType === 'approve'
                                    ? React.createElement('button', { className: 'btn btn-sm btn-success', onClick: () => handleApprove(indent.id) }, 'Confirm Approve')
                                    : null,
                                actionType === 'dismiss'
                                    ? React.createElement('button', { className: 'btn btn-sm btn-danger', onClick: () => handleDismiss(indent.id) }, 'Confirm Return')
                                    : null,
                                React.createElement('button', { className: 'btn btn-sm btn-secondary', onClick: () => setActionIndentId(null) }, 'Cancel')
                            )
                        )
                        : null
                )
            )
    );
}

// ============================================================================
// 10. MD PO APPROVALS SCREEN (MODIFIED - GST breakdown)
// ============================================================================

function MDPOApprovalsScreen() {
    const [state, dispatch] = React.useContext(AppContext);
    const [rejectPoId, setRejectPoId] = useState(null);
    const [rejectReason, setRejectReason] = useState('');

    const [approvePoId, setApprovePoId] = useState(null);
    const [approveRemarks, setApproveRemarks] = useState('');

    const allPending = state.purchaseOrders.filter(po => po.status === 'pending_approval').sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const list = useListControls(allPending, poListFields(state));
    const pendingPOs = list.rows;

    const handleApprovePO = (poId) => {
        if (!approveRemarks.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please provide remarks for the approval', type: 'error' } });
            return;
        }
        dispatch({ type: 'MD_APPROVE_PO', payload: { poId, remarks: approveRemarks.trim() } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO approved', type: 'success' } });
        setApprovePoId(null);
        setApproveRemarks('');
    };

    const handleRejectPO = (poId) => {
        if (!rejectReason.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please provide a rejection reason', type: 'error' } });
            return;
        }
        dispatch({ type: 'MD_REJECT_PO', payload: { poId, reason: rejectReason } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO rejected', type: 'success' } });
        setRejectPoId(null);
        setRejectReason('');
    };

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'PO Approvals (' + allPending.length + ')')
        ),
        allPending.length > 0 ? React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, list.bar) : null,
        pendingPOs.length === 0
            ? React.createElement('div', { style: { textAlign: 'center', padding: '40px', color: '#64748b' } }, allPending.length === 0 ? 'No POs pending approval' : 'No POs match your search')
            : pendingPOs.map(po => {
                const itemSubtotal = (po.lineItems || []).reduce((s, item) => s + (item.amount || 0), 0);
                const itemGstTotal = (po.lineItems || []).reduce((s, item) => s + (item.gstAmount || 0), 0);

                return React.createElement('div', { key: po.id, style: { padding: '20px', borderBottom: '1px solid #e2e8f0' } },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '16px' } },
                        React.createElement('div', null,
                            React.createElement('a', { href: '#po/' + po.id, style: { fontSize: '16px', fontWeight: '600', color: '#2563eb', textDecoration: 'none' } }, getPODisplayId(po)),
                            React.createElement('div', { style: { fontSize: '13px', color: '#64748b', marginTop: '4px' } },
                                po.indentId ? 'Indent: ' : 'No indent',
                                po.indentId ? React.createElement('a', { href: '#indent/' + po.indentId, style: { color: '#2563eb' } }, poIndentLabel(po, state)) : null,
                                ' | Vendor: ' + po.vendorName,
                                po.paymentTerms ? ' | Terms: ' + po.paymentTerms : '',
                                po.deliveryDate ? ' | Delivery: ' + new Date(po.deliveryDate).toLocaleDateString('en-IN') : '',
                                ' | Raised by: ' + getUserName(po.createdBy, state.users)
                            ),
                            !po.indentId ? React.createElement('div', { style: { fontSize: '13px', color: '#b45309', marginTop: '4px', fontWeight: 600 } },
                                'Raised without an indent' + (poSiteOf(po, state) ? ' for ' + poSiteOf(po, state).name : '') + ': ' + (po.noIndentReason || 'no reason given')) : null,
                            po.notes ? React.createElement('div', { style: { fontSize: '13px', color: '#334155', marginTop: '4px' } }, 'Procurement remarks: ' + po.notes) : null,
                            (function() {
                                var quotes = poQuoteDocs(po, state);
                                return React.createElement('div', { style: { fontSize: '13px', marginTop: '4px', color: quotes.length ? '#334155' : '#b45309' } },
                                    quotes.length === 0
                                        ? (po.noQuoteReason ? 'No quotation — procurement declares: ' + po.noQuoteReason : 'No quotation attached')
                                        : 'Quotations: ',
                                    quotes.map(function(d) {
                                        return React.createElement('button', {
                                            key: d.id, className: 'btn btn-sm btn-secondary', style: { marginRight: 6, marginTop: 2 },
                                            onClick: function() { openIndentDocument(d, dispatch); }
                                        }, '📎 ' + d.name);
                                    })
                                );
                            })()
                        ),
                        React.createElement('div', { style: { fontSize: '20px', fontWeight: '700', color: '#15803d' } },
                            'Rs. ' + (po.totalAmount || 0).toLocaleString()
                        )
                    ),

                    React.createElement('table', { className: 'line-items-table', style: { marginBottom: '16px' } },
                        React.createElement('thead', null,
                            React.createElement('tr', null,
                                React.createElement('th', null, 'Material'),
                                React.createElement('th', null, 'Qty'),
                                React.createElement('th', null, 'Unit'),
                                React.createElement('th', null, 'Rate'),
                                React.createElement('th', null, 'Amount'),
                                React.createElement('th', null, 'GST %'),
                                React.createElement('th', null, 'GST Amount'),
                                React.createElement('th', null, 'Total with GST')
                            )
                        ),
                        React.createElement('tbody', null,
                            (po.lineItems || []).map(item =>
                                React.createElement('tr', { key: item.id },
                                    React.createElement('td', null, item.description),
                                    React.createElement('td', null, item.qty),
                                    React.createElement('td', null, item.unit),
                                    React.createElement('td', null, 'Rs. ' + (item.rate || 0).toLocaleString()),
                                    React.createElement('td', { style: { fontWeight: '600' } }, 'Rs. ' + (item.amount || 0).toLocaleString()),
                                    React.createElement('td', null, (item.gstPercent || 0) + '%'),
                                    React.createElement('td', null, 'Rs. ' + (item.gstAmount || 0).toLocaleString()),
                                    React.createElement('td', { style: { fontWeight: '600' } }, 'Rs. ' + (item.amountWithGst || item.amount || 0).toLocaleString())
                                )
                            ),
                            React.createElement('tr', { style: { backgroundColor: '#f8fafc' } },
                                React.createElement('td', { colSpan: '4', style: { textAlign: 'right', fontWeight: '600' } }, 'Subtotal:'),
                                React.createElement('td', { style: { fontWeight: '600' } }, 'Rs. ' + itemSubtotal.toLocaleString()),
                                React.createElement('td', null, ''),
                                React.createElement('td', { style: { fontWeight: '600' } }, 'Rs. ' + itemGstTotal.toLocaleString()),
                                React.createElement('td', { style: { fontWeight: '700', color: '#15803d' } }, 'Rs. ' + (po.totalAmount || 0).toLocaleString())
                            )
                        )
                    ),

                    React.createElement('div', { style: { display: 'flex', gap: '8px' } },
                        React.createElement('button', { className: 'btn btn-success', onClick: () => { setApprovePoId(approvePoId === po.id ? null : po.id); setApproveRemarks(''); setRejectPoId(null); } }, 'Approve PO'),
                        React.createElement('button', { className: 'btn btn-danger', onClick: () => { setRejectPoId(rejectPoId === po.id ? null : po.id); setRejectReason(''); setApprovePoId(null); } }, 'Reject PO'),
                        React.createElement('a', { href: '#po/' + po.id, className: 'btn btn-secondary', style: { textDecoration: 'none' } }, 'Open PO')
                    ),

                    approvePoId === po.id
                        ? React.createElement('div', { style: { marginTop: '12px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '6px' } },
                            React.createElement('label', { className: 'form-label' }, 'MD Remarks (required)'),
                            React.createElement('textarea', {
                                className: 'form-textarea', value: approveRemarks,
                                onChange: (e) => setApproveRemarks(e.target.value),
                                placeholder: 'Why this PO is approved...',
                                style: { minHeight: '60px' }
                            }),
                            React.createElement('div', { style: { marginTop: '8px', display: 'flex', gap: '8px' } },
                                React.createElement('button', { className: 'btn btn-sm btn-success', onClick: () => handleApprovePO(po.id) }, 'Confirm Approve'),
                                React.createElement('button', { className: 'btn btn-sm btn-secondary', onClick: () => { setApprovePoId(null); setApproveRemarks(''); } }, 'Cancel')
                            )
                        )
                        : null,

                    rejectPoId === po.id
                        ? React.createElement('div', { style: { marginTop: '12px', padding: '16px', backgroundColor: '#fef2f2', borderRadius: '6px' } },
                            React.createElement('label', { className: 'form-label' }, 'Rejection Reason (required)'),
                            React.createElement('textarea', {
                                className: 'form-textarea', value: rejectReason,
                                onChange: (e) => setRejectReason(e.target.value),
                                placeholder: 'Why is this PO rejected?',
                                style: { minHeight: '60px' }
                            }),
                            React.createElement('div', { style: { marginTop: '8px', display: 'flex', gap: '8px' } },
                                React.createElement('button', { className: 'btn btn-sm btn-danger', onClick: () => handleRejectPO(po.id) }, 'Confirm Reject'),
                                React.createElement('button', { className: 'btn btn-sm btn-secondary', onClick: () => { setRejectPoId(null); setRejectReason(''); } }, 'Cancel')
                            )
                        )
                        : null
                );
            })
    );
}
