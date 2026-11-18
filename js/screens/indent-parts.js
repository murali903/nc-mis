
// ─────────────────────────────────────────────
// NEW: DocumentsSection
// ─────────────────────────────────────────────
function DocumentsSection(_ref) {
  var indent = _ref.indent;
  var _state_dispatch = useContext(AppContext);
  var state = _state_dispatch[0];
  var dispatch = _state_dispatch[1];

  var currentUser = state.currentUser;
  var isProcurement = currentUser && (currentUser.role === 'procurement_manager' || currentUser.role === 'procurement_clerk');

  var documents = indent.documents || [];

  var categoryOptions = ['Quotation', 'Purchase Order', 'Proforma Invoice', 'Estimate', 'Delivery Challan', 'Other'];
  var _cat = useState('Quotation');
  var selectedCategory = _cat[0];
  var setSelectedCategory = _cat[1];

  var fileInputRef = useRef(null);
  var _uploading = useState(false);
  var uploading = _uploading[0];
  var setUploading = _uploading[1];

  // POs linked to this indent
  var linkedPOs = (state.purchaseOrders || []).filter(function(po) {
    return po.indentId === indent.id;
  });

  var handleUpload = function() {
    var fileInput = fileInputRef.current;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please select a file', type: 'error' } });
      return;
    }
    var file = fileInput.files[0];
    setUploading(true);

    var reader = new FileReader();
    reader.onload = function(e) {
      var base64Data = e.target.result;
      var doc = {
        id: 'DOC-' + Date.now(),
        name: file.name,
        type: file.type,
        size: file.size,
        category: selectedCategory,
        data: base64Data,
        uploadedBy: state.currentUserId,
        uploadedAt: new Date().toISOString()
      };
      dispatch({ type: 'ADD_DOCUMENT', payload: { indentId: indent.id, document: doc } });
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Document uploaded successfully', type: 'success' } });
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = function() {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Failed to read file', type: 'error' } });
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  var handleDelete = function(docId) {
    if (confirm('Are you sure you want to delete this document?')) {
      dispatch({ type: 'DELETE_DOCUMENT', payload: { indentId: indent.id, documentId: docId } });
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Document deleted', type: 'success' } });
    }
  };

  var handleView = function(doc) {
    if (!doc.data) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'File not available — document was uploaded without file data', type: 'error' } });
      return;
    }
    var newTab = window.open();
    if (newTab) {
      newTab.document.write('<html><head><title>' + escapeHtml(doc.name) + '</title></head><body style="margin:0;">');
      if (doc.type && doc.type.startsWith('image/')) {
        newTab.document.write('<img src="' + doc.data + '" style="max-width:100%;height:auto;" />');
      } else {
        newTab.document.write('<iframe src="' + doc.data + '" style="width:100%;height:100vh;border:none;"></iframe>');
      }
      newTab.document.write('</body></html>');
      newTab.document.close();
    }
  };

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
    'Quotation': '#3b82f6',
    'Purchase Order': '#8b5cf6',
    'Proforma Invoice': '#f59e0b',
    'Estimate': '#6366f1',
    'Delivery Challan': '#10b981',
    'Other': '#6b7280'
  };

  return React.createElement('div', { style: { marginTop: '24px' } },
    React.createElement('h3', { style: { marginBottom: '16px', fontSize: '18px', fontWeight: '600' } }, 'Documents'),

    // Upload form (procurement roles only)
    isProcurement ? React.createElement('div', {
      style: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }
    },
      React.createElement('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' } },
        React.createElement('div', { style: { flex: '1', minWidth: '200px' } },
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'File'),
          React.createElement('input', {
            ref: fileInputRef,
            type: 'file',
            accept: '.pdf,.jpg,.jpeg,.png',
            style: { fontSize: '14px' }
          })
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
    documents.length === 0 && linkedPOs.length === 0
      ? React.createElement('p', { style: { color: '#6b7280', fontSize: '14px', fontStyle: 'italic' } }, 'No documents attached.')
      : null,

    documents.length > 0 ? React.createElement('div', { style: { border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' } },
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f9fafb' } },
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600' } }, 'Name'),
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600' } }, 'Category'),
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
              React.createElement('td', { style: { padding: '10px 12px', color: '#6b7280' } }, formatSize(doc.size)),
              React.createElement('td', { style: { padding: '10px 12px' } }, getUserName(doc.uploadedBy, state.users)),
              React.createElement('td', { style: { padding: '10px 12px', color: '#6b7280' } }, formatDate(doc.uploadedAt)),
              React.createElement('td', { style: { padding: '10px 12px', textAlign: 'right' } },
                React.createElement('button', {
                  className: 'btn btn-primary',
                  style: { marginRight: '6px', fontSize: '12px', padding: '4px 10px' },
                  onClick: function() { handleView(doc); }
                }, 'View / Download'),
                isProcurement ? React.createElement('button', {
                  className: 'btn btn-danger',
                  style: { fontSize: '12px', padding: '4px 10px' },
                  onClick: function() { handleDelete(doc.id); }
                }, 'Delete') : null
              )
            );
          })
        )
      )
    ) : null,

    // Linked POs section
    linkedPOs.length > 0 ? React.createElement('div', { style: { marginTop: '16px' } },
      React.createElement('h4', { style: { fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: '#374151' } }, 'Auto-Attached Purchase Orders'),
      linkedPOs.map(function(po) {
        return React.createElement('div', {
          key: po.id,
          style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '6px', marginBottom: '6px', background: '#f0fdf4' }
        },
          React.createElement('div', null,
            React.createElement('span', { style: { fontWeight: '500' } }, po.id),
            React.createElement('span', { style: { marginLeft: '12px', color: '#6b7280', fontSize: '13px' } }, 'Vendor: ' + po.vendorName),
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
// NEW: IndentActionButtons (with corrected payloads)
// ─────────────────────────────────────────────
function IndentActionButtons(_ref) {
  var indent = _ref.indent;
  var _state_dispatch = useContext(AppContext);
  var state = _state_dispatch[0];
  var dispatch = _state_dispatch[1];

  var currentUser = state.currentUser;
  if (!currentUser) return null;

  var role = currentUser.role;
  var status = indent.status;

  var _showReject = useState(false);
  var showRejectBox = _showReject[0];
  var setShowRejectBox = _showReject[1];

  var _showReturn = useState(false);
  var showReturnBox = _showReturn[0];
  var setShowReturnBox = _showReturn[1];

  var _reason = useState('');
  var reason = _reason[0];
  var setReason = _reason[1];

  var _assignClerk = useState('');
  var assignClerkId = _assignClerk[0];
  var setAssignClerkId = _assignClerk[1];

  var clerkList = (state.users || []).filter(function(u) { return u.role === 'procurement_clerk'; });

  var handleApprove = function() {
    dispatch({ type: 'APPROVE_INDENT', payload: { indentId: indent.id, approvedBy: state.currentUserId } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent approved', type: 'success' } });
  };

  var handleReject = function() {
    if (!reason.trim()) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please provide a reason for rejection', type: 'error' } });
      return;
    }
    dispatch({ type: 'REJECT_INDENT', payload: { indentId: indent.id, rejectedBy: state.currentUserId, reason: reason } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent rejected', type: 'success' } });
    setShowRejectBox(false);
    setReason('');
  };

  var handleEscalate = function() {
    dispatch({ type: 'ESCALATE_TO_MD', payload: { indentId: indent.id, remarks: '', escalatedBy: state.currentUserId } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent escalated to MD', type: 'success' } });
  };

  var handleReturn = function() {
    if (!reason.trim()) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please provide a reason for returning', type: 'error' } });
      return;
    }
    dispatch({ type: 'REJECT_INDENT', payload: { indentId: indent.id, rejectedBy: state.currentUserId, reason: reason, returnForRevision: true } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent returned for revision', type: 'success' } });
    setShowReturnBox(false);
    setReason('');
  };

  var handleAssign = function() {
    if (!assignClerkId) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please select a clerk', type: 'error' } });
      return;
    }
    dispatch({ type: 'ASSIGN_INDENT', payload: { indentId: indent.id, userId: assignClerkId } });
    var clerkName = getUserName(assignClerkId, state.users);
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent assigned to ' + clerkName, type: 'success' } });
  };

  var handleSelfAssign = function() {
    dispatch({ type: 'ASSIGN_INDENT', payload: { indentId: indent.id, userId: state.currentUserId } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent self-assigned', type: 'success' } });
  };

  var buttonWrap = { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' };

  // Site engineer + draft — allow submit for approval
  if (role === 'site_engineer' && status === 'draft') {
    return React.createElement('div', { style: buttonWrap },
      React.createElement('button', { className: 'btn btn-success', onClick: function() {
        if (!indent.lineItems || indent.lineItems.length === 0) {
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'Cannot submit: indent has no line items', type: 'error' } });
          return;
        }
        dispatch({ type: 'SUBMIT_INDENT', payload: { indentId: indent.id, userId: state.currentUserId } });
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent submitted for approval', type: 'success' } });
      } }, 'Submit for Approval'),
      React.createElement('a', { href: '#edit-draft/' + indent.id, className: 'btn btn-primary', style: { textDecoration: 'none' } }, 'Edit Indent')
    );
  }

  // PM/MD + pending_approval
  if ((role === 'project_manager' || role === 'md') && status === 'pending_approval') {
    return React.createElement('div', null,
      React.createElement('div', { style: buttonWrap },
        React.createElement('button', { className: 'btn btn-success', onClick: handleApprove }, 'Approve'),
        React.createElement('button', { className: 'btn btn-danger', onClick: function() { setShowRejectBox(!showRejectBox); setShowReturnBox(false); setReason(''); } }, 'Reject'),
        role === 'project_manager' ? React.createElement('button', { className: 'btn btn-warning', onClick: handleEscalate }, 'Escalate to MD') : null,
        React.createElement('button', { className: 'btn btn-secondary', onClick: function() { setShowReturnBox(!showReturnBox); setShowRejectBox(false); setReason(''); } }, 'Return for Revision')
      ),
      showRejectBox ? React.createElement('div', { style: { marginBottom: '16px' } },
        React.createElement('textarea', {
          value: reason,
          onChange: function(e) { setReason(e.target.value); },
          placeholder: 'Reason for rejection...',
          rows: 3,
          style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '8px', boxSizing: 'border-box' }
        }),
        React.createElement('button', { className: 'btn btn-danger', onClick: handleReject }, 'Confirm Rejection')
      ) : null,
      showReturnBox ? React.createElement('div', { style: { marginBottom: '16px' } },
        React.createElement('textarea', {
          value: reason,
          onChange: function(e) { setReason(e.target.value); },
          placeholder: 'Reason for returning...',
          rows: 3,
          style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '8px', boxSizing: 'border-box' }
        }),
        React.createElement('button', { className: 'btn btn-secondary', onClick: handleReturn }, 'Confirm Return')
      ) : null
    );
  }

  // procurement_manager + approved
  if (role === 'procurement_manager' && status === 'approved') {
    return React.createElement('div', { style: buttonWrap },
      React.createElement('select', {
        value: assignClerkId,
        onChange: function(e) { setAssignClerkId(e.target.value); },
        style: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }
      },
        React.createElement('option', { value: '' }, '-- Select Clerk --'),
        clerkList.map(function(c) {
          return React.createElement('option', { key: c.id, value: c.id }, getUserName(c.id, state.users));
        })
      ),
      React.createElement('button', { className: 'btn btn-primary', onClick: handleAssign }, 'Assign'),
      React.createElement('button', { className: 'btn btn-success', onClick: handleSelfAssign }, 'Self-Assign'),
      React.createElement('a', { href: '#create-po/' + indent.id, className: 'btn btn-primary', style: { textDecoration: 'none' } }, 'Create PO')
    );
  }

  // procurement_manager/procurement_clerk + in_procurement
  if ((role === 'procurement_manager' || role === 'procurement_clerk') && status === 'in_procurement') {
    return React.createElement('div', { style: buttonWrap },
      React.createElement('a', { href: '#create-po/' + indent.id, className: 'btn btn-primary', style: { textDecoration: 'none' } }, 'Create PO'),
      // Dispatch needs vendor, expected delivery and document reference, which are
      // collected on the In Progress screen; this button used to skip them.
      React.createElement('a', {
        href: role === 'procurement_clerk' ? '#clerk-assigned' : '#procurement-progress',
        className: 'btn btn-success', style: { textDecoration: 'none' },
        title: 'Opens the In Progress list, where dispatch details are entered'
      }, 'Dispatch (enter details)')
    );
  }

  // site_engineer + rejected/returned_for_revision
  if (role === 'site_engineer' && (status === 'rejected' || status === 'returned_for_revision')) {
    return React.createElement('div', { style: buttonWrap },
      React.createElement('a', { href: '#revise/' + indent.id, className: 'btn btn-primary', style: { textDecoration: 'none' } }, 'Revise')
    );
  }

  // storekeeper + dispatched
  if (role === 'storekeeper' && status === 'dispatched') {
    return React.createElement('div', { style: buttonWrap },
      React.createElement('a', { href: '#receipt/' + indent.id, className: 'btn btn-success', style: { textDecoration: 'none' } }, 'Receive Items')
    );
  }

  // Nothing for other combos
  return null;
}
