
// ─────────────────────────────────────────────
// NEW: DocumentsSection
// ─────────────────────────────────────────────
function DocumentsSection(_ref) {
  var indent = _ref.indent;
  var _state_dispatch = useContext(AppContext);
  var state = _state_dispatch[0];
  var dispatch = _state_dispatch[1];

  var currentUser = state.currentUser;
  var role = currentUser ? currentUser.role : '';
  var isProcurement = role === 'procurement_manager' || role === 'procurement_clerk';
  var isCreator = indent.createdBy === state.currentUserId;
  // Who may attach: procurement, the person who raised the indent, and the approvers
  var canUpload = isProcurement || isCreator || role === 'project_manager' || role === 'md' || role === 'admin';
  var embedded = !!_ref.embedded;   // shown inside the edit / revise screens

  var documents = indent.documents || [];

  var categoryOptions = ATTACHMENT_CATEGORIES;
  var _cat = useState(isProcurement ? 'Quotation' : 'Drawing');
  var selectedCategory = _cat[0];
  var setSelectedCategory = _cat[1];
  var _item = useState('');
  var selectedItemId = _item[0];
  var setSelectedItemId = _item[1];

  var fileInputRef = useRef(null);
  var _uploading = useState(false);
  var uploading = _uploading[0];
  var setUploading = _uploading[1];

  // POs linked to this indent
  var linkedPOs = (state.purchaseOrders || []).filter(function(po) {
    return po.indentId === indent.id;
  });

  var itemLabel = function(lineItemId, poId) {
    if (poId) {
      var dpo = (state.purchaseOrders || []).find(function(p) { return p.id === poId; });
      return dpo ? getPODisplayId(dpo) : 'Purchase order';
    }
    if (!lineItemId) return 'Whole indent';
    var idx = (indent.lineItems || []).findIndex(function(li) { return li.id === lineItemId; });
    if (idx === -1) return 'Whole indent';
    var li = indent.lineItems[idx];
    return 'Item ' + (idx + 1) + ': ' + (li.description || li.name || '');
  };

  var handleUpload = function() {
    var fileInput = fileInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please select a file', type: 'error' } });
      return;
    }
    var file = fileInput.files[0];
    setUploading(true);
    uploadIndentFile(indent.id, file, selectedCategory, selectedItemId || null).then(function(doc) {
      doc.uploadedBy = state.currentUserId;
      dispatch({ type: 'ADD_DOCUMENT', payload: { indentId: indent.id, document: doc } });
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'File attached', type: 'success' } });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }).catch(function(err) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: err.message || 'Could not upload the file', type: 'error' } });
    }).then(function() { setUploading(false); });
  };

  var handleDelete = function(doc) {
    if (confirm('Remove "' + doc.name + '" from this indent?')) {
      dispatch({ type: 'DELETE_DOCUMENT', payload: { indentId: indent.id, documentId: doc.id, documentName: doc.name } });
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'File removed', type: 'success' } });
    }
  };

  var handleView = function(doc) { openIndentDocument(doc, dispatch); };

  var formatSize = function(bytes) {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  var formatDate = function(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  var categoryBadgeColors = {
    'Drawing': '#0ea5e9',
    'Shop Drawing': '#0284c7',
    'Sketch': '#14b8a6',
    'Specification': '#64748b',
    'Photo': '#ec4899',
    'Quotation': '#3b82f6',
    'Purchase Order': '#8b5cf6',
    'Proforma Invoice': '#f59e0b',
    'Estimate': '#6366f1',
    'Delivery Challan': '#10b981',
    'Other': '#6b7280'
  };

  return React.createElement('div', { style: { marginTop: '24px' } },
    React.createElement('h3', { style: { marginBottom: '16px', fontSize: '18px', fontWeight: '600' } }, 'Documents & Drawings'),

    // Upload form
    canUpload ? React.createElement('div', {
      style: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }
    },
      React.createElement('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' } },
        React.createElement('div', { style: { flex: '1', minWidth: '200px' } },
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'File'),
          React.createElement('input', {
            ref: fileInputRef,
            type: 'file',
            accept: ATTACHMENT_ACCEPT,
            style: { fontSize: '14px' }
          })
        ),
        React.createElement('div', { style: { minWidth: '180px' } },
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Applies to'),
          React.createElement('select', {
            value: selectedItemId,
            onChange: function(e) { setSelectedItemId(e.target.value); },
            style: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', maxWidth: '240px' }
          },
            React.createElement('option', { value: '' }, 'Whole indent'),
            (indent.lineItems || []).map(function(li, i) {
              return React.createElement('option', { key: li.id || i, value: li.id }, 'Item ' + (i + 1) + ': ' + String(li.description || li.name || '').slice(0, 40));
            })
          )
        ),
        React.createElement('div', { style: { minWidth: '180px' } },
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Category'),
          React.createElement('select', {
            value: selectedCategory,
            onChange: function(e) { setSelectedCategory(e.target.value); },
            style: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }
          },
            categoryOptions.map(function(cat) {
              return React.createElement('option', { key: cat, value: cat }, cat);
            })
          )
        ),
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: handleUpload,
          disabled: uploading
        }, uploading ? 'Uploading...' : 'Upload')
      )
    ) : null,

    // Document list
    documents.length === 0 && (embedded || linkedPOs.length === 0)
      ? React.createElement('p', { style: { color: '#6b7280', fontSize: '14px', fontStyle: 'italic' } }, 'No documents attached.')
      : null,

    documents.length > 0 ? React.createElement('div', { style: { border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' } },
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f9fafb' } },
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600' } }, 'Name'),
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600' } }, 'Category'),
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600' } }, 'Applies to'),
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600' } }, 'Size'),
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600' } }, 'Uploaded By'),
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600' } }, 'Date'),
            React.createElement('th', { style: { textAlign: 'right', padding: '10px 12px', fontWeight: '600' } }, 'Actions')
          )
        ),
        React.createElement('tbody', null,
          documents.map(function(doc) {
            var badgeColor = categoryBadgeColors[doc.category] || '#6b7280';
            return React.createElement('tr', { key: doc.id, style: { borderTop: '1px solid #e5e7eb' } },
              React.createElement('td', { style: { padding: '10px 12px' } }, doc.name),
              React.createElement('td', { style: { padding: '10px 12px' } },
                React.createElement('span', {
                  style: { background: badgeColor, color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }
                }, doc.category)
              ),
              React.createElement('td', { style: { padding: '10px 12px', color: '#374151' } }, itemLabel(doc.lineItemId, doc.poId)),
              React.createElement('td', { style: { padding: '10px 12px', color: '#6b7280' } }, formatSize(doc.size)),
              React.createElement('td', { style: { padding: '10px 12px' } }, getUserName(doc.uploadedBy, state.users)),
              React.createElement('td', { style: { padding: '10px 12px', color: '#6b7280' } }, formatDate(doc.uploadedAt)),
              React.createElement('td', { style: { padding: '10px 12px', textAlign: 'right' } },
                React.createElement('button', {
                  className: 'btn btn-primary',
                  style: { marginRight: '6px', fontSize: '12px', padding: '4px 10px' },
                  onClick: function() { handleView(doc); }
                }, 'View / Download'),
                (isProcurement || doc.uploadedBy === state.currentUserId) ? React.createElement('button', {
                  className: 'btn btn-danger',
                  style: { fontSize: '12px', padding: '4px 10px' },
                  onClick: function() { handleDelete(doc); }
                }, 'Remove') : null
              )
            );
          })
        )
      )
    ) : null,

    // Linked POs section
    (!embedded && linkedPOs.length > 0) ? React.createElement('div', { style: { marginTop: '16px' } },
      React.createElement('h4', { style: { fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#374151' } }, 'Auto-Attached Purchase Orders'),
      linkedPOs.map(function(po) {
        return React.createElement('div', {
          key: po.id,
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '6px', marginBottom: '6px', background: '#f0fdf4' }
        },
          React.createElement('div', null,
            React.createElement('span', { style: { fontWeight: '500' } }, getPODisplayId(po)),
            React.createElement('span', { style: { marginLeft: '12px', color: '#6b7280', fontSize: '13px' } }, 'Vendor: ' + (po.vendorName || '-') + '  |  ' + statusLabel(po.status)),
            React.createElement('span', {
              style: { marginLeft: '12px', background: '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }
            }, 'Purchase Order')
          ),
          React.createElement('a', {
            href: '#po/' + po.id,
            className: 'btn btn-primary',
            style: { fontSize: '12px', padding: '4px 10px', textDecoration: 'none' }
          }, 'View PO')
        );
      })
    ) : null
  );
}

// ─────────────────────────────────────────────
// IndentActionButtons: every action a user can take on an indent, shown on the
// indent page itself (so nobody has to go back to a list to act).
// ─────────────────────────────────────────────
function IndentActionButtons(_ref) {
  var indent = _ref.indent;
  var _state_dispatch = useContext(AppContext);
  var state = _state_dispatch[0];
  var dispatch = _state_dispatch[1];

  var _mode = useState('');        // '', approve, reject, return, escalate, md_approve, md_return
  var mode = _mode[0], setMode = _mode[1];
  var _text = useState('');
  var text = _text[0], setText = _text[1];
  var _assignClerk = useState('');
  var assignClerkId = _assignClerk[0], setAssignClerkId = _assignClerk[1];
  var _showDispatch = useState(false);
  var showDispatch = _showDispatch[0], setShowDispatch = _showDispatch[1];

  var currentUser = state.currentUser;
  if (!currentUser) return null;

  var role = currentUser.role;
  var status = indent.status;
  var isCreator = indent.createdBy === state.currentUserId;
  var number = getIndentDisplayId(indent, state.indents);

  var toast = function(message, type) { dispatch({ type: 'SHOW_TOAST', payload: { message: message, type: type || 'success' } }); };
  var open = function(m) { setMode(mode === m ? '' : m); setText(''); };
  var close = function() { setMode(''); setText(''); };

  var clerkList = (state.users || []).filter(function(u) { return u.role === 'procurement_clerk'; });

  // What each decision needs and does
  var decisions = {
    approve:    { title: 'Approve ' + number, label: role === 'md' ? 'Remarks (required)' : 'Note (optional)', required: role === 'md',
                  confirm: 'Confirm Approval', cls: 'btn btn-success',
                  run: function() { dispatch({ type: 'APPROVE_INDENT', payload: { indentId: indent.id, approvedBy: state.currentUserId, note: text.trim() } }); toast('Indent approved'); } },
    reject:     { title: 'Reject ' + number, label: 'Reason for rejection (required)', required: true,
                  confirm: 'Confirm Rejection', cls: 'btn btn-danger',
                  run: function() { dispatch({ type: 'REJECT_INDENT', payload: { indentId: indent.id, rejectedBy: state.currentUserId, reason: text.trim() } }); toast('Indent rejected'); } },
    'return':   { title: 'Return ' + number + ' for revision', label: 'What needs to change (required)', required: true,
                  confirm: 'Confirm Return', cls: 'btn btn-warning',
                  run: function() { dispatch({ type: 'REJECT_INDENT', payload: { indentId: indent.id, rejectedBy: state.currentUserId, reason: text.trim(), returnForRevision: true } }); toast('Indent returned for revision'); } },
    escalate:   { title: 'Escalate ' + number + ' to the MD', label: 'Why this needs the MD (required)', required: true,
                  confirm: 'Confirm Escalation', cls: 'btn btn-warning',
                  run: function() { dispatch({ type: 'ESCALATE_TO_MD', payload: { indentId: indent.id, remarks: text.trim(), escalatedBy: state.currentUserId } }); toast('Indent escalated to MD'); } },
    md_approve: { title: 'Approve ' + number + ' — OK to proceed', label: 'MD remarks (required)', required: true,
                  confirm: 'Confirm Approval', cls: 'btn btn-success',
                  run: function() { dispatch({ type: 'MD_ESCALATION_APPROVE', payload: { indentId: indent.id, remarks: text.trim() } }); toast('Approved — indent is with procurement'); } },
    md_return:  { title: 'Return ' + number + ' for revision', label: 'MD remarks (required)', required: true,
                  confirm: 'Confirm Return', cls: 'btn btn-danger',
                  run: function() { dispatch({ type: 'MD_ESCALATION_DISMISS', payload: { indentId: indent.id, remarks: text.trim() } }); toast('Returned for revision'); } },
  };

  var confirmDecision = function() {
    var d = decisions[mode];
    if (!d) return;
    if (d.required && !text.trim()) { toast('Please fill in: ' + d.label.replace(' (required)', ''), 'error'); return; }
    d.run();
    close();
  };

  var buttonWrap = { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' };
  var noteBox = function(bg, border, children) {
    return React.createElement('div', {
      style: { background: bg, border: '1px solid ' + border, borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#1e293b' }
    }, children);
  };

  var decisionForm = function() {
    var d = decisions[mode];
    if (!d) return null;
    return React.createElement('div', {
      style: { marginBottom: 16, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }
    },
      React.createElement('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#1e293b' } }, d.title),
      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 } }, d.label),
      React.createElement('textarea', {
        value: text, onChange: function(e) { setText(e.target.value); }, rows: 3, autoFocus: true,
        'aria-label': d.label,
        style: { width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box', fontSize: 13 }
      }),
      React.createElement('div', { style: { display: 'flex', gap: 8 } },
        React.createElement('button', { className: d.cls, onClick: confirmDecision }, d.confirm),
        React.createElement('button', { className: 'btn btn-secondary', onClick: close }, 'Cancel')
      )
    );
  };

  // The person who raised it: a draft can be submitted or edited
  if (isCreator && status === 'draft') {
    return React.createElement('div', { style: buttonWrap },
      React.createElement('button', { className: 'btn btn-success', onClick: function() {
        if (!indent.lineItems || indent.lineItems.length === 0) { toast('Cannot submit: indent has no line items', 'error'); return; }
        dispatch({ type: 'SUBMIT_INDENT', payload: { indentId: indent.id, userId: state.currentUserId } });
        toast('Indent submitted for approval');
      } }, 'Submit for Approval'),
      React.createElement('a', { href: '#edit-draft/' + indent.id, className: 'btn btn-primary', style: { textDecoration: 'none' } }, 'Edit Indent')
    );
  }

  // The person who raised it: a rejected / returned indent can be revised
  if (isCreator && (status === 'rejected' || status === 'returned_for_revision')) {
    var why = indent.mdEscalationResult === 'dismissed' && indent.mdRemarks ? ('MD: ' + indent.mdRemarks)
            : (indent.returnReason || indent.rejectionReason || '');
    return React.createElement('div', null,
      noteBox('#fff7ed', '#fdba74', [
        React.createElement('strong', { key: 'a' }, status === 'rejected' ? 'This indent was rejected. ' : 'This indent was returned to you for revision. '),
        why ? React.createElement('span', { key: 'b' }, 'Reason: ' + why) : null
      ]),
      React.createElement('div', { style: buttonWrap },
        React.createElement('a', { href: '#revise/' + indent.id, className: 'btn btn-primary', style: { textDecoration: 'none' } }, 'Revise and Resubmit')
      )
    );
  }

  // Approvers: an indent waiting for approval
  if ((role === 'project_manager' || role === 'md') && status === 'pending_approval') {
    if (role === 'project_manager' && isCreator) {
      return noteBox('#eff6ff', '#93c5fd',
        'You raised this indent, so you cannot approve it yourself. It is waiting for the MD.');
    }
    return React.createElement('div', null,
      React.createElement('div', { style: buttonWrap },
        React.createElement('button', { className: 'btn btn-success', onClick: function() { open('approve'); } }, 'Approve'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: function() { open('return'); } }, 'Return for Revision'),
        React.createElement('button', { className: 'btn btn-danger', onClick: function() { open('reject'); } }, 'Reject'),
        role === 'project_manager' ? React.createElement('button', { className: 'btn btn-warning', onClick: function() { open('escalate'); } }, 'Escalate to MD') : null
      ),
      decisionForm()
    );
  }

  // MD: an escalated indent
  if (status === 'escalated_to_md') {
    var info = noteBox('#fdf2f8', '#f9a8d4', [
      React.createElement('strong', { key: 'a' }, 'Escalated to the MD' + (indent.escalatedBy ? ' by ' + getUserName(indent.escalatedBy, state.users) : '') + '. '),
      indent.escalationRemarks ? React.createElement('span', { key: 'b' }, 'Remarks: ' + indent.escalationRemarks) : null
    ]);
    if (role !== 'md') return info;
    return React.createElement('div', null,
      info,
      React.createElement('div', { style: buttonWrap },
        React.createElement('button', { className: 'btn btn-success', onClick: function() { open('md_approve'); } }, 'Approve — OK to Proceed'),
        React.createElement('button', { className: 'btn btn-danger', onClick: function() { open('md_return'); } }, 'Return for Revision')
      ),
      decisionForm()
    );
  }

  // procurement_manager + approved
  if (role === 'procurement_manager' && status === 'approved') {
    return React.createElement('div', { style: buttonWrap },
      React.createElement('select', {
        value: assignClerkId,
        onChange: function(e) { setAssignClerkId(e.target.value); },
        'aria-label': 'Assign to clerk',
        style: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }
      },
        React.createElement('option', { value: '' }, '-- Select Clerk --'),
        clerkList.map(function(c) {
          return React.createElement('option', { key: c.id, value: c.id }, getUserName(c.id, state.users));
        })
      ),
      React.createElement('button', { className: 'btn btn-primary', onClick: function() {
        if (!assignClerkId) { toast('Please select a clerk', 'error'); return; }
        dispatch({ type: 'ASSIGN_INDENT', payload: { indentId: indent.id, userId: assignClerkId } });
        toast('Indent assigned to ' + getUserName(assignClerkId, state.users));
      } }, 'Assign'),
      React.createElement('button', { className: 'btn btn-success', onClick: function() {
        dispatch({ type: 'ASSIGN_INDENT', payload: { indentId: indent.id, userId: state.currentUserId } });
        toast('Indent self-assigned');
      } }, 'Self-Assign'),
      React.createElement('a', { href: '#create-po/' + indent.id, className: 'btn btn-primary', style: { textDecoration: 'none' } }, 'Create PO'),
      React.createElement('button', { className: 'btn btn-secondary', onClick: function() { setShowDispatch(true); } }, 'Dispatch without PO'),
      showDispatch ? React.createElement(DispatchModal, { indentId: indent.id, onClose: function() { setShowDispatch(false); } }) : null
    );
  }

  // procurement_manager/procurement_clerk + in_procurement
  if ((role === 'procurement_manager' || role === 'procurement_clerk') && status === 'in_procurement') {
    return React.createElement('div', { style: buttonWrap },
      React.createElement('a', { href: '#create-po/' + indent.id, className: 'btn btn-primary', style: { textDecoration: 'none' } }, 'Create PO'),
      // Dispatch details (vendor, expected delivery, notes) are entered right here
      React.createElement('button', { className: 'btn btn-success', onClick: function() { setShowDispatch(true); } }, 'Dispatch without PO'),
      showDispatch ? React.createElement(DispatchModal, { indentId: indent.id, onClose: function() { setShowDispatch(false); } }) : null
    );
  }

  // storekeeper: material can be received
  if (role === 'storekeeper' && status === 'dispatched') {
    return React.createElement('div', { style: buttonWrap },
      React.createElement('a', { href: '#receipt/' + indent.id, className: 'btn btn-success', style: { textDecoration: 'none' } }, 'Receive Items')
    );
  }

  // After an MD decision, keep the MD's remarks visible to everyone
  if (indent.mdRemarks && indent.mdEscalationResult) {
    return noteBox('#f0fdf4', '#86efac',
      'MD ' + (indent.mdEscalationResult === 'approved' ? 'approved' : 'returned') + ' this indent: ' + indent.mdRemarks);
  }

  return null;
}
