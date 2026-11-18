
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
      React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#15803d', marginBottom: '4px' } }, 'GRN Remarks'),
      React.createElement('input', {
        type: 'text', value: grnRemarks,
        onChange: function(e) { setGrnRemarks(e.target.value); },
        style: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' },
        placeholder: 'Overall remarks for this receipt...',
      })
    ),
    // Photo upload
    React.createElement('div', { style: { marginBottom: '12px' } },
      React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: 600, color: '#15803d', marginBottom: '4px' } }, 'Attach Photo (Invoice/Delivery)'),
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
      remarks: po.remarks || '',
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
    var versionEntry = {
      version: po.version || 1,
      editedBy: state.currentUserId,
      editedAt: new Date().toISOString(),
      totalAmount: po.totalAmount
    };
    var updatedPO = Object.assign({}, po, {
      vendorId: editForm.vendorId,
      vendorName: editForm.vendorName,
      deliveryDate: editForm.deliveryDate,
      paymentTerms: editForm.paymentTerms,
      remarks: editForm.remarks,
      lineItems: editForm.lineItems,
      totalAmount: newTotalAmount,
      version: newVersion,
      versionHistory: (po.versionHistory || []).concat([versionEntry])
    });
    dispatch({ type: 'UPDATE_PO', payload: { poId: po.id, updates: { vendorId: editForm.vendorId, vendorName: editForm.vendorName, deliveryDate: editForm.deliveryDate, paymentTerms: editForm.paymentTerms, remarks: editForm.remarks, lineItems: editForm.lineItems, totalAmount: newTotalAmount }, note: 'Edited PO to version ' + newVersion } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO updated to version ' + newVersion, type: 'success' } });
    setEditing(false);
    setEditForm(null);
  };

  var cancelEdit = function() {
    setEditing(false);
    setEditForm(null);
  };

  var handlePrint = function() {
    var printWin = window.open('', '_blank');
    if (!printWin) return;

    // Look up office from indent -> site -> office
    var indent = (state.indents || []).find(function(ind) { return ind.id === po.indentId; });
    var site = indent ? (state.sites || []).find(function(s) { return s.id === indent.siteId; }) : null;
    var office = site ? (state.offices || []).find(function(o) { return o.id === site.officeId; }) : null;

    var printCompanyName = orgSettings.companyName || '';
    var printAddress = office ? office.address : (orgSettings.companyAddress || '');
    var printPhone = office ? office.phone : (orgSettings.companyPhone || '');
    var printGSTIN = office ? office.gstin : (orgSettings.companyGSTIN || '');
    var printPAN = office ? office.pan : (orgSettings.companyPAN || '');

    var lineRows = po.lineItems.map(function(li, i) {
      return '<tr>' +
        '<td style="border:1px solid #ccc;padding:6px;">' + (i + 1) + '</td>' +
        '<td style="border:1px solid #ccc;padding:6px;">' + (li.description || li.name || '') + '</td>' +
        '<td style="border:1px solid #ccc;padding:6px;text-align:center;">' + (li.quantity || 0) + '</td>' +
        '<td style="border:1px solid #ccc;padding:6px;">' + (li.unit || '') + '</td>' +
        '<td style="border:1px solid #ccc;padding:6px;text-align:right;">' + (Number(li.rate) || 0).toFixed(2) + '</td>' +
        '<td style="border:1px solid #ccc;padding:6px;text-align:right;">' + (li.gstPercent || 0) + '%</td>' +
        '<td style="border:1px solid #ccc;padding:6px;text-align:right;">' + (Number(li.gstAmount) || 0).toFixed(2) + '</td>' +
        '<td style="border:1px solid #ccc;padding:6px;text-align:right;">' + lineTotal(li).toFixed(2) + '</td>' +
        '</tr>';
    }).join('');
    var html = '<!DOCTYPE html><html><head><title>PO ' + po.id + '</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:30px;} table{border-collapse:collapse;width:100%;margin-top:10px;} @media print{button{display:none;}}</style>' +
      '</head><body>' +
      '<div style="text-align:center;margin-bottom:20px;">' +
      '<h2 style="margin:0;">' + printCompanyName + '</h2>' +
      (office ? '<p style="margin:2px 0;font-size:12px;color:#666;">' + office.name + '</p>' : '') +
      '<p style="margin:4px 0;font-size:13px;">' + printAddress + '</p>' +
      '<p style="margin:2px 0;font-size:13px;">Phone: ' + printPhone + ' | GSTIN: ' + printGSTIN + ' | PAN: ' + printPAN + '</p>' +
      '</div>' +
      '<h3 style="text-align:center;margin-bottom:16px;">PURCHASE ORDER</h3>' +
      '<table><tr><td><strong>PO Number:</strong> ' + getPODisplayId(po) + '</td><td><strong>Date:</strong> ' + new Date(po.createdAt).toLocaleDateString('en-IN') + '</td></tr>' +
      '<tr><td><strong>Vendor:</strong> ' + po.vendorName + '</td><td><strong>Delivery Date:</strong> ' + (po.deliveryDate || 'N/A') + '</td></tr>' +
      '<tr><td><strong>Status:</strong> ' + po.status + '</td><td><strong>Version:</strong> ' + (po.version || 1) + '</td></tr>' +
      '<tr><td colspan="2"><strong>Payment Terms:</strong> ' + (po.paymentTerms || 'N/A') + '</td></tr></table>' +
      '<table style="margin-top:16px;"><thead><tr style="background:#f3f4f6;">' +
      '<th style="border:1px solid #ccc;padding:6px;">#</th>' +
      '<th style="border:1px solid #ccc;padding:6px;">Description</th>' +
      '<th style="border:1px solid #ccc;padding:6px;">Qty</th>' +
      '<th style="border:1px solid #ccc;padding:6px;">Unit</th>' +
      '<th style="border:1px solid #ccc;padding:6px;">Rate</th>' +
      '<th style="border:1px solid #ccc;padding:6px;">GST%</th>' +
      '<th style="border:1px solid #ccc;padding:6px;">GST Amt</th>' +
      '<th style="border:1px solid #ccc;padding:6px;">Amount</th>' +
      '</tr></thead><tbody>' + lineRows + '</tbody></table>' +
      '<p style="text-align:right;font-weight:bold;margin-top:12px;">Total: Rs. ' + (po.totalAmount || 0).toFixed(2) + '</p>' +
      (po.remarks ? '<p><strong>Remarks:</strong> ' + po.remarks + '</p>' : '') +
      '<br/><button onclick="window.print()">Print</button>' +
      '</body></html>';
    printWin.document.write(html);
    printWin.document.close();
  };

  var handleMailto = function() {
    var vendorEmail = vendor && vendor.email ? vendor.email : '';
    var subject = encodeURIComponent('PO ' + po.id + ' from ' + (orgSettings.companyName || ''));
    var bodyLines = [
      'Dear ' + po.vendorName + ',',
      '',
      'Please find the details of Purchase Order ' + po.id + ':',
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
          }, po.status)
        ),
        React.createElement('div', null,
          React.createElement('span', { style: { color: '#6b7280' } }, 'Version: '),
          React.createElement('strong', null, po.version || 1)
        ),
        React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('span', { style: { color: '#6b7280' } }, 'Payment Terms: '),
          React.createElement('strong', null, po.paymentTerms || 'N/A')
        ),
        po.remarks ? React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('span', { style: { color: '#6b7280' } }, 'Remarks: '),
          React.createElement('span', null, po.remarks)
        ) : null,
        po.indentId ? React.createElement('div', { style: { gridColumn: '1 / -1' } },
          React.createElement('span', { style: { color: '#6b7280' } }, 'Linked Indent: '),
          React.createElement('a', { href: '#indent/' + po.indentId, style: { color: '#3b82f6' } }, getIndentDisplayId((state.indents || []).find(function(i) { return i.id === po.indentId; }) || { id: po.indentId }, state.indents))
        ) : null
      )
    ),
    React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' } },
      // Contextual buttons based on PO status and user role
      canManagePO && po.status === 'draft' && React.createElement('button', { className: 'btn btn-primary', onClick: editing ? cancelEdit : startEdit }, editing ? 'Cancel Edit' : 'Edit PO'),
      canManagePO && po.status === 'draft' && React.createElement('button', {
        className: 'btn btn-success',
        onClick: function() {
          dispatch({ type: 'SUBMIT_PO_FOR_APPROVAL', payload: { poId: po.id } });
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO submitted for approval', type: 'success' } });
        }
      }, 'Submit for Approval'),
      canManagePO && po.status === 'draft' && React.createElement('button', {
        className: 'btn btn-danger',
        onClick: function() {
          if (window.confirm('Cancel this PO?')) {
            dispatch({ type: 'CANCEL_PO', payload: { poId: po.id, reason: 'Cancelled from draft' } });
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO cancelled', type: 'success' } });
          }
        }
      }, 'Delete'),
      (po.status === 'pending_approval' || po.status === 'pending_approval') && state.currentUser && state.currentUser.role === 'md' && React.createElement('button', {
        className: 'btn btn-success',
        onClick: function() {
          dispatch({ type: 'MD_APPROVE_PO', payload: { poId: po.id } });
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO approved', type: 'success' } });
        }
      }, 'Approve'),
      (po.status === 'pending_approval' || po.status === 'pending_approval') && state.currentUser && state.currentUser.role === 'md' && React.createElement('button', {
        className: 'btn btn-danger',
        onClick: function() {
          var reason = window.prompt('Rejection reason:');
          if (reason !== null && !reason.trim()) {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please provide a rejection reason', type: 'error' } });
          } else if (reason !== null) {
            dispatch({ type: 'MD_REJECT_PO', payload: { poId: po.id, reason: reason.trim() } });
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO rejected', type: 'info' } });
          }
        }
      }, 'Reject'),
      canManagePO && po.status === 'approved' && React.createElement('button', {
        className: 'btn btn-success',
        onClick: function() {
          dispatch({ type: 'ISSUE_PO', payload: { poId: po.id } });
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO issued to vendor', type: 'success' } });
        }
      }, 'Issue to Vendor'),
      (po.status === 'approved' || po.status === 'issued') && React.createElement('button', { className: 'btn btn-primary', onClick: handlePrint }, 'Print / PDF'),
      canManagePO && (po.status === 'approved' || po.status === 'issued') && React.createElement('button', { className: 'btn btn-secondary', onClick: handleMailto }, 'Email Vendor'),
      canManagePO && po.status === 'issued' && React.createElement('button', {
        className: 'btn btn-secondary',
        onClick: function() {
          dispatch({ type: 'AMEND_PO', payload: { poId: po.id } });
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO amendment requested', type: 'info' } });
        }
      }, 'Amend PO (Revert to Draft)'),
      canManagePO && (po.status === 'partially_fulfilled') && React.createElement('button', {
        className: 'btn btn-secondary',
        onClick: function() {
          dispatch({ type: 'CLOSE_PO', payload: { poId: po.id } });
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO short-closed', type: 'success' } });
        }
      }, 'Short-Close'),
      canManagePO && po.status === 'fulfilled' && React.createElement('button', {
        className: 'btn btn-success',
        onClick: function() {
          dispatch({ type: 'CLOSE_PO', payload: { poId: po.id } });
          dispatch({ type: 'SHOW_TOAST', payload: { message: 'PO closed', type: 'success' } });
        }
      }, 'Close PO'),
      (po.status !== 'draft') && React.createElement('button', { className: 'btn btn-primary', onClick: handlePrint }, 'Download PDF')
    ),
    editing && editForm ? React.createElement('div', {
      style: { background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '8px', padding: '20px', marginBottom: '20px' }
    },
      React.createElement('h3', { style: { marginTop: 0, marginBottom: '16px' } }, 'Edit Purchase Order'),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' } },
        React.createElement('div', null,
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Vendor Name'),
          React.createElement('input', {
            type: 'text',
            value: editForm.vendorName,
            onChange: function(e) { setEditForm(function(prev) { return Object.assign({}, prev, { vendorName: e.target.value }); }); },
            style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Delivery Date'),
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
          React.createElement('label', { style: { display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '4px' } }, 'Remarks'),
          React.createElement('textarea', {
            value: editForm.remarks,
            onChange: function(e) { setEditForm(function(prev) { return Object.assign({}, prev, { remarks: e.target.value }); }); },
            rows: 2,
            style: { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }
          })
        )
      ),
      React.createElement('h4', { style: { marginBottom: '8px' } }, 'Line Items'),
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '12px' } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f9fafb' } },
            React.createElement('th', { style: { padding: '6px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' } }, 'Description'),
            React.createElement('th', { style: { padding: '6px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '70px' } }, 'Qty'),
            React.createElement('th', { style: { padding: '6px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '90px' } }, 'Rate'),
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
    React.createElement('div', { style: { background: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
      React.createElement('h3', { style: { marginTop: 0, marginBottom: '12px' } }, 'Email to Vendor'),
      React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: handleMailto }, 'Open in Email Client'),
        React.createElement('button', {
          className: 'btn btn-secondary',
          onClick: function() {
            dispatch({ type: 'SHOW_TOAST', payload: { message: 'Gmail connector is not configured. Please set up the Gmail integration to send emails directly.', type: 'info' } });
          }
        }, 'Send via Gmail')
      ),
      React.createElement('p', { style: { fontSize: '13px', color: '#6b7280', marginTop: '8px' } },
        'Note: "Send via Gmail" requires the Gmail connector to be configured. Use "Open in Email Client" to compose the email in your default mail application.'
      )
    )
  );
}
