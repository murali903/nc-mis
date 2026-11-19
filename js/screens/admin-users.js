

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// UserManagementScreen — Full user lifecycle management
// ─────────────────────────────────────────────
function UserManagementScreen() {
  var _ctx = useContext(AppContext);
  var state = _ctx[0];
  var dispatch = _ctx[1];

  var _showAdd = useState(false);
  var showAdd = _showAdd[0];
  var setShowAdd = _showAdd[1];

  var _editUserId = useState(null);
  var editUserId = _editUserId[0];
  var setEditUserId = _editUserId[1];

  var _siteAssignUserId = useState(null);
  var siteAssignUserId = _siteAssignUserId[0];
  var setSiteAssignUserId = _siteAssignUserId[1];

  var _searchTerm = useState('');
  var searchTerm = _searchTerm[0];
  var setSearchTerm = _searchTerm[1];

  var _filterRole = useState('all');
  var filterRole = _filterRole[0];
  var setFilterRole = _filterRole[1];

  var _filterStatus = useState('all');
  var filterStatus = _filterStatus[0];
  var setFilterStatus = _filterStatus[1];

  // Add user form state
  var _addName = useState('');
  var addName = _addName[0];
  var setAddName = _addName[1];

  var _addEmail = useState('');
  var addEmail = _addEmail[0];
  var setAddEmail = _addEmail[1];

  var _addPhone = useState('');
  var addPhone = _addPhone[0];
  var setAddPhone = _addPhone[1];
  var _addPassword = useState('');
  var addPassword = _addPassword[0];
  var setAddPassword = _addPassword[1];

  var _addRole = useState('site_engineer');
  var addRole = _addRole[0];
  var setAddRole = _addRole[1];

  var _addSiteIds = useState([]);
  var addSiteIds = _addSiteIds[0];
  var setAddSiteIds = _addSiteIds[1];

  var _addError = useState('');
  var addError = _addError[0];
  var setAddError = _addError[1];

  var _showInviteMsg = useState(null);
  var showInviteMsg = _showInviteMsg[0];
  var setShowInviteMsg = _showInviteMsg[1];

  // Edit user form state
  var _editName = useState('');
  var editName = _editName[0];
  var setEditName = _editName[1];

  var _editPhone = useState('');
  var editPhone = _editPhone[0];
  var setEditPhone = _editPhone[1];

  var _editRole = useState('');
  var editRole = _editRole[0];
  var setEditRole = _editRole[1];

  // Site assignment state
  var _assignSiteIds = useState([]);
  var assignSiteIds = _assignSiteIds[0];
  var setAssignSiteIds = _assignSiteIds[1];

  var allRoles = [
    { value: 'admin', label: 'Admin', color: '#7c3aed' },
    { value: 'site_engineer', label: 'Site Engineer', color: '#2563eb' },
    { value: 'storekeeper', label: 'Storekeeper', color: '#0891b2' },
    { value: 'project_manager', label: 'Project Manager', color: '#059669' },
    { value: 'procurement_manager', label: 'Procurement Manager', color: '#d97706' },
    { value: 'procurement_clerk', label: 'Procurement Clerk', color: '#ea580c' },
    { value: 'md', label: 'Managing Director', color: '#dc2626' },
  ];

  var getRoleColor = function(role) {
    var found = allRoles.find(function(r) { return r.value === role; });
    return found ? found.color : '#64748b';
  };

  var getRoleLabel = function(role) {
    var found = allRoles.find(function(r) { return r.value === role; });
    return found ? found.label : role;
  };

  // Filtered users
  var filteredUsers = state.users.filter(function(u) {
    if (searchTerm) {
      var term = searchTerm.toLowerCase();
      if ((u.name || '').toLowerCase().indexOf(term) === -1 && (u.email || '').toLowerCase().indexOf(term) === -1) {
        return false;
      }
    }
    if (filterRole !== 'all' && u.role !== filterRole) return false;
    if (filterStatus === 'active' && u.isActive === false) return false;
    if (filterStatus === 'inactive' && u.isActive !== false) return false;
    return true;
  });

  // Get sites assigned to a user
  var getUserSites = function(userId) {
    var siteIds = state.siteAssignments[userId] || [];
    return siteIds.map(function(sId) {
      var site = state.sites.find(function(s) { return s.id === sId; });
      return site ? site.name : sId;
    });
  };

  // HANDLERS

  var handleAddUser = function() {
    setAddError('');
    if (!addName.trim()) { setAddError('Name is required'); return; }
    if (!addEmail.trim()) { setAddError('Email is required'); return; }
    if (!addRole) { setAddError('Role is required'); return; }

    // Check duplicate email
    var exists = state.users.find(function(u) { return (u.email || '').toLowerCase() === addEmail.trim().toLowerCase(); });
    if (exists) { setAddError('A user with this email already exists'); return; }

    if (addPassword && addPassword.length < 8) { setAddError('Temporary password must be at least 8 characters'); return; }

    // The real user id is assigned on the server; this one only labels the row
    // on screen until the list reloads.
    var newUser = {
      id: genUUID(),
      name: addName.trim(),
      email: addEmail.trim().toLowerCase(),
      phone: addPhone.trim(),
      role: addRole,
      isActive: true,
    };

    // Login, profile and site assignments are created together on the server
    dispatch({ type: 'ADD_USER', payload: { user: newUser, siteIds: addSiteIds.slice(), password: addPassword } });
    dispatch({ type: 'SHOW_TOAST', payload: {
      message: addPassword
        ? addName.trim() + ' created. Share the temporary password with them.'
        : addName.trim() + ' created. An email invitation has been sent.',
      type: 'success' } });
    setAddPassword('');

    // Reset form
    setAddName('');
    setAddEmail('');
    setAddPhone('');
    setAddRole('site_engineer');
    setAddSiteIds([]);
    setShowAdd(false);
  };

  var startEdit = function(user) {
    setEditUserId(user.id);
    setEditName(user.name || '');
    setEditPhone(user.phone || '');
    setEditRole(user.role || 'site_engineer');
  };

  var handleSaveEdit = function() {
    if (!editName.trim()) return;
    dispatch({
      type: 'UPDATE_USER',
      payload: {
        userId: editUserId,
        name: editName.trim(),
        phone: editPhone.trim(),
        role: editRole,
        isActive: true,
      }
    });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'User updated successfully', type: 'success' } });
    setEditUserId(null);
  };

  var handleToggleActive = function(user) {
    var newStatus = user.isActive === false ? true : false;
    dispatch({
      type: 'DEACTIVATE_USER',
      payload: { userId: user.id, isActive: newStatus }
    });
    dispatch({
      type: 'SHOW_TOAST',
      payload: {
        message: (user.name || 'User') + (newStatus ? ' reactivated' : ' deactivated'),
        type: newStatus ? 'success' : 'warning'
      }
    });
  };

  var openSiteAssign = function(user) {
    setSiteAssignUserId(user.id);
    setAssignSiteIds(state.siteAssignments[user.id] || []);
  };

  var handleSaveSiteAssignments = function() {
    dispatch({
      type: 'UPDATE_SITE_ASSIGNMENTS',
      payload: { userId: siteAssignUserId, siteIds: assignSiteIds }
    });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Site assignments updated', type: 'success' } });
    setSiteAssignUserId(null);
  };

  var toggleSiteInAssign = function(siteId) {
    setAssignSiteIds(function(prev) {
      if (prev.indexOf(siteId) >= 0) {
        return prev.filter(function(s) { return s !== siteId; });
      }
      return prev.concat([siteId]);
    });
  };

  var toggleSiteInAdd = function(siteId) {
    setAddSiteIds(function(prev) {
      if (prev.indexOf(siteId) >= 0) {
        return prev.filter(function(s) { return s !== siteId; });
      }
      return prev.concat([siteId]);
    });
  };

  // Shared styles
  var cardStyle = { background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' };
  var headerCellStyle = { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' };
  var cellStyle = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' };
  var inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' };
  var labelStyle = { display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#374151' };
  var btnPrimary = { padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' };
  var btnSecondary = { padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' };
  var btnDanger = { padding: '6px 14px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' };
  var btnSuccess = { padding: '6px 14px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' };
  var btnSmall = { padding: '5px 12px', border: 'none', borderRadius: '5px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' };

  var roleBadge = function(role) {
    var color = getRoleColor(role);
    return React.createElement('span', {
      style: {
        display: 'inline-block', padding: '3px 10px', borderRadius: '12px',
        fontSize: '11px', fontWeight: 600, color: color,
        background: color + '18', border: '1px solid ' + color + '30',
      }
    }, getRoleLabel(role));
  };

  var statusBadge = function(isActive) {
    var active = isActive !== false;
    return React.createElement('span', {
      style: {
        display: 'inline-block', padding: '3px 10px', borderRadius: '12px',
        fontSize: '11px', fontWeight: 600,
        color: active ? '#16a34a' : '#dc2626',
        background: active ? '#dcfce7' : '#fee2e2',
      }
    }, active ? 'Active' : 'Inactive');
  };

  // ── INVITE MESSAGE MODAL ──
  var inviteModal = showInviteMsg ? React.createElement('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
  },
    React.createElement('div', {
      style: { background: '#fff', borderRadius: '12px', padding: '28px', width: '500px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }
    },
      React.createElement('h3', { style: { marginBottom: '12px', color: '#1e293b', fontSize: '18px' } }, 'User Profile Created'),
      React.createElement('div', {
        style: { background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '8px', padding: '16px', marginBottom: '16px' }
      },
        React.createElement('p', { style: { color: '#92400e', fontSize: '14px', fontWeight: 600, marginBottom: '8px' } }, 'Next Step: Invite this user to sign in'),
        React.createElement('p', { style: { color: '#92400e', fontSize: '13px', marginBottom: '8px' } },
          'The profile for ' + showInviteMsg + ' has been created in the system. To complete setup:'
        ),
        React.createElement('ol', { style: { color: '#92400e', fontSize: '13px', paddingLeft: '20px', margin: 0 } },
          React.createElement('li', { style: { marginBottom: '4px' } }, 'Go to your Supabase Dashboard'),
          React.createElement('li', { style: { marginBottom: '4px' } }, 'Navigate to Authentication > Users'),
          React.createElement('li', { style: { marginBottom: '4px' } }, 'Click "Invite User"'),
          React.createElement('li', { style: { marginBottom: '4px' } }, 'Enter the email: ' + showInviteMsg),
          React.createElement('li', null, 'The user will receive an invite email with a link to set their password')
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
        React.createElement('button', {
          onClick: function() {
            if (navigator.clipboard) { navigator.clipboard.writeText(showInviteMsg); }
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Email copied to clipboard', type: 'info' } });
          },
          style: Object.assign({}, btnSecondary)
        }, 'Copy Email'),
        React.createElement('button', {
          onClick: function() { setShowInviteMsg(null); },
          style: Object.assign({}, btnPrimary)
        }, 'Got It')
      )
    )
  ) : null;

  // ── SITE ASSIGNMENT MODAL ──
  var siteAssignModal = siteAssignUserId ? (function() {
    var assignUser = state.users.find(function(u) { return u.id === siteAssignUserId; });
    if (!assignUser) return null;
    return React.createElement('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
    },
      React.createElement('div', {
        style: { background: '#fff', borderRadius: '12px', padding: '28px', width: '480px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }
      },
        React.createElement('h3', { style: { marginBottom: '4px', color: '#1e293b', fontSize: '18px' } }, 'Assign Sites'),
        React.createElement('p', { style: { color: '#64748b', fontSize: '14px', marginBottom: '20px' } }, 'Select sites for ' + (assignUser.name || assignUser.email)),
        React.createElement('div', {
          style: { maxHeight: '300px', overflowY: 'auto', marginBottom: '20px' }
        },
          state.sites.length === 0
            ? React.createElement('p', { style: { color: '#94a3b8', fontSize: '14px', padding: '12px' } }, 'No sites found. Add sites first.')
            : state.sites.map(function(site) {
                var checked = assignSiteIds.indexOf(site.id) >= 0;
                return React.createElement('label', {
                  key: site.id,
                  style: {
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '6px', cursor: 'pointer', marginBottom: '4px',
                    background: checked ? '#eff6ff' : 'transparent',
                    border: checked ? '1px solid #bfdbfe' : '1px solid transparent',
                  }
                },
                  React.createElement('input', {
                    type: 'checkbox', checked: checked,
                    onChange: function() { toggleSiteInAssign(site.id); },
                    style: { width: '16px', height: '16px', accentColor: '#2563eb' }
                  }),
                  React.createElement('div', null,
                    React.createElement('div', { style: { fontWeight: 600, fontSize: '14px', color: '#1e293b' } }, site.name),
                    React.createElement('div', { style: { fontSize: '12px', color: '#64748b' } }, site.location || '')
                  )
                );
              })
        ),
        React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
          React.createElement('button', {
            onClick: function() { setSiteAssignUserId(null); },
            style: Object.assign({}, btnSecondary)
          }, 'Cancel'),
          React.createElement('button', {
            onClick: handleSaveSiteAssignments,
            style: Object.assign({}, btnPrimary)
          }, 'Save Assignments')
        )
      )
    );
  })() : null;

  // ── EDIT USER MODAL ──
  var editModal = editUserId ? (function() {
    var editUser = state.users.find(function(u) { return u.id === editUserId; });
    if (!editUser) return null;
    return React.createElement('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
    },
      React.createElement('div', {
        style: { background: '#fff', borderRadius: '12px', padding: '28px', width: '480px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }
      },
        React.createElement('h3', { style: { marginBottom: '16px', color: '#1e293b', fontSize: '18px' } }, 'Edit User'),
        React.createElement('div', { style: { marginBottom: '14px' } },
          React.createElement('label', { style: labelStyle }, 'Email (read-only)'),
          React.createElement('input', { type: 'text', value: editUser.email || '', disabled: true, style: Object.assign({}, inputStyle, { background: '#f8fafc', color: '#94a3b8' }) })
        ),
        React.createElement('div', { style: { marginBottom: '14px' } },
          React.createElement('label', { style: labelStyle }, 'Full Name'),
          React.createElement('input', {
            type: 'text', value: editName,
            onChange: function(e) { setEditName(e.target.value); },
            style: inputStyle
          })
        ),
        React.createElement('div', { style: { marginBottom: '14px' } },
          React.createElement('label', { style: labelStyle }, 'Phone'),
          React.createElement('input', {
            type: 'tel', value: editPhone,
            onChange: function(e) { setEditPhone(e.target.value); },
            style: inputStyle
          })
        ),
        React.createElement('div', { style: { marginBottom: '20px' } },
          React.createElement('label', { style: labelStyle }, 'Role'),
          React.createElement('select', {
            value: editRole,
            onChange: function(e) { setEditRole(e.target.value); },
            style: inputStyle
          },
            allRoles.map(function(r) {
              return React.createElement('option', { key: r.value, value: r.value }, r.label);
            })
          )
        ),
        React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
          React.createElement('button', {
            onClick: function() { setEditUserId(null); },
            style: Object.assign({}, btnSecondary)
          }, 'Cancel'),
          React.createElement('button', {
            onClick: handleSaveEdit,
            style: Object.assign({}, btnPrimary)
          }, 'Save Changes')
        )
      )
    );
  })() : null;

  // ── ADD USER FORM ──
  var addUserForm = showAdd ? React.createElement('div', {
    style: { background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '20px' }
  },
    React.createElement('h3', { style: { fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '16px' } }, 'Add New User'),
    addError ? React.createElement('div', {
      style: { background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', color: '#dc2626', fontSize: '13px' }
    }, addError) : null,
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' } },
      React.createElement('div', null,
        React.createElement('label', { style: labelStyle }, 'Full Name *'),
        React.createElement('input', {
          type: 'text', value: addName,
          onChange: function(e) { setAddName(e.target.value); },
          placeholder: 'e.g. Ravi Kumar',
          style: inputStyle
        })
      ),
      React.createElement('div', null,
        React.createElement('label', { style: labelStyle }, 'Email *'),
        React.createElement('input', {
          type: 'email', value: addEmail,
          onChange: function(e) { setAddEmail(e.target.value); },
          placeholder: 'e.g. ravi@navyacon.com',
          style: inputStyle
        })
      ),
      React.createElement('div', null,
        React.createElement('label', { style: labelStyle }, 'Phone'),
        React.createElement('input', {
          type: 'tel', value: addPhone,
          onChange: function(e) { setAddPhone(e.target.value); },
          placeholder: '+91-XXXXX-XXXXX',
          style: inputStyle
        })
      ),
      React.createElement('div', null,
        React.createElement('label', { style: labelStyle }, 'Temporary password'),
        React.createElement('input', {
          type: 'password', value: addPassword, autoComplete: 'new-password',
          onChange: function(e) { setAddPassword(e.target.value); },
          placeholder: 'Leave blank to email an invitation',
          style: inputStyle
        })
      ),
      React.createElement('div', null,
        React.createElement('label', { style: labelStyle }, 'Role *'),
        React.createElement('select', {
          value: addRole,
          onChange: function(e) { setAddRole(e.target.value); },
          style: inputStyle
        },
          allRoles.map(function(r) {
            return React.createElement('option', { key: r.value, value: r.value }, r.label);
          })
        )
      )
    ),
    // Site checkboxes
    React.createElement('div', { style: { marginBottom: '16px' } },
      React.createElement('label', { style: labelStyle }, 'Assign to Sites'),
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
        state.sites.map(function(site) {
          var checked = addSiteIds.indexOf(site.id) >= 0;
          return React.createElement('label', {
            key: site.id,
            style: {
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
              borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
              background: checked ? '#eff6ff' : '#f8fafc',
              border: checked ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
            }
          },
            React.createElement('input', {
              type: 'checkbox', checked: checked,
              onChange: function() { toggleSiteInAdd(site.id); },
              style: { accentColor: '#2563eb' }
            }),
            site.name
          );
        })
      )
    ),
    React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
      React.createElement('button', {
        onClick: function() { setShowAdd(false); setAddError(''); },
        style: Object.assign({}, btnSecondary)
      }, 'Cancel'),
      React.createElement('button', {
        onClick: handleAddUser,
        style: Object.assign({}, btnPrimary)
      }, 'Create User Profile')
    )
  ) : null;

  // ── MAIN RENDER ──
  return React.createElement('div', { style: { padding: '24px' } },
    // Header
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }
    },
      React.createElement('div', null,
        React.createElement('h2', { style: { fontSize: '22px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' } }, 'User Management'),
        React.createElement('p', { style: { color: '#64748b', fontSize: '14px' } }, state.users.length + ' total users')
      ),
      React.createElement('button', {
        onClick: function() { setShowAdd(!showAdd); setAddError(''); },
        style: Object.assign({}, btnPrimary, { padding: '10px 24px', fontSize: '14px' })
      }, showAdd ? 'Cancel' : '+ Add New User')
    ),

    // Note about invite flow
    React.createElement('div', {
      style: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#1e40af' }
    },
      'Adding a user creates their login, profile, role and site assignments together. Set a temporary password to share with them, or leave it blank and they will get an email invitation to choose their own.'
    ),

    // Add User Form
    addUserForm,

    // Filters
    React.createElement('div', {
      style: { display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }
    },
      React.createElement('input', {
        type: 'text', value: searchTerm,
        onChange: function(e) { setSearchTerm(e.target.value); },
        placeholder: 'Search by name or email...',
        style: Object.assign({}, inputStyle, { width: '260px' })
      }),
      React.createElement('select', {
        value: filterRole,
        onChange: function(e) { setFilterRole(e.target.value); },
        style: Object.assign({}, inputStyle, { width: '180px' })
      },
        React.createElement('option', { value: 'all' }, 'All Roles'),
        allRoles.map(function(r) {
          return React.createElement('option', { key: r.value, value: r.value }, r.label);
        })
      ),
      React.createElement('select', {
        value: filterStatus,
        onChange: function(e) { setFilterStatus(e.target.value); },
        style: Object.assign({}, inputStyle, { width: '140px' })
      },
        React.createElement('option', { value: 'all' }, 'All Status'),
        React.createElement('option', { value: 'active' }, 'Active'),
        React.createElement('option', { value: 'inactive' }, 'Inactive')
      )
    ),

    // Users Table
    React.createElement('div', { style: cardStyle },
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f8fafc' } },
            React.createElement('th', { style: headerCellStyle }, 'Name'),
            React.createElement('th', { style: headerCellStyle }, 'Email'),
            React.createElement('th', { style: headerCellStyle }, 'Role'),
            React.createElement('th', { style: headerCellStyle }, 'Phone'),
            React.createElement('th', { style: headerCellStyle }, 'Status'),
            React.createElement('th', { style: headerCellStyle }, 'Sites'),
            React.createElement('th', { style: Object.assign({}, headerCellStyle, { textAlign: 'center' }) }, 'Actions')
          )
        ),
        React.createElement('tbody', null,
          filteredUsers.length === 0
            ? React.createElement('tr', null,
                React.createElement('td', { colSpan: 7, style: { padding: '40px', textAlign: 'center', color: '#94a3b8' } }, 'No users found')
              )
            : filteredUsers.map(function(u) {
                var userSites = getUserSites(u.id);
                var isCurrentUser = u.id === state.currentUserId;
                return React.createElement('tr', {
                  key: u.id,
                  style: { borderBottom: '1px solid #f1f5f9', opacity: u.isActive === false ? 0.6 : 1 }
                },
                  React.createElement('td', { style: Object.assign({}, cellStyle, { fontWeight: 600 }) }, u.name || '—'),
                  React.createElement('td', { style: Object.assign({}, cellStyle, { color: '#64748b' }) }, u.email || '—'),
                  React.createElement('td', { style: cellStyle }, roleBadge(u.role)),
                  React.createElement('td', { style: Object.assign({}, cellStyle, { color: '#64748b' }) }, u.phone || '—'),
                  React.createElement('td', { style: cellStyle }, statusBadge(u.isActive)),
                  React.createElement('td', { style: Object.assign({}, cellStyle, { maxWidth: '180px' }) },
                    userSites.length > 0
                      ? React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
                          userSites.map(function(sName, idx) {
                            return React.createElement('span', {
                              key: idx,
                              style: { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: '#f1f5f9', fontSize: '11px', color: '#475569' }
                            }, sName);
                          })
                        )
                      : React.createElement('span', { style: { color: '#cbd5e1', fontSize: '12px' } }, 'None')
                  ),
                  React.createElement('td', { style: Object.assign({}, cellStyle, { textAlign: 'center' }) },
                    React.createElement('div', { style: { display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' } },
                      React.createElement('button', {
                        onClick: function() { startEdit(u); },
                        style: Object.assign({}, btnSmall, { background: '#eef2ff', color: '#6366f1' })
                      }, 'Edit'),
                      React.createElement('button', {
                        onClick: function() { openSiteAssign(u); },
                        style: Object.assign({}, btnSmall, { background: '#ecfdf5', color: '#059669' })
                      }, 'Sites'),
                      !isCurrentUser ? React.createElement('button', {
                        onClick: function() { handleToggleActive(u); },
                        style: u.isActive === false
                          ? Object.assign({}, btnSmall, { background: '#dcfce7', color: '#16a34a' })
                          : Object.assign({}, btnSmall, { background: '#fee2e2', color: '#dc2626' })
                      }, u.isActive === false ? 'Reactivate' : 'Deactivate') : null
                    )
                  )
                );
              })
        )
      )
    ),

    // Modals
    inviteModal,
    siteAssignModal,
    editModal
  );
}

// NEW: OrgSettingsScreen
// ─────────────────────────────────────────────
function OrgSettingsScreen() {
  var _ctx = useContext(AppContext);
  var state = _ctx[0];
  var dispatch = _ctx[1];
  var settings = state.orgSettings || {};

  var _form = useState({
    companyName: settings.companyName || '',
    senderEmail: settings.senderEmail || '',
    companyAddress: settings.companyAddress || '',
    companyGSTIN: settings.companyGSTIN || '',
    companyPhone: settings.companyPhone || '',
    companyPAN: settings.companyPAN || '',
    poMdApprovalThreshold: String(poApprovalLimit(state)),
    localPurchaseLimit: String(localPurchaseLimit(state)),
    companyTagline: settings.companyTagline || '',
    companyWebsite: settings.companyWebsite || '',
  });
  var form = _form[0];
  var setForm = _form[1];

  var _saved = useState(false);
  var saved = _saved[0];
  var setSaved = _saved[1];

  var handleChange = function(field, value) {
    setForm(function(prev) { return Object.assign({}, prev, { [field]: value }); });
    setSaved(false);
  };

  var handleSave = function() {
    var limitText = String(form.poMdApprovalThreshold || '').trim();
    if (limitText === '' || isNaN(Number(limitText)) || Number(limitText) < 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Enter the PO value above which MD approval is required (a number, 0 or more)', type: 'error' } });
      return;
    }
    var lpText = String(form.localPurchaseLimit || '').trim();
    if (lpText === '' || isNaN(Number(lpText)) || Number(lpText) < 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Enter the most a single local purchase can be (a number, 0 or more)', type: 'error' } });
      return;
    }
    dispatch({ type: 'UPDATE_ORG_SETTINGS', payload: Object.assign({}, form, { poMdApprovalThreshold: String(Number(limitText)), localPurchaseLimit: String(Number(lpText)) }) });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Organisation settings saved', type: 'success' } });
    setSaved(true);
  };

  var fields = [
    { key: 'companyName', label: 'Company Name', type: 'text' },
    { key: 'senderEmail', label: 'Sender Email', type: 'email' },
    { key: 'companyAddress', label: 'Company Address', type: 'textarea' },
    { key: 'companyGSTIN', label: 'Company GSTIN', type: 'text' },
    { key: 'companyPhone', label: 'Company Phone', type: 'tel' },
    { key: 'companyPAN', label: 'Company PAN', type: 'text' },
    { key: 'companyTagline', label: 'Line under the company name on printed documents', type: 'text' },
    { key: 'companyWebsite', label: 'Website', type: 'text' },
    { key: 'localPurchaseLimit', label: 'Most a single local purchase can be (Rs., including GST)', type: 'number',
      help: 'Material bought at site without an indent and recorded afterwards. Above this, an indent is required.' },
    { key: 'poMdApprovalThreshold', label: 'PO value above which MD approval is required (Rs., including GST)', type: 'number',
      help: 'A PO at or below this value can be issued by the procurement manager without MD approval. Above it, MD approval is compulsory. Enter 0 to send every PO to the MD.' },
  ];

  return React.createElement('div', { style: { padding: '20px', maxWidth: '700px' } },
    React.createElement('h2', { style: { marginBottom: '20px' } }, 'Organisation Settings'),
    React.createElement('div', { style: { background: '#fff', borderRadius: '8px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
      fields.map(function(f) {
        return React.createElement('div', { key: f.key, style: { marginBottom: '16px' } },
          React.createElement('label', { style: { display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '14px' } }, f.label),
          f.type === 'textarea'
            ? React.createElement('textarea', {
                value: form[f.key],
                onChange: function(e) { handleChange(f.key, e.target.value); },
                rows: 3,
                style: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }
              })
            : React.createElement('input', {
                type: f.type,
                value: form[f.key],
                onChange: function(e) { handleChange(f.key, e.target.value); },
                style: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }
              }),
          f.help ? React.createElement('div', { style: { fontSize: '12px', color: '#64748b', marginTop: '4px' } }, f.help) : null
        );
      }),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px' } },
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: handleSave
        }, 'Save Settings'),
        saved ? React.createElement('span', { style: { color: '#16a34a', fontSize: '14px' } }, 'Settings saved successfully') : null
      )
    )
  );
}
