
// ─────────────────────────────────────────────
// NEW: PODetailScreen
// ─────────────────────────────────────────────
function GRNRecordingSection(_ref) {
  var po = _ref.po;
  var _ctx = useContext(AppContext);
  var state = _ctx[0];
  var dispatch = _ctx[1];

  var _receiving = useState({});
  var receiving = _receiving[0];
  var setReceiving = _receiving[1];

  var _remarks = useState({});
  var remarks = _remarks[0];
  var setRemarks = _remarks[1];

  var _conditions = useState({});
  var conditions = _conditions[0];
  var setConditions = _conditions[1];

  var _qualityRemarks = useState({});
  var qualityRemarks = _qualityRemarks[0];
  var setQualityRemarks = _qualityRemarks[1];

  var _grnRemarks = useState('');
  var grnRemarks = _grnRemarks[0];
  var setGrnRemarks = _grnRemarks[1];

  var _photoFile = useState(null);
  var photoFile = _photoFile[0];
  var setPhotoFile = _photoFile[1];

  var _photoPreview = useState(null);
  var photoPreview = _photoPreview[0];
  var setPhotoPreview = _photoPreview[1];

  var _uploading = useState(false);
  var uploading = _uploading[0];
  var setUploading = _uploading[1];

  var handlePhotoChange = function(e) {
    var file = e.target.files[0];
    if (file) {
      setPhotoFile(file);
      var reader = new FileReader();
      reader.onload = function(ev) { setPhotoPreview(ev.target.result); };
      reader.readAsDataURL(file);
    }
  };

  var handleSubmitReceipt = async function() {
    var receipts = [];
    po.lineItems.forEach(function(li) {
      var qty = parseFloat(receiving[li.id]) || 0;
      if (qty > 0) {
        receipts.push({
          lineItemId: li.id,
          quantityReceived: qty,
          remarks: remarks[li.id] || '',
          condition: conditions[li.id] || 'Good',
          qualityRemarks: qualityRemarks[li.id] || '',
        });
      }
    });
    var negativeLine = po.lineItems.find(function(li) { return parseFloat(receiving[li.id]) < 0; });
    if (negativeLine) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: (negativeLine.description || 'Item') + ': quantity cannot be negative', type: 'error' } });
      return;
    }
    if (receipts.length === 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Enter at least one quantity to receive', type: 'error' } });
      return;
    }
    // Block negative quantities, receiving more than is still outstanding, and
    // quality flags without an explanation.
    var receiptError = '';
    po.lineItems.forEach(function(li) {
      if (receiptError) return;
      var entered = parseFloat(receiving[li.id]);
      if (isNaN(entered) || entered === 0) return;
      var itemName = li.description || li.name || 'Item';
      var outstanding = (Number(li.quantity || li.qty) || 0) - (Number(li.receivedQty) || 0);
      if (entered < 0) {
        receiptError = itemName + ': quantity cannot be negative';
      } else if (entered > outstanding) {
        receiptError = itemName + ': only ' + outstanding + ' ' + (li.unit || '') + ' still to be received (you entered ' + entered + ')';
      } else if ((conditions[li.id] || 'Good') !== 'Good' && !(qualityRemarks[li.id] || '').trim()) {
        receiptError = itemName + ': describe the quality issue for a ' + conditions[li.id] + ' item';
      }
    });
    if (receiptError) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: receiptError, type: 'error' } });
      return;
    }

    // A receipt needs evidence: a photo, or remarks
    var anyRemark = grnRemarks.trim() !== '' || receipts.some(function(r) {
      return (r.remarks || '').trim() !== '' || (r.qualityRemarks || '').trim() !== '';
    });
    if (!photoFile && !anyRemark) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Add a photo or remarks to record this receipt', type: 'error' } });
      return;
    }

    // Upload photo if present
    var photoUrl = '';
    if (photoFile) {
      setUploading(true);
      try {
        var filePath = 'grn-photos/' + po.id + '/' + Date.now() + '-' + photoFile.name;
        var uploadResult = await supabaseClient.storage.from('receipts').upload(filePath, photoFile);
        if (uploadResult.error) {
          console.warn('[NC_MIS] Photo upload failed:', uploadResult.error.message);
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'Photo could not be uploaded (' + uploadResult.error.message + '). The receipt will be saved without it.', type: 'error' } });
        } else {
          var urlResult = supabaseClient.storage.from('receipts').getPublicUrl(filePath);
          photoUrl = urlResult.data ? urlResult.data.publicUrl : '';
        }
      } catch (uploadErr) {
        console.warn('[NC_MIS] Photo upload error:', uploadErr);
      }
      setUploading(false);
    }
    if (!photoUrl && !anyRemark) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'The photo was not uploaded. Add remarks, or try the photo again.', type: 'error' } });
      return;
    }

    dispatch({ type: 'RECEIVE_AGAINST_PO', payload: { poId: po.id, receipts: receipts, remarks: grnRemarks, photoUrl: photoUrl } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Receipt recorded successfully', type: 'success' } });
    setReceiving({});
    setRemarks({});
    setConditions({});
    setQualityRemarks({});
    setGrnRemarks('');
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  var thStyle = { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #86efac', fontSize: '13px' };
  var thCenter = Object.assign({}, thStyle, { textAlign: 'center' });

  return React.createElement('div', {
    style: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '20px', marginBottom: '20px' }
  },
    React.createElement('h3', { style: { marginTop: 0, marginBottom: '12px', color: '#15803d' } }, 'Record Receipt (GRN)'),
    React.createElement('div', { style: { overflowX: 'auto' } },
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', marginBottom: '12px', minWidth: '700px' } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#dcfce7' } },
            React.createElement('th', { style: thStyle }, 'Description'),
            React.createElement('th', { style: thCenter }, 'Ordered'),
            React.createElement('th', { style: thCenter }, 'Prev Recd'),
            React.createElement('th', { style: thCenter }, 'Receiving Now'),
            React.createElement('th', { style: thStyle }, 'Condition'),
            React.createElement('th', { style: thStyle }, 'Quality Remarks'),
            React.createElement('th', { style: thStyle }, 'Remarks')
          )
        ),
        React.createElement('tbody', null,
          po.lineItems.map(function(li) {
            var ordered = li.quantity || li.qty || 0;
            var prevReceived = li.receivedQty || 0;
            var remaining = ordered - prevReceived;
            return React.createElement('tr', { key: li.id, style: { borderBottom: '1px solid #e5e7eb' } },
              React.createElement('td', { style: { padding: '8px 12px' } }, li.description || li.name || ''),
              React.createElement('td', { style: { padding: '8px 12px', textAlign: 'center' } }, ordered),
              React.createElement('td', { style: { padding: '8px 12px', textAlign: 'center', color: prevReceived > 0 ? '#15803d' : '#6b7280' } }, prevReceived),
              React.createElement('td', { style: { padding: '8px 12px', textAlign: 'center' } },
                remaining > 0
                  ? React.createElement('input', {
                      type: 'number', min: 0, max: remaining, step: 'any',
                      value: receiving[li.id] || '',
                      onChange: function(e) { setReceiving(function(prev) { return Object.assign({}, prev, { [li.id]: e.target.value }); }); },
                      style: { width: '70px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', textAlign: 'center' },
                      placeholder: '0',
                    })
                  : React.createElement('span', { style: { color: '#15803d', fontWeight: 600 } }, 'Complete')
              ),
              React.createElement('td', { style: { padding: '8px 12px' } },
                remaining > 0
                  ? React.createElement('select', {
                      value: conditions[li.id] || 'Good',
                      onChange: function(e) { setConditions(function(prev) { return Object.assign({}, prev, { [li.id]: e.target.value }); }); },
                      style: { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px',
                        backgroundColor: (conditions[li.id] && conditions[li.id] !== 'Good') ? '#fef2f2' : '#fff',
                        color: (conditions[li.id] && conditions[li.id] !== 'Good') ? '#dc2626' : '#1e293b' }
                    },
                      React.createElement('option', { value: 'Good' }, 'Good'),
                      React.createElement('option', { value: 'Damaged' }, 'Damaged'),
                      React.createElement('option', { value: 'Partially Damaged' }, 'Partially Damaged'),
                      React.createElement('option', { value: 'Rejected' }, 'Rejected')
                    )
                  : null
              ),
              React.createElement('td', { style: { padding: '8px 12px' } },
                remaining > 0 && conditions[li.id] && conditions[li.id] !== 'Good'
                  ? React.createElement('input', {
                      type: 'text',
                      value: qualityRemarks[li.id] || '',
                      onChange: function(e) { setQualityRemarks(function(prev) { return Object.assign({}, prev, { [li.id]: e.target.value }); }); },
                      style: { width: '100%', padding: '4px 8px', border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fef2f2' },
                      placeholder: 'Describe quality issue...',
                    })
                  : null
              ),
              React.createElement('td', { style: { padding: '8px 12px' } },
                remaining > 0
                  ? React.createElement('input', {
                      type: 'text',
                      value: remarks[li.id] || '',
                      onChange: function(e) { setRemarks(function(prev) { return Object.assign({}, prev, { [li.id]: e.target.value }); }); },
                      style: { width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '13px' },
                      placeholder: 'Remarks...',
                    })
                  : null
              )
            );
          })
        )
      )
    ),
    // GRN-level remarks
    React.createElement('div', { style: { marginBottom: '12px' } },
      React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#15803d', marginBottom: '4px' } }, 'Receipt Remarks (a photo or remarks is required)'),
      React.createElement('input', {
        type: 'text', value: grnRemarks,
        onChange: function(e) { setGrnRemarks(e.target.value); },
        style: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' },
        placeholder: 'Overall remarks for this receipt...',
      })
    ),
    // Photo upload
    React.createElement('div', { style: { marginBottom: '12px' } },
      React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#15803d', marginBottom: '4px' } }, 'Attach Photo (invoice / delivery challan / material)'),
      React.createElement('label', {
        htmlFor: 'grn-photo-upload',
        style: {
          display: 'inline-block', border: '2px dashed #86efac', borderRadius: '8px',
          padding: '12px 24px', cursor: 'pointer', backgroundColor: '#f0fdf4', fontSize: '13px', color: '#15803d'
        }
      },
        photoFile ? photoFile.name : 'Click to upload photo',
        React.createElement('input', {
          id: 'grn-photo-upload', type: 'file', accept: 'image/*',
          onChange: handlePhotoChange, style: { display: 'none' }
        })
      ),
      photoPreview
        ? React.createElement('div', { style: { marginTop: '8px' } },
            React.createElement('img', {
              src: photoPreview, alt: 'Photo preview',
              style: { maxWidth: '150px', maxHeight: '150px', borderRadius: '6px', border: '1px solid #e2e8f0' }
            })
          )
        : null
    ),
    React.createElement('button', {
      className: 'btn btn-success',
      onClick: handleSubmitReceipt,
      disabled: uploading,
    }, uploading ? 'Uploading...' : 'Submit Receipt')
  );
}

// Quotations and other files attached to a purchase order. They are stored with
// the PO's indent (so they also show on the indent page) and marked with the PO.
function PODocumentsSection(_ref) {
  var po = _ref.po;
  var canUpload = _ref.canUpload;
  var _ctx = useContext(AppContext);
  var state = _ctx[0];
  var dispatch = _ctx[1];
  var fileRef = useRef(null);
  var _cat = useState('Quotation');
  var category = _cat[0], setCategory = _cat[1];
  var _busy = useState(false);
  var busy = _busy[0], setBusy = _busy[1];

  var indent = (state.indents || []).find(function(i) { return i.id === po.indentId; });
  var docs = poQuoteDocs(po, state);
  var indentIdOrNull = indent ? indent.id : null;
  var folder = indent ? indent.id : ('po-' + po.id);
  var categories = ['Quotation', 'Comparative Statement', 'Proforma Invoice', 'Estimate', 'Purchase Order', 'Delivery Challan', 'Other'];

  var upload = function() {
    var input = fileRef.current;
    if (!input || !input.files || input.files.length === 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please select a file', type: 'error' } });
      return;
    }
    var picked = Array.prototype.slice.call(input.files).map(function(f) { return { file: f, category: category, itemIndex: '' }; });
    setBusy(true);
    uploadPickedFiles(folder, picked, null, po.id).then(function(uploaded) {
      uploaded.forEach(function(doc) {
        doc.uploadedBy = state.currentUserId;
        dispatch({ type: 'ADD_DOCUMENT', payload: { indentId: indentIdOrNull, document: doc } });
      });
      dispatch({ type: 'SHOW_TOAST', payload: { message: uploaded.length === 1 ? 'File attached' : uploaded.length + ' files attached', type: 'success' } });
      if (fileRef.current) fileRef.current.value = '';
    }).catch(function(err) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: err.message || 'Could not upload the file', type: 'error' } });
    }).then(function() { setBusy(false); });
  };

  var remove = function(doc) {
    if (!confirm('Remove "' + doc.name + '" from this PO?')) return;
    dispatch({ type: 'DELETE_DOCUMENT', payload: { indentId: indentIdOrNull, documentId: doc.id, documentName: doc.name } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'File removed', type: 'success' } });
  };

  var cell = { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' };

  return React.createElement('div', { style: { background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' } },
    React.createElement('h3', { style: { marginTop: 0, marginBottom: '12px' } }, 'Quotations & Documents (' + docs.length + ')'),
    po.noQuoteReason ? React.createElement('div', {
      style: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', fontSize: '13px', marginBottom: '12px' }
    }, React.createElement('strong', null, 'Declared — no quotation available: '), po.noQuoteReason) : null,
    docs.length === 0
      ? React.createElement('p', { style: { color: '#6b7280', fontSize: '14px', fontStyle: 'italic', marginTop: 0 } }, 'No quotation attached to this PO.')
      : React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', marginBottom: '12px' } },
          React.createElement('tbody', null,
            docs.map(function(doc) {
              return React.createElement('tr', { key: doc.id },
                React.createElement('td', { style: Object.assign({}, cell, { fontWeight: 600 }) }, '📎 ' + doc.name),
                React.createElement('td', { style: cell }, doc.category),
                React.createElement('td', { style: Object.assign({}, cell, { color: '#6b7280' }) },
                  getUserName(doc.uploadedBy, state.users) + (doc.uploadedAt ? ', ' + new Date(doc.uploadedAt).toLocaleDateString('en-IN') : '')),
                React.createElement('td', { style: Object.assign({}, cell, { textAlign: 'right', whiteSpace: 'nowrap' }) },
                  React.createElement('button', { className: 'btn btn-sm btn-primary', style: { marginRight: 6 }, onClick: function() { openIndentDocument(doc, dispatch); } }, 'View / Download'),
                  (canUpload && doc.uploadedBy === state.currentUserId) ? React.createElement('button', { className: 'btn btn-sm btn-danger', onClick: function() { remove(doc); } }, 'Remove') : null
                )
              );
            })
          )
        ),
    canUpload ? React.createElement('div', { className: 'no-print', style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid #e5e7eb' } },
      React.createElement('input', { ref: fileRef, type: 'file', multiple: true, accept: ATTACHMENT_ACCEPT, 'aria-label': 'Choose files to attach', style: { fontSize: '13px' } }),
      React.createElement('select', {
        value: category, onChange: function(e) { setCategory(e.target.value); }, 'aria-label': 'Type of file',
        style: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }
      }, categories.map(function(c) { return React.createElement('option', { key: c, value: c }, c); })),
      React.createElement('button', { className: 'btn btn-primary', onClick: upload, disabled: busy }, busy ? 'Uploading...' : 'Attach')
    ) : null
  );
}

function PODetailScreen(_ref) {
  var poId = _ref.poId;
  var _state_dispatch = useContext(AppContext);
  var state = _state_dispatch[0];
  var dispatch = _state_dispatch[1];

  var po = (state.purchaseOrders || []).find(function(p) { return p.id === poId; });
  var vendor = po ? (state.vendors || []).find(function(v) { return v.id === po.vendorId; }) : null;
  var orgSettings = state.orgSettings || {};

  // Only procurement (and admin) may edit, submit, issue, amend, close or cancel a PO;
  // other roles get a read-only view (plus receipt for the store).
  var _poUser = state.currentUser || (state.users || []).find(function(u) { return u.id === state.currentUserId; }) || {};
  var _poRole = _poUser.role || '';
  var canManagePO = _poRole === 'procurement_manager' || _poRole === 'procurement_clerk' || _poRole === 'admin';
  var poBackHref = canManagePO ? '#procurement-pos' : (_poRole === 'storekeeper' ? '#store-expected' : (_poRole === 'md' ? '#md-po-approvals' : '#dashboard'));
  var poBackLabel = canManagePO ? 'Back to POs' : 'Back';

  var _editing = useState(false);
  var editing = _editing[0];
  var setEditing = _editing[1];

  var _editForm = useState(null);
  var editForm = _editForm[0];
  var setEditForm = _editForm[1];

  var _linkTo = useState('');
  var linkTo = _linkTo[0], setLinkTo = _linkTo[1];

  // Decision being entered: '', approve, reject, close, cancel
  var _mode = useState('');
  var mode = _mode[0], setMode = _mode[1];
  var _text = useState('');
  var text = _text[0], setText = _text[1];

  if (!po) {
    return React.createElement('div', { style: { padding: '20px' } },
      React.createElement('h2', null, 'Purchase Order Not Found'),
      React.createElement('p', null, 'The requested PO (' + poId + ') could not be found.'),
      React.createElement('a', { href: '#procurement-pos', className: 'btn btn-primary', style: { textDecoration: 'none' } }, 'Back to POs')
    );
  }

  var startEdit = function() {
    setEditForm({
      vendorId: po.vendorId,
      vendorName: po.vendorName,
      deliveryDate: po.deliveryDate || '',
      paymentTerms: po.paymentTerms || '',
      notes: po.notes || '',
      noQuoteReason: po.noQuoteReason || '',
      deliveryAddress: po.deliveryAddress || '',
      terms: Object.assign({}, po.terms || {}),
      noIndentReason: po.noIndentReason || '',
      lineItems: po.lineItems.map(function(li) { return Object.assign({}, li); })
    });
    setEditing(true);
  };

  var handleEditLineItemChange = function(idx, field, value) {
    setEditForm(function(prev) {
      var items = prev.lineItems.map(function(li, i) {
        if (i === idx) {
          var updated = Object.assign({}, li, { [field]: value });
          var qty = parseFloat(updated.quantity) || 0;
          var rate = parseFloat(updated.rate) || 0;
          var gstPct = parseFloat(updated.gstPercent) || 0;
          var base = qty * rate;
          // Keep numbers as numbers (inputs give strings) and the aliases in step
          updated.quantity = qty;
          updated.qty = qty;
          updated.rate = rate;
          updated.unitPrice = rate;
          updated.gstPercent = gstPct;
          updated.gstAmount = base * gstPct / 100;
          updated.amount = base;
          updated.amountWithGst = base + updated.gstAmount;
          return updated;
        }
        return li;
      });
      return Object.assign({}, prev, { lineItems: items });
    });
  };

  var handleSaveEdit = function() {
    var newVersion = (po.version || 1) + 1;
    var newTotalAmount = editForm.lineItems.reduce(function(sum, li) { return sum + lineTotal(li); }, 0);
    if (!editForm.vendorId) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please select a vendor', type: 'error' } });
      return;
    }
    var badLine = editForm.lineItems.find(function(li) { return !(Number(li.quantity) > 0); });
    if (badLine) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Quantity must be above zero for "' + (badLine.description || 'item') + '"', type: 'error' } });
      return;
    }
    dispatch({ type: 'UPDATE_PO', payload: { poId: po.id, updates: { vendorId: editForm.vendorId, deliveryDate: editForm.deliveryDate || null, paymentTerms: editForm.paymentTerms, notes: editForm.notes, noQuoteReason: (editForm.noQuoteReason || '').trim(), deliveryAddress: editForm.deliveryAddress, terms: cleanPOTerms(editForm.terms), noIndentReason: po.indentId ? undefined : (editForm.noIndentReason || '').trim(), lineItems: editForm.lineItems, totalAmount: newTotalAmount }, note: 'Edited PO to version ' + newVersion } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO updated to version ' + newVersion, type: 'success' } });
    setEditing(false);
    setEditForm(null);
  };

  var cancelEdit = function() {
    setEditing(false);
    setEditForm(null);
  };

  var handlePrint = function() {
    if (!printPurchaseOrder(po, state)) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'The browser blocked the print window. Allow pop-ups for this site and try again.', type: 'error' } });
    }
  };

  var handleMailto = function() {
    var vendorEmail = vendor && vendor.email ? vendor.email : '';
    var subject = encodeURIComponent(getPODisplayId(po) + ' from ' + (orgSettings.companyName || ''));
    var bodyLines = [
      'Dear ' + po.vendorName + ',',
      '',
      'Please find the details of Purchase Order ' + getPODisplayId(po) + ':',
      '',
      'Total Amount: Rs. ' + (po.totalAmount || 0).toFixed(2),
      'Delivery Date: ' + (po.deliveryDate || 'TBD'),
      'Payment Terms: ' + (po.paymentTerms || 'N/A'),
      '',
      'Line Items:',
    ];
    po.lineItems.forEach(function(li, i) {
      bodyLines.push((i + 1) + '. ' + (li.description || li.name || '') + ' - Qty: ' + (li.quantity || 0) + ' - Rate: ' + (li.rate || 0) + ' - Amount: ' + lineTotal(li).toFixed(2));
    });
    bodyLines.push('', 'Regards,', orgSettings.companyName || '');
    var body = encodeURIComponent(bodyLines.join('\n'));
    window.open('mailto:' + vendorEmail + '?subject=' + subject + '&body=' + body);
  };

  var formatDate = function(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  var isMD = _poRole === 'md';
  var isPOManager = _poRole === 'procurement_manager' || _poRole === 'admin';
  var mdLimit = poApprovalLimit(state);
  var needsMD = poNeedsMD(po, state);
  var missing = poMissingFields(po, state);
  var poToast = function(message, type) { dispatch({ type: 'SHOW_TOAST', payload: { message: message, type: type || 'success' } }); };
  var openMode = function(m) { setMode(mode === m ? '' : m); setText(''); };
  var closeMode = function() { setMode(''); setText(''); };

  var readyOrExplain = function() {
    if (missing.length === 0) return true;
    poToast('This PO is missing: ' + missing.slice(0, 4).join(', ') + '. Use Edit PO to complete it.', 'error');
    return false;
  };

  var poDecisions = {
    approve: { title: 'Approve ' + getPODisplayId(po), label: 'MD remarks (required)', confirm: 'Confirm Approval', cls: 'btn btn-success',
               run: function() { dispatch({ type: 'MD_APPROVE_PO', payload: { poId: po.id, remarks: text.trim() } }); poToast('PO approved'); } },
    reject:  { title: 'Reject ' + getPODisplayId(po), label: 'Reason for rejection (required)', confirm: 'Confirm Rejection', cls: 'btn btn-danger',
               run: function() { dispatch({ type: 'MD_REJECT_PO', payload: { poId: po.id, reason: text.trim() } }); poToast('PO rejected and returned to procurement'); } },
    close:   { title: (po.status === 'partially_fulfilled' ? 'Short-close ' : 'Close ') + getPODisplayId(po),
               label: po.status === 'partially_fulfilled' ? 'Why the balance will not be supplied (required)' : 'Closing remarks (required)',
               confirm: po.status === 'partially_fulfilled' ? 'Confirm Short-Close' : 'Confirm Close', cls: 'btn btn-success',
               run: function() { dispatch({ type: 'CLOSE_PO', payload: { poId: po.id, remarks: text.trim() } }); poToast(po.status === 'partially_fulfilled' ? 'PO short-closed' : 'PO closed'); } },
    cancel:  { title: 'Cancel draft ' + getPODisplayId(po), label: 'Reason for cancelling (required)', confirm: 'Confirm Cancel', cls: 'btn btn-danger',
               run: function() { dispatch({ type: 'CANCEL_PO', payload: { poId: po.id, reason: text.trim() } }); poToast('PO cancelled'); } },
  };
  var confirmPODecision = function() {
    var d = poDecisions[mode];
    if (!d) return;
    if (!text.trim()) { poToast('Please fill in: ' + d.label.replace(' (required)', ''), 'error'); return; }
    d.run();
    closeMode();
  };

  var statusColors = {
    'draft': '#6b7280',
    'sent': '#3b82f6',
    'acknowledged': '#8b5cf6',
    'fulfilled': '#16a34a',
    'cancelled': '#ef4444'
  };

  return React.createElement('div', { style: { padding: '20px', maxWidth: '900px' } },
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
      React.createElement('h2', { style: { margin: 0 } }, 'Purchase Order: ' + getPODisplayId(po)),
      React.createElement('a', { href: poBackHref, style: { color: '#3b82f6', textDecoration: 'none', fontSize: '14px' } }, poBackLabel)
    ),
    React.createElement('div', { style: { background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' } },
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' } },
        React.createElement('div', null,
          React.createElement('span', { style: { color: '#6b7280' } }, 'PO Number: '),
          React.createElement('strong', null, getPODisplayId(po))
        ),
        React.createElement('div', null,
          React.createElement('span', { style: { color: '#6b7280' } }, 'Vendor: '),
          React.createElement('strong', null, po.vendorName)
        ),
        React.createElement('div', null,
          React.createElement('span', { style: { color: '#6b7280' } }, 'Created: '),
          React.createElement('strong', null, formatDate(po.createdAt))
        ),
        React.createElement('div', null,
          React.createElement('span', { style: { color: '#6b7280' } }, 'Delivery Date: '),
          React.createElement('strong', null, formatDate(po.deliveryDate))
        ),
        React.createElement('div', null,
          React.createElement('span', { style: { color: '#6b7280' } }, 'Status: '),
          React.createElement('span', {
            style: { background: statusColors[po.status] || '#6b7280', color: '#fff', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }
          }, statusLabel(po.status))
        ),
        React.createElement('div', null,
          React.createElement('span', { style: { color: '#6b7280' } }, 'Version: '),
          React.createElement('strong', null, po.version || 1)
        ),
        React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('span', { style: { color: '#6b7280' } }, 'Payment Terms: '),
          React.createElement('strong', null, po.paymentTerms || 'N/A')
        ),
        React.createElement('div', null,
          React.createElement('span', { style: { color: '#6b7280' } }, 'Total Value: '),
          React.createElement('strong', null, formatRs(po.totalAmount))
        ),
        React.createElement('div', null,
          React.createElement('span', { style: { color: '#6b7280' } }, 'Raised By: '),
          React.createElement('strong', null, getUserName(po.createdBy, state.users))
        ),
        po.notes ? React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('span', { style: { color: '#6b7280' } }, 'Remarks: '),
          React.createElement('span', null, po.notes)
        ) : null,
        (po.status !== 'draft' && po.status !== 'pending_approval' && po.status !== 'cancelled' && po.approvalRoute) ? React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('span', { style: { color: '#6b7280' } }, 'Approval: '),
          React.createElement('span', null, po.approvalRoute === 'direct'
            ? 'Issued by procurement within the MD approval limit (MD approval not required)'
            : 'Approved by MD' + (po.mdRemarks ? ' — "' + po.mdRemarks + '"' : ''))
        ) : null,
        po.remarks ? React.createElement('div', { style: { gridColumn: '1 / -1', color: '#b91c1c' } },
          React.createElement('span', null, po.remarks)
        ) : null,
        po.closeRemarks ? React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('span', { style: { color: '#6b7280' } }, 'Closing remarks: '),
          React.createElement('span', null, po.closeRemarks)
        ) : null,
        po.indentId ? React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('span', { style: { color: '#6b7280' } }, 'Linked Indent: '),
          React.createElement('a', { href: '#indent/' + po.indentId, style: { color: '#3b82f6' } }, poIndentLabel(po, state))
        ) : React.createElement('div', { style: { gridColumn: '1 / -1', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px' } },
          React.createElement('strong', null, 'Raised without an indent' + (poSiteOf(po, state) ? ' for ' + poSiteOf(po, state).name : '') + '. '),
          React.createElement('span', null, 'Reason: ' + (po.noIndentReason || 'not given') + '. It needs MD approval whatever its value.'),
          (canManagePO && po.status !== 'cancelled' && po.status !== 'closed') ? React.createElement('div', { className: 'no-print', style: { marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            React.createElement('select', {
              value: linkTo, onChange: function(e) { setLinkTo(e.target.value); }, 'aria-label': 'Indent to link',
              style: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, maxWidth: 360 }
            },
              React.createElement('option', { value: '' }, 'Link to an approved indent...'),
              (state.indents || []).filter(function(i) { return i.status === 'approved' || i.status === 'in_procurement'; }).map(function(i) {
                return React.createElement('option', { key: i.id, value: i.id },
                  getIndentDisplayId(i, state.indents) + ' — ' + getSiteName(i.siteId, state.sites) + ' — ' + (i.lineItems || []).map(function(l) { return l.description; }).join(', ').slice(0, 50));
              })
            ),
            React.createElement('button', {
              className: 'btn btn-sm btn-secondary', disabled: !linkTo,
              onClick: function() {
                if (!linkTo) return;
                dispatch({ type: 'LINK_PO_INDENT', payload: { poId: po.id, indentId: linkTo } });
                dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO linked to the indent', type: 'success' } });
                setLinkTo('');
              }
            }, 'Link')
          ) : null
        ),
        (function() {
          var t = cleanPOTerms(po.terms);
          var lines = PO_TERMS.filter(function(x) { return t[x.key]; }).map(function(x) { return x.label + ': ' + t[x.key]; });
          if (t.siteContact || t.sitePhone) lines.push('Site contact: ' + [t.siteContact, t.sitePhone].filter(Boolean).join(', '));
          if (t.special) lines.push('Special instructions: ' + t.special);
          if (po.deliveryAddress) lines.unshift('Deliver to: ' + po.deliveryAddress);
          return lines.length ? React.createElement('div', { style: { gridColumn: '1 / -1', fontSize: 13, color: '#374151' } },
            React.createElement('div', { style: { color: '#6b7280', marginBottom: 2 } }, 'Terms'),
            lines.map(function(l, i) { return React.createElement('div', { key: i }, l); })) : null;
        })()
      )
    ),
    // What this PO still needs / which approval route applies (procurement, draft only)
    (canManagePO && po.status === 'draft') ? React.createElement('div', {
      style: { padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#1e293b',
               background: missing.length ? '#fffbeb' : (needsMD ? '#fef2f2' : '#f0fdf4'),
               border: '1px solid ' + (missing.length ? '#fde68a' : (needsMD ? '#fecaca' : '#bbf7d0')) }
    },
      missing.length
        ? 'Before this PO can be sent or issued it needs: ' + missing.join(', ') + '.'
        : (!po.indentId
            ? 'This PO has no indent, so it needs MD approval whatever its value.'
            : needsMD
            ? 'Value ' + formatRs(poValueForLimit(po, state)) + ' is above the ' + formatRs(mdLimit) + ' limit: MD approval is required.'
            : 'Value ' + formatRs(poValueForLimit(po, state)) + ' is within the ' + formatRs(mdLimit) + ' limit: the procurement manager can issue it directly, or it can be sent to the MD.')
    ) : null,
    (isMD && po.status === 'pending_approval') ? React.createElement('div', {
      style: { padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, background: '#ede9fe', border: '1px solid #c4b5fd', color: '#1e293b' }
    }, 'This PO is waiting for your approval. Remarks are required whether you approve or reject.') : null,

    React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } },
      // Draft: procurement
      canManagePO && po.status === 'draft' && React.createElement('button', { className: 'btn btn-primary', onClick: editing ? cancelEdit : startEdit }, editing ? 'Cancel Edit' : 'Edit PO'),
      (canManagePO && po.status === 'draft' && !editing && isPOManager && !needsMD && po.indentId) && React.createElement('button', {
        className: 'btn btn-success',
        onClick: function() {
          if (!readyOrExplain()) return;
          if (!window.confirm('Issue ' + getPODisplayId(po) + ' (' + formatRs(po.totalAmount) + ') to the vendor without MD approval?')) return;
          dispatch({ type: 'ISSUE_PO', payload: { poId: po.id } });
          poToast('PO issued to vendor');
        }
      }, 'Issue to Vendor'),
      (canManagePO && po.status === 'draft' && !editing) && React.createElement('button', {
        className: needsMD ? 'btn btn-success' : 'btn btn-secondary',
        onClick: function() {
          if (!readyOrExplain()) return;
          dispatch({ type: 'SUBMIT_PO_FOR_APPROVAL', payload: { poId: po.id } });
          poToast('PO sent for MD approval');
        }
      }, (needsMD || !po.indentId) ? 'Send for MD Approval' : 'Send for MD Approval anyway'),
      (canManagePO && po.status === 'draft' && !editing) && React.createElement('button', { className: 'btn btn-danger', onClick: function() { openMode('cancel'); } }, 'Cancel PO'),

      // With the MD
      (isMD && po.status === 'pending_approval') && React.createElement('button', { className: 'btn btn-success', onClick: function() { openMode('approve'); } }, 'Approve PO'),
      (isMD && po.status === 'pending_approval') && React.createElement('button', { className: 'btn btn-danger', onClick: function() { openMode('reject'); } }, 'Reject PO'),

      // Approved: issue
      canManagePO && po.status === 'approved' && React.createElement('button', {
        className: 'btn btn-success',
        onClick: function() {
          if (!readyOrExplain()) return;
          dispatch({ type: 'ISSUE_PO', payload: { poId: po.id } });
          poToast('PO issued to vendor');
        }
      }, 'Issue to Vendor'),

      // Issued: amend (before any receipt)
      canManagePO && po.status === 'issued' && React.createElement('button', {
        className: 'btn btn-secondary',
        onClick: function() {
          if (!window.confirm('Take ' + getPODisplayId(po) + ' back to draft so it can be changed? It will need to be issued again.')) return;
          dispatch({ type: 'AMEND_PO', payload: { poId: po.id } });
          poToast('PO is back in draft for amendment', 'info');
        }
      }, 'Amend PO (back to draft)'),

      // Received: close
      (isPOManager && po.status === 'partially_fulfilled') && React.createElement('button', { className: 'btn btn-secondary', onClick: function() { openMode('close'); } }, 'Short-Close PO'),
      (isPOManager && po.status === 'fulfilled') && React.createElement('button', { className: 'btn btn-success', onClick: function() { openMode('close'); } }, 'Close PO'),

      React.createElement('button', { className: 'btn btn-primary', onClick: handlePrint }, 'Print / Save as PDF'),
      canManagePO && (po.status === 'approved' || po.status === 'issued') && React.createElement('button', { className: 'btn btn-secondary', onClick: handleMailto }, 'Email Vendor')
    ),

    poDecisions[mode] ? React.createElement('div', {
      style: { marginBottom: 20, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }
    },
      React.createElement('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 8 } }, poDecisions[mode].title),
      React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 } }, poDecisions[mode].label),
      React.createElement('textarea', {
        value: text, onChange: function(e) { setText(e.target.value); }, rows: 3, autoFocus: true,
        'aria-label': poDecisions[mode].label,
        style: { width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box', fontSize: 13 }
      }),
      React.createElement('div', { style: { display: 'flex', gap: 8 } },
        React.createElement('button', { className: poDecisions[mode].cls, onClick: confirmPODecision }, poDecisions[mode].confirm),
        React.createElement('button', { className: 'btn btn-secondary', onClick: closeMode }, 'Back')
      )
    ) : React.createElement('div', { style: { marginBottom: 8 } }),

    editing && editForm ? React.createElement('div', {
      style: { background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '8px', padding: '20px', marginBottom: '20px' }
    },
      React.createElement('h3', { style: { marginTop: 0, marginBottom: '16px' } }, 'Edit Purchase Order'),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' } },
        React.createElement('div', null,
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Vendor *'),
          React.createElement('select', {
            value: editForm.vendorId || '',
            onChange: function(e) { var v = e.target.value; setEditForm(function(prev) { return Object.assign({}, prev, { vendorId: v }); }); },
            style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }
          },
            React.createElement('option', { value: '' }, 'Select Vendor'),
            (state.vendors || []).map(function(v) { return React.createElement('option', { key: v.id, value: v.id }, v.name); })
          )
        ),
        React.createElement('div', null,
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Delivery Date *'),
          React.createElement('input', {
            type: 'date',
            value: editForm.deliveryDate,
            onChange: function(e) { setEditForm(function(prev) { return Object.assign({}, prev, { deliveryDate: e.target.value }); }); },
            style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }
          })
        ),
        React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Payment Terms'),
          React.createElement('input', {
            type: 'text',
            value: editForm.paymentTerms,
            onChange: function(e) { setEditForm(function(prev) { return Object.assign({}, prev, { paymentTerms: e.target.value }); }); },
            style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }
          })
        ),
        React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Remarks *'),
          React.createElement('textarea', {
            value: editForm.notes,
            onChange: function(e) { var v = e.target.value; setEditForm(function(prev) { return Object.assign({}, prev, { notes: v }); }); },
            rows: 2,
            style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }
          })
        )
      ),
      React.createElement('div', { style: { marginBottom: '16px' } },
        React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Delivery Address'),
        React.createElement('input', {
          type: 'text', value: editForm.deliveryAddress,
          onChange: function(e) { var v = e.target.value; setEditForm(function(prev) { return Object.assign({}, prev, { deliveryAddress: v }); }); },
          style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }
        })
      ),
      !po.indentId ? React.createElement('div', { style: { marginBottom: '16px' } },
        React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Why there is no indent *'),
        React.createElement('textarea', {
          value: editForm.noIndentReason, rows: 2,
          onChange: function(e) { var v = e.target.value; setEditForm(function(prev) { return Object.assign({}, prev, { noIndentReason: v }); }); },
          style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }
        })
      ) : null,
      React.createElement(POTermsFields, {
        terms: editForm.terms,
        setTerms: function(t) { setEditForm(function(prev) { return Object.assign({}, prev, { terms: t }); }); }
      }),
      React.createElement('div', { style: { marginBottom: '16px' } },
        React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Declaration if no quotation is available (leave empty when a quotation is attached below)'),
        React.createElement('textarea', {
          value: editForm.noQuoteReason,
          onChange: function(e) { var v = e.target.value; setEditForm(function(prev) { return Object.assign({}, prev, { noQuoteReason: v }); }); },
          rows: 2, placeholder: 'e.g. rate contract, verbal / phone rate, single source, emergency purchase',
          style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }
        })
      ),
      React.createElement('h4', { style: { marginBottom: '8px' } }, 'Line Items'),
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '12px' } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f9fafb' } },
            React.createElement('th', { style: { padding: '6px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' } }, 'Description'),
            React.createElement('th', { style: { padding: '6px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '70px' } }, 'Qty'),
            React.createElement('th', { style: { padding: '6px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '90px' } }, 'Rate *'),
            React.createElement('th', { style: { padding: '6px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '70px' } }, 'GST%'),
            React.createElement('th', { style: { padding: '6px', textAlign: 'right', borderBottom: '1px solid #e5e7eb', width: '90px' } }, 'Amount')
          )
        ),
        React.createElement('tbody', null,
          editForm.lineItems.map(function(li, idx) {
            return React.createElement('tr', { key: idx },
              React.createElement('td', { style: { padding: '4px' } }, li.description || li.name || ''),
              React.createElement('td', { style: { padding: '4px' } },
                React.createElement('input', {
                  type: 'number',
                  value: li.quantity || 0,
                  onChange: function(e) { handleEditLineItemChange(idx, 'quantity', e.target.value); },
                  style: { width: '60px', padding: '4px', border: '1px solid #d1d5db', borderRadius: '4px', textAlign: 'center' }
                })
              ),
              React.createElement('td', { style: { padding: '4px' } },
                React.createElement('input', {
                  type: 'number',
                  value: li.rate || 0,
                  onChange: function(e) { handleEditLineItemChange(idx, 'rate', e.target.value); },
                  style: { width: '80px', padding: '4px', border: '1px solid #d1d5db', borderRadius: '4px', textAlign: 'right' }
                })
              ),
              React.createElement('td', { style: { padding: '4px' } },
                React.createElement('input', {
                  type: 'number',
                  value: li.gstPercent || 0,
                  onChange: function(e) { handleEditLineItemChange(idx, 'gstPercent', e.target.value); },
                  style: { width: '60px', padding: '4px', border: '1px solid #d1d5db', borderRadius: '4px', textAlign: 'center' }
                })
              ),
              React.createElement('td', { style: { padding: '4px', textAlign: 'right' } },
                lineTotal(li).toFixed(2)
              )
            );
          })
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        React.createElement('button', { className: 'btn btn-success', onClick: handleSaveEdit }, 'Save Changes'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: cancelEdit }, 'Cancel')
      )
    ) : null,
    !editing ? React.createElement('div', { style: { background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' } },
      React.createElement('h3', { style: { marginTop: 0, marginBottom: '12px' } }, 'Line Items'),
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f9fafb' } },
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600', borderBottom: '2px solid #e5e7eb' } }, '#'),
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600', borderBottom: '2px solid #e5e7eb' } }, 'Description'),
            React.createElement('th', { style: { textAlign: 'center', padding: '10px 12px', fontWeight: '600', borderBottom: '2px solid #e5e7eb' } }, 'Qty'),
            React.createElement('th', { style: { textAlign: 'left', padding: '10px 12px', fontWeight: '600', borderBottom: '2px solid #e5e7eb' } }, 'Unit'),
            React.createElement('th', { style: { textAlign: 'right', padding: '10px 12px', fontWeight: '600', borderBottom: '2px solid #e5e7eb' } }, 'Rate'),
            React.createElement('th', { style: { textAlign: 'right', padding: '10px 12px', fontWeight: '600', borderBottom: '2px solid #e5e7eb' } }, 'GST%'),
            React.createElement('th', { style: { textAlign: 'right', padding: '10px 12px', fontWeight: '600', borderBottom: '2px solid #e5e7eb' } }, 'GST Amt'),
            React.createElement('th', { style: { textAlign: 'right', padding: '10px 12px', fontWeight: '600', borderBottom: '2px solid #e5e7eb' } }, 'Amount')
          )
        ),
        React.createElement('tbody', null,
          po.lineItems.map(function(li, i) {
            return React.createElement('tr', { key: i, style: { borderBottom: '1px solid #e5e7eb' } },
              React.createElement('td', { style: { padding: '10px 12px' } }, i + 1),
              React.createElement('td', { style: { padding: '10px 12px' } }, li.description || li.name || ''),
              React.createElement('td', { style: { padding: '10px 12px', textAlign: 'center' } }, li.quantity || 0),
              React.createElement('td', { style: { padding: '10px 12px' } }, li.unit || ''),
              React.createElement('td', { style: { padding: '10px 12px', textAlign: 'right' } }, (Number(li.rate) || 0).toFixed(2)),
              React.createElement('td', { style: { padding: '10px 12px', textAlign: 'right' } }, (li.gstPercent || 0) + '%'),
              React.createElement('td', { style: { padding: '10px 12px', textAlign: 'right' } }, (Number(li.gstAmount) || 0).toFixed(2)),
              React.createElement('td', { style: { padding: '10px 12px', textAlign: 'right', fontWeight: '500' } }, lineTotal(li).toFixed(2))
            );
          }),
          React.createElement('tr', { style: { background: '#f9fafb', fontWeight: '700' } },
            React.createElement('td', { colSpan: 7, style: { padding: '10px 12px', textAlign: 'right' } }, 'Total'),
            React.createElement('td', { style: { padding: '10px 12px', textAlign: 'right' } }, 'Rs. ' + (po.totalAmount || 0).toFixed(2))
          )
        )
      )
    ) : null,
    // Quotations and other files
    !editing ? React.createElement(PODocumentsSection, {
      po: po,
      canUpload: canManagePO && po.status !== 'closed' && po.status !== 'cancelled'
    }) : null,
    // GRN Recording Section
    (po.status === 'issued' || po.status === 'partially_fulfilled') && state.currentUser && (state.currentUser.role === 'storekeeper' || state.currentUser.role === 'procurement_manager' || state.currentUser.role === 'admin')
      ? React.createElement(GRNRecordingSection, { po: po })
      : null,
    // Receipt History
    (function() {
      var poGrns = (state.grns || []).filter(function(g) { return g.poId === po.id; });
      if (poGrns.length === 0) return null;
      var _grnThStyle = { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #e5e7eb' };
      return React.createElement('div', { style: { background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' } },
        React.createElement('h3', { style: { marginTop: 0, marginBottom: '12px' } }, 'Receipt History (GRNs)'),
        poGrns.map(function(grn) {
          var grnItems = grn.items || [];
          // If old flat format (no items array), create a single-item array for backward compat
          if (grnItems.length === 0 && grn.lineItemId) {
            grnItems = [{ poLineItemId: grn.lineItemId, quantityReceived: grn.quantityReceived || 0, remarks: grn.remarks || '', condition: 'Good' }];
          }
          return React.createElement('div', { key: grn.id, style: { border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px', marginBottom: '12px' } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
              React.createElement('div', null,
                React.createElement('strong', { style: { fontSize: '14px' } }, grn.grnNumber || grn.id),
                React.createElement('span', { style: { color: '#6b7280', fontSize: '13px', marginLeft: '12px' } },
                  'by ' + getUserName(grn.receivedBy, state.users) + ' on ' + new Date(grn.createdAt || grn.receivedAt).toLocaleDateString('en-IN')
                )
              ),
              React.createElement('button', {
                className: 'btn btn-sm btn-secondary',
                onClick: function() { printGRN(grn, po, state); },
                style: { fontSize: '12px', padding: '4px 10px' }
              }, 'Print')
            ),
            grn.remarks ? React.createElement('div', { style: { fontSize: '13px', color: '#6b7280', marginBottom: '8px' } }, 'Remarks: ' + grn.remarks) : null,
            grn.photoUrl ? React.createElement('div', { style: { marginBottom: '8px' } },
              React.createElement('a', { href: grn.photoUrl, target: '_blank', rel: 'noopener', style: { fontSize: '13px', color: '#2563eb' } }, 'View Photo')
            ) : null,
            React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } },
              React.createElement('thead', null,
                React.createElement('tr', { style: { background: '#f9fafb' } },
                  React.createElement('th', { style: _grnThStyle }, 'Item'),
                  React.createElement('th', { style: Object.assign({}, _grnThStyle, { textAlign: 'center' }) }, 'Qty'),
                  React.createElement('th', { style: _grnThStyle }, 'Condition'),
                  React.createElement('th', { style: _grnThStyle }, 'Remarks')
                )
              ),
              React.createElement('tbody', null,
                grnItems.map(function(gi, idx) {
                  var li = po.lineItems.find(function(l) { return l.id === gi.poLineItemId; });
                  return React.createElement('tr', { key: gi.id || idx, style: { borderBottom: '1px solid #f1f5f9' } },
                    React.createElement('td', { style: { padding: '6px 12px' } }, li ? (li.description || li.name || '') : gi.poLineItemId),
                    React.createElement('td', { style: { padding: '6px 12px', textAlign: 'center', fontWeight: 600 } }, gi.quantityReceived),
                    React.createElement('td', { style: { padding: '6px 12px', color: gi.condition && gi.condition !== 'Good' ? '#dc2626' : '#15803d' } }, gi.condition || 'Good'),
                    React.createElement('td', { style: { padding: '6px 12px', fontSize: 12 } }, [gi.remarks, gi.qualityRemarks].filter(Boolean).join(' | ') || '')
                  );
                })
              )
            )
          );
        })
      );
    })(),
    React.createElement('div', { style: { background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' } },
      React.createElement('h3', { style: { marginTop: 0, marginBottom: '12px' } }, 'Version History'),
      (po.versionHistory && po.versionHistory.length > 0)
        ? React.createElement('div', null,
            po.versionHistory.map(function(vh, i) {
              return React.createElement('div', {
                key: i,
                style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < po.versionHistory.length - 1 ? '1px solid #e5e7eb' : 'none', fontSize: '14px' }
              },
                React.createElement('span', null,
                  React.createElement('strong', null, 'Version ' + vh.version),
                  React.createElement('span', { style: { color: '#6b7280', marginLeft: '12px' } },
                    'Edited by ' + getUserName(vh.editedBy, state.users) + ' on ' + formatDate(vh.editedAt)
                  )
                ),
                React.createElement('span', { style: { color: '#6b7280' } }, 'Total: Rs. ' + (vh.totalAmount || 0).toFixed(2))
              );
            })
          )
        : React.createElement('p', { style: { color: '#6b7280', fontSize: '14px', fontStyle: 'italic' } }, 'No previous versions.'),
      React.createElement('div', { style: { marginTop: '8px', fontSize: '14px', fontWeight: '500' } },
        'Current Version: ' + (po.version || 1)
      )
    ),
    (canManagePO && (po.status === 'approved' || po.status === 'issued' || po.status === 'partially_fulfilled')) ? React.createElement('div', { style: { background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
      React.createElement('h3', { style: { marginTop: 0, marginBottom: '12px' } }, 'Email to Vendor'),
      React.createElement('button', { className: 'btn btn-primary', onClick: handleMailto }, 'Open in Email Client'),
      React.createElement('p', { style: { fontSize: '13px', color: '#6b7280', marginTop: '8px' } },
        'Opens a ready-written email in your mail application. Attach the PO PDF (Print / Save as PDF) before sending.')
    ) : null
  );
}
