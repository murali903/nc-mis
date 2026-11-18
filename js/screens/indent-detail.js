
// ─────────────────────────────────────────────
// 9. IndentDetail - MODIFIED
// ─────────────────────────────────────────────
function IndentDetail({ indentId }) {
  const [state, dispatch] = useContext(AppContext);
  const indent = state.indents.find(i => i.id === indentId);
  const user = state.currentUser;

  if (!indent) {
    return React.createElement('div', { style: { padding: 32 } },
      React.createElement('h2', null, 'Indent not found'),
      React.createElement('button', {
        onClick: () => window.history.back(),
        style: {
          marginTop: 16, padding: '8px 20px', borderRadius: 8,
          border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer',
        }
      }, 'Go Back')
    );
  }

  const handleClone = () => {
    dispatch({ type: 'CLONE_INDENT', payload: { indentId: indent.id, userId: user.id } });
    window.location.hash = '#my-indents';
  };

  const handlePrint = () => {
    window.print();
  };

  const cardStyle = {
    border: '1px solid #e2e8f0', borderRadius: 12, padding: 20,
    background: '#fff', marginBottom: 20,
  };
  const labelStyle = { fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4 };
  const valueStyle = { fontSize: 14, color: '#1e293b', fontWeight: 500 };

  return React.createElement('div', { style: { padding: 24, maxWidth: 900, margin: '0 auto' } },
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }
    },
      React.createElement('div', null,
        React.createElement('h2', {
          style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 4 }
        }, 'Indent: ' + getIndentDisplayId(indent, state.indents)),
        React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          React.createElement(StatusBadge, { status: indent.status }),
          React.createElement(PriorityBadge, { priority: indent.priority })
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8 } },
        React.createElement('button', {
          onClick: handleClone,
          style: {
            padding: '8px 16px', borderRadius: 8, border: '1px solid #6366f1',
            background: '#eef2ff', color: '#6366f1', fontWeight: 600,
            fontSize: 13, cursor: 'pointer',
          }
        }, '📋 Create Similar'),
        React.createElement('button', {
          onClick: handlePrint,
          style: {
            padding: '8px 16px', borderRadius: 8, border: '1px solid #059669',
            background: '#ecfdf5', color: '#059669', fontWeight: 600,
            fontSize: 13, cursor: 'pointer',
          }
        }, '🖨️ Print / Export PDF'),
        React.createElement('button', {
          onClick: () => window.history.back(),
          style: {
            padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db',
            background: '#fff', color: '#475569', fontWeight: 600,
            fontSize: 13, cursor: 'pointer',
          }
        }, 'Back')
      )
    ),

    // Action Buttons
    React.createElement(IndentActionButtons, { indent: indent }),

    // Indent info card
    React.createElement('div', { style: cardStyle },
      React.createElement('h3', {
        style: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1e293b' }
      }, 'Indent Information'),
      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }
      },
        React.createElement('div', null,
          React.createElement('div', { style: labelStyle }, 'Site'),
          React.createElement('div', { style: valueStyle }, getSiteName(indent.siteId, state.sites))
        ),
        React.createElement('div', null,
          React.createElement('div', { style: labelStyle }, 'Created By'),
          React.createElement('div', { style: valueStyle }, getUserName(indent.createdBy, state.users))
        ),
        React.createElement('div', null,
          React.createElement('div', { style: labelStyle }, 'Created At'),
          React.createElement('div', { style: valueStyle }, new Date(indent.createdAt).toLocaleString())
        ),
        React.createElement('div', null,
          React.createElement('div', { style: labelStyle }, 'Priority'),
          React.createElement('div', { style: valueStyle },
            React.createElement(PriorityBadge, { priority: indent.priority })
          )
        ),
        indent.requiredDate && React.createElement('div', null,
          React.createElement('div', { style: labelStyle }, 'Required Date'),
          React.createElement('div', { style: valueStyle }, new Date(indent.requiredDate).toLocaleDateString())
        ),
        indent.remarks && React.createElement('div', null,
          React.createElement('div', { style: labelStyle }, 'Remarks'),
          React.createElement('div', { style: valueStyle }, indent.remarks)
        )
      )
    ),

    // Line items
    React.createElement('div', { style: cardStyle },
      React.createElement('h3', {
        style: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#1e293b' }
      }, 'Line Items'),
      React.createElement('table', {
        style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
      },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f8fafc' } },
            React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, '#'),
            React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Material'),
            React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'HSN'),
            React.createElement('th', { style: { padding: '10px 12px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Qty'),
            React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Unit'),
            React.createElement('th', { style: { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Remarks')
          )
        ),
        React.createElement('tbody', null,
          (indent.lineItems || []).map((item, idx) => {
            const siteBoq = state.boqLists[indent.siteId] || [];
            const boqItem = item.boqId ? siteBoq.find(b => b.id === item.boqId) : null;
            return React.createElement('tr', {
              key: idx,
              style: { borderBottom: '1px solid #f1f5f9' }
            },
              React.createElement('td', { style: { padding: '10px 12px' } }, idx + 1),
              React.createElement('td', { style: { padding: '10px 12px', fontWeight: 500 } }, item.description || (boqItem && boqItem.name) || ''),
              React.createElement('td', { style: { padding: '10px 12px', color: '#64748b' } }, (boqItem && boqItem.hsn) || item.hsn || '-'),
              React.createElement('td', { style: { padding: '10px 12px', textAlign: 'right', fontWeight: 600 } }, item.qty),
              React.createElement('td', { style: { padding: '10px 12px' } }, item.unit || (boqItem && boqItem.unit) || ''),
              React.createElement('td', { style: { padding: '10px 12px', color: '#64748b' } }, item.remarks || '-')
            );
          })
        )
      )
    ),

    // Activity Timeline replaces old Approval History
    React.createElement(ActivityTimeline, {
      activityLog: indent.activityLog || [],
      users: state.users,
    }),

    // Comments
    React.createElement('div', { style: { marginTop: 20 } },
      React.createElement(CommentThread, {
        comments: indent.comments,
        onAddComment: (comment) => {
          dispatch({ type: 'ADD_COMMENT', payload: { indentId: indent.id, author: comment.author, text: comment.text } });
        }
      })
    ),

    // Documents
    React.createElement(DocumentsSection, { indent: indent })
  );
}
