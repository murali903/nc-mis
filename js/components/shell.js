
// ─────────────────────────────────────────────
// 1. Toast Component
// ─────────────────────────────────────────────
function Toast({ message, type }) {
  if (!message) return null;
  const colors = {
    success: { bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
    error: { bg: '#fee2e2', border: '#dc2626', text: '#991b1b' },
    info: { bg: '#dbeafe', border: '#2563eb', text: '#1e40af' },
    warning: { bg: '#fef9c3', border: '#ca8a04', text: '#854d0e' },
  };
  const c = colors[type] || colors.info;
  return React.createElement('div', {
    style: {
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      padding: '12px 24px', borderRadius: 8,
      backgroundColor: c.bg, border: '1px solid ' + c.border, color: c.text,
      fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      animation: 'slideIn 0.3s ease-out',
    }
  }, message);
}

// ─────────────────────────────────────────────
// 2. useHashRoute Hook
// ─────────────────────────────────────────────
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#login');
  useEffect(() => {
    const handler = () => setHash(window.location.hash || '#login');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return hash;
}

// ─────────────────────────────────────────────
// 3. LoginPage
// ─────────────────────────────────────────────
function LoginPage() {
  var ctx = useContext(AppContext);
  var state = ctx[0];
  var dispatch = ctx[1];

  var emailRef = useRef(null);
  var passwordRef = useRef(null);
  var _loginState = useState('');
  var loginError = _loginState[0];
  var setLoginError = _loginState[1];
  var _loadingState = useState(false);
  var isSubmitting = _loadingState[0];
  var setIsSubmitting = _loadingState[1];
  var _forgotState = useState(false);
  var showForgot = _forgotState[0];
  var setShowForgot = _forgotState[1];
  var _forgotMsg = useState('');
  var forgotMsg = _forgotMsg[0];
  var setForgotMsg = _forgotMsg[1];

  var roleRoutes = {
    admin: '#user-management',
    site_engineer: '#my-indents',
    storekeeper: '#store-dashboard',
    project_manager: '#dashboard',
    procurement_manager: '#procurement-dashboard',
    procurement_clerk: '#clerk-assigned',
    md: '#dashboard',
  };

  var handleSignIn = function(e) {
    e.preventDefault();
    setLoginError('');
    setIsSubmitting(true);

    var email = emailRef.current ? emailRef.current.value : '';
    var password = passwordRef.current ? passwordRef.current.value : '';

    if (!email || !password) {
      setLoginError('Please enter both email and password.');
      setIsSubmitting(false);
      return;
    }

    supabaseClient.auth.signInWithPassword({ email: email, password: password })
      .then(function(result) {
        if (result.error) {
          setLoginError(result.error.message || 'Sign in failed');
          setIsSubmitting(false);
          return;
        }

        var session = result.data.session;
        var authUser = result.data.user;
        if (!authUser) {
          setLoginError('No user returned from authentication.');
          setIsSubmitting(false);
          return;
        }

        // Fetch user profile from core.profiles
        supabaseClient.schema('core').from('profiles').select('*').eq('id', authUser.id).single()
          .then(function(profileRes) {
            if (profileRes.error || !profileRes.data) {
              setLoginError('User profile not found. Contact your administrator.');
              setIsSubmitting(false);
              return;
            }

            var profile = transformProfile(profileRes.data);
            dispatch({ type: 'SET_LOADING', payload: true });

            // Load all data
            loadAllData(authUser.id).then(function(data) {
              dispatch({ type: 'LOAD_DATA', payload: data });
              dispatch({ type: 'LOGIN_AS_USER', payload: profile });
              window.location.hash = roleRoutes[profile.role] || '#dashboard';
              setIsSubmitting(false);
            }).catch(function(err) {
              console.error('[NC_MIS] Data load error:', err);
              setLoginError('Failed to load application data: ' + err.message);
              setIsSubmitting(false);
            });
          });
      })
      .catch(function(err) {
        setLoginError(err.message || 'An unexpected error occurred');
        setIsSubmitting(false);
      });
  };

  var handleForgotPassword = function() {
    var email = emailRef.current ? emailRef.current.value : '';
    if (!email) {
      setForgotMsg('Please enter your email address first.');
      return;
    }
    supabaseClient.auth.resetPasswordForEmail(email)
      .then(function(result) {
        if (result.error) {
          setForgotMsg('Error: ' + result.error.message);
        } else {
          setForgotMsg('Password reset email sent! Check your inbox.');
        }
      })
      .catch(function(err) {
        setForgotMsg('Error: ' + err.message);
      });
  };

  return React.createElement('div', { className: 'login-container' },
    React.createElement('div', { className: 'login-card' },
      React.createElement('div', { className: 'login-title' }, 'IndentFlow'),
      React.createElement('div', { className: 'login-subtitle' }, 'Material Indent Management System'),

      loginError ? React.createElement('div', { className: 'login-error' }, loginError) : null,

      React.createElement('form', { onSubmit: handleSignIn },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Email'),
          React.createElement('input', {
            ref: emailRef,
            type: 'email',
            className: 'form-input',
            placeholder: 'Enter your email',
            autoComplete: 'email',
            disabled: isSubmitting,
          })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Password'),
          React.createElement('input', {
            ref: passwordRef,
            type: 'password',
            className: 'form-input',
            placeholder: 'Enter your password',
            autoComplete: 'current-password',
            disabled: isSubmitting,
          })
        ),
        React.createElement('button', {
          type: 'submit',
          className: 'btn btn-primary',
          disabled: isSubmitting,
          style: { width: '100%', padding: '12px', fontSize: 15 },
        }, isSubmitting ? 'Signing in...' : 'Sign In')
      ),

      React.createElement('div', {
        className: 'forgot-password-link',
        onClick: handleForgotPassword,
      }, 'Forgot Password?'),

      forgotMsg ? React.createElement('div', {
        style: { marginTop: 12, fontSize: 13, color: '#2563eb', textAlign: 'center' },
      }, forgotMsg) : null
    )
  );
}

// ─────────────────────────────────────────────
// 4. Navbar
// ─────────────────────────────────────────────
function Navbar() {
  const [state, dispatch] = useContext(AppContext);
  const user = state.currentUser;
  var _notifOpen = useState(false);
  var notifOpen = _notifOpen[0];
  var setNotifOpen = _notifOpen[1];
  if (!user) return null;

  // Notifications for the signed-in user, newest first
  var myNotifs = (state.notifications || []).filter(function(n) { return n.userId === state.currentUserId; })
    .slice().sort(function(a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  var myUnread = myNotifs.filter(function(n) { return !n.read; }).length;
  var openNotification = function(n) {
    if (!n.read) dispatch({ type: 'MARK_NOTIFICATION_READ', payload: n.id });
    var target = n.link || (n.indentId ? '#indent/' + n.indentId : '');
    setNotifOpen(false);
    if (target) window.location.hash = target;
  };

  var handleLogout = function() {
    supabaseClient.auth.signOut().then(function() {
      dispatch({ type: 'LOGOUT' });
      window.location.hash = '#login';
    }).catch(function(err) {
      console.error('[NC_MIS] Sign out error:', err);
      dispatch({ type: 'LOGOUT' });
      window.location.hash = '#login';
    });
  };

  return React.createElement('nav', {
    style: {
      background: 'linear-gradient(135deg, #1e293b, #334155)',
      color: '#fff', padding: '0 24px', height: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    }
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
      React.createElement('span', { style: { fontSize: 22, fontWeight: 800 } }, 'IndentFlow'),
      React.createElement('span', {
        style: {
          fontSize: 10, background: '#6366f1', padding: '2px 8px',
          borderRadius: 10, fontWeight: 600,
        }
      }, 'v3')
    ),
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', {
          onClick: function() { setNotifOpen(!notifOpen); },
          title: 'Notifications',
          'aria-label': 'Notifications' + (myUnread ? ' (' + myUnread + ' unread)' : ''),
          style: {
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 14,
          }
        }, '\uD83D\uDD14', myUnread > 0 ? React.createElement('span', {
          style: {
            marginLeft: 6, background: '#ef4444', color: '#fff', borderRadius: 10,
            padding: '1px 7px', fontSize: 11, fontWeight: 700,
          }
        }, myUnread) : null),
        notifOpen ? React.createElement('div', {
          style: {
            position: 'absolute', right: 0, top: 40, width: 340, maxHeight: 420, overflowY: 'auto',
            background: '#fff', color: '#1e293b', borderRadius: 8, zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0',
          }
        },
          React.createElement('div', { style: { padding: '10px 14px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid #e2e8f0' } }, 'Notifications'),
          myNotifs.length === 0
            ? React.createElement('div', { style: { padding: 16, fontSize: 13, color: '#64748b' } }, 'No notifications yet')
            : myNotifs.slice(0, 30).map(function(n) {
                return React.createElement('div', {
                  key: n.id,
                  onClick: function() { openNotification(n); },
                  style: {
                    padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    background: n.read ? '#fff' : '#eff6ff',
                  }
                },
                  n.title ? React.createElement('div', { style: { fontSize: 13, fontWeight: 600 } }, n.title) : null,
                  React.createElement('div', { style: { fontSize: 13 } }, n.message),
                  React.createElement('div', { style: { fontSize: 11, color: '#94a3b8', marginTop: 2 } }, n.createdAt ? new Date(n.createdAt).toLocaleString() : '')
                );
              })
        ) : null
      ),
      React.createElement('span', { style: { fontSize: 13, color: '#cbd5e1' } },
        user.name, ' ', getRoleBadge(user.role)
      ),
      React.createElement('button', {
        onClick: handleLogout,
        style: {
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff', padding: '6px 16px', borderRadius: 6,
          cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }
      }, 'Logout')
    )
  );
}

// ─────────────────────────────────────────────
// 5. Sidebar - MODIFIED
// ─────────────────────────────────────────────
function Sidebar() {
  const [state] = useContext(AppContext);
  const hash = useHashRoute();
  const user = state.currentUser;
  if (!user) return null;

  const navItems = {
    admin: [
      { label: '👥 User Management', hash: '#user-management' },
      { label: '🏗️ Sites', hash: '#sites' },
      { label: '🏢 Office Management', hash: '#offices' },
      { label: '🔗 Assignments', hash: '#assignments' },
      { label: '⚙️ Organisation Settings', hash: '#org-settings' },
      { label: '📋 System Logs', hash: '#system-logs' },
    ],
    site_engineer: [
      { label: '📋 My Indents', hash: '#my-indents' },
      { label: '➕ Create Indent', hash: '#create-indent' },
      { label: '📜 History', hash: '#history' },
    ],
    storekeeper: [
      { label: '📊 Store Dashboard', hash: '#store-dashboard' },
      { label: '📦 Expected Deliveries', hash: '#store-expected' },
      { label: '📥 Pending Receipt', hash: '#store-pending' },
      { label: '➕ New Indent', hash: '#store-new-indent' },
      { label: '📝 My Indents', hash: '#my-indents' },
      { label: '📜 History', hash: '#store-history' },
      { label: '📋 GRN History', hash: '#store-grn-history' },
      { label: '📋 All Indents', hash: '#store-all' },
    ],
    project_manager: [
      { label: '📊 Dashboard', hash: '#dashboard' },
      { label: '➕ New Indent', hash: '#pm-create-indent' },
      { label: '📝 My Indents', hash: '#my-indents' },
      { label: '⏳ Pending Approval', hash: '#approvals' },
      { label: '✅ Approved', hash: '#approved' },
      { label: '📋 All Indents', hash: '#all-indents' },
      { label: '📈 Reports', hash: '#pm-reports' },
    ],
    procurement_manager: [
      { label: '📊 Dashboard', hash: '#procurement-dashboard' },
      { label: '📋 Approved Indents', hash: '#procurement-approved' },
      { label: '🔄 In Progress', hash: '#procurement-progress' },
      { label: '🏪 Vendors', hash: '#procurement-vendors' },
      { label: '📦 Purchase Orders', hash: '#procurement-pos' },
    ],
    procurement_clerk: [
      { label: '📋 My Assigned', hash: '#clerk-assigned' },
      { label: '📦 Purchase Orders', hash: '#procurement-pos' },
    ],
    md: [
      { label: '📊 Dashboard', hash: '#dashboard' },
      { label: '⏳ Indent Approvals', hash: '#approvals' },
      { label: '⚡ Escalations', hash: '#md-escalations' },
      { label: '📦 PO Approvals', hash: '#md-po-approvals' },
      { label: '📋 All Indents', hash: '#all-indents' },
      { label: '🧾 All Purchase Orders', hash: '#procurement-pos' },
      { label: '📈 Reports', hash: '#md-reports' },
    ],
  };

  const items = navItems[user.role] || [];

  return React.createElement('div', {
    style: {
      width: 240, background: '#f8fafc', borderRight: '1px solid #e2e8f0',
      padding: '16px 0', minHeight: 'calc(100vh - 56px)',
    }
  },
    items.map(item =>
      React.createElement('a', {
        key: item.hash,
        href: item.hash,
        style: {
          display: 'block', padding: '10px 24px', fontSize: 14,
          color: hash === item.hash ? '#6366f1' : '#475569',
          background: hash === item.hash ? '#eef2ff' : 'transparent',
          borderRight: hash === item.hash ? '3px solid #6366f1' : '3px solid transparent',
          textDecoration: 'none', fontWeight: hash === item.hash ? 700 : 500,
          transition: 'all 0.15s ease',
        }
      }, item.label)
    )
  );
}

// ─────────────────────────────────────────────
// 6. StatusBadge & PriorityBadge
// ─────────────────────────────────────────────
function StatusBadge({ status }) {
  const styles = {
    draft: { bg: '#f1f5f9', color: '#475569' },
    pending_approval: { bg: '#dbeafe', color: '#1d4ed8' },
    approved: { bg: '#dcfce7', color: '#15803d' },
    rejected: { bg: '#fee2e2', color: '#dc2626' },
    in_procurement: { bg: '#fef3c7', color: '#92400e' },
    escalated_to_md: { bg: '#fce7f3', color: '#be185d' },
    returned_for_revision: { bg: '#ffedd5', color: '#c2410c' },
    po_draft: { bg: '#e0e7ff', color: '#4338ca' },
    pending_md_po_approval: { bg: '#ede9fe', color: '#6d28d9' },
    po_approved: { bg: '#d1fae5', color: '#047857' },
    po_issued: { bg: '#cffafe', color: '#0e7490' },
    dispatched: { bg: '#f3e8ff', color: '#7c3aed' },
    completed: { bg: '#d1fae5', color: '#047857' },
    partial: { bg: '#fef9c3', color: '#a16207' },
    issued: { bg: '#cffafe', color: '#0e7490' },
    partially_fulfilled: { bg: '#fef9c3', color: '#a16207' },
    fulfilled: { bg: '#d1fae5', color: '#047857' },
    closed: { bg: '#e2e8f0', color: '#475569' },
    cancelled: { bg: '#fee2e2', color: '#dc2626' },
    amendment_pending: { bg: '#fce7f3', color: '#be185d' },
    pending_approval: { bg: '#ede9fe', color: '#6d28d9' },
  };
  const s = styles[status] || styles.draft;
  return React.createElement('span', {
    style: {
      display: 'inline-block', padding: '3px 10px', borderRadius: 12,
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      backgroundColor: s.bg, color: s.color,
    }
  }, status);
}

function PriorityBadge({ priority }) {
  const styles = {
    urgent: { bg: '#fee2e2', color: '#dc2626', icon: '🔴' },
    normal: { bg: '#dbeafe', color: '#1d4ed8', icon: '🔵' },
    low: { bg: '#f1f5f9', color: '#64748b', icon: '⚪' },
  };
  const s = styles[priority] || styles.normal;
  return React.createElement('span', {
    style: {
      display: 'inline-block', padding: '3px 10px', borderRadius: 12,
      fontSize: 11, fontWeight: 700, backgroundColor: s.bg, color: s.color,
    }
  }, s.icon + ' ' + (priority || 'normal'));
}

// ─────────────────────────────────────────────
// 7. CommentThread
// ─────────────────────────────────────────────
function CommentThread({ comments, onAddComment }) {
  const [state] = useContext(AppContext);
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAddComment({
      id: 'cmt-' + Date.now(),
      text: text.trim(),
      author: state.currentUserId,
      createdAt: new Date().toISOString(),
    });
    setText('');
  };

  return React.createElement('div', {
    style: { border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, background: '#fff' }
  },
    React.createElement('h3', {
      style: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1e293b' }
    }, 'Comments'),
    (comments || []).length === 0
      ? React.createElement('p', { style: { color: '#94a3b8', fontSize: 13, fontStyle: 'italic' } }, 'No comments yet')
      : (comments || []).map(c =>
          React.createElement('div', {
            key: c.id,
            style: {
              padding: '10px 14px', background: '#f8fafc', borderRadius: 8,
              marginBottom: 8, borderLeft: '3px solid #6366f1',
            }
          },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
              React.createElement('span', { style: { fontWeight: 600, fontSize: 13, color: '#1e293b' } },
                getUserName(c.author, state.users)
              ),
              React.createElement('span', { style: { fontSize: 11, color: '#94a3b8' } },
                new Date(c.createdAt).toLocaleString()
              )
            ),
            React.createElement('p', { style: { fontSize: 13, color: '#475569', margin: 0 } }, escapeHtml(c.text || c.content))
          )
        ),
    React.createElement('form', {
      onSubmit: handleSubmit,
      style: { marginTop: 12, display: 'flex', gap: 8 }
    },
      React.createElement('input', {
        value: text, onChange: e => setText(e.target.value),
        placeholder: 'Add a comment...',
        style: {
          flex: 1, padding: '8px 12px', borderRadius: 8,
          border: '1px solid #d1d5db', fontSize: 13, outline: 'none',
        }
      }),
      React.createElement('button', {
        type: 'submit',
        style: {
          padding: '8px 20px', borderRadius: 8, border: 'none',
          background: '#6366f1', color: '#fff', fontWeight: 600,
          fontSize: 13, cursor: 'pointer',
        }
      }, 'Post')
    )
  );
}

// ─────────────────────────────────────────────
// 8. ActivityTimeline - NEW
// ─────────────────────────────────────────────
function ActivityTimeline({ activityLog, users }) {
  if (!activityLog || activityLog.length === 0) {
    return React.createElement('div', {
      style: {
        border: '1px solid #e2e8f0', borderRadius: 12, padding: 20,
        background: '#fff',
      }
    },
      React.createElement('h3', {
        style: { fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#1e293b' }
      }, 'Activity Timeline'),
      React.createElement('p', {
        style: { color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }
      }, 'No activity recorded yet')
    );
  }

  const actionColors = {
    created: '#3b82f6',
    approved: '#16a34a',
    rejected: '#dc2626',
    dispatched: '#7c3aed',
    completed: '#059669',
    submitted: '#2563eb',
    revised: '#d97706',
    commented: '#64748b',
  };

  const getColor = (action) => {
    const key = (action || '').toLowerCase();
    for (const k of Object.keys(actionColors)) {
      if (key.includes(k)) return actionColors[k];
    }
    return '#94a3b8';
  };

  const sortedLog = [...activityLog].sort((a, b) => new Date(b.at) - new Date(a.at));

  return React.createElement('div', {
    style: {
      border: '1px solid #e2e8f0', borderRadius: 12, padding: 20,
      background: '#fff',
    }
  },
    React.createElement('h3', {
      style: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1e293b' }
    }, 'Activity Timeline'),
    React.createElement('div', { style: { position: 'relative', paddingLeft: 24 } },
      React.createElement('div', {
        style: {
          position: 'absolute', left: 7, top: 0, bottom: 0,
          width: 2, background: '#e2e8f0',
        }
      }),
      sortedLog.map((entry, idx) => {
        const color = getColor(entry.action);
        return React.createElement('div', {
          key: idx,
          style: { position: 'relative', marginBottom: 20, paddingLeft: 16 }
        },
          React.createElement('div', {
            style: {
              position: 'absolute', left: -20, top: 4,
              width: 14, height: 14, borderRadius: '50%',
              backgroundColor: color, border: '3px solid #fff',
              boxShadow: '0 0 0 2px ' + color + '40',
            }
          }),
          React.createElement('div', {
            style: { fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 2 }
          }, entry.action),
          React.createElement('div', {
            style: { fontSize: 12, color: '#64748b', marginBottom: 2 }
          },
            'by ', React.createElement('span', { style: { fontWeight: 600 } },
              getUserName(entry.by, users || [])
            ),
            ' on ', new Date(entry.at).toLocaleString()
          ),
          entry.note && React.createElement('div', {
            style: {
              fontSize: 12, color: '#475569', marginTop: 4,
              background: '#f8fafc', padding: '6px 10px', borderRadius: 6,
              borderLeft: '3px solid ' + color,
            }
          }, entry.note)
        );
      })
    )
  );
}
