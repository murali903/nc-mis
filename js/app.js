
// ============================================================================
// 20. APP COMPONENT (MODIFIED - new routes)
// ============================================================================

function LoadingScreen() {
    return React.createElement('div', { className: 'loading-screen' },
        React.createElement('div', { className: 'loading-spinner' }),
        React.createElement('div', { style: { fontSize: 22, fontWeight: 700, marginBottom: 8 } }, 'IndentFlow'),
        React.createElement('div', { style: { fontSize: 14, opacity: 0.8 } }, 'Loading your data...')
    );
}

function OfflineBanner() {
    return React.createElement('div', { className: 'offline-banner' },
        'Network connection lost. Changes may not be saved. Reconnecting...'
    );
}

function App() {
    var _reducer = useReducer(appReducer, initialState);
    var state = _reducer[0];
    var rawDispatch = _reducer[1];
    var route = useHashRoute();
    var stateRef = useRef(state);

    // Keep stateRef current for async sync functions
    stateRef.current = state;
    // DB syncs run one at a time, in dispatch order, so e.g. a PO insert always
    // lands before the status update that follows it.
    var syncQueueRef = useRef(Promise.resolve());

    // Replaces what is on screen with what is in the database
    var reloadFromDb = function() {
        var uid = stateRef.current.currentUserId;
        if (!uid) return Promise.resolve();
        return loadAllData(uid).then(function(data) {
            rawDispatch({ type: 'LOAD_DATA', payload: data });
        }).catch(function(reloadErr) {
            console.error('[NC_MIS] Reload from database failed:', reloadErr);
        });
    };

    var dispatch = useCallback(function(action) {
        var entry = { ts: new Date().toISOString(), type: action.type, userId: stateRef.current.currentUserId };
        if (action.payload && action.payload.indentId) entry.indentId = action.payload.indentId;
        if (action.payload && action.payload.poId) entry.poId = action.payload.poId;
        window.NC_MIS_LOG = window.NC_MIS_LOG || [];
        window.NC_MIS_LOG.push(entry);
        if (window.NC_MIS_LOG.length > 500) window.NC_MIS_LOG = window.NC_MIS_LOG.slice(-500);
        try { rawDispatch(action); } catch(e) {
            entry.error = e.message;
            console.error('[NC_MIS] Dispatch error:', e);
            throw e;
        }

        // Sync to Supabase in the background, queued behind earlier syncs.
        // preState is the state before this action; the short wait lets React
        // re-render so stateRef.current is the state after it.
        var preState = stateRef.current;
        syncQueueRef.current = syncQueueRef.current.then(function() {
            return new Promise(function(resolve) { setTimeout(resolve, 25); });
        }).then(function() {
            return supabaseSync(action, preState, stateRef.current);
        }).then(function() {
            // Some saves produce values only the database knows (e.g. a GRN number)
            if (action._reload) return reloadFromDb();
        }).catch(function(err) {
            console.error('[NC_MIS] Sync failed for ' + action.type + ':', err);
            rawDispatch({ type: 'SHOW_TOAST', payload: { message: 'Not saved: ' + err.message, type: 'error' } });
            // The screen already shows the change; reload from the database so it
            // goes back to what is actually saved.
            return reloadFromDb();
        });
    }, []);

    // Auth state listener
    React.useEffect(function() {
        // Guards against loading twice when both INITIAL_SESSION and SIGNED_IN fire
        var sessionLoadStarted = false;
        var subscription = supabaseClient.auth.onAuthStateChange(function(event, session) {
            // On a page refresh Supabase may emit only INITIAL_SESSION (SIGNED_IN can fire
            // before this listener is registered), so both events must start the data load.
            if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && session.user) {
                // User signed in - load data if not already loaded
                if (!stateRef.current.isAuthenticated && !sessionLoadStarted) {
                    sessionLoadStarted = true;
                    rawDispatch({ type: 'SET_LOADING', payload: true });
                    // Deferred: Supabase calls made directly inside this callback can deadlock
                    setTimeout(function() {
                        supabaseClient.schema('core').from('profiles').select('*').eq('id', session.user.id).single()
                            .then(function(profileRes) {
                                if (profileRes.error || !profileRes.data) {
                                    console.error('[NC_MIS] Profile not found for auth user');
                                    sessionLoadStarted = false;
                                    rawDispatch({ type: 'SET_LOADING', payload: false });
                                    return;
                                }
                                var profile = transformProfile(profileRes.data);
                                loadAllData(session.user.id).then(function(data) {
                                    rawDispatch({ type: 'LOAD_DATA', payload: data });
                                    rawDispatch({ type: 'LOGIN_AS_USER', payload: profile });
                                    var roleRoutes = {
                                        admin: '#user-management', site_engineer: '#my-indents', storekeeper: '#store-pending',
                                        project_manager: '#dashboard', procurement_manager: '#procurement-dashboard',
                                        procurement_clerk: '#clerk-assigned', md: '#dashboard',
                                    };
                                    if (window.location.hash === '#login' || window.location.hash === '' || !window.location.hash) {
                                        window.location.hash = roleRoutes[profile.role] || '#dashboard';
                                    }
                                }).catch(function(err) {
                                    console.error('[NC_MIS] Data load error in auth listener:', err);
                                    sessionLoadStarted = false;
                                    rawDispatch({ type: 'SET_LOADING', payload: false });
                                });
                            });
                    }, 0);
                }
            } else if (event === 'SIGNED_OUT') {
                sessionLoadStarted = false;
                rawDispatch({ type: 'LOGOUT' });
                rawDispatch({ type: 'SET_LOADING', payload: false });
                rawDispatch({ type: 'SET_AUTHENTICATED', payload: false });
                window.location.hash = '#login';
            }
        });

        // Check if there is an existing session on app load
        supabaseClient.auth.getSession().then(function(result) {
            if (result.data && result.data.session && result.data.session.user) {
                // Session exists, data will be loaded by onAuthStateChange
            } else {
                rawDispatch({ type: 'SET_LOADING', payload: false });
            }
        }).catch(function() {
            rawDispatch({ type: 'SET_LOADING', payload: false });
        });

        // Online/offline detection
        var handleOnline = function() { rawDispatch({ type: 'SET_OFFLINE', payload: false }); };
        var handleOffline = function() { rawDispatch({ type: 'SET_OFFLINE', payload: true }); };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return function() {
            if (subscription && subscription.data && subscription.data.subscription) {
                subscription.data.subscription.unsubscribe();
            }
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // ============ REALTIME SUBSCRIPTIONS FOR CROSS-BROWSER SYNC ============
    React.useEffect(function() {
        if (!state.isAuthenticated) return;

        var indentRefreshTimer = null;
        var poRefreshTimer = null;
        var channel = null;

        function debouncedRefreshIndents() {
            if (indentRefreshTimer) clearTimeout(indentRefreshTimer);
            indentRefreshTimer = setTimeout(function() {
                supabaseClient.schema('indent_flow').from('indents')
                    .select('*, indent_line_items(*), indent_activity(*), indent_comments(*), indent_documents(*)')
                    .then(function(res) {
                        if (!res.error && res.data) {
                            rawDispatch({ type: 'REFRESH_INDENTS', payload: res.data.map(transformIndent) });
                            console.log('[NC_MIS] Realtime: refreshed ' + res.data.length + ' indents');
                        }
                    }).catch(function(err) {
                        console.warn('[NC_MIS] Realtime indent refresh failed:', err.message);
                    });
            }, 600);
        }

        function debouncedRefreshPOs() {
            if (poRefreshTimer) clearTimeout(poRefreshTimer);
            poRefreshTimer = setTimeout(function() {
                supabaseClient.schema('indent_flow').from('purchase_orders')
                    .select('*, po_line_items(*), po_version_history(*)')
                    .then(function(res) {
                        if (!res.error && res.data) {
                            rawDispatch({ type: 'REFRESH_POS', payload: res.data.map(transformPO) });
                            console.log('[NC_MIS] Realtime: refreshed ' + res.data.length + ' POs');
                        }
                    }).catch(function(err) {
                        console.warn('[NC_MIS] Realtime PO refresh failed:', err.message);
                    });
            }, 600);
        }

        try {
            channel = supabaseClient.channel('indent-realtime')
                .on('postgres_changes', { event: '*', schema: 'indent_flow', table: 'indents' }, debouncedRefreshIndents)
                .on('postgres_changes', { event: '*', schema: 'indent_flow', table: 'indent_line_items' }, debouncedRefreshIndents)
                .on('postgres_changes', { event: '*', schema: 'indent_flow', table: 'indent_activity' }, debouncedRefreshIndents)
                .on('postgres_changes', { event: '*', schema: 'indent_flow', table: 'indent_comments' }, debouncedRefreshIndents)
                .on('postgres_changes', { event: '*', schema: 'indent_flow', table: 'purchase_orders' }, debouncedRefreshPOs)
                .on('postgres_changes', { event: '*', schema: 'indent_flow', table: 'po_line_items' }, debouncedRefreshPOs)
                .subscribe(function(status) {
                    console.log('[NC_MIS] Realtime subscription status:', status);
                });
        } catch(e) {
            console.warn('[NC_MIS] Realtime subscription setup failed (enable Realtime on indent_flow tables in Supabase dashboard):', e.message);
        }

        return function() {
            if (indentRefreshTimer) clearTimeout(indentRefreshTimer);
            if (poRefreshTimer) clearTimeout(poRefreshTimer);
            if (channel) {
                try { supabaseClient.removeChannel(channel); } catch(e) { /* ignore cleanup errors */ }
            }
        };
    }, [state.isAuthenticated]);

    React.useEffect(function() {
        // Log navigation events
        var navEntry = { ts: new Date().toISOString(), type: 'NAVIGATE', userId: state.currentUserId, route: route };
        window.NC_MIS_LOG = window.NC_MIS_LOG || [];
        window.NC_MIS_LOG.push(navEntry);
        dispatch({ type: 'NAVIGATE', payload: route });
    }, [route]);

    React.useEffect(function() {
        if (state.toast) {
            var timer = setTimeout(function() { dispatch({ type: 'HIDE_TOAST' }); }, 3000);
            return function() { clearTimeout(timer); };
        }
    }, [state.toast]);

    var currentUser = state.users.find(function(u) { return u.id === state.currentUserId; });

    // Show loading screen while checking auth or loading data
    if (state.isLoading) {
        return React.createElement(AppContext.Provider, { value: [state, dispatch] },
            React.createElement(LoadingScreen, null)
        );
    }

    if (!state.currentUserId) {
        return React.createElement(AppContext.Provider, { value: [state, dispatch] },
            React.createElement(LoginPage, null)
        );
    }

    const userNotifications = state.notifications.filter(n => n.userId === state.currentUserId);
    const unreadCount = userNotifications.filter(n => !n.read).length;

    if (!currentUser) {
        dispatch({ type: 'LOGOUT' });
        return React.createElement(AppContext.Provider, { value: [state, dispatch] },
            React.createElement(LoginPage, null)
        );
    }

    let pendingCount = 0;
    if (currentUser.role === 'project_manager') {
        const userSites = getUserSites(state.currentUserId, state.sites, state.siteAssignments);
        const siteIds = userSites.map(s => s.id);
        pendingCount = state.indents.filter(i => siteIds.includes(i.siteId) && i.status === 'pending_approval').length;
    }

    const parseRoute = (hash) => {
        if (hash === '#login') return { screen: 'login' };
        if (hash === '#dashboard') return { screen: 'dashboard' };
        if (hash === '#my-indents') return { screen: 'my-indents' };
        if (hash === '#create-indent') return { screen: 'create-indent' };
        if (hash === '#pm-create-indent') return { screen: 'create-indent' };
        if (hash === '#approvals') return { screen: 'approvals' };
        if (hash === '#approved') return { screen: 'approved' };
        if (hash === '#all-indents') return { screen: 'all-indents' };
        if (hash === '#escalated') return { screen: 'escalated' };
        if (hash === '#users') return { screen: 'user-management' }; // old Users screen merged into User Management
        if (hash === '#sites') return { screen: 'sites' };
        if (hash === '#assignments') return { screen: 'assignments' };
        if (hash === '#procurement-approved') return { screen: 'procurement-approved' };
        if (hash === '#procurement-progress') return { screen: 'procurement-progress' };
        if (hash === '#procurement-dashboard') return { screen: 'procurement-dashboard' };
        if (hash === '#clerk-assigned') return { screen: 'clerk-assigned' };
        if (hash === '#store-dashboard') return { screen: 'store-dashboard' };
        if (hash === '#store-expected') return { screen: 'store-expected' };
        if (hash === '#store-pending') return { screen: 'store-pending' };
        if (hash === '#store-new-indent') return { screen: 'store-new-indent' };
        if (hash === '#store-history') return { screen: 'store-history' };
        if (hash === '#store-grn-history') return { screen: 'store-grn-history' };
        if (hash === '#store-all') return { screen: 'store-all' };
        if (hash === '#history') return { screen: 'history' };
        if (hash.startsWith('#indent/')) return { screen: 'indent-detail', indentId: hash.split('/')[1] };
        if (hash.startsWith('#revise/')) return { screen: 'revise-indent', indentId: hash.split('/')[1] };
        if (hash.startsWith('#edit-draft/')) return { screen: 'edit-draft', indentId: hash.split('/')[1] };
        if (hash.startsWith('#approve-detail/')) return { screen: 'approve-detail', indentId: hash.split('/')[1] };
        if (hash.startsWith('#receipt/')) return { screen: 'receipt-entry', indentId: hash.split('/')[1] };
        if (hash.startsWith('#create-po/')) return { screen: 'create-po', indentId: hash.split('/')[1] };
        if (hash === '#procurement-review') return { screen: 'procurement-progress' };
        if (hash === '#procurement-pos') return { screen: 'procurement-pos' };
        if (hash === '#procurement-vendors') return { screen: 'procurement-vendors' };
        if (hash === '#md-escalations') return { screen: 'md-escalations' };
        if (hash === '#md-po-approvals') return { screen: 'md-po-approvals' };
        if (hash === '#pm-reports') return { screen: 'reports' };
        if (hash === '#md-reports') return { screen: 'reports' };
        if (hash === '#user-management') return { screen: 'user-management' };
        if (hash === '#org-settings') return { screen: 'org-settings' };
        if (hash === '#offices') return { screen: 'offices' };
        if (hash === '#system-logs') return { screen: 'system-logs' };
        if (hash.startsWith('#po/')) return { screen: 'po-detail', id: hash.slice(4) };
        return { screen: 'dashboard' };
    };

    const routeInfo = parseRoute(state.currentRoute);

    let screenContent = null;

    if (routeInfo.screen === 'indent-detail' && routeInfo.indentId) {
        const indent = state.indents.find(i => i.id === routeInfo.indentId);
        screenContent = indent
            ? React.createElement(IndentDetail, { indentId: indent.id })
            : React.createElement('div', { className: 'placeholder-screen' }, 'Indent not found');
    } else if (routeInfo.screen === 'approve-detail' && routeInfo.indentId) {
        const indent = state.indents.find(i => i.id === routeInfo.indentId);
        screenContent = indent
            ? React.createElement(ApproveDetailScreen, { indentId: indent.id })
            : React.createElement('div', { className: 'placeholder-screen' }, 'Indent not found');
    } else if (routeInfo.screen === 'revise-indent' && routeInfo.indentId) {
        const indent = state.indents.find(i => i.id === routeInfo.indentId);
        screenContent = indent
            ? React.createElement(ReviseIndentScreen, { indentId: indent.id })
            : React.createElement('div', { className: 'placeholder-screen' }, 'Indent not found');
    } else if (routeInfo.screen === 'edit-draft' && routeInfo.indentId) {
        const indent = state.indents.find(i => i.id === routeInfo.indentId);
        screenContent = indent && indent.status === 'draft'
            ? React.createElement(EditDraftScreen, { indentId: indent.id })
            : React.createElement('div', { className: 'placeholder-screen' }, 'Draft not found');
    } else if (routeInfo.screen === 'receipt-entry' && routeInfo.indentId) {
        const indent = state.indents.find(i => i.id === routeInfo.indentId);
        screenContent = indent
            ? React.createElement(ReceiptEntryScreen, { indent, currentUserId: state.currentUserId })
            : React.createElement('div', { className: 'placeholder-screen' }, 'Indent not found');
    } else if (routeInfo.screen === 'create-po' && routeInfo.indentId) {
        screenContent = React.createElement(CreatePOScreen, { indentId: routeInfo.indentId });
    } else if (routeInfo.screen === 'dashboard') {
        screenContent = React.createElement(DashboardScreen, null);
    } else if (routeInfo.screen === 'my-indents') {
        screenContent = React.createElement(MyIndentsScreen, null);
    } else if (routeInfo.screen === 'create-indent') {
        screenContent = React.createElement(CreateIndentScreen, null);
    } else if (routeInfo.screen === 'approvals') {
        screenContent = React.createElement(ApprovalsScreen, null);
    } else if (routeInfo.screen === 'approved') {
        screenContent = React.createElement(ApprovedScreen, null);
    } else if (routeInfo.screen === 'escalated') {
        screenContent = React.createElement(EscalatedScreen, null);
    } else if (routeInfo.screen === 'all-indents') {
        screenContent = React.createElement(AllIndentsScreen, null);
    } else if (routeInfo.screen === 'sites') {
        screenContent = React.createElement(SitesScreen, null);
    } else if (routeInfo.screen === 'assignments') {
        screenContent = React.createElement(AssignmentsScreen, null);
    } else if (routeInfo.screen === 'users') {
        screenContent = React.createElement(UsersScreen, null);
    } else if (routeInfo.screen === 'procurement-approved') {
        screenContent = React.createElement(ProcurementApprovedScreen, null);
    } else if (routeInfo.screen === 'procurement-progress') {
        screenContent = React.createElement(ProcurementProgressScreen, null);
    } else if (routeInfo.screen === 'procurement-dashboard') {
        screenContent = React.createElement(ProcurementDashboardScreen, null);
    } else if (routeInfo.screen === 'clerk-assigned') {
        screenContent = React.createElement(ClerkAssignedScreen, null);
    } else if (routeInfo.screen === 'store-dashboard') {
        screenContent = React.createElement(StoreDashboardScreen, null);
    } else if (routeInfo.screen === 'store-expected') {
        screenContent = React.createElement(StoreExpectedDeliveriesScreen, null);
    } else if (routeInfo.screen === 'store-pending') {
        screenContent = React.createElement(StorePendingScreen, null);
    } else if (routeInfo.screen === 'store-new-indent') {
        screenContent = React.createElement(StoreNewIndentScreen, null);
    } else if (routeInfo.screen === 'store-history') {
        screenContent = React.createElement(StoreHistoryScreen, null);
    } else if (routeInfo.screen === 'store-grn-history') {
        screenContent = React.createElement(StoreGRNHistoryScreen, null);
    } else if (routeInfo.screen === 'store-all') {
        screenContent = React.createElement(StoreAllScreen, null);
    } else if (routeInfo.screen === 'history') {
        screenContent = React.createElement(CompletedOrdersScreen, null);
    } else if (routeInfo.screen === 'procurement-pos') {
        screenContent = React.createElement(ProcurementPOsScreen, null);
    } else if (routeInfo.screen === 'procurement-vendors') {
        screenContent = React.createElement(VendorScreen, null);
    } else if (routeInfo.screen === 'md-escalations') {
        screenContent = React.createElement(MDEscalationsScreen, null);
    } else if (routeInfo.screen === 'md-po-approvals') {
        screenContent = React.createElement(MDPOApprovalsScreen, null);
    } else if (routeInfo.screen === 'reports') {
        screenContent = React.createElement(ReportsScreen, null);
    } else if (routeInfo.screen === 'user-management') {
        screenContent = React.createElement(UserManagementScreen, null);
    } else if (routeInfo.screen === 'org-settings') {
        screenContent = React.createElement(OrgSettingsScreen, null);
    } else if (routeInfo.screen === 'offices') {
        screenContent = React.createElement(OfficeManagementScreen, null);
    } else if (routeInfo.screen === 'system-logs') {
        screenContent = React.createElement(SystemLogsScreen, null);
    } else if (routeInfo.screen === 'po-detail') {
        screenContent = React.createElement(PODetailScreen, { poId: routeInfo.id });
    } else {
        screenContent = React.createElement(DashboardScreen, null);
    }

    return React.createElement(AppContext.Provider, { value: [state, dispatch] },
        state.isOffline ? React.createElement(OfflineBanner, null) : null,
        React.createElement('div', { className: 'app-container', style: state.isOffline ? { marginTop: 36 } : {} },
            React.createElement(Sidebar, {
                currentRoute: state.currentRoute,
                currentUserRole: currentUser.role,
                pendingCount: pendingCount
            }),
            React.createElement('div', { className: 'main-container' },
                React.createElement(Navbar, {
                    currentUserName: currentUser.name,
                    notificationCount: unreadCount,
                    notifications: userNotifications,
                    users: state.users
                }),
                React.createElement('div', { className: 'content-area' },
                    screenContent
                )
            )
        ),
        React.createElement('div', { className: 'toast-container' },
            state.toast ? React.createElement(Toast, { message: state.toast.message, type: state.toast.type }) : null
        )
    );
}

// ============================================================================
// 21. ERROR BOUNDARY
// ============================================================================

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error('IndentFlow Error:', error, info);
        window.NC_MIS_LOG = window.NC_MIS_LOG || [];
        window.NC_MIS_LOG.push({
            ts: new Date().toISOString(),
            type: 'ERROR_BOUNDARY',
            error: error ? error.message : 'Unknown error',
            componentStack: info && info.componentStack ? info.componentStack.substring(0, 200) : '',
        });
    }
    render() {
        if (this.state.hasError) {
            return React.createElement('div', {
                style: { padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }
            },
                React.createElement('h2', { style: { color: '#dc2626' } }, 'Something went wrong'),
                React.createElement('p', { style: { color: '#666', marginTop: '10px' } },
                    this.state.error ? this.state.error.message : ''
                ),
                React.createElement('button', {
                    onClick: () => {
                        this.setState({ hasError: false });
                        window.location.hash = '#login';
                        window.location.reload();
                    },
                    style: {
                        marginTop: '20px', padding: '10px 20px',
                        background: '#2563eb', color: '#fff',
                        border: 'none', borderRadius: '6px', cursor: 'pointer'
                    }
                }, 'Reload App')
            );
        }
        return this.props.children;
    }
}

// ============================================================================
// 22. RENDER
// ============================================================================

// Initialize logging
window.NC_MIS_LOG = window.NC_MIS_LOG || [];
window.NC_MIS_EXPORT_LOGS = function() {
    var dataStr = JSON.stringify(window.NC_MIS_LOG || [], null, 2);
    var blob = new Blob([dataStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'nc_mis_logs_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return 'Exported ' + (window.NC_MIS_LOG || []).length + ' log entries';
};

var root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(ErrorBoundary, null, React.createElement(App, null)));

