
// ─────────────────────────────────────────────
// 13. MyIndentsScreen (updated priority badge)
// ─────────────────────────────────────────────
function MyIndentsScreen() {
  const [state] = useContext(AppContext);
  const user = state.currentUser;
  const mine = state.indents.filter(i => i.createdBy === user.id).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const list = useListControls(mine, indentListFields(state));
  const myIndents = list.rows;
  const createHash = user.role === 'project_manager' ? '#pm-create-indent' : (user.role === 'storekeeper' ? '#store-new-indent' : '#create-indent');
  const needAction = mine.filter(i => i.status === 'rejected' || i.status === 'returned_for_revision').length;

  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }
    },
      React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b' } }, 'My Indents'),
      React.createElement('a', {
        href: createHash,
        style: {
          padding: '10px 20px', borderRadius: 8, background: '#6366f1',
          color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none',
        }
      }, '+ New Indent')
    ),

    needAction > 0 && React.createElement('div', {
      style: { background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: '#9a3412', fontWeight: 600 }
    }, needAction + (needAction === 1 ? ' indent was' : ' indents were') + ' returned or rejected and ' + (needAction === 1 ? 'needs' : 'need') + ' your revision.'),

    mine.length > 0 && list.bar,

    mine.length === 0
      ? React.createElement('div', {
          style: {
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            padding: 40, textAlign: 'center', color: '#94a3b8',
          }
        },
          React.createElement('p', { style: { fontSize: 16, marginBottom: 8 } }, 'No indents yet'),
          React.createElement('a', { href: createHash, style: { color: '#6366f1', fontWeight: 600 } }, 'Create your first indent')
        )
      : React.createElement('div', {
          style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }
        },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
            React.createElement('thead', null,
              React.createElement('tr', { style: { background: '#f8fafc' } },
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Indent ID'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Site'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Status'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Priority'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Items'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Created'),
                React.createElement('th', { style: { padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 } }, 'Actions')
              )
            ),
            React.createElement('tbody', null,
              myIndents.length === 0 && React.createElement('tr', null,
                React.createElement('td', { colSpan: 7, style: { padding: 32, textAlign: 'center', color: '#94a3b8' } }, 'No indents match your search')),
              myIndents.map(indent =>
                React.createElement('tr', {
                  key: indent.id,
                  style: { borderBottom: '1px solid #f1f5f9', cursor: 'pointer' },
                  onClick: () => { window.location.hash = '#indent/' + indent.id; }
                },
                  React.createElement('td', { style: { padding: '12px 16px', fontWeight: 600, color: '#6366f1' } }, getIndentDisplayId(indent, state.indents)),
                  React.createElement('td', { style: { padding: '12px 16px' } }, getSiteName(indent.siteId, state.sites)),
                  React.createElement('td', { style: { padding: '12px 16px' } }, React.createElement(StatusBadge, { status: indent.status })),
                  React.createElement('td', { style: { padding: '12px 16px' } }, React.createElement(PriorityBadge, { priority: indent.priority })),
                  React.createElement('td', { style: { padding: '12px 16px' } }, (indent.lineItems || []).length),
                  React.createElement('td', { style: { padding: '12px 16px', color: '#64748b' } }, new Date(indent.createdAt).toLocaleDateString()),
                  React.createElement('td', { style: { padding: '12px 16px', textAlign: 'center' } },
                    indent.status === 'draft' && React.createElement('a', {
                      href: '#edit-draft/' + indent.id,
                      onClick: e => e.stopPropagation(),
                      style: {
                        padding: '4px 12px', borderRadius: 6, background: '#eef2ff',
                        color: '#6366f1', fontSize: 12, fontWeight: 600, textDecoration: 'none',
                      }
                    }, 'Edit'),
                    (indent.status === 'rejected' || indent.status === 'returned_for_revision') && React.createElement('a', {
                      href: '#revise/' + indent.id,
                      onClick: e => e.stopPropagation(),
                      style: {
                        padding: '4px 12px', borderRadius: 6, background: '#fef9c3',
                        color: '#a16207', fontSize: 12, fontWeight: 600, textDecoration: 'none',
                      }
                    }, 'Revise')
                  )
                )
              )
            )
          )
        )
  );
}

// ─────────────────────────────────────────────
// 14. CreateIndentScreen - MODIFIED
// ─────────────────────────────────────────────
function CreateIndentScreen() {
  const [state, dispatch] = useContext(AppContext);
  const user = state.currentUser;
  const sites = getUserSites(user.id, state.sites, state.siteAssignments);
  // For PM, show all sites
  const availableSites = user.role === 'project_manager' ? state.sites : sites;

  const [siteId, setSiteId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [requiredDate, setRequiredDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState([{ boqId: '', name: '', description: '', qty: '', unit: '', remarks: '', isBoqItem: false, boqReference: '' }]);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  const addItem = () => {
    setItems([...items, { boqId: '', name: '', description: '', qty: '', unit: '', remarks: '', isBoqItem: false, boqReference: '' }]);
  };

  const removeItem = (idx) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === 'boqId' && value) {
      const boqItems = siteId ? (state.boqLists[siteId] || []) : [];
      const boq = boqItems.find(b => b.id === value);
      if (boq) {
        updated[idx].description = boq.name;
        updated[idx].unit = boq.unit;
        updated[idx].hsn = boq.hsn || '';
      }
    }
    setItems(updated);
  };

  var isSubmittingIndent = React.useRef(false);
  const handleSubmit = (status) => {
    // Prevent double submission
    if (isSubmittingIndent.current) return;

    // Site is required
    if (!siteId) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please select a site', type: 'error' } });
      return;
    }

    // Required date validation
    if (requiredDate && requiredDate < new Date().toISOString().split('T')[0]) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Required date cannot be in the past', type: 'error' } });
      return;
    }

    // For "submit for approval", required date is mandatory
    if (status === 'pending_approval' && !requiredDate) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Required date is mandatory when submitting for approval', type: 'error' } });
      return;
    }

    // Check each item individually for quality issues
    var itemErrors = [];
    items.forEach(function(i, idx) {
      var num = idx + 1;
      if ((i.name || i.description) && (!i.qty || parseFloat(i.qty) <= 0)) {
        itemErrors.push('Item ' + num + ' (' + (i.name || i.description) + '): quantity is required');
      }
      if (i.qty && parseFloat(i.qty) > 0 && !i.name && !i.description) {
        itemErrors.push('Item ' + num + ': material name is required');
      }
      if (i.qty && (parseFloat(i.qty) <= 0 || parseFloat(i.qty) > 999999)) {
        itemErrors.push('Item ' + num + ': quantity must be between 1 and 999,999');
      }
      if ((i.name || i.description) && i.qty && parseFloat(i.qty) > 0 && !i.unit) {
        itemErrors.push('Item ' + num + ' (' + (i.name || i.description) + '): please select a unit');
      }
    });
    if (itemErrors.length > 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: itemErrors[0], type: 'error' } });
      return;
    }

    // Filter to fully valid items
    const validItems = items.filter(i => (i.name || i.description) && i.qty && parseFloat(i.qty) > 0 && parseFloat(i.qty) <= 999999);
    if (validItems.length === 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please add at least one line item with material name and valid quantity', type: 'error' } });
      return;
    }

    // Mandatory field validation for all valid items
    var invalidItems = validItems.filter(function(li) {
        if (li.isBoqItem && !li.boqId) return true;
        if (!li.isBoqItem && (!li.description || !li.description.trim()) && (!li.name || !li.name.trim())) return true;
        if (!li.unit) return true;
        if (!li.qty || parseFloat(li.qty) <= 0) return true;
        return false;
    });
    if (invalidItems.length > 0) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: 'All items must have Description, Unit, and Qty > 0', type: 'error' } });
        return;
    }

    // Warn if some items were dropped (partially filled items)
    var totalItems = items.filter(function(i) { return i.name || i.description || i.qty; }).length;
    if (totalItems > validItems.length) {
      var droppedCount = totalItems - validItems.length;
      dispatch({ type: 'SHOW_TOAST', payload: { message: droppedCount + ' incomplete item(s) were removed. Only ' + validItems.length + ' valid item(s) will be saved.', type: 'warning' } });
    }

    isSubmittingIndent.current = true;

    // A file attached to "Item N" follows that item (by its position on the form)
    const validWithIndex = validItems.map(function(vi) { return { item: vi, formIndex: items.indexOf(vi), id: genUUID() }; });
    const idByFormIndex = {};
    validWithIndex.forEach(function(v) { idByFormIndex[v.formIndex] = v.id; });

    const indent = {
      id: genUUID(),
      siteId: siteId,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      status: status,
      priority: priority,
      requiredDate: requiredDate || null,
      remarks: remarks,
      lineItems: validWithIndex.map(({ item: i, id }) => ({
        id: id,
        boqId: i.boqId || null,
        name: i.name || i.description,
        description: i.description || i.name,
        qty: parseFloat(i.qty),
        unit: i.unit || '',
        hsn: i.hsn || '',
        remarks: i.remarks,
        received: 0,
        isBoqItem: i.isBoqItem || false,
        boqReference: i.boqReference || '',
      })),
      comments: [],
      activityLog: [createActivityLogEntry(
        status === 'pending_approval' ? 'Created and Submitted' : 'Created as Draft',
        user.id
      )],
    };

    const finish = function(docs) {
      indent.documents = docs.map(function(d) { d.uploadedBy = user.id; return d; });
      dispatch({ type: 'CREATE_INDENT', payload: indent });
      dispatch({ type: 'SHOW_TOAST', payload: { message: status === 'pending_approval' ? 'Indent submitted for approval' : 'Draft saved', type: 'success' } });
      window.location.hash = '#my-indents';
      setTimeout(function() { isSubmittingIndent.current = false; }, 2000);
    };

    if (attachments.length === 0) { finish([]); return; }

    // Upload the files first; the indent is saved only if every upload worked
    setUploading(true);
    const lineIds = items.map(function(_, formIndex) { return idByFormIndex[formIndex] || null; });
    uploadPickedFiles(indent.id, attachments, lineIds).then(function(docs) {
      setUploading(false);
      finish(docs);
    }).catch(function(err) {
      setUploading(false);
      isSubmittingIndent.current = false;
      dispatch({ type: 'SHOW_TOAST', payload: { message: (err.message || 'Could not upload the attachments') + '. The indent was not saved.', type: 'error' } });
    });
  };

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' };

  return React.createElement('div', { style: { padding: 24, maxWidth: 900, margin: '0 auto' } },
    React.createElement('h2', {
      style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 24 }
    }, 'Create New Indent'),

    React.createElement('div', {
      style: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 24,
      }
    },
      React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16 }
      },
        React.createElement('div', null,
          React.createElement('label', { style: labelStyle }, 'Site *'),
          React.createElement('select', {
            value: siteId, onChange: e => setSiteId(e.target.value),
            style: inputStyle,
          },
            React.createElement('option', { value: '' }, 'Select site...'),
            availableSites.map(s =>
              React.createElement('option', { key: s.id, value: s.id }, s.name)
            )
          )
        ),
        React.createElement('div', null,
          React.createElement('label', { style: labelStyle }, 'Priority'),
          React.createElement('select', {
            value: priority, onChange: e => setPriority(e.target.value),
            style: inputStyle,
          },
            React.createElement('option', { value: 'urgent' }, 'Urgent'),
            React.createElement('option', { value: 'normal' }, 'Normal'),
            React.createElement('option', { value: 'low' }, 'Low')
          )
        ),
        React.createElement('div', null,
          React.createElement('label', { style: labelStyle }, 'Required Date'),
          React.createElement('input', {
            type: 'date', value: requiredDate, onChange: e => setRequiredDate(e.target.value),
            min: new Date().toISOString().split('T')[0],
            style: inputStyle,
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { style: labelStyle }, 'Remarks'),
          React.createElement('input', {
            value: remarks, onChange: e => setRemarks(e.target.value),
            placeholder: 'Optional remarks',
            style: inputStyle,
          })
        )
      )
    ),

    // Line items
    React.createElement('div', {
      style: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 24,
      }
    },
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }
      },
        React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b' } }, 'Line Items'),
        React.createElement('button', {
          onClick: addItem, type: 'button',
          style: {
            padding: '6px 16px', borderRadius: 8, border: '1px solid #6366f1',
            background: '#eef2ff', color: '#6366f1', fontWeight: 600,
            fontSize: 12, cursor: 'pointer',
          }
        }, '+ Add Item')
      ),

      items.map(function(item, idx) {
        var boqItems = siteId ? (state.boqLists[siteId] || []) : [];
        return React.createElement('div', {
          key: idx,
          style: { marginBottom: 12, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }
        },
          React.createElement('div', {
            style: { display: 'grid', gridTemplateColumns: '2fr 2fr 80px 80px 1fr 40px', gap: 8, alignItems: 'end' }
          },
            React.createElement('div', null,
              idx === 0 && React.createElement('label', { style: labelStyle }, 'Material *'),
              React.createElement('input', {
                list: 'chest-items-' + idx,
                value: item.name,
                onChange: function(e) {
                  var val = e.target.value;
                  var matchedBoq = boqItems.find(function(b) {
                    return b.name === val || (b.name + ' [HSN: ' + b.hsn + '] (' + b.unit + ')') === val;
                  });
                  if (matchedBoq) {
                    var updated = [...items];
                    updated[idx] = { ...updated[idx], name: matchedBoq.name, boqId: matchedBoq.id, unit: matchedBoq.unit, hsn: matchedBoq.hsn || '' };
                    setItems(updated);
                  } else {
                    updateItem(idx, 'name', val);
                  }
                },
                placeholder: 'Type or select material...',
                style: inputStyle,
              }),
              React.createElement('datalist', { id: 'chest-items-' + idx },
                boqItems.map(function(b) {
                  return React.createElement('option', { key: b.id, value: b.name + ' [HSN: ' + b.hsn + '] (' + b.unit + ')' });
                })
              )
            ),
            React.createElement('div', null,
              idx === 0 && React.createElement('label', { style: labelStyle }, 'Description'),
              React.createElement('input', {
                value: item.description, onChange: function(e) { updateItem(idx, 'description', e.target.value); },
                placeholder: 'Material description', style: inputStyle,
              })
            ),
            React.createElement('div', null,
              idx === 0 && React.createElement('label', { style: labelStyle }, 'Qty *'),
              React.createElement('input', {
                type: 'number', value: item.qty, onChange: function(e) {
                  var val = parseFloat(e.target.value);
                  if (val < 0) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'Quantity cannot be negative', type: 'error' } }); return; }
                  if (val > 999999) { dispatch({ type: 'SHOW_TOAST', payload: { message: 'Quantity too large (max 999,999)', type: 'error' } }); return; }
                  updateItem(idx, 'qty', e.target.value);
                },
                placeholder: 'Qty', style: inputStyle, min: 1, max: 999999, step: 'any',
              })
            ),
            React.createElement('div', null,
              idx === 0 && React.createElement('label', { style: labelStyle }, 'Unit'),
              React.createElement('select', {
                value: item.unit || '', onChange: function(e) { updateItem(idx, 'unit', e.target.value); },
                style: inputStyle,
              },
                unitOptionElements(item.unit)
              )
            ),
            React.createElement('div', null,
              idx === 0 && React.createElement('label', { style: labelStyle }, 'Remarks'),
              React.createElement('input', {
                value: item.remarks, onChange: function(e) { updateItem(idx, 'remarks', e.target.value); },
                placeholder: 'Item remarks', style: inputStyle,
              })
            ),
            React.createElement('div', null,
              items.length > 1 && React.createElement('button', {
                onClick: function() { removeItem(idx); }, type: 'button',
                style: {
                  width: 32, height: 32, borderRadius: 8, border: '1px solid #fca5a5',
                  background: '#fee2e2', color: '#dc2626', fontWeight: 700,
                  fontSize: 16, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }
              }, '×')
            )
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 } },
            React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' } },
              React.createElement('input', {
                type: 'checkbox', checked: item.isBoqItem || false,
                onChange: function(e) { updateItem(idx, 'isBoqItem', e.target.checked); },
              }),
              'BOQ Item'
            ),
            item.isBoqItem && React.createElement('div', { style: { flex: 1 } },
              React.createElement('input', {
                value: item.boqReference || '',
                onChange: function(e) { updateItem(idx, 'boqReference', e.target.value); },
                placeholder: 'BOQ Reference / Serial Number',
                style: { ...inputStyle, maxWidth: 300 },
              })
            )
          )
        );
      })
    ),

    React.createElement(AttachmentPicker, { files: attachments, setFiles: setAttachments, items: items }),

    // Action buttons
    React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' } },
      uploading && React.createElement('span', { style: { fontSize: 13, color: '#64748b' } }, 'Uploading attachments...'),
      React.createElement('button', {
        onClick: () => handleSubmit('draft'), disabled: uploading,
        style: {
          padding: '10px 24px', borderRadius: 8, border: '1px solid #d1d5db',
          background: '#fff', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }
      }, 'Save as Draft'),
      React.createElement('button', {
        onClick: () => handleSubmit('pending_approval'), disabled: uploading,
        style: {
          padding: '10px 24px', borderRadius: 8, border: 'none',
          background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }
      }, 'Submit for Approval')
    )
  );
}

// ─────────────────────────────────────────────
// 15. ReviseIndentScreen
// ─────────────────────────────────────────────
function ReviseIndentScreen({ indentId }) {
  const [state, dispatch] = useContext(AppContext);
  const indent = state.indents.find(i => i.id === indentId);
  const user = state.currentUser;

  const [items, setItems] = useState(
    indent ? (indent.lineItems || []).map(i => ({ ...i, qty: String(i.qty) })) : []
  );
  const [remarks, setRemarks] = useState(indent ? indent.remarks || '' : '');
  const [priority, setPriority] = useState(indent ? indent.priority || 'normal' : 'normal');

  if (!indent) {
    return React.createElement('div', { style: { padding: 32 } },
      React.createElement('h2', null, 'Indent not found')
    );
  }

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    setItems(updated);
  };

  const addItem = () => {
    setItems([...items, { description: '', qty: '', unit: '', remarks: '' }]);
  };

  const removeItem = (idx) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    const validItems = items.filter(i => i.description && i.qty && parseFloat(i.qty) > 0);
    if (validItems.length === 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Add at least one item with a description and a quantity', type: 'error' } });
      return;
    }
    if (validItems.some(i => !i.unit)) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Select a unit for every item', type: 'error' } });
      return;
    }

    dispatch({
      type: 'REVISE_RESUBMIT',
      payload: {
        indentId: indent.id,
        lineItems: validItems.map((i, idx) => ({
          ...i,
          id: i.id || genUUID(),
          qty: parseFloat(i.qty),
          received: i.received || 0,
        })),
        priority: priority,
        remarks: remarks,
        revisedBy: user.id,
      }
    });
    dispatch({ type: 'SHOW_TOAST', payload: { message: 'Indent revised and resubmitted', type: 'success' } });
    window.location.hash = '#my-indents';
  };

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' };

  return React.createElement('div', { style: { padding: 24, maxWidth: 900, margin: '0 auto' } },
    React.createElement('h2', {
      style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 8 }
    }, 'Revise Indent: ' + getIndentDisplayId(indent, state.indents)),
    React.createElement('p', {
      style: { color: '#dc2626', fontSize: 13, marginBottom: 24 }
    }, indent.status === 'returned_for_revision'
      ? 'This indent was returned for revision. Please update and resubmit.'
      : 'This indent was rejected. Please revise and resubmit.'),
    (indent.mdEscalationResult === 'dismissed' && indent.mdRemarks) ? React.createElement('p', {
      style: { color: '#64748b', fontSize: 13, marginBottom: 16, fontStyle: 'italic' }
    }, 'MD remarks: ' + indent.mdRemarks)
    : ((indent.returnReason || indent.rejectionReason) && React.createElement('p', {
      style: { color: '#64748b', fontSize: 13, marginBottom: 16, fontStyle: 'italic' }
    }, 'Reason: ' + (indent.status === 'returned_for_revision' ? (indent.returnReason || indent.rejectionReason) : indent.rejectionReason))),

    React.createElement('div', {
      style: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 24,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
      }
    },
      React.createElement('div', null,
        React.createElement('label', { style: labelStyle }, 'Priority'),
        React.createElement('select', {
          value: priority, onChange: e => setPriority(e.target.value),
          style: inputStyle,
        },
          React.createElement('option', { value: 'urgent' }, 'Urgent'),
          React.createElement('option', { value: 'normal' }, 'Normal'),
          React.createElement('option', { value: 'low' }, 'Low')
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { style: labelStyle }, 'Remarks'),
        React.createElement('input', {
          value: remarks, onChange: e => setRemarks(e.target.value),
          style: inputStyle,
        })
      )
    ),

    React.createElement('div', {
      style: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 24,
      }
    },
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }
      },
        React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b' } }, 'Line Items'),
        React.createElement('button', {
          onClick: addItem, type: 'button',
          style: {
            padding: '6px 16px', borderRadius: 8, border: '1px solid #6366f1',
            background: '#eef2ff', color: '#6366f1', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }
        }, '+ Add Item')
      ),
      items.map((item, idx) =>
        React.createElement('div', {
          key: idx,
          style: { display: 'grid', gridTemplateColumns: '2fr 80px 80px 1fr 40px', gap: 8, marginBottom: 8, alignItems: 'end' }
        },
          React.createElement('div', null,
            idx === 0 && React.createElement('label', { style: labelStyle }, 'Description'),
            React.createElement('input', {
              value: item.description, onChange: e => updateItem(idx, 'description', e.target.value),
              style: inputStyle,
            })
          ),
          React.createElement('div', null,
            idx === 0 && React.createElement('label', { style: labelStyle }, 'Qty'),
            React.createElement('input', {
              type: 'number', value: item.qty, onChange: e => updateItem(idx, 'qty', e.target.value),
              style: inputStyle, min: 0, step: 'any',
            })
          ),
          React.createElement('div', null,
            idx === 0 && React.createElement('label', { style: labelStyle }, 'Unit'),
            React.createElement('select', {
              value: item.unit || '', onChange: e => updateItem(idx, 'unit', e.target.value),
              style: inputStyle, 'aria-label': 'Unit',
            }, unitOptionElements(item.unit))
          ),
          React.createElement('div', null,
            idx === 0 && React.createElement('label', { style: labelStyle }, 'Remarks'),
            React.createElement('input', {
              value: item.remarks || '', onChange: e => updateItem(idx, 'remarks', e.target.value),
              style: inputStyle,
            })
          ),
          React.createElement('div', null,
            items.length > 1 && React.createElement('button', {
              onClick: () => removeItem(idx), type: 'button',
              style: {
                width: 32, height: 32, borderRadius: 8, border: '1px solid #fca5a5',
                background: '#fee2e2', color: '#dc2626', fontWeight: 700,
                fontSize: 16, cursor: 'pointer',
              }
            }, '×')
          )
        )
      )
    ),

    React.createElement('div', { style: { marginBottom: 24 } },
      React.createElement(DocumentsSection, { indent: indent, embedded: true })),

    React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'flex-end' } },
      React.createElement('button', {
        onClick: () => window.history.back(),
        style: {
          padding: '10px 24px', borderRadius: 8, border: '1px solid #d1d5db',
          background: '#fff', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }
      }, 'Cancel'),
      React.createElement('button', {
        onClick: handleSubmit,
        style: {
          padding: '10px 24px', borderRadius: 8, border: 'none',
          background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }
      }, 'Resubmit')
    )
  );
}

// ─────────────────────────────────────────────
// 16. EditDraftScreen (unchanged)
// ─────────────────────────────────────────────
function EditDraftScreen({ indentId }) {
  const [state, dispatch] = useContext(AppContext);
  const indent = state.indents.find(i => i.id === indentId);
  const user = state.currentUser;

  const [items, setItems] = useState(
    indent ? (indent.lineItems || []).map(i => ({ ...i, qty: String(i.qty) })) : []
  );
  const [remarks, setRemarks] = useState(indent ? indent.remarks || '' : '');
  const [priority, setPriority] = useState(indent ? indent.priority || 'normal' : 'normal');

  if (!indent || indent.status !== 'draft') {
    return React.createElement('div', { style: { padding: 32 } },
      React.createElement('h2', null, 'Draft not found or already submitted')
    );
  }

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    setItems(updated);
  };

  const addItem = () => {
    setItems([...items, { description: '', qty: '', unit: '', remarks: '' }]);
  };

  const removeItem = (idx) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSave = (status) => {
    const validItems = items.filter(i => i.description && i.qty && parseFloat(i.qty) > 0);
    if (validItems.length === 0) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Add at least one item with a description and a quantity', type: 'error' } });
      return;
    }
    if (status === 'pending_approval' && validItems.some(i => !i.unit)) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Select a unit for every item', type: 'error' } });
      return;
    }

    dispatch({
      type: 'UPDATE_DRAFT',
      payload: {
        id: indent.id,
        status: status,
        priority: priority,
        remarks: remarks,
        lineItems: validItems.map((i, idx) => ({ ...i, id: i.id || genUUID(), qty: parseFloat(i.qty), received: i.received || 0 })),
      }
    });

    dispatch({ type: 'SHOW_TOAST', payload: { message: status === 'pending_approval' ? 'Indent submitted for approval' : 'Draft saved', type: 'success' } });
    window.location.hash = '#my-indents';
  };

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: 8,
    border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' };

  return React.createElement('div', { style: { padding: 24, maxWidth: 900, margin: '0 auto' } },
    React.createElement('h2', {
      style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 24 }
    }, 'Edit Draft: ' + getIndentDisplayId(indent, state.indents)),

    React.createElement('div', {
      style: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 24,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
      }
    },
      React.createElement('div', null,
        React.createElement('label', { style: labelStyle }, 'Priority'),
        React.createElement('select', {
          value: priority, onChange: e => setPriority(e.target.value),
          style: inputStyle,
        },
          React.createElement('option', { value: 'urgent' }, 'Urgent'),
          React.createElement('option', { value: 'normal' }, 'Normal'),
          React.createElement('option', { value: 'low' }, 'Low')
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { style: labelStyle }, 'Remarks'),
        React.createElement('input', {
          value: remarks, onChange: e => setRemarks(e.target.value),
          style: inputStyle,
        })
      )
    ),

    React.createElement('div', {
      style: {
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: 24, marginBottom: 24,
      }
    },
      React.createElement('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }
      },
        React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b' } }, 'Line Items'),
        React.createElement('button', {
          onClick: addItem, type: 'button',
          style: {
            padding: '6px 16px', borderRadius: 8, border: '1px solid #6366f1',
            background: '#eef2ff', color: '#6366f1', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }
        }, '+ Add Item')
      ),
      items.map((item, idx) =>
        React.createElement('div', {
          key: idx,
          style: { display: 'grid', gridTemplateColumns: '2fr 80px 80px 1fr 40px', gap: 8, marginBottom: 8, alignItems: 'end' }
        },
          React.createElement('div', null,
            idx === 0 && React.createElement('label', { style: labelStyle }, 'Description'),
            React.createElement('input', {
              value: item.description, onChange: e => updateItem(idx, 'description', e.target.value),
              style: inputStyle,
            })
          ),
          React.createElement('div', null,
            idx === 0 && React.createElement('label', { style: labelStyle }, 'Qty'),
            React.createElement('input', {
              type: 'number', value: item.qty, onChange: e => updateItem(idx, 'qty', e.target.value),
              style: inputStyle, min: 0, step: 'any',
            })
          ),
          React.createElement('div', null,
            idx === 0 && React.createElement('label', { style: labelStyle }, 'Unit'),
            React.createElement('select', {
              value: item.unit || '', onChange: e => updateItem(idx, 'unit', e.target.value),
              style: inputStyle, 'aria-label': 'Unit',
            }, unitOptionElements(item.unit))
          ),
          React.createElement('div', null,
            idx === 0 && React.createElement('label', { style: labelStyle }, 'Remarks'),
            React.createElement('input', {
              value: item.remarks || '', onChange: e => updateItem(idx, 'remarks', e.target.value),
              style: inputStyle,
            })
          ),
          React.createElement('div', null,
            items.length > 1 && React.createElement('button', {
              onClick: () => removeItem(idx), type: 'button',
              style: {
                width: 32, height: 32, borderRadius: 8, border: '1px solid #fca5a5',
                background: '#fee2e2', color: '#dc2626', fontWeight: 700,
                fontSize: 16, cursor: 'pointer',
              }
            }, '×')
          )
        )
      )
    ),

    React.createElement('div', { style: { marginBottom: 24 } },
      React.createElement(DocumentsSection, { indent: indent, embedded: true })),

    React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'flex-end' } },
      React.createElement('button', {
        onClick: () => { window.location.hash = '#my-indents'; },
        style: {
          padding: '10px 24px', borderRadius: 8, border: '1px solid #d1d5db',
          background: '#fff', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }
      }, 'Cancel'),
      React.createElement('button', {
        onClick: () => handleSave('draft'),
        style: {
          padding: '10px 24px', borderRadius: 8, border: '1px solid #d1d5db',
          background: '#fff', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }
      }, 'Save Draft'),
      React.createElement('button', {
        onClick: () => handleSave('pending_approval'),
        style: {
          padding: '10px 24px', borderRadius: 8, border: 'none',
          background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }
      }, 'Submit')
    )
  );
}
