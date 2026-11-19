
const AppContext = createContext();

var initialState = {
    currentUserId: null,
    currentUser: null,
    users: [],
    sites: [],
    siteAssignments: {},
    vendors: [],
    indents: [],
    purchaseOrders: [],
    localPurchases: [],
    grns: [],
    notifications: [],
    offices: [],
    orgSettings: {},
    boqLists: {},
    currentRoute: '#login',
    toast: null,
    toasts: [],
    isLoading: true,
    isAuthenticated: false,
    isOffline: false,
};

function createNotification(userId, indentId, message, link, title) {
    return {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        userId,
        indentId,
        message,
        link: link || (indentId ? '#indent/' + indentId : ''),
        title: title || '',
        read: false,
        createdAt: new Date().toISOString()
    };
}

// Human-readable indent number for messages (never the internal UUID)
function indentNo(indentOrId, state) {
    var all = (state && state.indents) || [];
    var ind = (typeof indentOrId === 'string') ? all.find(function(i) { return i.id === indentOrId; }) : indentOrId;
    if (!ind) return '';
    var list = all.some(function(i) { return i.id === ind.id; }) ? all : all.concat([ind]);
    return getIndentDisplayId(ind, list);
}

// PO and indent notifications are created by the database functions
// (indent_flow.po_* / indent_* ), not here.

function createActivityLogEntry(action, by, note) {
    return {
        action,
        by,
        at: new Date().toISOString(),
        note: note || ''
    };
}

function addActivityLog(indent, action, by, note) {
    const log = indent.activityLog || [];
    return [...log, createActivityLogEntry(action, by, note)];
}

function appReducer(state, action) {
    switch (action.type) {
        case 'LOGIN_AS_USER': {
            var loginUser = typeof action.payload === 'string'
                ? state.users.find(function(u) { return u.id === action.payload; })
                : action.payload;
            return Object.assign({}, state, { currentUserId: loginUser ? loginUser.id : null, currentUser: loginUser || null });
        }

        case 'LOAD_DATA': {
            var _ld = Object.assign({}, state, action.payload, { isLoading: false, isAuthenticated: true });
            _ld.purchaseOrders = hydratePOs(_ld.purchaseOrders, _ld.vendors);
            return _ld;
        }

        case 'REFRESH_INDENTS':
            return Object.assign({}, state, { indents: action.payload });

        case 'REFRESH_POS':
            return Object.assign({}, state, { purchaseOrders: hydratePOs(action.payload, state.vendors) });

        case 'SET_LOADING':
            return Object.assign({}, state, { isLoading: action.payload });

        case 'SET_AUTHENTICATED':
            return Object.assign({}, state, { isAuthenticated: action.payload });

        case 'SET_SAVING':
            return Object.assign({}, state, { savingCount: Math.max(0, (state.savingCount || 0) + (action.payload || 0)) });

        case 'SET_OFFLINE':
            return Object.assign({}, state, { isOffline: action.payload });

        case 'LOGOUT':
            return { ...state, currentUserId: null, currentUser: null, currentRoute: '#login' };

        case 'NAVIGATE':
            return { ...state, currentRoute: action.payload };

        case 'CREATE_INDENT': {
            const newIndent = {
                ...action.payload,
                activityLog: action.payload.activityLog || [
                    createActivityLogEntry('Created', action.payload.createdBy, ''),
                    ...(action.payload.status === 'pending_approval'
                        ? [createActivityLogEntry('Submitted for Approval', action.payload.createdBy, '')]
                        : [])
                ]
            };
            let notificationsToAdd = [];

            if (newIndent.status === 'pending_approval') {
                const userSiteAssignments = state.siteAssignments;
                const siteAssignedPMs = Object.entries(userSiteAssignments)
                    .filter(([userId, siteIds]) => siteIds.includes(newIndent.siteId))
                    .map(([userId]) => userId)
                    .filter(userId => {
                        const user = state.users.find(u => u.id === userId);
                        return user && user.role === 'project_manager';
                    });

                const md = state.users.find(u => u.role === 'md');

                siteAssignedPMs.forEach(pmId => {
                    notificationsToAdd.push(createNotification(pmId, newIndent.id, `New indent ${indentNo(newIndent, state)} pending approval`));
                });

                if (md) {
                    notificationsToAdd.push(createNotification(md.id, newIndent.id, `New indent ${indentNo(newIndent, state)} pending approval`));
                }
            }

            return {
                ...state,
                indents: [...state.indents, newIndent],
                notifications: [...state.notifications, ...notificationsToAdd]
            };
        }

        case 'SUBMIT_INDENT': {
            var _si_indent = state.indents.find(function(i) { return i.id === action.payload.indentId; });
            if (!_si_indent || _si_indent.status !== 'draft') return state;
            var _si_notifs = [];
            var _si_pms = (state.users || []).filter(function(u) { return u.role === 'project_manager'; });
            var _si_md = (state.users || []).find(function(u) { return u.role === 'md'; });
            _si_pms.forEach(function(pm) { _si_notifs.push(createNotification(pm.id, _si_indent.id, 'New indent ' + getIndentDisplayId(_si_indent, state.indents) + ' pending approval')); });
            if (_si_md) { _si_notifs.push(createNotification(_si_md.id, _si_indent.id, 'New indent ' + getIndentDisplayId(_si_indent, state.indents) + ' pending approval')); }
            return {
                ...state,
                indents: state.indents.map(function(ind) {
                    return ind.id === action.payload.indentId
                        ? Object.assign({}, ind, { status: 'pending_approval', submittedAt: new Date().toISOString(), activityLog: addActivityLog(ind, 'Submitted for Approval', state.currentUserId, '') })
                        : ind;
                }),
                notifications: [...state.notifications, ..._si_notifs]
            };
        }

        case 'APPROVE_INDENT': {
            const indent = state.indents.find(i => i.id === action.payload.indentId);
            let notificationsToAdd = [];
            const approvedBy = action.payload.approvedBy || state.currentUserId;

            if (indent) {
                notificationsToAdd.push(createNotification(indent.createdBy, indent.id, `Indent ${indentNo(indent, state)} approved`));

                const procManager = state.users.find(u => u.role === 'procurement_manager');
                if (procManager) {
                    notificationsToAdd.push(createNotification(procManager.id, indent.id, `Indent ${indentNo(indent, state)} ready for procurement`));
                }
            }

            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: 'approved',
                            activityLog: addActivityLog(ind, 'Approved', approvedBy, action.payload.note || '')
                        }
                        : ind
                ),
                notifications: [...state.notifications, ...notificationsToAdd]
            };
        }

        case 'REJECT_INDENT': {
            const indent = state.indents.find(i => i.id === action.payload.indentId);
            let notificationsToAdd = [];
            const rejectedBy = action.payload.rejectedBy || state.currentUserId;

            const isReturnForRevision = action.payload.returnForRevision;
            const newStatus = isReturnForRevision ? 'returned_for_revision' : 'rejected';
            const actionLabel = isReturnForRevision ? 'Returned for Revision' : 'Rejected';

            if (indent) {
                notificationsToAdd.push(createNotification(indent.createdBy, indent.id,
                    isReturnForRevision
                        ? `Indent ${indentNo(indent, state)} returned for revision: ${action.payload.reason}`
                        : `Indent ${indentNo(indent, state)} rejected`
                ));
            }

            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: newStatus,
                            rejectionReason: action.payload.reason,
                            activityLog: addActivityLog(ind, actionLabel, rejectedBy, action.payload.reason)
                        }
                        : ind
                ),
                notifications: [...state.notifications, ...notificationsToAdd]
            };
        }

        case 'ASSIGN_INDENT': {
            let notificationsToAdd = [];
            const assignedBy = action.payload.assignedBy || state.currentUserId;
            const assigneeName = state.users.find(u => u.id === action.payload.userId)?.name || action.payload.userId;

            notificationsToAdd.push(createNotification(action.payload.userId, action.payload.indentId, `Indent assigned to you`));

            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: 'in_procurement',
                            assignedTo: action.payload.userId,
                            activityLog: addActivityLog(ind, 'Assigned to Procurement', assignedBy, `Assigned to ${assigneeName}`)
                        }
                        : ind
                ),
                notifications: [...state.notifications, ...notificationsToAdd]
            };
        }

        case 'MARK_DISPATCHED': {
            const indentId = typeof action.payload === 'string' ? action.payload : action.payload.indentId;
            const dispatchedBy = (typeof action.payload === 'object' && action.payload.dispatchedBy) || state.currentUserId;
            const indent = state.indents.find(i => i.id === indentId);
            let notificationsToAdd = [];

            if (indent) {
                const userSiteAssignments = state.siteAssignments;
                const siteAssignedStorekeepers = Object.entries(userSiteAssignments)
                    .filter(([userId, siteIds]) => siteIds.includes(indent.siteId))
                    .map(([userId]) => userId)
                    .filter(userId => {
                        const user = state.users.find(u => u.id === userId);
                        return user && user.role === 'storekeeper';
                    });

                siteAssignedStorekeepers.forEach(skId => {
                    notificationsToAdd.push(createNotification(skId, indent.id, `Indent ${indentNo(indent, state)} dispatched to your site`));
                });
            }

            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === indentId
                        ? {
                            ...ind,
                            status: 'dispatched',
                            dispatchVendor: (typeof action.payload === 'object' && action.payload.vendorName) || '',
                            dispatchETA: (typeof action.payload === 'object' && action.payload.expectedDelivery) || '',
                            dispatchDocRef: (typeof action.payload === 'object' && action.payload.docReference) || '',
                            dispatchNotes: (typeof action.payload === 'object' && action.payload.notes) || '',
                            activityLog: addActivityLog(ind, 'Dispatched', dispatchedBy,
                                typeof action.payload === 'object' ? ('Vendor: ' + (action.payload.vendorName || '') + ', ETA: ' + (action.payload.expectedDelivery || '')) : '')
                        }
                        : ind
                ),
                notifications: [...state.notifications, ...notificationsToAdd]
            };
        }

        case 'RECEIVE_ITEMS': {
            let notificationsToAdd = [];
            const receivedBy = action.payload.receivedBy || state.currentUserId;

            return {
                ...state,
                indents: state.indents.map(ind => {
                    if (ind.id === action.payload.indentId) {
                        const updatedLineItems = ind.lineItems.map(li =>
                            action.payload.lineItemUpdates[li.id]
                                ? { ...li, received: action.payload.lineItemUpdates[li.id] }
                                : li
                        );
                        const allFullyReceived = updatedLineItems.every(li => li.received >= li.qty);

                        if (allFullyReceived) {
                            notificationsToAdd.push(createNotification(ind.createdBy, ind.id, `Indent ${indentNo(ind, state)} completed - all items received`));

                            const userSiteAssignments = state.siteAssignments;
                            const pmId = Object.entries(userSiteAssignments)
                                .find(([userId, siteIds]) => siteIds.includes(ind.siteId) && state.users.find(u => u.id === userId && u.role === 'project_manager'))?.[0];
                            if (pmId) {
                                notificationsToAdd.push(createNotification(pmId, ind.id, `Indent ${indentNo(ind, state)} completed`));
                            }
                        }

                        (action.payload.qualityIssues || []).length > 0 && state.users.filter(u => u.role === 'procurement_manager' && u.id !== state.currentUserId).forEach(u => {
                            notificationsToAdd.push(createNotification(u.id, ind.id, `Quality issue on receipt for indent ${indentNo(ind, state)}: ${action.payload.qualityIssues.join('; ')}`, '', 'Quality issue on receipt'));
                        });

                        const logNote = (allFullyReceived ? 'All items received in full' : 'Partial items received') + (action.payload.receiptNote ? ' — ' + action.payload.receiptNote : '');
                        return {
                            ...ind,
                            lineItems: updatedLineItems,
                            status: allFullyReceived ? 'completed' : ind.status,
                            activityLog: addActivityLog(ind, allFullyReceived ? 'Completed' : 'Items Received (Partial)', receivedBy, logNote)
                        };
                    }
                    return ind;
                }),
                notifications: [...state.notifications, ...notificationsToAdd]
            };
        }

        case 'ADD_COMMENT':
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            comments: [
                                ...(ind.comments || []),
                                {
                                    id: `cmt-${Date.now()}`,
                                    author: action.payload.author,
                                    text: action.payload.text,
                                    createdAt: new Date().toISOString(),
                                },
                            ],
                        }
                        : ind
                ),
            };

        case 'MARK_NOTIFICATION_READ':
            return {
                ...state,
                notifications: state.notifications.map(n =>
                    n.id === action.payload
                        ? { ...n, read: true }
                        : n
                ),
            };

        case 'REVISE_RESUBMIT': {
            const indent = state.indents.find(i => i.id === action.payload.indentId);
            let notificationsToAdd = [];

            if (indent) {
                const userSiteAssignments = state.siteAssignments;
                const siteAssignedPMs = Object.entries(userSiteAssignments)
                    .filter(([userId, siteIds]) => siteIds.includes(indent.siteId))
                    .map(([userId]) => userId)
                    .filter(userId => {
                        const user = state.users.find(u => u.id === userId);
                        return user && user.role === 'project_manager';
                    });

                const md = state.users.find(u => u.role === 'md');

                siteAssignedPMs.forEach(pmId => {
                    notificationsToAdd.push(createNotification(pmId, indent.id, `Indent ${indentNo(indent, state)} resubmitted for approval`));
                });

                if (md) {
                    notificationsToAdd.push(createNotification(md.id, indent.id, `Indent ${indentNo(indent, state)} resubmitted for approval`));
                }
            }

            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: 'pending_approval',
                            lineItems: action.payload.lineItems,
                            notes: action.payload.notes,
                            submittedAt: new Date().toISOString(),
                            isRevised: true,
                            revisionCount: (ind.revisionCount || 0) + 1,
                            comments: [
                                ...(ind.comments || []),
                                {
                                    id: `cmt-${Date.now()}`,
                                    author: action.payload.revisedBy,
                                    text: action.payload.remarks || 'Revised and resubmitted',
                                    createdAt: new Date().toISOString(),
                                },
                            ],
                            activityLog: addActivityLog(ind, 'Revised & Resubmitted', action.payload.revisedBy, action.payload.remarks || `Revision #${(ind.revisionCount || 0) + 1}`)
                        }
                        : ind
                ),
                notifications: [...state.notifications, ...notificationsToAdd]
            };
        }

        case 'SUBMIT_DRAFT': {
            const indent = state.indents.find(i => i.id === action.payload);
            let notificationsToAdd = [];

            if (indent) {
                const userSiteAssignments = state.siteAssignments;
                const siteAssignedPMs = Object.entries(userSiteAssignments)
                    .filter(([userId, siteIds]) => siteIds.includes(indent.siteId))
                    .map(([userId]) => userId)
                    .filter(userId => {
                        const user = state.users.find(u => u.id === userId);
                        return user && user.role === 'project_manager';
                    });

                const md = state.users.find(u => u.role === 'md');

                siteAssignedPMs.forEach(pmId => {
                    notificationsToAdd.push(createNotification(pmId, indent.id, `Draft indent ${indentNo(indent, state)} submitted for approval`));
                });

                if (md) {
                    notificationsToAdd.push(createNotification(md.id, indent.id, `Draft indent ${indentNo(indent, state)} submitted for approval`));
                }
            }

            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload
                        ? {
                            ...ind,
                            status: 'pending_approval',
                            submittedAt: new Date().toISOString(),
                            activityLog: addActivityLog(ind, 'Submitted for Approval', ind.createdBy, '')
                        }
                        : ind
                ),
                notifications: [...state.notifications, ...notificationsToAdd]
            };
        }

        case 'UPDATE_DRAFT':
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            description: action.payload.description,
                            notes: action.payload.notes,
                            lineItems: action.payload.lineItems,
                            activityLog: addActivityLog(ind, 'Draft Updated', ind.createdBy, '')
                        }
                        : ind
                ),
            };

        case 'SHOW_TOAST':
            return { ...state, toast: action.payload };

        case 'HIDE_TOAST':
            return { ...state, toast: null };

        case 'ADD_USER':
            return {
                ...state,
                users: [...state.users, action.payload.user],
                siteAssignments: { ...state.siteAssignments, [action.payload.user.id]: (action.payload.siteIds || []) }
            };

        case 'EDIT_USER': {
            return {
                ...state,
                users: state.users.map(u =>
                    u.id === action.payload.userId
                        ? {
                            ...u,
                            name: action.payload.name !== undefined ? action.payload.name : u.name,
                            email: action.payload.email !== undefined ? action.payload.email : u.email,
                            role: action.payload.role !== undefined ? action.payload.role : u.role,
                        }
                        : u
                ),
            };
        }

        case 'DELETE_USER': {
            const deleteUserId = action.payload;
            const updatedAssignments = { ...state.siteAssignments };
            delete updatedAssignments[deleteUserId];
            return {
                ...state,
                users: state.users.filter(u => u.id !== deleteUserId),
                siteAssignments: updatedAssignments,
                indents: state.indents.map(ind =>
                    ind.assignedTo === deleteUserId
                        ? { ...ind, assignedTo: undefined }
                        : ind
                ),
            };
        }

        case 'UPDATE_USER': {
            return {
                ...state,
                users: state.users.map(function(u) {
                    if (u.id !== action.payload.userId) return u;
                    return Object.assign({}, u, {
                        name: action.payload.name !== undefined ? action.payload.name : u.name,
                        phone: action.payload.phone !== undefined ? action.payload.phone : u.phone,
                        role: action.payload.role !== undefined ? action.payload.role : u.role,
                        isActive: action.payload.isActive !== undefined ? action.payload.isActive : u.isActive,
                    });
                }),
            };
        }

        case 'DEACTIVATE_USER': {
            return {
                ...state,
                users: state.users.map(function(u) {
                    if (u.id !== action.payload.userId) return u;
                    return Object.assign({}, u, { isActive: action.payload.isActive });
                }),
            };
        }

        case 'UPDATE_SITE_ASSIGNMENTS': {
            var newAssignments = Object.assign({}, state.siteAssignments);
            newAssignments[action.payload.userId] = action.payload.siteIds || [];
            return Object.assign({}, state, { siteAssignments: newAssignments });
        }

        case 'ADD_SITE':
            return {
                ...state,
                sites: [...state.sites, action.payload],
                boqLists: { ...state.boqLists, [action.payload.id]: [] }
            };

        case 'EDIT_SITE': {
            return {
                ...state,
                sites: state.sites.map(s =>
                    s.id === action.payload.siteId
                        ? {
                            ...s,
                            name: action.payload.name !== undefined ? action.payload.name : s.name,
                            location: action.payload.location !== undefined ? action.payload.location : s.location,
                            officeId: action.payload.officeId || s.officeId,
                        }
                        : s
                ),
            };
        }

        case 'DELETE_SITE': {
            const deleteSiteId = action.payload;
            const updatedSiteAssignments = {};
            Object.entries(state.siteAssignments).forEach(([userId, siteIds]) => {
                updatedSiteAssignments[userId] = siteIds.filter(id => id !== deleteSiteId);
            });
            const updatedBoqLists = { ...state.boqLists };
            delete updatedBoqLists[deleteSiteId];
            return {
                ...state,
                sites: state.sites.filter(s => s.id !== deleteSiteId),
                siteAssignments: updatedSiteAssignments,
                boqLists: updatedBoqLists,
            };
        }

        case 'TOGGLE_SITE_ASSIGNMENT': {
            const { userId, siteId } = action.payload;
            const currentAssignments = state.siteAssignments[userId] || [];
            const newAssignments = currentAssignments.includes(siteId)
                ? currentAssignments.filter(id => id !== siteId)
                : [...currentAssignments, siteId];
            return {
                ...state,
                siteAssignments: { ...state.siteAssignments, [userId]: newAssignments }
            };
        }

        case 'ADD_VENDOR':
            return { ...state, vendors: [...state.vendors, action.payload] };

        case 'EDIT_VENDOR': {
            return {
                ...state,
                vendors: state.vendors.map(v =>
                    v.id === action.payload.vendorId
                        ? { ...v, ...action.payload.updates }
                        : v
                ),
            };
        }

        case 'DELETE_VENDOR': {
            return {
                ...state,
                vendors: state.vendors.filter(v => v.id !== action.payload),
            };
        }

        case 'CLONE_INDENT': {
            const sourceIndent = state.indents.find(i => i.id === action.payload.sourceIndentId);
            if (!sourceIndent) return state;

            const clonedBy = action.payload.clonedBy || state.currentUserId;
            const newIndentId = genUUID();
            const clonedIndent = {
                ...sourceIndent,
                id: newIndentId,
                createdBy: clonedBy,
                createdAt: new Date().toISOString(),
                status: 'draft',
                priority: sourceIndent.priority || 'normal',
                assignedTo: undefined,
                submittedAt: undefined,
                rejectionReason: undefined,
                returnReason: undefined,
                escalationRemarks: undefined,
                mdRemarks: undefined,
                mdEscalationResult: undefined,
                linkedPO: undefined,
                externalPO: undefined,
                isRevised: undefined,
                revisionCount: 0,
                lineItems: sourceIndent.lineItems.map((li, idx) => ({
                    ...li,
                    id: genUUID(),
                    received: 0,
                })),
                comments: [],
                activityLog: [
                    createActivityLogEntry('Created', clonedBy, `Cloned from ${sourceIndent.id}`)
                ],
            };

            return {
                ...state,
                indents: [...state.indents, clonedIndent],
            };
        }

        case 'BULK_APPROVE': {
            const indentIds = action.payload.indentIds || [];
            const approvedBy = action.payload.approvedBy || state.currentUserId;
            let notificationsToAdd = [];

            const updatedIndents = state.indents.map(ind => {
                if (indentIds.includes(ind.id) && ind.status === 'pending_approval') {
                    notificationsToAdd.push(createNotification(ind.createdBy, ind.id, `Indent ${indentNo(ind, state)} approved`));

                    const procManager = state.users.find(u => u.role === 'procurement_manager');
                    if (procManager) {
                        notificationsToAdd.push(createNotification(procManager.id, ind.id, `Indent ${indentNo(ind, state)} ready for procurement`));
                    }

                    return {
                        ...ind,
                        status: 'approved',
                        activityLog: addActivityLog(ind, 'Approved (Bulk)', approvedBy, `Bulk approved with ${indentIds.length} other indents`)
                    };
                }
                return ind;
            });

            return {
                ...state,
                indents: updatedIndents,
                notifications: [...state.notifications, ...notificationsToAdd]
            };
        }

        case 'LOG_ACTIVITY': {
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            activityLog: addActivityLog(
                                ind,
                                action.payload.action,
                                action.payload.by || state.currentUserId,
                                action.payload.note || ''
                            )
                        }
                        : ind
                ),
            };
        }

        case 'CREATE_PO': {
            const po = {
                ...action.payload.po,
                lineItems: (action.payload.po.lineItems || []).map(li => ({
                    ...li,
                    gstPercent: li.gstPercent !== undefined ? li.gstPercent : 18
                }))
            };
            return {
                ...state,
                purchaseOrders: [...state.purchaseOrders, po],
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: 'po_draft',
                            linkedPO: po.id,
                            activityLog: addActivityLog(ind, 'PO Created', state.currentUserId, 'PO ' + (po.poNumber || po.id) + ' created')
                        }
                        : ind
                ),
            };
        }

        case 'ATTACH_EXTERNAL_PO':
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: 'po_issued',
                            externalPO: action.payload.fileName,
                            linkedPO: 'external',
                            activityLog: addActivityLog(ind, 'External PO Attached', state.currentUserId, `File: ${action.payload.fileName}`)
                        }
                        : ind
                ),
            };

        case 'ESCALATE_TO_MD':
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: 'escalated_to_md',
                            escalationRemarks: action.payload.remarks,
                            activityLog: addActivityLog(ind, 'Escalated to MD', state.currentUserId, action.payload.remarks)
                        }
                        : ind
                ),
                notifications: [
                    ...state.notifications,
                    createNotification(
                        state.users.find(u => u.role === 'md')?.id || 'md-001',
                        action.payload.indentId,
                        `Escalated: Indent ${indentNo(action.payload.indentId, state)} needs your decision` + (action.payload.remarks ? ' -- ' + action.payload.remarks.substring(0, 50) : '')
                    )
                ]
            };

        case 'MD_ESCALATION_APPROVE':
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: 'in_procurement',
                            mdEscalationResult: 'approved',
                            mdRemarks: action.payload.remarks,
                            activityLog: addActivityLog(ind, 'MD Escalation Approved', state.currentUserId, action.payload.remarks || '')
                        }
                        : ind
                ),
                notifications: [
                    ...state.notifications,
                    createNotification(
                        state.users.find(u => u.role === 'procurement_manager')?.id || 'proc-001',
                        action.payload.indentId,
                        `MD approved escalation for ${indentNo(action.payload.indentId, state)} -- proceed with PO`
                    )
                ]
            };

        case 'MD_ESCALATION_DISMISS': {
            const targetIndent = state.indents.find(i => i.id === action.payload.indentId);
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: 'returned_for_revision',
                            mdEscalationResult: 'dismissed',
                            mdRemarks: action.payload.remarks,
                            activityLog: addActivityLog(ind, 'MD Escalation Dismissed', state.currentUserId, action.payload.remarks || '')
                        }
                        : ind
                ),
                notifications: [
                    ...state.notifications,
                    createNotification(
                        targetIndent?.createdBy || '',
                        action.payload.indentId,
                        `Indent ${indentNo(action.payload.indentId, state)} returned for revision by MD`
                    )
                ]
            };
        }

        // REQUEST_MD_PO_APPROVAL handled in var-based section below

        case 'MD_APPROVE_PO':
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(po =>
                    po.id === action.payload.poId
                        ? { ...po, status: 'approved' }
                        : po
                ),
                indents: state.indents.map(ind =>
                    ind.linkedPO === action.payload.poId
                        ? {
                            ...ind,
                            status: 'po_approved',
                            activityLog: addActivityLog(ind, 'PO Approved by MD', state.currentUserId, `PO ${action.payload.poId}`)
                        }
                        : ind
                ),
            };

        case 'MD_REJECT_PO':
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(po =>
                    po.id === action.payload.poId
                        ? { ...po, status: 'draft', mdRejectReason: action.payload.reason }
                        : po
                ),
                indents: state.indents.map(ind =>
                    ind.linkedPO === action.payload.poId
                        ? {
                            ...ind,
                            status: 'po_draft',
                            activityLog: addActivityLog(ind, 'PO Rejected by MD', state.currentUserId, action.payload.reason || '')
                        }
                        : ind
                ),
            };

        case 'FINALIZE_PO':
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(po =>
                    po.id === action.payload.poId
                        ? { ...po, status: 'issued' }
                        : po
                ),
                indents: state.indents.map(ind =>
                    ind.linkedPO === action.payload.poId
                        ? {
                            ...ind,
                            status: 'po_issued',
                            activityLog: addActivityLog(ind, 'PO Finalized & Issued', state.currentUserId, `PO ${action.payload.poId} issued`)
                        }
                        : ind
                ),
            };

        case 'RETURN_FOR_REVISION':
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            status: 'returned_for_revision',
                            returnReason: action.payload.reason,
                            activityLog: addActivityLog(ind, 'Returned for Revision', state.currentUserId, action.payload.reason || '')
                        }
                        : ind
                ),
            };

        case 'ASSIGN_SITE': {
            const { userId, siteId } = action.payload;
            const current = state.siteAssignments[userId] || [];
            if (current.includes(siteId)) return state;
            return {
                ...state,
                siteAssignments: {
                    ...state.siteAssignments,
                    [userId]: [...current, siteId],
                },
            };
        }

        case 'UNASSIGN_SITE': {
            const { userId, siteId } = action.payload;
            const current = state.siteAssignments[userId] || [];
            return {
                ...state,
                siteAssignments: {
                    ...state.siteAssignments,
                    [userId]: current.filter(s => s !== siteId),
                },
            };
        }

        case 'UPDATE_ORG_SETTINGS':
            return { ...state, orgSettings: { ...state.orgSettings, ...action.payload } };

        case 'ADD_DOCUMENT': {
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            documents: [...(ind.documents || []), action.payload.document],
                            activityLog: addActivityLog(ind, 'Document Uploaded', state.currentUserId, action.payload.document.name + ' (' + action.payload.document.category + ')')
                        }
                        : ind
                ),
            };
        }

        case 'DELETE_DOCUMENT': {
            return {
                ...state,
                indents: state.indents.map(ind =>
                    ind.id === action.payload.indentId
                        ? {
                            ...ind,
                            documents: (ind.documents || []).filter(d => d.id !== action.payload.documentId),
                            activityLog: addActivityLog(ind, 'Document Removed', state.currentUserId, action.payload.documentName || '')
                        }
                        : ind
                ),
            };
        }

        case 'UPDATE_PO': {
            const existingPO = state.purchaseOrders.find(p => p.id === action.payload.poId);
            if (!existingPO) return state;
            const newVersion = (existingPO.version || 1) + 1;
            const updatedPO = {
                ...existingPO,
                ...action.payload.updates,
                version: newVersion,
                updatedAt: new Date().toISOString(),
                updatedBy: state.currentUserId,
            };
            // Keep old version in history
            const versionEntry = {
                version: existingPO.version || 1,
                editedBy: state.currentUserId,
                editedAt: new Date().toISOString(),
                totalAmount: Number(existingPO.totalAmount) || 0,
            };
            updatedPO.versionHistory = [...(existingPO.versionHistory || []), versionEntry];
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(po =>
                    po.id === action.payload.poId ? updatedPO : po
                ),
                indents: state.indents.map(ind =>
                    ind.id === existingPO.indentId
                        ? { ...ind, activityLog: addActivityLog(ind, 'PO Updated to v' + newVersion, state.currentUserId, action.payload.note || '') }
                        : ind
                ),
            };
        }

        // ── Office Management ──
        case 'ADD_OFFICE':
            return { ...state, offices: [...(state.offices || []), action.payload] };

        case 'UPDATE_OFFICE':
            return {
                ...state,
                offices: (state.offices || []).map(function(o) {
                    return o.id === action.payload.officeId ? Object.assign({}, o, action.payload.updates) : o;
                }),
            };

        case 'DELETE_OFFICE': {
            var linkedSites = (state.sites || []).filter(function(s) { return s.officeId === action.payload; });
            if (linkedSites.length > 0) return state; // Cannot delete if sites linked
            return { ...state, offices: (state.offices || []).filter(function(o) { return o.id !== action.payload; }) };
        }

        // ── PO Lifecycle ──
        case 'SUBMIT_PO_FOR_APPROVAL': {
            var _spfa_po = (state.purchaseOrders || []).find(function(p) { return p.id === action.payload.poId; });
            if (!_spfa_po || _spfa_po.status !== 'draft') return state;
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'pending_approval', submittedAt: new Date().toISOString(), submittedBy: state.currentUserId }) : po;
                }),
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId
                        ? Object.assign({}, ind, { status: 'pending_md_po_approval', activityLog: addActivityLog(ind, 'PO Submitted for MD Approval', state.currentUserId, 'PO ' + action.payload.poId) })
                        : ind;
                }),
            };
        }

        case 'APPROVE_PO': {
            var _apo = (state.purchaseOrders || []).find(function(p) { return p.id === action.payload.poId; });
            if (!_apo || (_apo.status !== 'pending_approval' && _apo.status !== 'pending_approval')) return state;
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'approved', approvedAt: new Date().toISOString(), approvedBy: state.currentUserId }) : po;
                }),
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId
                        ? Object.assign({}, ind, { status: 'po_approved', activityLog: addActivityLog(ind, 'PO Approved', state.currentUserId, 'PO ' + action.payload.poId + ' approved') })
                        : ind;
                }),
            };
        }

        case 'REJECT_PO': {
            var _rpo = (state.purchaseOrders || []).find(function(p) { return p.id === action.payload.poId; });
            if (!_rpo) return state;
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'draft', rejectedAt: new Date().toISOString(), rejectedBy: state.currentUserId, rejectReason: action.payload.reason || '' }) : po;
                }),
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId
                        ? Object.assign({}, ind, { status: 'po_draft', activityLog: addActivityLog(ind, 'PO Rejected', state.currentUserId, action.payload.reason || '') })
                        : ind;
                }),
            };
        }

        case 'ISSUE_PO': {
            var _ipo = (state.purchaseOrders || []).find(function(p) { return p.id === action.payload.poId; });
            if (!_ipo || _ipo.status !== 'approved') return state;
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'issued', issuedAt: new Date().toISOString(), issuedBy: state.currentUserId }) : po;
                }),
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId
                        ? Object.assign({}, ind, { status: 'po_issued', activityLog: addActivityLog(ind, 'PO Issued to Vendor', state.currentUserId, 'PO ' + action.payload.poId + ' issued') })
                        : ind;
                }),
            };
        }

        case 'RECEIVE_AGAINST_PO': {
            var _rap_poId = action.payload.poId;
            var _rap_receipts = action.payload.receipts || [];
            var _rap_po = (state.purchaseOrders || []).find(function(p) { return p.id === _rap_poId; });
            if (!_rap_po) return state;

            var _rap_grnId = genUUID();
            var _rap_grnNumber = 'GRN-' + new Date().getFullYear() + '-' + Date.now().toString(36).toUpperCase();
            var _rap_now = new Date().toISOString();

            // Build single GRN with nested items (new structure)
            var _rap_newGrn = {
                id: _rap_grnId,
                grnNumber: _rap_grnNumber,
                poId: _rap_poId,
                receivedBy: state.currentUserId,
                remarks: action.payload.remarks || '',
                createdAt: _rap_now,
                photoUrl: action.payload.photoUrl || '',
                items: _rap_receipts.map(function(r) {
                    return {
                        id: genUUID(),
                        poLineItemId: r.lineItemId,
                        quantityReceived: parseFloat(r.quantityReceived) || 0,
                        remarks: r.remarks || '',
                        condition: r.condition || 'Good',
                        qualityRemarks: r.qualityRemarks || '',
                    };
                }),
            };

            var updatedPoLineItems = _rap_po.lineItems.map(function(li) {
                var receipt = _rap_receipts.find(function(r) { return r.lineItemId === li.id; });
                if (receipt) {
                    return Object.assign({}, li, { receivedQty: (li.receivedQty || 0) + (parseFloat(receipt.quantityReceived) || 0) });
                }
                return li;
            });

            var allFulfilled = updatedPoLineItems.every(function(li) { return (li.receivedQty || 0) >= (li.quantity || li.qty || 0); });
            var someFulfilled = updatedPoLineItems.some(function(li) { return (li.receivedQty || 0) > 0; });
            var newPoStatus = allFulfilled ? 'fulfilled' : (someFulfilled ? 'partially_fulfilled' : _rap_po.status);

            // Check for discrepancies and generate notifications
            var _rap_discrepancies = [];
            _rap_receipts.forEach(function(r) {
                var li = _rap_po.lineItems.find(function(l) { return l.id === r.lineItemId; });
                if (r.condition && r.condition !== 'Good') {
                    _rap_discrepancies.push((li ? li.description || li.name : 'Item') + ': ' + r.condition);
                }
            });
            var _rap_notifs = [];
            if (_rap_discrepancies.length > 0) {
                var _rap_poDisplay = getPODisplayId(_rap_po);
                var _rap_msg = 'Discrepancy in GRN ' + _rap_grnNumber + ' for ' + _rap_poDisplay + ': ' + _rap_discrepancies.join('; ');
                // Notify all procurement managers
                (state.users || []).forEach(function(u) {
                    if (u.role === 'procurement_manager') {
                        _rap_notifs.push(createNotification(u.id, null, _rap_msg));
                    }
                });
            }

            return {
                ...state,
                grns: [...(state.grns || []), _rap_newGrn],
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === _rap_poId ? Object.assign({}, po, { lineItems: updatedPoLineItems, status: newPoStatus }) : po;
                }),
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === _rap_poId
                        ? Object.assign({}, ind, { activityLog: addActivityLog(ind, allFulfilled ? 'PO Fully Received' : 'PO Partial Receipt', state.currentUserId, 'GRN recorded for PO ' + _rap_poId) })
                        : ind;
                }),
                notifications: [...(state.notifications || []), ..._rap_notifs],
            };
        }

        case 'CLOSE_PO': {
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'closed', closedAt: new Date().toISOString(), closedBy: state.currentUserId }) : po;
                }),
                // Closing the PO completes the indent it was raised for
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId
                        ? Object.assign({}, ind, { status: 'completed', activityLog: addActivityLog(ind, 'PO Closed — Indent Completed', state.currentUserId, 'PO ' + action.payload.poId + ' closed') })
                        : ind;
                }),
            };
        }

        case 'CANCEL_PO': {
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: state.currentUserId, cancelReason: action.payload.reason || '' }) : po;
                }),
                // The indent goes back to procurement so a new PO can be raised
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId
                        ? Object.assign({}, ind, { status: 'in_procurement', linkedPO: null, activityLog: addActivityLog(ind, 'PO Cancelled', state.currentUserId, action.payload.reason || '') })
                        : ind;
                }),
            };
        }

        case 'REQUEST_MD_PO_APPROVAL': {
            var _rmpa_po = (state.purchaseOrders || []).find(function(p) { return p.id === action.payload.poId; });
            if (!_rmpa_po) return state;
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'pending_approval', submittedAt: new Date().toISOString(), submittedBy: state.currentUserId }) : po;
                }),
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId || ind.id === action.payload.indentId
                        ? Object.assign({}, ind, { status: 'pending_md_po_approval', activityLog: addActivityLog(ind, 'PO Submitted for MD Approval', state.currentUserId, 'PO ' + action.payload.poId) })
                        : ind;
                }),
            };
        }

        case 'MD_APPROVE_PO': {
            var _mdapo = (state.purchaseOrders || []).find(function(p) { return p.id === action.payload.poId; });
            if (!_mdapo || _mdapo.status !== 'pending_approval') return state;
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'approved', approvedAt: new Date().toISOString(), approvedBy: state.currentUserId }) : po;
                }),
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId
                        ? Object.assign({}, ind, { status: 'po_approved', activityLog: addActivityLog(ind, 'PO Approved by MD', state.currentUserId, 'PO ' + action.payload.poId + ' approved') })
                        : ind;
                }),
            };
        }

        case 'MD_REJECT_PO': {
            var _mdrpo = (state.purchaseOrders || []).find(function(p) { return p.id === action.payload.poId; });
            if (!_mdrpo) return state;
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'draft', rejectedAt: new Date().toISOString(), rejectedBy: state.currentUserId, rejectReason: action.payload.reason || '' }) : po;
                }),
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId
                        ? Object.assign({}, ind, { status: 'po_draft', activityLog: addActivityLog(ind, 'PO Rejected by MD', state.currentUserId, action.payload.reason || '') })
                        : ind;
                }),
            };
        }

        case 'AMEND_PO': {
            var _amp = (state.purchaseOrders || []).find(function(p) { return p.id === action.payload.poId; });
            if (!_amp) return state;
            var _ampVersion = (_amp.version || 1) + 1;
            return {
                ...state,
                purchaseOrders: state.purchaseOrders.map(function(po) {
                    return po.id === action.payload.poId ? Object.assign({}, po, { status: 'draft', amendedAt: new Date().toISOString(), amendedBy: state.currentUserId, isAmended: true, version: _ampVersion, previousStatus: 'issued' }) : po;
                }),
                indents: state.indents.map(function(ind) {
                    return ind.linkedPO === action.payload.poId
                        ? Object.assign({}, ind, { status: 'po_draft', activityLog: addActivityLog(ind, 'PO Amendment — Reverted to Draft', state.currentUserId, 'PO ' + action.payload.poId + ' v' + _ampVersion + ' opened for editing') })
                        : ind;
                }),
            };
        }

        default:
            return state;
    }
}
