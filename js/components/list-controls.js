
// =============================================================================
// Shared list tools: search + sort bar, unit list, file attachments, PO limit
// Loaded after shell.js and before the screens.
// =============================================================================

// ── Search ───────────────────────────────────────────────────────────────────
// Plain text finds anything containing it. A star is a wildcard:
//   *33   ends with 33        IND-0*   starts with IND-0        *cem*   contains cem
function textMatches(value, term) {
  var v = String(value === null || value === undefined ? '' : value).toLowerCase();
  var t = String(term || '').trim().toLowerCase();
  if (!t) return true;
  if (t.indexOf('*') !== -1) {
    var parts = t.split('*').map(function(p) { return p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); });
    try { return new RegExp('^' + parts.join('.*') + '$').test(v); } catch (e) { return false; }
  }
  return v.indexOf(t) !== -1;
}

// A date is searchable the ways people type it: 18/11/2026, 18-11-2026, 2026-11-18, 18 Nov 2026
function dateSearchStrings(value) {
  if (!value) return [];
  var d = new Date(value);
  if (isNaN(d.getTime())) return [String(value)];
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var yyyy = d.getFullYear();
  var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return [dd + '/' + mm + '/' + yyyy, dd + '-' + mm + '-' + yyyy, yyyy + '-' + mm + '-' + dd,
          dd + ' ' + mon + ' ' + yyyy, d.getDate() + ' ' + mon + ' ' + yyyy, d.getDate() + '/' + (d.getMonth() + 1) + '/' + yyyy];
}

function fieldSearchStrings(field, row) {
  var val = field.get(row);
  if (field.type === 'date') return dateSearchStrings(val);
  if (Array.isArray(val)) return val.filter(function(x) { return x !== null && x !== undefined && x !== ''; }).map(String);
  if (val === null || val === undefined) return [];
  return [String(val)];
}

function fieldSortValue(field, row) {
  var val = field.get(row);
  if (Array.isArray(val)) val = val.join(' ');
  if (field.order) return field.order[val] !== undefined ? field.order[val] : 99;
  if (field.type === 'number') return Number(val) || 0;
  if (field.type === 'date') { var t = val ? new Date(val).getTime() : 0; return isNaN(t) ? 0 : t; }
  return String(val === null || val === undefined ? '' : val).toLowerCase();
}

// useListControls(rows, fields, opts) -> { rows, bar }
//   fields: [{ key, label, get(row), type: 'text' | 'number' | 'date', order: {value: rank}, noSearch }]
//   opts:   { placeholder, defaultSort, defaultDir }
// "rows" comes back searched and sorted; "bar" is the search + sort strip to place above the list.
// Call it at the top of the component, before any early return (it uses React state).
function useListControls(rows, fields, opts) {
  opts = opts || {};
  var _term = useState('');
  var term = _term[0], setTerm = _term[1];
  var _key = useState(opts.defaultSort || '');
  var sortKey = _key[0], setSortKey = _key[1];
  var _dir = useState(opts.defaultDir || 'desc');
  var sortDir = _dir[0], setSortDir = _dir[1];

  var all = rows || [];
  var out = all;

  if (term.trim()) {
    out = out.filter(function(row) {
      return fields.some(function(f) {
        if (f.noSearch) return false;
        return fieldSearchStrings(f, row).some(function(s) { return textMatches(s, term); });
      });
    });
  }

  if (sortKey) {
    var sf = fields.find(function(f) { return f.key === sortKey; });
    if (sf) {
      var sign = sortDir === 'asc' ? 1 : -1;
      out = out.slice().sort(function(a, b) {
        var x = fieldSortValue(sf, a), y = fieldSortValue(sf, b);
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
        return String(x).localeCompare(String(y), undefined, { numeric: true }) * sign;
      });
    }
  }

  var ctl = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' };
  var bar = React.createElement('div', {
    className: 'list-controls no-print',
    style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px 0' }
  },
    React.createElement('input', {
      type: 'search', value: term,
      onChange: function(e) { setTerm(e.target.value); },
      placeholder: opts.placeholder || 'Search number, description, date…   (*33 finds numbers ending in 33)',
      'aria-label': 'Search this list',
      style: Object.assign({}, ctl, { flex: '1 1 260px', minWidth: 200 })
    }),
    React.createElement('label', { style: { fontSize: 12, color: '#64748b', fontWeight: 600 } }, 'Sort by'),
    React.createElement('select', {
      value: sortKey, onChange: function(e) { setSortKey(e.target.value); },
      'aria-label': 'Sort by', style: ctl
    },
      React.createElement('option', { value: '' }, 'Default order'),
      fields.map(function(f) { return React.createElement('option', { key: f.key, value: f.key }, f.label); })
    ),
    React.createElement('button', {
      type: 'button', disabled: !sortKey,
      onClick: function() { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); },
      title: 'Switch between ascending and descending',
      style: Object.assign({}, ctl, { cursor: sortKey ? 'pointer' : 'default', fontWeight: 600, color: sortKey ? '#1e293b' : '#94a3b8' })
    }, sortDir === 'asc' ? '↑ Ascending' : '↓ Descending'),
    React.createElement('span', { style: { fontSize: 12, color: '#64748b' } },
      term.trim() ? (out.length + ' of ' + all.length) : (all.length + (all.length === 1 ? ' record' : ' records')))
  );

  return { rows: out, bar: bar, term: term };
}

var STATUS_LABELS = {
  draft: 'Draft', pending_approval: 'Pending approval', approved: 'Approved', rejected: 'Rejected',
  returned_for_revision: 'Returned for revision', escalated_to_md: 'Escalated to MD',
  in_procurement: 'In procurement', po_draft: 'PO draft', pending_md_po_approval: 'PO with MD',
  po_approved: 'PO approved', po_issued: 'PO issued', dispatched: 'Dispatched', completed: 'Completed',
  cancelled: 'Cancelled', issued: 'Issued', partially_fulfilled: 'Partially fulfilled',
  fulfilled: 'Fulfilled', closed: 'Closed',
};
function statusLabel(status) { return STATUS_LABELS[status] || String(status || '').replace(/_/g, ' '); }

// Search / sort fields for any list of indents
function indentListFields(state) {
  return [
    { key: 'number', label: 'Indent number', get: function(i) { return getIndentDisplayId(i, state.indents); } },
    { key: 'created', label: 'Created date', type: 'date', get: function(i) { return i.createdAt; } },
    { key: 'required', label: 'Required date', type: 'date', get: function(i) { return i.requiredDate; } },
    { key: 'items', label: 'Number of items', type: 'number', noSearch: true, get: function(i) { return (i.lineItems || []).length; } },
    { key: 'status', label: 'Status', get: function(i) { return [statusLabel(i.status), i.status]; } },
    { key: 'priority', label: 'Priority', order: { urgent: 0, normal: 1, low: 2 }, get: function(i) { return i.priority || 'normal'; } },
    { key: 'site', label: 'Site', get: function(i) { return getSiteName(i.siteId, state.sites); } },
    { key: 'by', label: 'Created by', get: function(i) { return getUserName(i.createdBy, state.users); } },
    { key: 'desc', label: 'Description', get: function(i) {
        return [i.remarks, i.description].concat((i.lineItems || []).map(function(l) { return l.description || l.name; }));
      } },
  ];
}

// Search / sort fields for any list of purchase orders
function poListFields(state) {
  var indentOf = function(po) { return (state.indents || []).find(function(i) { return i.id === po.indentId; }); };
  return [
    { key: 'number', label: 'PO number', get: function(po) { return getPODisplayId(po); } },
    { key: 'indent', label: 'Indent number', get: function(po) { var i = indentOf(po); return i ? getIndentDisplayId(i, state.indents) : ''; } },
    { key: 'created', label: 'Created date', type: 'date', get: function(po) { return po.createdAt; } },
    { key: 'delivery', label: 'Delivery date', type: 'date', get: function(po) { return po.deliveryDate; } },
    { key: 'value', label: 'Value', type: 'number', get: function(po) { return po.totalAmount || 0; } },
    { key: 'items', label: 'Number of items', type: 'number', noSearch: true, get: function(po) { return (po.lineItems || []).length; } },
    { key: 'status', label: 'Status', get: function(po) { return [statusLabel(po.status), po.status]; } },
    { key: 'vendor', label: 'Vendor', get: function(po) { return po.vendorName || ''; } },
    { key: 'desc', label: 'Description', get: function(po) {
        return [po.notes].concat((po.lineItems || []).map(function(l) { return l.description || l.name; }));
      } },
  ];
}

// ── Units: one list for every screen ─────────────────────────────────────────
var UNIT_OPTIONS = [
  ['Bags', 'Bags'], ['MT', 'MT (Metric Ton)'], ['Kg', 'Kg'], ['Cu.M', 'Cu.M (Cubic Metre)'],
  ['Sqm', 'Sqm (Square Metre)'], ['Rmt', 'Rmt (Running Metre)'], ['Nos', 'Nos (Numbers)'],
  ['Ltrs', 'Ltrs (Litres)'], ['Set', 'Set'], ['Pair', 'Pair'], ['Box', 'Box'], ['Roll', 'Roll'],
  ['Bundle', 'Bundle'], ['Sheet', 'Sheet'], ['Feet', 'Feet'], ['Inch', 'Inch'], ['Trip', 'Trip'],
  ['Load', 'Load'], ['LS', 'LS (Lump Sum)'],
];

// Options for a unit <select>. Keeps a unit that is not on the list (older records, BOQ units).
function unitOptionElements(current) {
  var known = UNIT_OPTIONS.some(function(u) { return u[0] === current; });
  var els = [React.createElement('option', { key: '_', value: '' }, 'Select unit...')];
  if (current && !known) els.push(React.createElement('option', { key: current, value: current }, current));
  UNIT_OPTIONS.forEach(function(u) { els.push(React.createElement('option', { key: u[0], value: u[0] }, u[1])); });
  return els;
}

// ── Attachments (drawings, shop drawings, sketches) ──────────────────────────
var ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.dwg,.dxf,.xls,.xlsx,.doc,.docx';
var ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
var ATTACHMENT_CATEGORIES = ['Drawing', 'Shop Drawing', 'Sketch', 'Specification', 'Photo', 'Quotation', 'Comparative Statement',
                             'Purchase Order', 'Proforma Invoice', 'Estimate', 'Delivery Challan', 'Other'];

// Uploads one file to the private "indent-docs" bucket and returns the document record.
async function uploadIndentFile(indentId, file, category, lineItemId, poId) {
  if (file.size > ATTACHMENT_MAX_BYTES) throw new Error(file.name + ' is larger than 15 MB');
  var docId = genUUID();
  var safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  var path = indentId + '/' + docId + '-' + safeName;
  var res = await supabaseClient.storage.from('indent-docs').upload(path, file, { contentType: file.type || undefined });
  if (res.error) throw new Error('Could not upload ' + file.name + ': ' + res.error.message);
  return {
    id: docId, name: file.name, category: category || 'Drawing', storagePath: path,
    size: file.size, mimeType: file.type || '', lineItemId: lineItemId || null, poId: poId || null,
    uploadedAt: new Date().toISOString(),
  };
}

// Opens a stored document in a new tab through a short-lived link.
async function openIndentDocument(doc, dispatch) {
  var fail = function(msg) { if (dispatch) dispatch({ type: 'SHOW_TOAST', payload: { message: msg, type: 'error' } }); };
  var path = doc.storagePath || '';
  if (!path || path.indexOf('/uploads/') === 0) { fail('This file is not available (it was recorded without the file itself)'); return; }
  if (path.indexOf('data:') === 0 || /^https?:/.test(path)) { window.open(path, '_blank'); return; }
  var tab = window.open('', '_blank');
  var res = await supabaseClient.storage.from('indent-docs').createSignedUrl(path, 600);
  if (res.error || !res.data || !res.data.signedUrl) {
    if (tab) tab.close();
    fail('Could not open the file: ' + ((res.error && res.error.message) || 'no link returned'));
    return;
  }
  if (tab) tab.location.href = res.data.signedUrl; else window.location.href = res.data.signedUrl;
}

// File chooser used on the "create indent" screens, before the indent exists.
//   files / setFiles: [{ file, category, itemIndex }]   (itemIndex '' = whole indent)
//   items: the line items on the form, to offer "applies to item N"
function AttachmentPicker(props) {
  var files = props.files || [];
  var setFiles = props.setFiles;
  var items = props.items || [];
  var categories = props.categories || ATTACHMENT_CATEGORIES.slice(0, 5).concat(['Other']);
  var defaultCategory = props.defaultCategory || categories[0];
  var hideItems = !!props.hideItems;
  var _st = useContext(AppContext);
  var dispatch = _st[1];
  var inputRef = useRef(null);

  var onPick = function(e) {
    var picked = Array.prototype.slice.call(e.target.files || []);
    var ok = [];
    picked.forEach(function(f) {
      if (f.size > ATTACHMENT_MAX_BYTES) {
        dispatch({ type: 'SHOW_TOAST', payload: { message: f.name + ' is larger than 15 MB and was not added', type: 'error' } });
      } else {
        ok.push({ file: f, category: defaultCategory, itemIndex: '' });
      }
    });
    if (ok.length) setFiles(files.concat(ok));
    if (inputRef.current) inputRef.current.value = '';
  };
  var update = function(idx, field, value) {
    setFiles(files.map(function(f, i) { var c = Object.assign({}, f); if (i === idx) c[field] = value; return c; }));
  };
  var remove = function(idx) { setFiles(files.filter(function(_, i) { return i !== idx; })); };

  var sel = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' };

  return React.createElement('div', {
    style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, marginBottom: 24 }
  },
    React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 } }, props.title || 'Attachments'),
    React.createElement('p', { style: { fontSize: 12, color: '#64748b', marginBottom: 12 } },
      props.help || 'Optional. Drawings, shop drawings, hand sketches, photos or specifications (PDF, image, DWG, Excel, Word; up to 15 MB each).'),
    React.createElement('input', {
      ref: inputRef, type: 'file', multiple: true, accept: ATTACHMENT_ACCEPT, onChange: onPick,
      'aria-label': 'Add attachments', style: { fontSize: 13, marginBottom: files.length ? 12 : 0 }
    }),
    files.map(function(f, idx) {
      return React.createElement('div', {
        key: idx,
        style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid #f1f5f9' }
      },
        React.createElement('span', { style: { flex: '1 1 200px', fontSize: 13, fontWeight: 600, color: '#1e293b', wordBreak: 'break-all' } },
          '📎 ' + f.file.name + '  (' + (f.file.size / 1048576).toFixed(1) + ' MB)'),
        React.createElement('select', { value: f.category, onChange: function(e) { update(idx, 'category', e.target.value); }, style: sel, 'aria-label': 'Type of file' },
          categories.map(function(c) { return React.createElement('option', { key: c, value: c }, c); })),
        hideItems ? null : React.createElement('select', { value: f.itemIndex, onChange: function(e) { update(idx, 'itemIndex', e.target.value); }, style: sel, 'aria-label': 'Applies to' },
          React.createElement('option', { value: '' }, 'Whole indent'),
          items.map(function(it, i) {
            var label = it.name || it.description || '';
            return label ? React.createElement('option', { key: i, value: String(i) }, 'Item ' + (i + 1) + ': ' + label.slice(0, 40)) : null;
          })),
        React.createElement('button', {
          type: 'button', onClick: function() { remove(idx); },
          style: { padding: '4px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
        }, 'Remove')
      );
    })
  );
}

// Uploads everything chosen in an AttachmentPicker. lineItemIds[i] is the id of form item i.
async function uploadPickedFiles(indentId, picked, lineItemIds, poId) {
  var docs = [];
  for (var i = 0; i < (picked || []).length; i++) {
    var p = picked[i];
    var itemId = (p.itemIndex !== '' && lineItemIds) ? (lineItemIds[Number(p.itemIndex)] || null) : null;
    docs.push(await uploadIndentFile(indentId, p.file, p.category, itemId, poId));
  }
  return docs;
}

// ── MD approval limit for purchase orders ────────────────────────────────────
function poApprovalLimit(state) {
  var raw = state && state.orgSettings ? state.orgSettings.poMdApprovalThreshold : null;
  var text = String(raw === null || raw === undefined ? '' : raw).replace(/[^0-9.]/g, '');
  if (text === '' || text === '.') return 50000;
  var n = Number(text);
  return isNaN(n) ? 50000 : n;   // 0 means every PO needs MD approval
}

// Value compared with the limit: this PO plus the other live POs on the same indent.
function poValueForLimit(po, state, totalOverride) {
  var own = totalOverride !== undefined ? totalOverride : (po.totalAmount || 0);
  var others = (state.purchaseOrders || []).filter(function(o) {
    return o.indentId && o.indentId === po.indentId && o.id !== po.id && o.status !== 'cancelled';
  }).reduce(function(s, o) { return s + (o.totalAmount || 0); }, 0);
  return own + others;
}

function poNeedsMD(po, state, totalOverride) {
  return poValueForLimit(po, state, totalOverride) > poApprovalLimit(state);
}

function formatRs(n) { return 'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }

// What is still missing before a PO can be submitted or issued (same checks as the database).
var QUOTE_CATEGORIES = ['Quotation', 'Comparative Statement', 'Proforma Invoice', 'Estimate'];

// Quotation files attached to a PO
function poQuoteDocs(po, state) {
  var indent = ((state && state.indents) || []).find(function(i) { return i.id === po.indentId; });
  return indent ? (indent.documents || []).filter(function(d) { return d.poId === po.id; }) : [];
}

// Pass state so the quotation rule can be checked too.
function poMissingFields(po, state) {
  var missing = [];
  if (!po.vendorId) missing.push('vendor');
  if (!po.deliveryDate) missing.push('delivery date');
  if (!String(po.notes || '').trim()) missing.push('remarks');
  var items = po.lineItems || [];
  if (state && !String(po.noQuoteReason || '').trim()
      && !poQuoteDocs(po, state).some(function(d) { return QUOTE_CATEGORIES.indexOf(d.category) !== -1; })) {
    missing.push('a quotation (or a declaration that none is available)');
  }
  if (items.length === 0) missing.push('at least one item');
  items.forEach(function(li) {
    var name = li.description || li.name || 'item';
    if (!(Number(li.quantity || li.qty) > 0)) missing.push('quantity for "' + name + '"');
    if (!(Number(li.rate !== undefined ? li.rate : li.unitPrice) > 0)) missing.push('rate for "' + name + '"');
  });
  return missing;
}
