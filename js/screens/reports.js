
// ============================================================================
// 16. COMPLETED ORDERS SCREEN
// ============================================================================

function CompletedOrdersScreen() {
    const [state] = React.useContext(AppContext);
    const currentUser = state.users.find(u => u.id === state.currentUserId);
    const [filters, setFilters] = useState({});

    let completedIndents = [];

    if (currentUser.role === 'site_engineer') {
        completedIndents = state.indents.filter(i => i.status === 'completed' && i.createdBy === state.currentUserId);
    } else if (currentUser.role === 'storekeeper') {
        const userSites = getUserSites(state.currentUserId, state.sites, state.siteAssignments);
        const siteIds = userSites.map(s => s.id);
        completedIndents = state.indents.filter(i => i.status === 'completed' && siteIds.includes(i.siteId));
    } else if (currentUser.role === 'project_manager') {
        const userSites = getUserSites(state.currentUserId, state.sites, state.siteAssignments);
        const siteIds = userSites.map(s => s.id);
        completedIndents = state.indents.filter(i => i.status === 'completed' && siteIds.includes(i.siteId));
    } else if (currentUser.role === 'procurement_manager') {
        completedIndents = state.indents.filter(i => i.status === 'completed');
    } else if (currentUser.role === 'procurement_clerk') {
        completedIndents = state.indents.filter(i => i.status === 'completed' && i.assignedTo === state.currentUserId);
    } else if (currentUser.role === 'md') {
        completedIndents = state.indents.filter(i => i.status === 'completed');
    } else if (currentUser.role === 'admin') {
        completedIndents = state.indents.filter(i => i.status === 'completed');
    }

    const allCompleted = completedIndents;
    const completedList = useListControls(
        applyIndentFilters(completedIndents, filters).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
        indentListFields(state));
    completedIndents = completedList.rows;

    return React.createElement('div', null,
        React.createElement(IndentFilterBar, {
            sites: state.sites, users: state.users, filters, setFilters,
            totalCount: allCompleted.length, filteredCount: completedIndents.length
        }),
        completedList.bar,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Completed Orders')
            ),
            React.createElement('table', { className: 'table' },
                React.createElement('thead', null,
                    React.createElement('tr', null,
                        React.createElement('th', null, 'Indent No.'),
                        React.createElement('th', null, 'Description'),
                        React.createElement('th', null, 'Site'),
                        React.createElement('th', null, 'Requested By'),
                        React.createElement('th', null, 'Completed Date'),
                        React.createElement('th', null, 'Items')
                    )
                ),
                React.createElement('tbody', null,
                    completedIndents.length === 0
                        ? React.createElement('tr', null,
                            React.createElement('td', { colSpan: '6', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No completed orders')
                        )
                        : completedIndents.map(indent =>
                            React.createElement('tr', {
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
                                React.createElement('td', null, new Date(indent.createdAt).toLocaleDateString()),
                                React.createElement('td', null, indent.lineItems.length)
                            )
                        )
                )
            )
        )
    );
}

// ============================================================================
// 17. MATERIAL CONSUMPTION REPORT (NEW)
// ============================================================================

function MaterialConsumptionReport() {
    const [state] = React.useContext(AppContext);
    const [siteFilter, setSiteFilter] = useState('');

    const completedIndents = state.indents.filter(i => {
        if (i.status !== 'completed') return false;
        if (siteFilter && i.siteId !== siteFilter) return false;
        return true;
    });

    const materialMap = {};
    completedIndents.forEach(indent => {
        indent.lineItems.forEach(li => {
            const key = li.description;
            if (!materialMap[key]) {
                materialMap[key] = { name: key, totalOrdered: 0, totalReceived: 0, unit: li.unit, indentCount: 0, indentIds: new Set() };
            }
            materialMap[key].totalOrdered += li.qty || 0;
            materialMap[key].totalReceived += li.received || 0;
            if (!materialMap[key].indentIds.has(indent.id)) {
                materialMap[key].indentIds.add(indent.id);
                materialMap[key].indentCount++;
            }
        });
    });

    const materials = Object.values(materialMap).sort((a, b) => b.totalOrdered - a.totalOrdered);

    return React.createElement('div', null,
        React.createElement('div', { style: { marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' } },
            React.createElement('label', { className: 'form-label', style: { margin: 0 } }, 'Filter by Site:'),
            React.createElement('select', {
                className: 'form-select', style: { width: '200px' },
                value: siteFilter,
                onChange: (e) => setSiteFilter(e.target.value)
            },
                React.createElement('option', { value: '' }, 'All Sites'),
                state.sites.map(s =>
                    React.createElement('option', { key: s.id, value: s.id }, s.name + ' (' + s.location + ')')
                )
            )
        ),
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Material Consumption Summary')
            ),
            React.createElement('table', { className: 'table' },
                React.createElement('thead', null,
                    React.createElement('tr', null,
                        React.createElement('th', null, 'Material'),
                        React.createElement('th', null, 'Total Qty Ordered'),
                        React.createElement('th', null, 'Total Qty Received'),
                        React.createElement('th', null, 'Unit'),
                        React.createElement('th', null, 'No. of Indents')
                    )
                ),
                React.createElement('tbody', null,
                    materials.length === 0
                        ? React.createElement('tr', null,
                            React.createElement('td', { colSpan: '5', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No completed indents found')
                        )
                        : materials.map(m =>
                            React.createElement('tr', { key: m.name },
                                React.createElement('td', { style: { fontWeight: '600' } }, m.name),
                                React.createElement('td', null, m.totalOrdered.toLocaleString()),
                                React.createElement('td', null, m.totalReceived.toLocaleString()),
                                React.createElement('td', null, m.unit),
                                React.createElement('td', null, m.indentCount)
                            )
                        )
                )
            )
        )
    );
}

// ============================================================================
// 18. INDENT AGING REPORT (NEW)
// ============================================================================

function IndentAgingReport() {
    const [state] = React.useContext(AppContext);

    const openIndents = state.indents
        .filter(i => !['completed', 'rejected'].includes(i.status))
        .map(i => {
            const daysSinceCreation = Math.floor((new Date() - new Date(i.createdAt)) / (1000 * 60 * 60 * 24));
            return { ...i, daysSinceCreation };
        })
        .sort((a, b) => b.daysSinceCreation - a.daysSinceCreation);

    const totalOpen = openIndents.length;
    const avgAge = totalOpen > 0
        ? Math.round(openIndents.reduce((sum, i) => sum + i.daysSinceCreation, 0) / totalOpen)
        : 0;
    const oldest = openIndents.length > 0 ? openIndents[0] : null;

    const getRowColor = (days) => {
        if (days > 30) return { backgroundColor: '#fef2f2' };
        if (days > 14) return { backgroundColor: '#fffbeb' };
        return {};
    };

    return React.createElement('div', null,
        // Summary cards
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' } },
            React.createElement('div', { className: 'card', style: { textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: '28px', fontWeight: '700', color: '#2563eb' } }, totalOpen),
                React.createElement('div', { style: { fontSize: '13px', color: '#64748b', marginTop: '4px' } }, 'Total Open Indents')
            ),
            React.createElement('div', { className: 'card', style: { textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: '28px', fontWeight: '700', color: '#f59e0b' } }, avgAge + ' days'),
                React.createElement('div', { style: { fontSize: '13px', color: '#64748b', marginTop: '4px' } }, 'Average Age')
            ),
            React.createElement('div', { className: 'card', style: { textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: '28px', fontWeight: '700', color: '#ef4444' } },
                    oldest ? oldest.daysSinceCreation + ' days' : '-'
                ),
                React.createElement('div', { style: { fontSize: '13px', color: '#64748b', marginTop: '4px' } },
                    oldest ? 'Oldest: ' + oldest.id : 'Oldest Indent'
                )
            )
        ),

        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-header' },
                React.createElement('div', { className: 'card-title' }, 'Indent Aging Detail')
            ),
            React.createElement('div', { style: { padding: '8px 16px', fontSize: '12px', color: '#64748b', display: 'flex', gap: '16px' } },
                React.createElement('span', null,
                    React.createElement('span', { style: { display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '2px', marginRight: '4px' } }),
                    '> 30 days'
                ),
                React.createElement('span', null,
                    React.createElement('span', { style: { display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '2px', marginRight: '4px' } }),
                    '> 14 days'
                )
            ),
            React.createElement('table', { className: 'table' },
                React.createElement('thead', null,
                    React.createElement('tr', null,
                        React.createElement('th', null, 'Indent ID'),
                        React.createElement('th', null, 'Site'),
                        React.createElement('th', null, 'Status'),
                        React.createElement('th', null, 'Created Date'),
                        React.createElement('th', null, 'Days Since Creation'),
                        React.createElement('th', null, 'Priority')
                    )
                ),
                React.createElement('tbody', null,
                    openIndents.length === 0
                        ? React.createElement('tr', null,
                            React.createElement('td', { colSpan: '6', style: { textAlign: 'center', padding: '20px', color: '#64748b' } }, 'No open indents')
                        )
                        : openIndents.map(indent =>
                            React.createElement('tr', {
                                key: indent.id,
                                style: { ...getRowColor(indent.daysSinceCreation), cursor: 'pointer' },
                                onClick: () => { window.location.hash = '#indent/' + indent.id; }
                            },
                                React.createElement('td', null,
                                    React.createElement('a', { href: '#indent/' + indent.id, style: { textDecoration: 'none', color: '#2563eb' } }, getIndentDisplayId(indent, state.indents))
                                ),
                                React.createElement('td', null, getSiteName(indent.siteId, state.sites)),
                                React.createElement('td', null, React.createElement(StatusBadge, { status: indent.status })),
                                React.createElement('td', null, new Date(indent.createdAt).toLocaleDateString()),
                                React.createElement('td', { style: { fontWeight: '600', color: indent.daysSinceCreation > 30 ? '#dc2626' : indent.daysSinceCreation > 14 ? '#d97706' : '#1e293b' } },
                                    indent.daysSinceCreation
                                ),
                                React.createElement('td', null,
                                    React.createElement('span', {
                                        style: {
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500',
                                            backgroundColor: indent.priority === 'urgent' ? '#fef2f2' : indent.priority === 'low' ? '#f0fdf4' : '#f8fafc',
                                            color: indent.priority === 'urgent' ? '#dc2626' : indent.priority === 'low' ? '#15803d' : '#475569'
                                        }
                                    }, (indent.priority || 'normal').charAt(0).toUpperCase() + (indent.priority || 'normal').slice(1))
                                )
                            )
                        )
                )
            )
        )
    );
}

// ============================================================================
// 19. REPORTS SCREEN (NEW - wrapper)
// ============================================================================

function ReportsScreen() {
    const [activeTab, setActiveTab] = useState('consumption');

    const renderTab = (label, tabKey) => {
        return React.createElement('button', {
            key: tabKey,
            onClick: () => setActiveTab(tabKey),
            style: {
                padding: '12px 20px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tabKey ? '600' : '500',
                color: activeTab === tabKey ? '#2563eb' : '#64748b',
                borderBottom: activeTab === tabKey ? '3px solid #2563eb' : 'none',
                transition: 'all 0.2s ease'
            }
        }, label);
    };

    return React.createElement('div', null,
        React.createElement('div', { className: 'card', style: { marginBottom: '16px' } },
            React.createElement('div', { style: { borderBottom: '1px solid #e2e8f0', display: 'flex' } },
                renderTab('Material Consumption', 'consumption'),
                renderTab('Indent Aging', 'aging')
            )
        ),
        activeTab === 'consumption'
            ? React.createElement(MaterialConsumptionReport, null)
            : React.createElement(IndentAgingReport, null)
    );
}
