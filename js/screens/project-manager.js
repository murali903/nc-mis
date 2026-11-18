
// ─────────────────────────────────────────────
// 17. DashboardScreen - MODIFIED
// ─────────────────────────────────────────────
function DashboardScreen() {
  const [state] = useContext(AppContext);
  const user = state.currentUser;
  const role = user ? user.role : '';

  const priorityOrder = { urgent: 0, normal: 1, low: 2 };

  if (role === 'project_manager') {
    const allIndents = state.indents;
    const pending = allIndents.filter(i => i.status === 'pending_approval');
    const approved = allIndents.filter(i => i.status === 'approved');
    const rejected = allIndents.filter(i => i.status === 'rejected');

    // Sort pending by priority (urgent first, then normal, then low)
    const sortedPending = [...pending].sort((a, b) =>
      (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1)
    );

    const stats = [
      { label: 'Pending', value: pending.length, color: '#f59e0b', bg: '#fef9c3', route: '#approvals' },
      { label: 'Approved', value: approved.length, color: '#16a34a', bg: '#dcfce7', route: '#approved' },
      { label: 'Rejected', value: rejected.length, color: '#dc2626', bg: '#fee2e2', route: '#all-indents' },
      { label: 'Total', value: allIndents.length, color: '#6366f1', bg: '#eef2ff', route: '#all-indents' },
    ];

    return React.createElement('div', { style: { padding: 24 } },
      React.createElement('h2', {
        style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 24 }
      }, 'Project Manager Dashboard'),

      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }
      },
        stats.map(s =>
          React.createElement('div', {
            key: s.label,
            style: {
              background: s.bg, borderRadius: 12, padding: 20,
              border: '1px solid ' + s.color + '20',
              cursor: 'pointer', transition: 'transform 0.15s ease',
            },
            onClick: function() { window.location.hash = s.route; }
          },
            React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: s.color } }, s.value),
            React.createElement('div', { style: { fontSize: 13, color: s.color, fontWeight: 600, marginTop: 4 } }, s.label)
          )
        )
      ),

      React.createElement('div', {
        style: {
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: 20,
        }
      },
        React.createElement('h3', {
          style: { fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 16 }
        }, 'Recent Pending Indents (sorted by priority)'),
        sortedPending.length === 0
          ? React.createElement('p', { style: { color: '#94a3b8', fontStyle: 'italic' } }, 'No pending indents')
          : React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
              React.createElement('thead', null,
                React.createElement('tr', { style: { background: '#f8fafc' } },
                  React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b' } }, 'ID'),
                  React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b' } }, 'Site'),
                  React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b' } }, 'Priority'),
                  React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b' } }, 'By'),
                  React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b' } }, 'Created'),
                )
              ),
              React.createElement('tbody', null,
                sortedPending.slice(0, 10).map(indent =>
                  React.createElement('tr', {
                    key: indent.id,
                    style: { borderBottom: '1px solid #f1f5f9', cursor: 'pointer' },
                    onClick: () => { window.location.hash = '#approve-detail/' + indent.id; }
                  },
                    React.createElement('td', { style: { padding: '10px 12px', fontWeight: 600, color: '#6366f1' } }, getIndentDisplayId(indent, state.indents)),
                    React.createElement('td', { style: { padding: '10px 12px' } }, getSiteName(indent.siteId, state.sites)),
                    React.createElement('td', { style: { padding: '10px 12px' } }, React.createElement(PriorityBadge, { priority: indent.priority })),
                    React.createElement('td', { style: { padding: '10px 12px' } }, getUserName(indent.createdBy, state.users)),
                    React.createElement('td', { style: { padding: '10px 12px', color: '#64748b' } }, new Date(indent.createdAt).toLocaleDateString())
                  )
                )
              )
            )
      )
    );
  }

  // MD Dashboard
  if (role === 'md') {
    const allIndents = state.indents;
    const pendingPOs = (state.purchaseOrders || []).filter(po => po.status === 'pending_approval');
    const stats = [
      { label: 'Total Indents', value: allIndents.length, color: '#6366f1', bg: '#eef2ff', route: '#all-indents' },
      { label: 'Submitted', value: allIndents.filter(i => i.status === 'pending_approval').length, color: '#f59e0b', bg: '#fef9c3', route: '#approvals' },
      { label: 'POs Pending', value: pendingPOs.length, color: '#dc2626', bg: '#fee2e2', route: '#md-po-approvals' },
      { label: 'Completed', value: allIndents.filter(i => i.status === 'completed').length, color: '#059669', bg: '#d1fae5', route: '#all-indents' },
    ];

    return React.createElement('div', { style: { padding: 24 } },
      React.createElement('h2', {
        style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 24 }
      }, 'MD Dashboard'),
      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }
      },
        stats.map(s =>
          React.createElement('div', {
            key: s.label,
            style: {
              background: s.bg, borderRadius: 12, padding: 20,
              border: '1px solid ' + s.color + '20',
              cursor: 'pointer', transition: 'transform 0.15s ease',
            },
            onClick: function() { window.location.hash = s.route; }
          },
            React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: s.color } }, s.value),
            React.createElement('div', { style: { fontSize: 13, color: s.color, fontWeight: 600, marginTop: 4 } }, s.label)
          )
        )
      )
    );
  }

  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('h2', null, 'Dashboard')
  );
}

// ─────────────────────────────────────────────
// 18. ApprovalsScreen - MODIFIED with bulk approve
// ─────────────────────────────────────────────
function ApprovalsScreen() {
  const [state, dispatch] = useContext(AppContext);
  const user = state.currentUser;
  const [selected, setSelected] = useState([]);

  const priorityOrder = { urgent: 0, normal: 1, low: 2 };

  const pendingIndents = state.indents
    .filter(i => i.status === 'pending_approval')
    .sort((a, b) => {
      // Sort by priority first (urgent first)
      const pDiff = (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
      if (pDiff !== 0) return pDiff;
      // Then by hours pending (longest first = earliest created first)
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  const toggleSelect = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selected.length === pendingIndents.length) {
      setSelected([]);
    } else {
      setSelected(pendingIndents.map(i => i.id));
    }
  };

  const handleBulkApprove = () => {
    if (selected.length === 0) return;
    dispatch({
      type: 'BULK_APPROVE',
      payload: { indentIds: selected, approvedBy: user.id }
    });
    selected.forEach(indentId => {
      dispatch({
        type: 'LOG_ACTIVITY',
        payload: {
          indentId: indentId,
          entry: createActivityLogEntry('Approved (bulk)', user.id)
        }
      });
    });
    setSelected([]);
  };

  const getHoursPending = (createdAt) => {
    const hours = Math.round((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60));
    if (hours < 1) return 'Less than 1 hour';
    if (hours < 24) return hours + ' hour' + (hours > 1 ? 's' : '');
    const days = Math.floor(hours / 24);
    return days + ' day' + (days > 1 ? 's' : '') + ' ' + (hours % 24) + 'h';
  };

  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }
    },
      React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b' } },
        'Pending Approvals (' + pendingIndents.length + ')'
      ),
      selected.length > 0 && React.createElement('button', {
        onClick: handleBulkApprove,
        style: {
          padding: '10px 20px', borderRadius: 8, border: 'none',
          background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }
      }, 'Approve Selected (' + selected.length + ')')
    ),

    pendingIndents.length === 0
      ? React.createElement('div', {
          style: {
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: 40, textAlign: 'center', color: '#94a3b8',
          }
        }, React.createElement('p', { style: { fontSize: 16 } }, 'No pending indents'))
      : React.createElement('div', {
          style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }
        },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
            React.createElement('thead', null,
              React.createElement('tr', { style: { background: '#f8fafc' } },
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', width: 40 } },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: selected.length === pendingIndents.length && pendingIndents.length > 0,
                    onChange: toggleAll,
                  })
                ),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Indent ID'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Site'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Priority'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'By'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Pending Since'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Items'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Action')
              )
            ),
            React.createElement('tbody', null,
              pendingIndents.map(indent =>
                React.createElement('tr', {
                  key: indent.id,
                  style: {
                    borderBottom: '1px solid #f1f5f9',
                    background: indent.priority === 'urgent' ? '#fef2f210' : 'transparent',
                  }
                },
                  React.createElement('td', { style: { padding: '12px 16px', textAlign: 'center' } },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: selected.includes(indent.id),
                      onChange: () => toggleSelect(indent.id),
                    })
                  ),
                  React.createElement('td', { style: { padding: '12px 16px', fontWeight: 600 } },
                    React.createElement('a', { href: '#approve-detail/' + indent.id, style: { color: '#6366f1', textDecoration: 'none', cursor: 'pointer' } }, getIndentDisplayId(indent, state.indents))
                  ),
                  React.createElement('td', { style: { padding: '12px 16px' } }, getSiteName(indent.siteId, state.sites)),
                  React.createElement('td', { style: { padding: '12px 16px' } }, React.createElement(PriorityBadge, { priority: indent.priority })),
                  React.createElement('td', { style: { padding: '12px 16px' } }, getUserName(indent.createdBy, state.users)),
                  React.createElement('td', { style: { padding: '12px 16px', color: '#64748b' } }, getHoursPending(indent.createdAt)),
                  React.createElement('td', { style: { padding: '12px 16px' } }, (indent.lineItems || []).length),
                  React.createElement('td', { style: { padding: '12px 16px', textAlign: 'center' } },
                    React.createElement('a', {
                      href: '#approve-detail/' + indent.id,
                      style: {
                        padding: '6px 14px', borderRadius: 6, background: '#eef2ff',
                        color: '#6366f1', fontSize: 12, fontWeight: 600, textDecoration: 'none',
                      }
                    }, 'Review')
                  )
                )
              )
            )
          )
        )
  );
}

// ─────────────────────────────────────────────
// 19. ApproveDetailScreen (unchanged)
// ─────────────────────────────────────────────
function ApproveDetailScreen({ indentId }) {
  const [state, dispatch] = useContext(AppContext);
  const indent = state.indents.find(i => i.id === indentId);
  const user = state.currentUser;
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [escalateRemarks, setEscalateRemarks] = useState('');

  if (!indent) {
    return React.createElement('div', { style: { padding: 32 } },
      React.createElement('h2', null, 'Indent not found')
    );
  }

  const handleApprove = () => {
    dispatch({
      type: 'APPROVE_INDENT',
      payload: { indentId: indent.id, approvedBy: user.id }
    });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent approved', type: 'success' } });
    window.location.hash = '#approvals';
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    dispatch({
      type: 'REJECT_INDENT',
      payload: { indentId: indent.id, rejectedBy: user.id, reason: rejectReason }
    });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent rejected', type: 'info' } });
    window.location.hash = '#approvals';
  };

  const handleEscalate = () => {
    dispatch({
      type: 'ESCALATE_TO_MD',
      payload: { indentId: indent.id, remarks: escalateRemarks, escalatedBy: user.id }
    });
    dispatch({
      type: 'LOG_ACTIVITY',
      payload: { indentId: indent.id, action: 'Escalated to MD', by: user.id, note: escalateRemarks || 'Escalated by PM' }
    });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent escalated to MD', type: 'success' } });
    window.location.hash = '#approvals';
  };

  const handleReturnForRevision = () => {
    if (!rejectReason.trim()) return;
    dispatch({
      type: 'REJECT_INDENT',
      payload: { indentId: indent.id, rejectedBy: user.id, reason: rejectReason, returnForRevision: true }
    });
    dispatch({
      type: 'LOG_ACTIVITY',
      payload: { indentId: indent.id, action: 'Returned for Revision', by: user.id, note: rejectReason }
    });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent returned for revision', type: 'info' } });
    window.location.hash = '#approvals';
  };

  return React.createElement('div', { style: { padding: 24, maxWidth: 900, margin: '0 auto' } },
    React.createElement(IndentDetail, { indentId: indentId }),

    indent.status === 'pending_approval' && React.createElement('div', {
      style: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginTop: 24,
      }
    },
      React.createElement('h3', {
        style: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1e293b' }
      }, 'Approval Actions'),

      !showRejectForm && !showEscalateForm
        ? React.createElement('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
            React.createElement('button', {
              onClick: handleApprove,
              style: {
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }
            }, 'Approve'),
            React.createElement('button', {
              onClick: () => setShowRejectForm(true),
              style: {
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }
            }, 'Reject'),
            user.role === 'project_manager' && React.createElement('button', {
              onClick: () => setShowEscalateForm(true),
              style: {
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }
            }, '⚡ Escalate to MD'),
            React.createElement('button', {
              onClick: () => { setShowRejectForm(true); },
              style: {
                padding: '10px 24px', borderRadius: 8, border: '1px solid #d97706',
                background: '#fff', color: '#d97706', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }
            }, '↩ Return for Revision')
          )
        : showEscalateForm
        ? React.createElement('div', null,
            React.createElement('p', { style: { fontSize: 13, color: '#64748b', marginBottom: 8 } }, 'This will escalate the indent to the MD for review and approval.'),
            React.createElement('textarea', {
              value: escalateRemarks, onChange: e => setEscalateRemarks(e.target.value),
              placeholder: 'Reason for escalation (optional)',
              rows: 3,
              style: {
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1px solid #d1d5db', fontSize: 13, marginBottom: 12,
                boxSizing: 'border-box', resize: 'vertical',
              }
            }),
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
              React.createElement('button', {
                onClick: handleEscalate,
                style: {
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: '#f59e0b', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }
              }, 'Confirm Escalation'),
              React.createElement('button', {
                onClick: () => { setShowEscalateForm(false); setEscalateRemarks(''); },
                style: {
                  padding: '8px 20px', borderRadius: 8, border: '1px solid #d1d5db',
                  background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }
              }, 'Cancel')
            )
          )
        : React.createElement('div', null,
            React.createElement('textarea', {
              value: rejectReason, onChange: e => setRejectReason(e.target.value),
              placeholder: 'Reason for rejection / revision (required)',
              rows: 3,
              style: {
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1px solid #d1d5db', fontSize: 13, marginBottom: 12,
                boxSizing: 'border-box', resize: 'vertical',
              }
            }),
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
              React.createElement('button', {
                onClick: handleReject,
                style: {
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }
              }, 'Confirm Rejection'),
              React.createElement('button', {
                onClick: handleReturnForRevision,
                style: {
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: '#d97706', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }
              }, 'Return for Revision'),
              React.createElement('button', {
                onClick: () => { setShowRejectForm(false); setRejectReason(''); },
                style: {
                  padding: '8px 20px', borderRadius: 8, border: '1px solid #d1d5db',
                  background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }
              }, 'Cancel')
            )
          )
    )
  );
}

// ─────────────────────────────────────────────
// 20. ApprovedScreen (unchanged)
// ─────────────────────────────────────────────
function ApprovedScreen() {
  const [state] = useContext(AppContext);
  const approvedIndents = state.indents.filter(i => i.status === 'approved');

  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('h2', {
      style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 24 }
    }, 'Approved Indents (' + approvedIndents.length + ')'),

    approvedIndents.length === 0
      ? React.createElement('div', {
          style: {
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: 40, textAlign: 'center', color: '#94a3b8',
          }
        }, React.createElement('p', { style: { fontSize: 16 } }, 'No approved indents'))
      : React.createElement('div', {
          style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }
        },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
            React.createElement('thead', null,
              React.createElement('tr', { style: { background: '#f8fafc' } },
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Indent ID'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Site'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Priority'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Created By'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Approved'),
              )
            ),
            React.createElement('tbody', null,
              approvedIndents.map(indent =>
                React.createElement('tr', {
                  key: indent.id,
                  style: { borderBottom: '1px solid #f1f5f9', cursor: 'pointer' },
                  onClick: () => { window.location.hash = '#indent/' + indent.id; }
                },
                  React.createElement('td', { style: { padding: '12px 16px', fontWeight: 600, color: '#6366f1' } }, getIndentDisplayId(indent, state.indents)),
                  React.createElement('td', { style: { padding: '12px 16px' } }, getSiteName(indent.siteId, state.sites)),
                  React.createElement('td', { style: { padding: '12px 16px' } }, React.createElement(PriorityBadge, { priority: indent.priority })),
                  React.createElement('td', { style: { padding: '12px 16px' } }, getUserName(indent.createdBy, state.users)),
                  React.createElement('td', { style: { padding: '12px 16px', color: '#64748b' } },
                    indent.approvedAt ? new Date(indent.approvedAt).toLocaleDateString() : '-'
                  )
                )
              )
            )
          )
        )
  );
}

// ─────────────────────────────────────────────
// 21. AllIndentsScreen (unchanged)
// ─────────────────────────────────────────────
function AllIndentsScreen() {
  const [state] = useContext(AppContext);
  const currentUser = state.users.find(u => u.id === state.currentUserId);
  const canApprove = currentUser && (currentUser.role === 'project_manager' || currentUser.role === 'md');
  const [filters, setFilters] = useState({
    status: '', site: '', priority: '', search: '',
    dateFrom: '', dateTo: '',
  });

  const filteredIndents = applyIndentFilters(state.indents, filters, state);

  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('h2', {
      style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 24 }
    }, 'All Indents'),

    React.createElement(IndentFilterBar, { filters, setFilters }),

    React.createElement('div', {
      style: { marginBottom: 12, color: '#64748b', fontSize: 13 }
    }, 'Showing ' + filteredIndents.length + ' of ' + state.indents.length + ' indents'),

    React.createElement('div', {
      style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }
    },
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f8fafc' } },
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Indent ID'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Site'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Status'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Priority'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Created By'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Created'),
            React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Items'),
          )
        ),
        React.createElement('tbody', null,
          filteredIndents.length === 0
            ? React.createElement('tr', null,
                React.createElement('td', {
                  colSpan: 7,
                  style: { padding: 40, textAlign: 'center', color: '#94a3b8' }
                }, 'No indents match your filters')
              )
            : filteredIndents.map(indent => {
                const indentRoute = (canApprove && indent.status === 'pending_approval')
                  ? '#approve-detail/' + indent.id
                  : '#indent/' + indent.id;
                return React.createElement('tr', {
                  key: indent.id,
                  style: { borderBottom: '1px solid #f1f5f9', cursor: 'pointer' },
                  onClick: () => { window.location.hash = indentRoute; }
                },
                  React.createElement('td', { style: { padding: '12px 16px', fontWeight: 600, color: '#6366f1' } }, getIndentDisplayId(indent, state.indents)),
                  React.createElement('td', { style: { padding: '12px 16px' } }, getSiteName(indent.siteId, state.sites)),
                  React.createElement('td', { style: { padding: '12px 16px' } }, React.createElement(StatusBadge, { status: indent.status })),
                  React.createElement('td', { style: { padding: '12px 16px' } }, React.createElement(PriorityBadge, { priority: indent.priority })),
                  React.createElement('td', { style: { padding: '12px 16px' } }, getUserName(indent.createdBy, state.users)),
                  React.createElement('td', { style: { padding: '12px 16px', color: '#64748b' } }, new Date(indent.createdAt).toLocaleDateString()),
                  React.createElement('td', { style: { padding: '12px 16px' } }, (indent.lineItems || []).length)
                );
              })
        )
      )
    )
  );
}

// ─────────────────────────────────────────────
// 22. IndentFilterBar - MODIFIED with text search + priority
// ─────────────────────────────────────────────
function IndentFilterBar({ filters, setFilters }) {
  const [state] = useContext(AppContext);

  const inputStyle = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db',
    fontSize: 13, boxSizing: 'border-box', outline: 'none',
  };

  const update = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };

  return React.createElement('div', {
    style: {
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
      padding: 16, marginBottom: 20,
      display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
    }
  },
    React.createElement('div', { style: { flex: '1 1 200px' } },
      React.createElement('label', {
        style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#64748b' }
      }, 'Search'),
      React.createElement('input', {
        value: filters.search || '', onChange: e => update('search', e.target.value),
        placeholder: 'Search ID, description...',
        style: { ...inputStyle, width: '100%' },
      })
    ),
    React.createElement('div', { style: { flex: '0 0 140px' } },
      React.createElement('label', {
        style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#64748b' }
      }, 'Status'),
      React.createElement('select', {
        value: filters.status || '', onChange: e => update('status', e.target.value),
        style: { ...inputStyle, width: '100%' },
      },
        React.createElement('option', { value: '' }, 'All Statuses'),
        React.createElement('option', { value: 'draft' }, 'Draft'),
        React.createElement('option', { value: 'pending_approval' }, 'Submitted'),
        React.createElement('option', { value: 'approved' }, 'Approved'),
        React.createElement('option', { value: 'rejected' }, 'Rejected'),
        React.createElement('option', { value: 'dispatched' }, 'Dispatched'),
        React.createElement('option', { value: 'completed' }, 'Completed')
      )
    ),
    React.createElement('div', { style: { flex: '0 0 120px' } },
      React.createElement('label', {
        style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#64748b' }
      }, 'Priority'),
      React.createElement('select', {
        value: filters.priority || '', onChange: e => update('priority', e.target.value),
        style: { ...inputStyle, width: '100%' },
      },
        React.createElement('option', { value: '' }, 'All Priorities'),
        React.createElement('option', { value: 'urgent' }, 'Urgent'),
        React.createElement('option', { value: 'normal' }, 'Normal'),
        React.createElement('option', { value: 'low' }, 'Low')
      )
    ),
    React.createElement('div', { style: { flex: '0 0 140px' } },
      React.createElement('label', {
        style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#64748b' }
      }, 'Site'),
      React.createElement('select', {
        value: filters.site || '', onChange: e => update('site', e.target.value),
        style: { ...inputStyle, width: '100%' },
      },
        React.createElement('option', { value: '' }, 'All Sites'),
        state.sites.map(s =>
          React.createElement('option', { key: s.id, value: s.id }, s.name)
        )
      )
    ),
    React.createElement('div', { style: { flex: '0 0 130px' } },
      React.createElement('label', {
        style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#64748b' }
      }, 'From Date'),
      React.createElement('input', {
        type: 'date', value: filters.dateFrom || '', onChange: e => update('dateFrom', e.target.value),
        style: { ...inputStyle, width: '100%' },
      })
    ),
    React.createElement('div', { style: { flex: '0 0 130px' } },
      React.createElement('label', {
        style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: '#64748b' }
      }, 'To Date'),
      React.createElement('input', {
        type: 'date', value: filters.dateTo || '', onChange: e => update('dateTo', e.target.value),
        style: { ...inputStyle, width: '100%' },
      })
    ),
    (filters.status || filters.site || filters.priority || filters.search || filters.dateFrom || filters.dateTo) &&
      React.createElement('button', {
        onClick: () => setFilters({ status: '', site: '', priority: '', search: '', dateFrom: '', dateTo: '' }),
        style: {
          padding: '8px 16px', borderRadius: 8, border: '1px solid #fca5a5',
          background: '#fee2e2', color: '#dc2626', fontWeight: 600,
          fontSize: 12, cursor: 'pointer',
        }
      }, 'Clear Filters')
  );
}

// ─────────────────────────────────────────────
// 23. applyIndentFilters - MODIFIED with text search + priority
// ─────────────────────────────────────────────
function applyIndentFilters(indents, filters, state) {
  let result = [...indents];

  // Text search: matches indent id or line item descriptions (case-insensitive)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    result = result.filter(indent => {
      if (indent.id.toLowerCase().includes(term)) return true;
      if (indent.lineItems && indent.lineItems.some(item =>
        (item.description || '').toLowerCase().includes(term)
      )) return true;
      return false;
    });
  }

  if (filters.status) {
    result = result.filter(i => i.status === filters.status);
  }

  if (filters.priority) {
    result = result.filter(i => i.priority === filters.priority);
  }

  if (filters.site) {
    result = result.filter(i => i.siteId === filters.site);
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    result = result.filter(i => new Date(i.createdAt) >= from);
  }

  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    result = result.filter(i => new Date(i.createdAt) <= to);
  }

  return result;
}
