
// =============================================================================
// Local / emergency purchases, and purchase orders raised without an indent
// =============================================================================

var LOCAL_PAYMENT_MODES = [
  'Cash from site imprest',
  'Paid personally, to be reimbursed',
  'UPI / bank transfer by the company',
  'On credit with the shop',
];
var GST_RATES = [0, 5, 12, 18, 28];

function localPurchaseLimit(state) {
  var raw = state && state.orgSettings ? state.orgSettings.localPurchaseLimit : null;
  var text = String(raw === null || raw === undefined ? '' : raw).replace(/[^0-9.]/g, '');
  var n = Number(text);
  return (text === '' || isNaN(n)) ? 10000 : n;
}

function lineAmount(it) {
  var q = parseFloat(it.quantity) || 0, r = parseFloat(it.rate) || 0, g = parseFloat(it.gstPercent) || 0;
  return Math.round(q * r * (1 + g / 100) * 100) / 100;
}

// Which local purchases this user sees: their sites for site staff and PMs,
// everything for procurement, the MD and admin.
function visibleLocalPurchases(state) {
  var user = state.currentUser || {};
  var all = state.localPurchases || [];
  if (['procurement_manager', 'procurement_clerk', 'md', 'admin'].indexOf(user.role) !== -1) return all;
  var siteIds = (state.siteAssignments || {})[state.currentUserId] || [];
  return all.filter(function(lp) { return siteIds.indexOf(lp.siteId) !== -1 || lp.createdBy === state.currentUserId; });
}

function localPurchaseFields(state) {
  return [
    { key: 'number', label: 'Number', id: true, get: function(lp) { return lp.lpNumber; } },
    { key: 'created', label: 'Recorded date', type: 'date', get: function(lp) { return lp.createdAt; } },
    { key: 'bill', label: 'Bill date', type: 'date', get: function(lp) { return lp.billDate; } },
    { key: 'value', label: 'Value', type: 'number', get: function(lp) { return lp.totalAmount; } },
    { key: 'items', label: 'Number of items', type: 'number', noSearch: true, get: function(lp) { return (lp.items || []).length; } },
    { key: 'status', label: 'Status', get: function(lp) { return [statusLabel(lp.status), lp.status]; } },
    { key: 'site', label: 'Site', get: function(lp) { return getSiteName(lp.siteId, state.sites); } },
    { key: 'vendor', label: 'Shop / vendor', get: function(lp) { return lp.vendorName; } },
    { key: 'by', label: 'Recorded by', get: function(lp) { return getUserName(lp.createdBy, state.users); } },
    { key: 'desc', label: 'Description', get: function(lp) {
        return [lp.reason, lp.billNumber].concat((lp.items || []).map(function(i) { return i.description; }));
      } },
  ];
}

// ── List ─────────────────────────────────────────────────────────────────────
function LocalPurchasesScreen() {
  var _ctx = useContext(AppContext);
  var state = _ctx[0];
  var user = state.currentUser || {};
  var canRecord = user.role === 'storekeeper' || user.role === 'procurement_manager' || user.role === 'admin';
  var mine = visibleLocalPurchases(state);
  var list = useListControls(mine, localPurchaseFields(state));
  var waiting = mine.filter(function(lp) { return lp.status === 'pending_approval'; }).length;
  var th = { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 700 };
  var td = { padding: '12px 16px' };

  return React.createElement('div', { style: { padding: 24 } },
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
      React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b' } }, 'Local Purchases'),
      canRecord ? React.createElement('a', { href: '#local-purchase-new', className: 'btn btn-primary', style: { textDecoration: 'none' } }, '+ Record a Local Purchase') : null
    ),
    React.createElement('p', { style: { fontSize: 13, color: '#64748b', marginBottom: 16 } },
      'Small or urgent material bought at site without an indent, recorded afterwards with the bill. Up to ' + formatRs(localPurchaseLimit(state)) +
      ' each; approved by the site\'s project manager. ' + (waiting ? waiting + ' waiting for approval.' : '')),
    mine.length > 0 ? list.bar : null,
    React.createElement('div', { style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' } },
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
        React.createElement('thead', null,
          React.createElement('tr', { style: { background: '#f8fafc' } },
            ['Number', 'Site', 'Shop / Vendor', 'Bill', 'Items', 'Value', 'Status', 'Recorded By', 'Recorded'].map(function(h) {
              return React.createElement('th', { key: h, style: th }, h);
            })
          )
        ),
        React.createElement('tbody', null,
          list.rows.length === 0
            ? React.createElement('tr', null, React.createElement('td', { colSpan: 9, style: { padding: 40, textAlign: 'center', color: '#94a3b8' } },
                mine.length === 0 ? 'No local purchases recorded yet' : 'No local purchases match your search'))
            : list.rows.map(function(lp) {
                return React.createElement('tr', {
                  key: lp.id, style: { borderBottom: '1px solid #f1f5f9', cursor: 'pointer' },
                  onClick: function() { window.location.hash = '#local-purchase/' + lp.id; }
                },
                  React.createElement('td', { style: Object.assign({}, td, { fontWeight: 600, color: '#6366f1' }) }, lp.lpNumber),
                  React.createElement('td', { style: td }, getSiteName(lp.siteId, state.sites)),
                  React.createElement('td', { style: td }, lp.vendorName),
                  React.createElement('td', { style: td }, lp.billNumber + (lp.billDate ? ', ' + new Date(lp.billDate).toLocaleDateString('en-IN') : '')),
                  React.createElement('td', { style: td }, (lp.items || []).length),
                  React.createElement('td', { style: Object.assign({}, td, { fontWeight: 600 }) }, formatRs(lp.totalAmount)),
                  React.createElement('td', { style: td }, React.createElement(StatusBadge, { status: lp.status })),
                  React.createElement('td', { style: td }, getUserName(lp.createdBy, state.users)),
                  React.createElement('td', { style: Object.assign({}, td, { color: '#64748b' }) }, new Date(lp.createdAt).toLocaleDateString('en-IN'))
                );
              })
        )
      )
    )
  );
}

// ── Record a new one ─────────────────────────────────────────────────────────
function LocalPurchaseNewScreen() {
  var _ctx = useContext(AppContext);
  var state = _ctx[0], dispatch = _ctx[1];
  var user = state.currentUser || {};
  var sites = user.role === 'storekeeper' ? getUserSites(state.currentUserId, state.sites, state.siteAssignments) : (state.sites || []);
  var blankItem = function() { return { description: '', quantity: '', unit: 'Nos', rate: '', gstPercent: 0 }; };

  var _f = useState(function() {
    return { siteId: sites.length === 1 ? sites[0].id : '', vendorId: '', vendorName: '', vendorPhone: '', vendorGstin: '', vendorAddress: '',
             billNumber: '', billDate: '', paymentMode: '', reason: '' };
  });
  var form = _f[0], setForm = _f[1];
  var _i = useState(function() { return [blankItem()]; });
  var items = _i[0], setItems = _i[1];
  var _b = useState([]);
  var bills = _b[0], setBills = _b[1];
  var _busy = useState(false);
  var busy = _busy[0], setBusy = _busy[1];
  var fileRef = useRef(null);

  var canRecord = user.role === 'storekeeper' || user.role === 'procurement_manager' || user.role === 'admin';
  if (!canRecord) {
    return React.createElement('div', { className: 'placeholder-screen' }, 'Local purchases are recorded by the storekeeper or the procurement manager.');
  }

  var limit = localPurchaseLimit(state);
  var total = items.reduce(function(s, it) { return s + lineAmount(it); }, 0);
  var over = total > limit;
  var today = new Date().toISOString().split('T')[0];
  var set = function(k, v) { setForm(function(p) { var n = Object.assign({}, p); n[k] = v; return n; }); };
  var setItem = function(idx, k, v) { setItems(items.map(function(it, i) { if (i !== idx) return it; var n = Object.assign({}, it); n[k] = v; return n; })); };
  var fail = function(m) { dispatch({ type: 'SHOW_TOAST', payload: { message: m, type: 'error' } }); return false; };

  var pickVendor = function(id) {
    if (id === '') { setForm(function(p) { return Object.assign({}, p, { vendorId: '' }); }); return; }
    var v = (state.vendors || []).find(function(x) { return x.id === id; });
    if (v) setForm(function(p) { return Object.assign({}, p, { vendorId: v.id, vendorName: v.name, vendorPhone: v.phone || '', vendorGstin: v.gstin || '', vendorAddress: [v.address, v.city].filter(Boolean).join(', ') }); });
  };

  var addBills = function(e) {
    var picked = Array.prototype.slice.call(e.target.files || []).filter(function(f) {
      if (f.size > ATTACHMENT_MAX_BYTES) { fail(f.name + ' is larger than 15 MB and was not added'); return false; }
      return true;
    });
    if (picked.length) setBills(bills.concat(picked));
    if (fileRef.current) fileRef.current.value = '';
  };

  var submit = function() {
    if (busy) return;
    if (!form.siteId) return fail('Choose the site the material was bought for');
    if (!form.vendorName.trim()) return fail('Enter the shop or vendor the material was bought from');
    if (!form.billNumber.trim()) return fail('Enter the bill / invoice number');
    if (!form.billDate) return fail('Enter the bill date');
    if (form.billDate > today) return fail('The bill date cannot be in the future');
    if (!form.paymentMode) return fail('Choose how it was paid for');
    if (!form.reason.trim()) return fail('Say why this had to be bought locally');
    var filled = items.filter(function(it) { return it.description.trim() || it.quantity || it.rate; });
    if (filled.length === 0) return fail('Enter the items on the bill');
    for (var k = 0; k < filled.length; k++) {
      var it = filled[k], name = it.description.trim() || ('Item ' + (k + 1));
      if (!it.description.trim()) return fail('Item ' + (k + 1) + ': enter what was bought');
      if (!(parseFloat(it.quantity) > 0)) return fail(name + ': enter a quantity above zero');
      if (!it.unit) return fail(name + ': choose a unit');
      if (!(parseFloat(it.rate) > 0)) return fail(name + ': enter the rate');
    }
    if (bills.length === 0) return fail('Attach a photo or scan of the bill');
    if (over) return fail('This bill is ' + formatRs(total) + ' but a local purchase can be at most ' + formatRs(limit) + '. Raise an indent for it instead.');

    setBusy(true);
    var folder = 'local-purchases/' + genUUID();
    var uploads = bills.map(function(f) {
      var path = folder + '/' + f.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
      return supabaseClient.storage.from('indent-docs').upload(path, f, { contentType: f.type || undefined }).then(function(res) {
        if (res.error) throw new Error('Could not upload ' + f.name + ': ' + res.error.message);
        return { name: f.name, path: path };
      });
    });
    Promise.all(uploads).then(function(billFiles) {
      dispatch({ type: 'RECORD_LOCAL_PURCHASE', payload: Object.assign({}, form, { items: filled, billFiles: billFiles }) });
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Local purchase recorded and sent for approval', type: 'success' } });
      window.location.hash = '#local-purchases';
    }).catch(function(err) {
      fail((err.message || 'Could not upload the bill') + '. Nothing was saved.');
    }).then(function() { setBusy(false); });
  };

  var label = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' };
  var input = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box', background: '#fff' };
  var card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, marginBottom: 24 };
  var field = function(lbl, el) { return React.createElement('div', null, React.createElement('label', { style: label }, lbl), el); };
  var text = function(key, placeholder, type) {
    return React.createElement('input', { type: type || 'text', style: input, value: form[key], placeholder: placeholder || '', 'aria-label': key,
      max: type === 'date' ? today : undefined, onChange: function(e) { set(key, e.target.value); } });
  };

  return React.createElement('div', { style: { padding: 24, maxWidth: 960, margin: '0 auto' } },
    React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 4 } }, 'Record a Local Purchase'),
    React.createElement('p', { style: { fontSize: 13, color: '#64748b', marginBottom: 20 } },
      'For material already bought at site without an indent. Enter the bill as it is, item by item, and attach a photo of it. Limit: ' + formatRs(limit) +
      ' per bill. It goes to the site\'s project manager for approval and the MD is informed.'),

    React.createElement('div', { style: card },
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
        field('Site *', React.createElement('select', { style: input, value: form.siteId, onChange: function(e) { set('siteId', e.target.value); } },
          React.createElement('option', { value: '' }, 'Select site...'),
          sites.map(function(s) { return React.createElement('option', { key: s.id, value: s.id }, s.name); }))),
        field('Bill / invoice number *', text('billNumber', 'As printed on the bill')),
        field('Bill date *', text('billDate', '', 'date')),
        field('Known vendor', React.createElement('select', { style: input, value: form.vendorId, onChange: function(e) { pickVendor(e.target.value); } },
          React.createElement('option', { value: '' }, 'Not in our vendor list'),
          (state.vendors || []).map(function(v) { return React.createElement('option', { key: v.id, value: v.id }, v.name); }))),
        field('Shop / vendor name *', text('vendorName', 'Name on the bill')),
        field('Shop phone', text('vendorPhone', '', 'tel')),
        field('Shop GSTIN', text('vendorGstin', 'If printed on the bill')),
        field('Shop address', text('vendorAddress', 'Area / town')),
        field('Paid by *', React.createElement('select', { style: input, value: form.paymentMode, onChange: function(e) { set('paymentMode', e.target.value); } },
          React.createElement('option', { value: '' }, 'Select...'),
          LOCAL_PAYMENT_MODES.map(function(m) { return React.createElement('option', { key: m, value: m }, m); })))
      ),
      React.createElement('div', { style: { marginTop: 16 } },
        field('Why it had to be bought locally *', React.createElement('textarea', {
          style: Object.assign({}, input, { minHeight: 60 }), value: form.reason, 'aria-label': 'Reason',
          placeholder: 'e.g. cutting wheels ran out during slab work; could not wait for an indent',
          onChange: function(e) { set('reason', e.target.value); } }))
      )
    ),

    React.createElement('div', { style: card },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
        React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b' } }, 'Items on the bill'),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: function() { setItems(items.concat([blankItem()])); } }, '+ Add Item')
      ),
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
        React.createElement('thead', null, React.createElement('tr', null,
          ['Item *', 'Qty *', 'Unit *', 'Rate (Rs.) *', 'GST %', 'Amount (Rs.)', ''].map(function(h) {
            return React.createElement('th', { key: h, style: { textAlign: 'left', padding: '6px 4px', fontSize: 12, color: '#64748b' } }, h);
          }))),
        React.createElement('tbody', null,
          items.map(function(it, idx) {
            return React.createElement('tr', { key: idx },
              React.createElement('td', { style: { padding: 4 } }, React.createElement('input', { style: input, value: it.description, placeholder: 'What was bought', 'aria-label': 'Item ' + (idx + 1),
                onChange: function(e) { setItem(idx, 'description', e.target.value); } })),
              React.createElement('td', { style: { padding: 4, width: 90 } }, React.createElement('input', { type: 'number', min: 0, step: 'any', style: input, value: it.quantity, 'aria-label': 'Quantity',
                onChange: function(e) { setItem(idx, 'quantity', e.target.value); } })),
              React.createElement('td', { style: { padding: 4, width: 150 } }, React.createElement('select', { style: input, value: it.unit, 'aria-label': 'Unit',
                onChange: function(e) { setItem(idx, 'unit', e.target.value); } }, unitOptionElements(it.unit))),
              React.createElement('td', { style: { padding: 4, width: 110 } }, React.createElement('input', { type: 'number', min: 0, step: 'any', style: input, value: it.rate, 'aria-label': 'Rate',
                onChange: function(e) { setItem(idx, 'rate', e.target.value); } })),
              React.createElement('td', { style: { padding: 4, width: 90 } }, React.createElement('select', { style: input, value: it.gstPercent, 'aria-label': 'GST',
                onChange: function(e) { setItem(idx, 'gstPercent', e.target.value); } },
                GST_RATES.map(function(g) { return React.createElement('option', { key: g, value: g }, g + '%'); }))),
              React.createElement('td', { style: { padding: 4, width: 110, textAlign: 'right', fontWeight: 600 } }, lineAmount(it).toLocaleString('en-IN')),
              React.createElement('td', { style: { padding: 4, width: 40 } }, items.length > 1 ? React.createElement('button', {
                type: 'button', 'aria-label': 'Remove item ' + (idx + 1), onClick: function() { setItems(items.filter(function(_, i) { return i !== idx; })); },
                style: { width: 30, height: 30, borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer' } }, '×') : null)
            );
          }),
          React.createElement('tr', null,
            React.createElement('td', { colSpan: 5, style: { padding: '10px 4px', textAlign: 'right', fontWeight: 700 } }, 'Bill total (including GST)'),
            React.createElement('td', { style: { padding: '10px 4px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: over ? '#dc2626' : '#15803d' } }, formatRs(total)),
            React.createElement('td', null))
        )
      ),
      over ? React.createElement('div', { role: 'alert', style: { marginTop: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#991b1b' } },
        'Above the ' + formatRs(limit) + ' limit for a local purchase. Raise an indent for this instead.') : null
    ),

    React.createElement('div', { style: card },
      React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 } }, 'Bill photo *'),
      React.createElement('p', { style: { fontSize: 12, color: '#64748b', marginBottom: 12 } }, 'A clear photo or scan of the bill. Add more than one if it runs to several pages.'),
      React.createElement('input', { ref: fileRef, type: 'file', multiple: true, accept: 'image/*,.pdf', onChange: addBills, 'aria-label': 'Add bill photos', style: { fontSize: 13 } }),
      bills.map(function(f, idx) {
        return React.createElement('div', { key: idx, style: { display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9', marginTop: idx === 0 ? 8 : 0 } },
          React.createElement('span', { style: { flex: 1, fontSize: 13, fontWeight: 600 } }, '📎 ' + f.name),
          React.createElement('button', { type: 'button', className: 'btn btn-sm btn-secondary', onClick: function() { setBills(bills.filter(function(_, i) { return i !== idx; })); } }, 'Remove'));
      })
    ),

    React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'flex-end' } },
      React.createElement('button', { className: 'btn btn-secondary', onClick: function() { window.location.hash = '#local-purchases'; } }, 'Cancel'),
      React.createElement('button', { className: 'btn btn-primary', onClick: submit, disabled: busy }, busy ? 'Saving...' : 'Record and Send for Approval')
    )
  );
}

// ── One local purchase, with the decision on the page ───────────────────────
function LocalPurchaseDetailScreen(_ref) {
  var _ctx = useContext(AppContext);
  var state = _ctx[0], dispatch = _ctx[1];
  var _mode = useState('');
  var mode = _mode[0], setMode = _mode[1];
  var _text = useState('');
  var text = _text[0], setText = _text[1];

  var lp = (state.localPurchases || []).find(function(x) { return x.id === _ref.id; });
  if (!lp) return React.createElement('div', { className: 'placeholder-screen' }, 'Local purchase not found');

  var user = state.currentUser || {};
  var mySites = (state.siteAssignments || {})[state.currentUserId] || [];
  var canDecide = lp.status === 'pending_approval' && lp.createdBy !== state.currentUserId &&
    (user.role === 'md' || user.role === 'admin' || (user.role === 'project_manager' && mySites.indexOf(lp.siteId) !== -1));
  var needRemarks = mode === 'reject' || user.role === 'md';

  var decide = function() {
    if (needRemarks && !text.trim()) {
      dispatch({ type: 'SHOW_TOAST', payload: { message: 'Please write your remarks', type: 'error' } });
      return;
    }
    dispatch({ type: 'DECIDE_LOCAL_PURCHASE', payload: { id: lp.id, approve: mode === 'approve', remarks: text.trim() } });
    dispatch({ type: 'SHOW_TOAST', payload: { message: mode === 'approve' ? 'Local purchase approved' : 'Local purchase rejected', type: 'success' } });
    setMode(''); setText('');
  };

  var card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 };
  var info = function(lbl, val) {
    return val ? React.createElement('div', null,
      React.createElement('div', { style: { fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 2 } }, lbl),
      React.createElement('div', { style: { fontSize: 14, color: '#1e293b' } }, val)) : null;
  };
  var cell = { padding: '8px 12px', borderBottom: '1px solid #f1f5f9' };

  return React.createElement('div', { style: { padding: 24, maxWidth: 900, margin: '0 auto' } },
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } },
      React.createElement('div', null,
        React.createElement('h2', { style: { fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 4 } }, 'Local Purchase: ' + lp.lpNumber),
        React.createElement(StatusBadge, { status: lp.status })),
      React.createElement('a', { href: '#local-purchases', style: { color: '#3b82f6', textDecoration: 'none', fontSize: 14 } }, 'Back to list')
    ),

    canDecide ? React.createElement('div', { style: { marginBottom: 16 } },
      React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
        React.createElement('button', { className: 'btn btn-success', onClick: function() { setMode(mode === 'approve' ? '' : 'approve'); setText(''); } }, 'Approve'),
        React.createElement('button', { className: 'btn btn-danger', onClick: function() { setMode(mode === 'reject' ? '' : 'reject'); setText(''); } }, 'Reject')),
      mode ? React.createElement('div', { style: { padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 } },
          mode === 'approve' ? ('Remarks' + (needRemarks ? ' (required)' : ' (optional)')) : 'Reason for rejecting (required)'),
        React.createElement('textarea', { value: text, rows: 3, autoFocus: true, 'aria-label': 'Remarks', onChange: function(e) { setText(e.target.value); },
          style: { width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box', fontSize: 13 } }),
        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          React.createElement('button', { className: mode === 'approve' ? 'btn btn-success' : 'btn btn-danger', onClick: decide }, mode === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'),
          React.createElement('button', { className: 'btn btn-secondary', onClick: function() { setMode(''); setText(''); } }, 'Back'))
      ) : null
    ) : null,

    (lp.status !== 'pending_approval') ? React.createElement('div', {
      style: { padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, background: lp.status === 'approved' ? '#f0fdf4' : '#fef2f2', border: '1px solid ' + (lp.status === 'approved' ? '#bbf7d0' : '#fecaca') }
    }, (lp.status === 'approved' ? 'Approved' : 'Rejected') + ' by ' + getUserName(lp.decidedBy, state.users) +
       (lp.decidedAt ? ' on ' + new Date(lp.decidedAt).toLocaleDateString('en-IN') : '') + (lp.decisionRemarks ? ': ' + lp.decisionRemarks : '')) : null,
    (lp.status === 'pending_approval' && !canDecide) ? React.createElement('div', {
      style: { padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, background: '#eff6ff', border: '1px solid #bfdbfe' }
    }, 'Waiting for approval by the site\'s project manager.') : null,

    React.createElement('div', { style: card },
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
        info('Site', getSiteName(lp.siteId, state.sites)),
        info('Shop / vendor', lp.vendorName),
        info('Bill', lp.billNumber + (lp.billDate ? ', ' + new Date(lp.billDate).toLocaleDateString('en-IN') : '')),
        info('Shop phone', lp.vendorPhone),
        info('Shop GSTIN', lp.vendorGstin),
        info('Shop address', lp.vendorAddress),
        info('Paid by', lp.paymentMode),
        info('Recorded by', getUserName(lp.createdBy, state.users) + ', ' + new Date(lp.createdAt).toLocaleString('en-IN')),
        info('Bill total', formatRs(lp.totalAmount))
      ),
      React.createElement('div', { style: { marginTop: 16 } }, info('Why it was bought locally', lp.reason))
    ),

    React.createElement('div', { style: card },
      React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, marginBottom: 12 } }, 'Items'),
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
        React.createElement('thead', null, React.createElement('tr', { style: { background: '#f8fafc' } },
          ['#', 'Item', 'Qty', 'Unit', 'Rate', 'GST', 'Amount'].map(function(h, i) {
            return React.createElement('th', { key: h, style: { padding: '8px 12px', textAlign: i >= 4 || i === 2 ? 'right' : 'left', color: '#64748b' } }, h);
          }))),
        React.createElement('tbody', null,
          (lp.items || []).map(function(it, i) {
            return React.createElement('tr', { key: it.id || i },
              React.createElement('td', { style: cell }, i + 1),
              React.createElement('td', { style: cell }, it.description),
              React.createElement('td', { style: Object.assign({}, cell, { textAlign: 'right' }) }, it.quantity),
              React.createElement('td', { style: cell }, it.unit),
              React.createElement('td', { style: Object.assign({}, cell, { textAlign: 'right' }) }, it.rate.toLocaleString('en-IN')),
              React.createElement('td', { style: Object.assign({}, cell, { textAlign: 'right' }) }, it.gstPercent + '%'),
              React.createElement('td', { style: Object.assign({}, cell, { textAlign: 'right', fontWeight: 600 }) }, it.amount.toLocaleString('en-IN')));
          }),
          React.createElement('tr', null,
            React.createElement('td', { colSpan: 6, style: { padding: '10px 12px', textAlign: 'right', fontWeight: 700 } }, 'Total'),
            React.createElement('td', { style: { padding: '10px 12px', textAlign: 'right', fontWeight: 800 } }, formatRs(lp.totalAmount)))
        )
      )
    ),

    React.createElement('div', { style: card },
      React.createElement('h3', { style: { fontSize: 16, fontWeight: 700, marginBottom: 12 } }, 'Bill'),
      (lp.billFiles || []).length === 0
        ? React.createElement('p', { style: { color: '#6b7280', fontStyle: 'italic' } }, 'No bill attached.')
        : lp.billFiles.map(function(f, i) {
            return React.createElement('button', { key: i, className: 'btn btn-secondary', style: { marginRight: 8, marginBottom: 8 },
              onClick: function() { openIndentDocument({ storagePath: f.path, name: f.name }, dispatch); } }, '📎 ' + f.name);
          })
    )
  );
}

// ── Purchase order with no indent behind it ─────────────────────────────────
function CreateDirectPOScreen() {
  var _ctx = useContext(AppContext);
  var state = _ctx[0], dispatch = _ctx[1];
  var user = state.currentUser || {};
  var blankItem = function() { return { id: genUUID(), description: '', hsn: '', quantity: '', unit: 'Nos', rate: '', gstPercent: 18 }; };

  var _f = useState({ siteId: '', reason: '', vendorId: '', deliveryDate: '', paymentTerms: '', deliveryAddress: '', remarks: '', noQuote: false, noQuoteReason: '' });
  var form = _f[0], setForm = _f[1];
  var _i = useState(function() { return [blankItem()]; });
  var items = _i[0], setItems = _i[1];
  var _t = useState({});
  var terms = _t[0], setTerms = _t[1];
  var _q = useState([]);
  var quotes = _q[0], setQuotes = _q[1];
  var _busy = useState(false);
  var busy = _busy[0], setBusy = _busy[1];

  var canRaise = ['procurement_manager', 'procurement_clerk', 'admin'].indexOf(user.role) !== -1;
  if (!canRaise) return React.createElement('div', { className: 'placeholder-screen' }, 'Only procurement can raise purchase orders.');

  var set = function(k, v) { setForm(function(p) { var n = Object.assign({}, p); n[k] = v; return n; }); };
  var setItem = function(idx, k, v) { setItems(items.map(function(it, i) { if (i !== idx) return it; var n = Object.assign({}, it); n[k] = v; return n; })); };
  var fail = function(m) { dispatch({ type: 'SHOW_TOAST', payload: { message: m, type: 'error' } }); return false; };
  var total = items.reduce(function(s, it) { return s + lineAmount(it); }, 0);
  var PAYMENT = ['Advance', '7 days', '15 days', '21 days', '30 days', '45 days', '60 days', '90 days'];

  var pickSite = function(id) {
    var s = (state.sites || []).find(function(x) { return x.id === id; });
    setForm(function(p) { return Object.assign({}, p, { siteId: id, deliveryAddress: s ? s.name + ', ' + s.location : p.deliveryAddress }); });
  };

  var save = function(sendToMD) {
    if (busy) return;
    if (!form.siteId) return fail('Choose the site the material is for');
    if (!form.reason.trim()) return fail('Say why this purchase order has no indent');
    if (!form.vendorId) return fail('Please select a vendor');
    var filled = items.filter(function(it) { return it.description.trim() || it.quantity || it.rate; });
    if (filled.length === 0) return fail('Enter at least one item');
    for (var k = 0; k < filled.length; k++) {
      var it = filled[k], name = it.description.trim() || ('Item ' + (k + 1));
      if (!it.description.trim()) return fail('Item ' + (k + 1) + ': enter a description');
      if (!(parseFloat(it.quantity) > 0)) return fail(name + ': enter a quantity above zero');
      if (!it.unit) return fail(name + ': choose a unit');
      if (sendToMD && !(parseFloat(it.rate) > 0)) return fail(name + ': enter a rate');
    }
    if (sendToMD) {
      if (!form.deliveryDate) return fail('Delivery date is required');
      if (!form.paymentTerms) return fail('Payment terms are required');
      if (!form.remarks.trim()) return fail('Remarks are required');
      var hasQuote = quotes.some(function(q) { return QUOTE_CATEGORIES.indexOf(q.category) !== -1; });
      if (form.noQuote && !form.noQuoteReason.trim()) return fail('Say why no quotation is available');
      if (!form.noQuote && !hasQuote) return fail('Attach a quotation, or tick "No quotation is available" and say why');
    }

    var vendor = (state.vendors || []).find(function(v) { return v.id === form.vendorId; });
    var po = {
      id: genUUID(), poNumber: nextPONumber(state), indentId: null, siteId: form.siteId, noIndentReason: form.reason.trim(),
      vendorId: form.vendorId, vendorName: vendor ? vendor.name : '', deliveryDate: form.deliveryDate, paymentTerms: form.paymentTerms,
      deliveryAddress: form.deliveryAddress, notes: form.remarks.trim(), noQuoteReason: form.noQuote ? form.noQuoteReason.trim() : '',
      terms: cleanPOTerms(terms), totalAmount: total,
      lineItems: filled.map(function(it) {
        return { id: it.id, description: it.description.trim(), hsn: it.hsn, quantity: parseFloat(it.quantity), unit: it.unit, rate: parseFloat(it.rate) || 0, gstPercent: parseFloat(it.gstPercent) || 0 };
      }),
    };
    var finish = function(docs) {
      po.documents = docs.map(function(d) { d.uploadedBy = state.currentUserId; return d; });
      dispatch({ type: 'CREATE_PO', payload: { po: po, indentId: null } });
      if (sendToMD) dispatch({ type: 'REQUEST_MD_PO_APPROVAL', payload: { poId: po.id } });
      dispatch({ type: 'SHOW_TOAST', payload: { message: sendToMD ? 'PO sent for MD approval' : 'PO draft saved', type: 'success' } });
      window.location.hash = '#procurement-pos';
    };
    if (quotes.length === 0) { finish([]); return; }
    setBusy(true);
    uploadPickedFiles('po-' + po.id, quotes, null, po.id).then(function(docs) { setBusy(false); finish(docs); })
      .catch(function(err) { setBusy(false); fail((err.message || 'Could not upload the quotations') + '. The PO was not saved.'); });
  };

  var input = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box', background: '#fff' };

  return React.createElement('div', null,
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('div', { className: 'card-title' }, 'Purchase Order without an Indent')),
      React.createElement('div', { style: { padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 13, background: '#fffbeb', border: '1px solid #fde68a' } },
        'Use this only when there is no indent to raise the order against. It always needs MD approval, whatever its value, and the MD sees your reason. You can link it to an approved indent later.'),

      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 } },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Site *'),
          React.createElement('select', { className: 'form-select', value: form.siteId, onChange: function(e) { pickSite(e.target.value); } },
            React.createElement('option', { value: '' }, 'Select site...'),
            (state.sites || []).map(function(s) { return React.createElement('option', { key: s.id, value: s.id }, s.name); }))),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Vendor *'),
          React.createElement('select', { className: 'form-select', value: form.vendorId, onChange: function(e) { set('vendorId', e.target.value); } },
            React.createElement('option', { value: '' }, 'Select Vendor'),
            (state.vendors || []).map(function(v) { return React.createElement('option', { key: v.id, value: v.id }, v.name); }))),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Delivery Date *'),
          React.createElement('input', { type: 'date', className: 'form-input', value: form.deliveryDate, min: new Date().toISOString().split('T')[0],
            onChange: function(e) { set('deliveryDate', e.target.value); } })),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Payment Terms *'),
          React.createElement('select', { className: 'form-select', value: PAYMENT.indexOf(form.paymentTerms) !== -1 ? form.paymentTerms : (form.paymentTerms ? '__custom__' : ''),
            onChange: function(e) { set('paymentTerms', e.target.value === '__custom__' ? 'Custom: ' : e.target.value); } },
            React.createElement('option', { value: '' }, 'Select Payment Terms'),
            PAYMENT.map(function(p) { return React.createElement('option', { key: p, value: p }, p); }),
            React.createElement('option', { value: '__custom__' }, 'Custom...')),
          (form.paymentTerms && PAYMENT.indexOf(form.paymentTerms) === -1) ? React.createElement('input', { type: 'text', className: 'form-input', style: { marginTop: 8 },
            value: form.paymentTerms, onChange: function(e) { set('paymentTerms', e.target.value); }, placeholder: 'e.g. 50% advance, 50% on delivery' }) : null),
        React.createElement('div', { className: 'form-group', style: { gridColumn: 'span 2' } },
          React.createElement('label', { className: 'form-label' }, 'Delivery Address'),
          React.createElement('input', { type: 'text', className: 'form-input', value: form.deliveryAddress, onChange: function(e) { set('deliveryAddress', e.target.value); } }))
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Why there is no indent *'),
        React.createElement('textarea', { className: 'form-textarea', value: form.reason, style: { minHeight: 60 },
          placeholder: 'e.g. annual rate contract; head-office purchase; site could not raise an indent in time',
          onChange: function(e) { set('reason', e.target.value); } })),

      React.createElement('div', { style: { marginBottom: 24 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
          React.createElement('label', { className: 'form-label' }, 'Items'),
          React.createElement('button', { type: 'button', className: 'btn btn-sm btn-secondary', onClick: function() { setItems(items.concat([blankItem()])); } }, '+ Add Item')),
        React.createElement('table', { className: 'line-items-table' },
          React.createElement('thead', null, React.createElement('tr', null,
            ['Material *', 'HSN', 'Qty *', 'Unit *', 'Rate (Rs.) *', 'GST %', 'Total with GST', ''].map(function(h) { return React.createElement('th', { key: h }, h); }))),
          React.createElement('tbody', null,
            items.map(function(it, idx) {
              return React.createElement('tr', { key: it.id },
                React.createElement('td', null, React.createElement('input', { style: input, value: it.description, 'aria-label': 'Material ' + (idx + 1), onChange: function(e) { setItem(idx, 'description', e.target.value); } })),
                React.createElement('td', { style: { width: 90 } }, React.createElement('input', { style: input, value: it.hsn, 'aria-label': 'HSN', onChange: function(e) { setItem(idx, 'hsn', e.target.value); } })),
                React.createElement('td', { style: { width: 90 } }, React.createElement('input', { type: 'number', min: 0, step: 'any', style: input, value: it.quantity, 'aria-label': 'Quantity', onChange: function(e) { setItem(idx, 'quantity', e.target.value); } })),
                React.createElement('td', { style: { width: 140 } }, React.createElement('select', { style: input, value: it.unit, 'aria-label': 'Unit', onChange: function(e) { setItem(idx, 'unit', e.target.value); } }, unitOptionElements(it.unit))),
                React.createElement('td', { style: { width: 110 } }, React.createElement('input', { type: 'number', min: 0, step: 'any', style: input, value: it.rate, 'aria-label': 'Rate', onChange: function(e) { setItem(idx, 'rate', e.target.value); } })),
                React.createElement('td', { style: { width: 90 } }, React.createElement('select', { style: input, value: it.gstPercent, 'aria-label': 'GST', onChange: function(e) { setItem(idx, 'gstPercent', e.target.value); } },
                  GST_RATES.map(function(g) { return React.createElement('option', { key: g, value: g }, g + '%'); }))),
                React.createElement('td', { style: { fontWeight: 600, textAlign: 'right' } }, 'Rs. ' + lineAmount(it).toLocaleString('en-IN')),
                React.createElement('td', { style: { width: 40 } }, items.length > 1 ? React.createElement('button', { type: 'button', 'aria-label': 'Remove item ' + (idx + 1),
                  onClick: function() { setItems(items.filter(function(_, i) { return i !== idx; })); },
                  style: { width: 30, height: 30, borderRadius: 6, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer' } }, '×') : null));
            }),
            React.createElement('tr', { style: { backgroundColor: '#f0fdf4', fontWeight: 700 } },
              React.createElement('td', { colSpan: 6, style: { textAlign: 'right' } }, 'Grand Total:'),
              React.createElement('td', { style: { color: '#15803d', fontSize: 16, textAlign: 'right' } }, formatRs(total)),
              React.createElement('td', null))
          )
        )
      ),

      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Remarks *'),
        React.createElement('textarea', { className: 'form-textarea', value: form.remarks, style: { minHeight: 70 },
          placeholder: 'Basis of the rate, quotations compared, how the negotiation went...',
          onChange: function(e) { set('remarks', e.target.value); } })),

      React.createElement(POTermsFields, { terms: terms, setTerms: setTerms }),

      React.createElement(AttachmentPicker, { files: quotes, setFiles: setQuotes, hideItems: true, title: 'Quotations',
        help: 'Attach the quotation(s) received (PDF, image, Excel, Word; up to 15 MB each). The MD sees these when approving.',
        categories: ['Quotation', 'Comparative Statement', 'Proforma Invoice', 'Estimate', 'Other'], defaultCategory: 'Quotation' }),
      React.createElement('div', { style: { margin: '-12px 0 24px 0', padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 } },
        React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' } },
          React.createElement('input', { type: 'checkbox', checked: form.noQuote, onChange: function(e) { set('noQuote', e.target.checked); } }),
          'No quotation is available for this order'),
        form.noQuote ? React.createElement('textarea', { className: 'form-textarea', value: form.noQuoteReason, 'aria-label': 'Why no quotation is available', style: { minHeight: 60, marginTop: 8 },
          placeholder: 'Declaration: why there is no quotation', onChange: function(e) { set('noQuoteReason', e.target.value); } }) : null),

      React.createElement('div', { className: 'action-buttons' },
        React.createElement('button', { className: 'btn btn-secondary', onClick: function() { save(false); }, disabled: busy }, 'Save as Draft PO'),
        React.createElement('button', { className: 'btn btn-primary', onClick: function() { save(true); }, disabled: busy }, busy ? 'Uploading...' : 'Send for MD Approval'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: function() { window.location.hash = '#procurement-pos'; } }, 'Cancel'))
    )
  );
}
