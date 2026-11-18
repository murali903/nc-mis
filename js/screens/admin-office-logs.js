
// ============================================================================
// OFFICE MANAGEMENT SCREEN
// ============================================================================

function OfficeManagementScreen() {
    var _ctx = useContext(AppContext);
    var state = _ctx[0];
    var dispatch = _ctx[1];
    var allOffices = state.offices || [];
    var officeList = useListControls(allOffices, [
        { key: 'name', label: 'Name', get: function(o) { return o.name; } },
        { key: 'city', label: 'City', get: function(o) { return o.city; } },
        { key: 'state', label: 'State', get: function(o) { return o.state; } },
        { key: 'gstin', label: 'GSTIN', get: function(o) { return o.gstin; } },
        { key: 'contact', label: 'Phone / email', get: function(o) { return [o.phone, o.email]; } },
    ], { placeholder: 'Search office name, city, GSTIN…' });
    var offices = officeList.rows;

    var _showForm = useState(false);
    var showForm = _showForm[0];
    var setShowForm = _showForm[1];

    var _editingId = useState(null);
    var editingId = _editingId[0];
    var setEditingId = _editingId[1];

    var emptyOffice = { name: '', city: '', state: '', address: '', gstin: '', pan: '', phone: '', email: '' };
    var _formData = useState(Object.assign({}, emptyOffice));
    var formData = _formData[0];
    var setFormData = _formData[1];

    var handleAdd = function() {
        if (!formData.name.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Office name is required', type: 'error' } });
            return;
        }
        var officeObj = Object.assign({ id: genUUID() }, formData);
        dispatch({ type: 'ADD_OFFICE', payload: officeObj });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Office added', type: 'success' } });
        setShowForm(false);
        setFormData(Object.assign({}, emptyOffice));
    };

    var handleStartEdit = function(office) {
        setEditingId(office.id);
        setFormData({
            name: office.name || '', city: office.city || '', state: office.state || '',
            address: office.address || '', gstin: office.gstin || '', pan: office.pan || '',
            phone: office.phone || '', email: office.email || '',
        });
    };

    var handleSaveEdit = function() {
        dispatch({ type: 'UPDATE_OFFICE', payload: { officeId: editingId, updates: formData } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Office updated', type: 'success' } });
        setEditingId(null);
        setFormData(Object.assign({}, emptyOffice));
    };

    var handleDelete = function(officeId) {
        var linkedSites = (state.sites || []).filter(function(s) { return s.officeId === officeId; });
        if (linkedSites.length > 0) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Cannot delete office with linked sites (' + linkedSites.length + ' sites)', type: 'error' } });
            return;
        }
        dispatch({ type: 'DELETE_OFFICE', payload: officeId });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Office deleted', type: 'success' } });
    };

    var inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' };
    var labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' };

    var renderForm = function(isEdit) {
        var fields = [
            ['Name *', 'name'], ['City', 'city'], ['State', 'state'], ['Address', 'address'],
            ['GSTIN', 'gstin'], ['PAN', 'pan'], ['Phone', 'phone'], ['Email', 'email'],
        ];
        return React.createElement('div', {
            style: { background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: 20, marginBottom: 20 }
        },
            React.createElement('h3', { style: { marginTop: 0, marginBottom: 16 } }, isEdit ? 'Edit Office' : 'Add New Office'),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
                fields.map(function(f) {
                    return React.createElement('div', { key: f[1] },
                        React.createElement('label', { style: labelStyle }, f[0]),
                        React.createElement('input', {
                            value: formData[f[1]], style: inputStyle,
                            onChange: function(e) { setFormData(function(prev) { return Object.assign({}, prev, { [f[1]]: e.target.value }); }); },
                        })
                    );
                })
            ),
            React.createElement('div', { style: { marginTop: 12, display: 'flex', gap: 8 } },
                React.createElement('button', {
                    className: 'btn btn-success',
                    onClick: isEdit ? handleSaveEdit : handleAdd,
                }, isEdit ? 'Save Changes' : 'Add Office'),
                React.createElement('button', {
                    className: 'btn btn-secondary',
                    onClick: function() { setShowForm(false); setEditingId(null); setFormData(Object.assign({}, emptyOffice)); },
                }, 'Cancel')
            )
        );
    };

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'Office Management'),
            !showForm && !editingId && React.createElement('button', {
                className: 'btn btn-primary',
                onClick: function() { setShowForm(true); },
            }, '+ Add Office')
        ),
        showForm && renderForm(false),
        editingId && renderForm(true),
        React.createElement('div', { style: { padding: '12px 16px 0 16px' } }, officeList.bar),
        React.createElement('table', { className: 'table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', null, 'Name'),
                    React.createElement('th', null, 'City'),
                    React.createElement('th', null, 'State'),
                    React.createElement('th', null, 'GSTIN'),
                    React.createElement('th', null, 'Phone'),
                    React.createElement('th', null, 'Email'),
                    React.createElement('th', null, 'Linked Sites'),
                    React.createElement('th', null, 'Actions')
                )
            ),
            React.createElement('tbody', null,
                offices.length === 0
                    ? React.createElement('tr', null, React.createElement('td', { colSpan: 8, style: { textAlign: 'center', padding: 20, color: '#64748b' } }, 'No offices configured'))
                    : offices.map(function(office) {
                        var linkedSites = (state.sites || []).filter(function(s) { return s.officeId === office.id; });
                        return React.createElement('tr', { key: office.id },
                            React.createElement('td', { style: { fontWeight: 600 } }, office.name),
                            React.createElement('td', null, office.city),
                            React.createElement('td', null, office.state),
                            React.createElement('td', { style: { fontSize: 12, fontFamily: 'monospace' } }, office.gstin),
                            React.createElement('td', null, office.phone),
                            React.createElement('td', null, office.email),
                            React.createElement('td', null, linkedSites.map(function(s) { return s.name; }).join(', ') || 'None'),
                            React.createElement('td', null,
                                React.createElement('div', { style: { display: 'flex', gap: 4 } },
                                    React.createElement('button', { className: 'btn btn-sm btn-secondary', onClick: function() { handleStartEdit(office); } }, 'Edit'),
                                    React.createElement('button', { className: 'btn btn-sm btn-danger', onClick: function() { handleDelete(office.id); } }, 'Delete')
                                )
                            )
                        );
                    })
            )
        )
    );
}

// ============================================================================
// SYSTEM LOGS SCREEN
// ============================================================================

function SystemLogsScreen() {
    var _ctx = useContext(AppContext);
    var state = _ctx[0];
    var user = state.currentUser;

    var _filterType = useState('');
    var filterType = _filterType[0];
    var setFilterType = _filterType[1];

    var logs = (window.NC_MIS_LOG || []).slice().reverse();
    if (filterType) {
        logs = logs.filter(function(l) { return l.type === filterType; });
    }

    var actionTypes = [];
    (window.NC_MIS_LOG || []).forEach(function(l) {
        if (actionTypes.indexOf(l.type) === -1) actionTypes.push(l.type);
    });

    var handleDownload = function() {
        var dataStr = JSON.stringify(window.NC_MIS_LOG || [], null, 2);
        var blob = new Blob([dataStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'nc_mis_logs_' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!user || user.role !== 'admin') {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { style: { padding: 40, textAlign: 'center', color: '#64748b' } }, 'Access denied. Admin only.')
        );
    }

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-header' },
            React.createElement('div', { className: 'card-title' }, 'System Logs (' + (window.NC_MIS_LOG || []).length + ' entries)'),
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
                React.createElement('select', {
                    value: filterType,
                    onChange: function(e) { setFilterType(e.target.value); },
                    style: { padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 },
                },
                    React.createElement('option', { value: '' }, 'All Actions'),
                    actionTypes.sort().map(function(t) {
                        return React.createElement('option', { key: t, value: t }, t);
                    })
                ),
                React.createElement('button', { className: 'btn btn-primary', onClick: handleDownload }, 'Download Logs (JSON)')
            )
        ),
        React.createElement('table', { className: 'table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', null, 'Timestamp'),
                    React.createElement('th', null, 'Action Type'),
                    React.createElement('th', null, 'User'),
                    React.createElement('th', null, 'Indent ID'),
                    React.createElement('th', null, 'PO ID'),
                    React.createElement('th', null, 'Error')
                )
            ),
            React.createElement('tbody', null,
                logs.length === 0
                    ? React.createElement('tr', null, React.createElement('td', { colSpan: 6, style: { textAlign: 'center', padding: 20, color: '#64748b' } }, 'No log entries'))
                    : logs.slice(0, 200).map(function(entry, idx) {
                        return React.createElement('tr', { key: idx, style: entry.error ? { background: '#fef2f2' } : {} },
                            React.createElement('td', { style: { fontSize: 12, fontFamily: 'monospace' } }, entry.ts ? new Date(entry.ts).toLocaleString() : ''),
                            React.createElement('td', { style: { fontWeight: 600 } }, entry.type),
                            React.createElement('td', null, getUserName(entry.userId, state.users)),
                            React.createElement('td', null, entry.indentId || ''),
                            React.createElement('td', null, entry.poId || ''),
                            React.createElement('td', { style: { color: '#dc2626', fontSize: 12 } }, entry.error || '')
                        );
                    })
            )
        )
    );
}
