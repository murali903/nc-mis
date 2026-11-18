// ─────────────────────────────────────────────
// 11. SitesScreen - MODIFIED with edit/delete
// ─────────────────────────────────────────────
function SitesScreen() {
  const [state, dispatch] = useContext(AppContext);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const siteList = useListControls(state.sites, [
    { key: 'name', label: 'Site name', get: s => s.name },
    { key: 'location', label: 'Location', get: s => s.location },
    { key: 'office', label: 'Office', get: s => { const o = (state.offices || []).find(x => x.id === s.officeId); return o ? o.name : ''; } },
    { key: 'indents', label: 'Number of indents', type: 'number', noSearch: true, get: s => state.indents.filter(i => i.siteId === s.id).length },
  ], { placeholder: 'Search site name, location or office…' });

  const resetForm = () => {
    setName(''); setLocation(''); setOfficeId('');
    setShowForm(false); setEditingId(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      dispatch({ type: 'EDIT_SITE', payload: { siteId: editingId, name, location, officeId } });
    } else {
      dispatch({ type: 'ADD_SITE', payload: { id: genUUID(), name, location, officeId } });
    }
    resetForm();
  };

  const startEdit = (site) => {
    setEditingId(site.id);
    setName(site.name);
    setLocation(site.location);
    setOfficeId(site.officeId || '');
    setShowForm(true);
  };

  const tryDelete = (site) => {
    const activeIndents = state.indents.filter(i =>
      i.siteId === site.id && !['completed', 'rejected'].includes(i.status)
    );
    if (activeIndents.length > 0) {
      setDeleteError('Cannot delete "' + site.name + '": there are ' + activeIndents.length + ' active indent(s) linked to this site.');
      setDeleteConfirm(null);
    } else {
      setDeleteError('');
      setDeleteConfirm(site);
    }
  };

  const handleDelete = (siteId) => {
    dispatch({ type: 'DELETE_SITE', payload: siteId });
    setDeleteConfirm(null);
  };

  const btnStyle = {
    padding: '6px 14px', borderRadius: 6, border: 'none',
    fontWeight: 600, fontSize: 12, cursor: 'pointer',
  };

  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }
    },
      React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b' } }, 'Site Management'),
      React.createElement('button', {
        onClick: () => { resetForm(); setShowForm(!showForm); },
        style: { ...btnStyle, padding: '10px 20px', background: '#6366f1', color: '#fff', fontSize: 14 }
      }, showForm ? 'Cancel' : '+ Add Site')
    ),

    deleteError && React.createElement('div', {
      style: {
        background: '#fee2e2', color: '#991b1b', padding: '12px 16px',
        borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500,
      }
    },
      deleteError,
      React.createElement('button', {
        onClick: () => setDeleteError(''),
        style: { marginLeft: 12, background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }
      }, 'Dismiss')
    ),

    showForm && React.createElement('form', {
      onSubmit: handleSubmit,
      style: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 20, marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-end',
      }
    },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' } }, 'Site Name'),
        React.createElement('input', {
          value: name, onChange: e => setName(e.target.value), required: true,
          style: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }
        })
      ),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' } }, 'Location'),
        React.createElement('input', {
          value: location, onChange: e => setLocation(e.target.value), required: true,
          style: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }
        })
      ),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' } }, 'Office'),
        React.createElement('select', {
          value: officeId, onChange: e => setOfficeId(e.target.value), required: true,
          style: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }
        },
          React.createElement('option', { value: '' }, 'Select office...'),
          (state.offices || []).map(o => React.createElement('option', { key: o.id, value: o.id }, o.name))
        )
      ),
      React.createElement('button', {
        type: 'submit',
        style: { ...btnStyle, padding: '8px 24px', background: '#6366f1', color: '#fff', fontSize: 13 }
      }, editingId ? 'Update Site' : 'Add Site')
    ),

    // Delete confirmation modal
    deleteConfirm && React.createElement('div', {
      style: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }
    },
      React.createElement('div', {
        style: {
          background: '#fff', borderRadius: 12, padding: 24, width: 400,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }
      },
        React.createElement('h3', { style: { marginBottom: 12, color: '#1e293b' } }, 'Delete Site?'),
        React.createElement('p', { style: { color: '#475569', fontSize: 14, marginBottom: 20 } },
          'Are you sure you want to delete "' + deleteConfirm.name + '"? This cannot be undone.'
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          React.createElement('button', {
            onClick: () => setDeleteConfirm(null),
            style: { ...btnStyle, background: '#f1f5f9', color: '#475569' }
          }, 'Cancel'),
          React.createElement('button', {
            onClick: () => handleDelete(deleteConfirm.id),
            style: { ...btnStyle, background: '#dc2626', color: '#fff' }
          }, 'Delete')
        )
      )
    ),

    siteList.bar,

    // Sites table
    React.createElement('div', {
      style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }
    },
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f8fafc' } },
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Site Name'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Location'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Indents'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Actions')
          )
        ),
        React.createElement('tbody', null,
          siteList.rows.map(site => {
            const indentCount = state.indents.filter(i => i.siteId === site.id).length;
            return React.createElement('tr', {
              key: site.id,
              style: { borderBottom: '1px solid #f1f5f9' }
            },
              React.createElement('td', { style: { padding: '12px 16px', fontWeight: 500 } }, site.name),
              React.createElement('td', { style: { padding: '12px 16px', color: '#64748b' } }, site.location),
              React.createElement('td', { style: { padding: '12px 16px', textAlign: 'center' } }, indentCount),
              React.createElement('td', { style: { padding: '12px 16px', textAlign: 'center' } },
                React.createElement('div', { style: { display: 'flex', gap: 6, justifyContent: 'center' } },
                  React.createElement('button', {
                    onClick: () => startEdit(site),
                    style: { ...btnStyle, background: '#eef2ff', color: '#6366f1' }
                  }, 'Edit'),
                  React.createElement('button', {
                    onClick: () => tryDelete(site),
                    style: { ...btnStyle, background: '#fee2e2', color: '#dc2626' }
                  }, 'Delete')
                )
              )
            );
          })
        )
      )
    )
  );
}

// ─────────────────────────────────────────────
// 12. AssignmentsScreen (unchanged)
// ─────────────────────────────────────────────
function AssignmentsScreen() {
  const [state, dispatch] = useContext(AppContext);
  const [userId, setUserId] = useState('');
  const [siteId, setSiteId] = useState('');

  const handleAssign = (e) => {
    e.preventDefault();
    if (!userId || !siteId) return;
    dispatch({
      type: 'ASSIGN_SITE',
      payload: { userId: userId, siteId: siteId }
    });
    setUserId(''); setSiteId('');
  };

  const handleUnassign = (uId, sId) => {
    dispatch({ type: 'UNASSIGN_SITE', payload: { userId: uId, siteId: sId } });
  };

  const engineers = state.users.filter(u => ['site_engineer', 'storekeeper', 'project_manager'].includes(u.role));

  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('h2', {
      style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 24 }
    }, 'Site Assignments'),

    React.createElement('form', {
      onSubmit: handleAssign,
      style: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 20, marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-end',
      }
    },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' } }, 'Engineer'),
        React.createElement('select', {
          value: userId, onChange: e => setUserId(e.target.value),
          style: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }
        },
          React.createElement('option', { value: '' }, 'Select engineer...'),
          engineers.map(u =>
            React.createElement('option', { key: u.id, value: u.id }, u.name)
          )
        )
      ),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' } }, 'Site'),
        React.createElement('select', {
          value: siteId, onChange: e => setSiteId(e.target.value),
          style: { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }
        },
          React.createElement('option', { value: '' }, 'Select site...'),
          state.sites.map(s =>
            React.createElement('option', { key: s.id, value: s.id }, s.name + ' - ' + s.location)
          )
        )
      ),
      React.createElement('button', {
        type: 'submit',
        style: {
          padding: '8px 24px', borderRadius: 8, border: 'none',
          background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }
      }, 'Assign')
    ),

    React.createElement('div', {
      style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }
    },
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f8fafc' } },
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Engineer'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Assigned Sites'),
          )
        ),
        React.createElement('tbody', null,
          engineers.map(u => {
            const sites = getUserSites(u.id, state.sites, state.siteAssignments);
            return React.createElement('tr', {
              key: u.id,
              style: { borderBottom: '1px solid #f1f5f9' }
            },
              React.createElement('td', { style: { padding: '12px 16px', fontWeight: 500 } }, u.name),
              React.createElement('td', { style: { padding: '12px 16px' } },
                sites.length === 0
                  ? React.createElement('span', { style: { color: '#94a3b8', fontStyle: 'italic' } }, 'No sites assigned')
                  : sites.map(s =>
                      React.createElement('span', {
                        key: s.id,
                        style: {
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: '#eef2ff', color: '#6366f1', padding: '4px 10px',
                          borderRadius: 16, fontSize: 12, fontWeight: 600, marginRight: 8, marginBottom: 4,
                        }
                      },
                        s.name,
                        React.createElement('button', {
                          onClick: () => handleUnassign(u.id, s.id),
                          style: {
                            background: 'none', border: 'none', color: '#dc2626',
                            cursor: 'pointer', fontWeight: 700, fontSize: 14, padding: 0, lineHeight: 1,
                          }
                        }, '×')
                      )
                    )
              )
            );
          })
        )
      )
    )
  );
}
