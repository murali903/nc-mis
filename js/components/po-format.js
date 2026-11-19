
// =============================================================================
// Purchase order terms and the printed purchase order
// Loaded after list-controls.js and before the screens.
// =============================================================================

// The usual terms on a purchase order. Each is a dropdown of common wordings with
// "Other..." for free text. Saved on the PO as { key: text }.
var PO_TERMS = [
  { key: 'freight', label: 'Freight / delivery', options: [
      'Delivered to site; freight included in the rates',
      'Freight extra, at actuals against transport bill',
      'Ex-works; transport arranged by Navya Constructions',
  ] },
  { key: 'unloading', label: 'Unloading', options: [
      'Unloading at site by the vendor',
      'Unloading at site by Navya Constructions',
  ] },
  { key: 'taxes', label: 'Taxes', options: [
      'GST as shown above; no other taxes or charges',
      'Rates are inclusive of all taxes and charges',
  ] },
  { key: 'quality', label: 'Quality and inspection', options: [
      'Material as per relevant IS codes, with manufacturer test certificate for each lot',
      'Material as per the approved make / sample',
      'Subject to inspection at site; rejected material to be replaced at the vendor\'s cost',
  ] },
  { key: 'warranty', label: 'Warranty', options: [
      'Not applicable',
      'Manufacturer\'s standard warranty',
      '12 months from the date of delivery',
  ] },
];
var PO_TERM_OTHER = '__other__';

// Site the material is for: the indent's site, or the PO's own when it has no indent
function poSiteOf(po, state) {
  var indent = po.indentId ? (state.indents || []).find(function(i) { return i.id === po.indentId; }) : null;
  var siteId = indent ? indent.siteId : po.siteId;
  return (state.sites || []).find(function(s) { return s.id === siteId; }) || null;
}

function poOfficeOf(po, state) {
  var byPo = po.officeId ? (state.offices || []).find(function(o) { return o.id === po.officeId; }) : null;
  if (byPo) return byPo;
  var site = poSiteOf(po, state);
  return site ? ((state.offices || []).find(function(o) { return o.id === site.officeId; }) || null) : null;
}

// Next PO number for the current year, from the numbers already used
function nextPONumber(state) {
  var year = new Date().getFullYear();
  var used = (state.purchaseOrders || []).map(function(po) {
    var m = String(po.poNumber || '').match(/^PO-(\d{4})-(\d{4,})$/);
    return m && parseInt(m[1], 10) === year ? parseInt(m[2], 10) : 0;
  });
  var max = used.length ? Math.max.apply(null, used) : 0;
  return 'PO-' + year + '-' + String(max + 1).padStart(4, '0');
}

// "IND-047", or "No indent" for a PO raised without one
function poIndentLabel(po, state) {
  if (!po.indentId) return 'No indent';
  var ind = (state.indents || []).find(function(i) { return i.id === po.indentId; });
  return ind ? getIndentDisplayId(ind, state.indents) : 'Indent';
}

// Fields for the terms, used when creating and editing a PO.
//   terms / setTerms: { freight, unloading, taxes, quality, warranty, siteContact, sitePhone, special }
function POTermsFields(props) {
  var terms = props.terms || {};
  var setTerms = props.setTerms;
  var set = function(key, value) { var next = Object.assign({}, terms); next[key] = value; setTerms(next); };
  var label = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
  var input = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', background: '#fff' };

  return React.createElement('div', { style: { marginBottom: 24 } },
    React.createElement('label', { className: 'form-label' }, 'Terms printed on the purchase order'),
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 } },
      PO_TERMS.map(function(t) {
        var value = terms[t.key];
        var isListed = t.options.indexOf(value) !== -1;
        var isOther = value !== undefined && value !== '' && !isListed;
        var choosing = terms['_' + t.key + 'Other'] || isOther;
        return React.createElement('div', { key: t.key },
          React.createElement('label', { style: label }, t.label),
          React.createElement('select', {
            style: input, 'aria-label': t.label,
            value: choosing ? PO_TERM_OTHER : (value || ''),
            onChange: function(e) {
              var v = e.target.value;
              var next = Object.assign({}, terms);
              if (v === PO_TERM_OTHER) { next['_' + t.key + 'Other'] = true; next[t.key] = ''; }
              else { delete next['_' + t.key + 'Other']; next[t.key] = v; }
              setTerms(next);
            }
          },
            React.createElement('option', { value: '' }, 'Leave out'),
            t.options.map(function(o) { return React.createElement('option', { key: o, value: o }, o); }),
            React.createElement('option', { value: PO_TERM_OTHER }, 'Other...')
          ),
          choosing ? React.createElement('input', {
            type: 'text', style: Object.assign({}, input, { marginTop: 6 }), 'aria-label': t.label + ' (your wording)',
            value: value || '', placeholder: 'Type the wording to print',
            onChange: function(e) { set(t.key, e.target.value); }
          }) : null
        );
      }),
      React.createElement('div', null,
        React.createElement('label', { style: label }, 'Contact person at site'),
        React.createElement('input', { type: 'text', style: input, value: terms.siteContact || '', placeholder: 'Name',
          onChange: function(e) { set('siteContact', e.target.value); } })
      ),
      React.createElement('div', null,
        React.createElement('label', { style: label }, 'Site contact phone'),
        React.createElement('input', { type: 'tel', style: input, value: terms.sitePhone || '', placeholder: 'Phone number',
          onChange: function(e) { set('sitePhone', e.target.value); } })
      ),
      React.createElement('div', { style: { gridColumn: '1 / -1' } },
        React.createElement('label', { style: label }, 'Special instructions'),
        React.createElement('input', { type: 'text', style: input, value: terms.special || '', placeholder: 'e.g. deliver between 9 am and 5 pm; call the site before dispatch',
          onChange: function(e) { set('special', e.target.value); } })
      )
    )
  );
}

// Terms as saved: drops the "Other..." markers and empty entries
function cleanPOTerms(terms) {
  var out = {};
  Object.keys(terms || {}).forEach(function(k) {
    if (k.charAt(0) === '_') return;
    var v = String(terms[k] === null || terms[k] === undefined ? '' : terms[k]).trim();
    if (v) out[k] = v;
  });
  return out;
}

// 123456.5 -> "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only"
function rupeesInWords(amount) {
  var ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
              'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  var two = function(n) { return n < 20 ? ones[n] : (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')); };
  var three = function(n) { return (n >= 100 ? ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : ''); };
  var whole = function(n) {
    if (n === 0) return 'Zero';
    var parts = [];
    var crore = Math.floor(n / 10000000); n %= 10000000;
    var lakh = Math.floor(n / 100000); n %= 100000;
    var thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(whole(crore) + ' Crore');
    if (lakh) parts.push(two(lakh) + ' Lakh');
    if (thousand) parts.push(two(thousand) + ' Thousand');
    if (n) parts.push(three(n));
    return parts.join(' ');
  };
  var value = Math.round((Number(amount) || 0) * 100);
  var rupees = Math.floor(value / 100), paise = value % 100;
  return 'Rupees ' + whole(rupees) + (paise ? ' and ' + two(paise) + ' Paise' : '') + ' Only';
}

function inr(n) {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Opens the purchase order, laid out on the company letterhead, ready to print
// or save as PDF. Returns false if the browser blocked the window.
function printPurchaseOrder(po, state) {
  var e = escapeHtml;
  var settings = state.orgSettings || {};
  var vendor = (state.vendors || []).find(function(v) { return v.id === po.vendorId; }) || {};
  var indent = po.indentId ? (state.indents || []).find(function(i) { return i.id === po.indentId; }) : null;
  var site = poSiteOf(po, state);
  var office = poOfficeOf(po, state);
  var terms = cleanPOTerms(po.terms);
  var company = settings.companyName || 'Navya Constructions';
  var issued = ['issued', 'partially_fulfilled', 'fulfilled', 'closed'].indexOf(po.status) !== -1;
  var dateOf = function(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; };

  var items = po.lineItems || [];
  var subtotal = 0, gstTotal = 0;
  var rows = items.map(function(li, i) {
    var qty = Number(li.quantity || li.qty) || 0, rate = Number(li.rate) || 0, pct = Number(li.gstPercent) || 0;
    var base = qty * rate, gst = base * pct / 100;
    subtotal += base; gstTotal += gst;
    return '<tr><td class="c">' + (i + 1) + '</td><td>' + e(li.description || li.name || '') + '</td><td class="c">' + e(li.hsn || '') + '</td>' +
      '<td class="r">' + qty + '</td><td>' + e(li.unit || '') + '</td><td class="r">' + inr(rate) + '</td><td class="r">' + inr(base) + '</td>' +
      '<td class="r">' + pct + '%</td><td class="r">' + inr(gst) + '</td><td class="r b">' + inr(base + gst) + '</td></tr>';
  }).join('');
  var grand = subtotal + gstTotal;

  var billTo = [company,
    office ? office.address : (settings.companyAddress || ''),
    (office && office.gstin) ? 'GSTIN: ' + office.gstin : (settings.companyGSTIN ? 'GSTIN: ' + settings.companyGSTIN : ''),
    (office && office.pan) || settings.companyPAN ? 'PAN: ' + ((office && office.pan) || settings.companyPAN) : ''
  ].filter(Boolean);
  var vendorLines = [
    vendor.address, [vendor.city, vendor.state, vendor.pincode].filter(Boolean).join(', '),
    vendor.gstin ? 'GSTIN: ' + vendor.gstin : '',
    vendor.contactPerson ? 'Kind attention: ' + vendor.contactPerson : '',
    [vendor.phone ? 'Tel: ' + vendor.phone : '', vendor.email ? 'E-mail: ' + vendor.email : ''].filter(Boolean).join('  |  ')
  ].filter(Boolean);
  var shipTo = [po.deliveryAddress || (site ? site.name + ', ' + site.location : ''),
    terms.siteContact ? 'Contact: ' + terms.siteContact + (terms.sitePhone ? ', ' + terms.sitePhone : '') : (terms.sitePhone ? 'Contact: ' + terms.sitePhone : '')
  ].filter(Boolean);

  var termLines = [];
  if (po.paymentTerms) termLines.push(['Payment', po.paymentTerms]);
  if (po.deliveryDate) termLines.push(['Delivery', 'On or before ' + dateOf(po.deliveryDate) + ', at the delivery address above']);
  PO_TERMS.forEach(function(t) { if (terms[t.key]) termLines.push([t.label, terms[t.key]]); });
  termLines.push(['Invoicing', 'Invoice in the name of ' + company + ' at the bill-to address' +
    (billTo.some(function(l) { return l.indexOf('GSTIN') === 0; }) ? ', quoting our GSTIN' : '') + ' and this purchase order number. Send the original invoice with the material.']);
  if (terms.special) termLines.push(['Special instructions', terms.special]);

  var offices = (state.offices || []).filter(function(o) { return /navya/i.test(o.name || ''); });
  if (offices.length === 0) offices = (state.offices || []).slice(0, 3);
  var rail = offices.map(function(o) {
    return '<div class="office"><div class="b">' + e(o.city || o.name) + '</div>' +
      String(o.address || '').split(',').map(function(p) { return '<div>' + e(p.trim()) + '</div>'; }).join('') + '</div>';
  }).join('');

  var logo = window.location.origin + '/img/navya-logo.png';
  var title = getPODisplayId(po);
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + e(title) + '</title><style>' +
    '@page{size:A4;margin:12mm}' +
    '*{box-sizing:border-box}body{font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:11px;color:#1f2937;margin:0}' +
    '.page{display:flex;min-height:270mm;width:186mm;margin:0 auto}' +
    '@media screen{body{background:#e5e7eb}.page{background:#fff;padding:8mm;width:202mm;margin:6mm auto;box-shadow:0 1px 6px rgba(0,0,0,.2)}}' +
    '.rail{width:38mm;flex:none;padding-right:6mm;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;justify-content:space-between;font-size:9px;color:#4b5563}' +
    '.rail img{width:16mm;display:block;margin-bottom:3mm}.rail .name{font-size:13px;font-weight:700;color:#111827;line-height:1.25}.rail .since{margin-top:1.5mm;color:#6b7280}' +
    '.office{margin-bottom:4mm;line-height:1.5}.contact{border-top:1px solid #e5e7eb;padding-top:3mm;line-height:1.6}' +
    '.main{flex:1;padding-left:7mm;position:relative}' +
    'h1{font-size:17px;letter-spacing:.06em;margin:0 0 1mm 0;color:#b91c1c}.b{font-weight:700;color:#111827}.r{text-align:right}.c{text-align:center}' +
    '.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #b91c1c;padding-bottom:3mm;margin-bottom:4mm}' +
    '.meta td{padding:1px 0 1px 8px}.meta td:first-child{color:#6b7280;padding-left:0}' +
    '.parties{display:flex;gap:6mm;margin-bottom:4mm}.parties>div{flex:1;line-height:1.5}' +
    '.lbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:1mm}' +
    'table.items{width:100%;border-collapse:collapse;margin-bottom:2mm}table.items th{background:#f3f4f6;font-size:9.5px;text-align:left;padding:5px 6px;border:1px solid #d1d5db}' +
    'table.items td{padding:5px 6px;border:1px solid #d1d5db;vertical-align:top}table.items th.r,table.items th.c{text-align:inherit}' +
    '.totals{width:70mm;margin-left:auto;border-collapse:collapse}.totals td{padding:3px 6px}.totals tr.g td{border-top:1.5px solid #111827;font-weight:700;font-size:12.5px;color:#111827}' +
    '.words{margin:2mm 0 4mm 0;font-style:italic}' +
    '.terms{width:100%;border-collapse:collapse;margin-top:1mm}.terms td{padding:2.5px 0;vertical-align:top;line-height:1.45}.terms td:first-child{width:36mm;color:#6b7280}' +
    '.sign{margin-top:12mm;display:flex;justify-content:space-between;align-items:flex-end}.sign .line{margin-top:14mm;border-top:1px solid #9ca3af;padding-top:1.5mm;width:55mm}' +
    '.stamp{position:absolute;top:95mm;left:10mm;right:0;text-align:center;font-size:44px;font-weight:800;color:rgba(185,28,28,.13);transform:rotate(-24deg);letter-spacing:.08em;pointer-events:none}' +
    '.foot{margin-top:6mm;font-size:8.5px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:2mm}' +
    '.bar{padding:10px;text-align:center;background:#f3f4f6;border-bottom:1px solid #e5e7eb}.bar button{padding:8px 18px;font-size:13px;cursor:pointer}' +
    '@media print{.bar{display:none}}' +
    '</style></head><body>' +
    '<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>' +
    '<div class="page"><div class="rail"><div><img src="' + e(logo) + '" alt=""><div class="name">' + e(company).replace(' ', '<br>') + '</div>' +
    '<div class="since">' + e(settings.companyTagline || '') + '</div></div>' +
    '<div>' + rail + '<div class="contact">' + [settings.companyWebsite, settings.senderEmail || settings.companyEmail, settings.companyPhone].filter(Boolean).map(function(x) { return '<div>' + e(x) + '</div>'; }).join('') + '</div></div></div>' +
    '<div class="main">' + (issued ? '' : '<div class="stamp">' + (po.status === 'cancelled' ? 'CANCELLED' : 'NOT ISSUED') + '</div>') +
    '<div class="head"><div><h1>PURCHASE ORDER</h1>' + ((po.version || 1) > 1 ? '<div>Amendment ' + ((po.version || 1) - 1) + ' (supersedes earlier versions)</div>' : '') + '</div>' +
    '<table class="meta"><tr><td>PO No.</td><td class="b">' + e(title) + '</td></tr><tr><td>Date</td><td>' + e(dateOf(po.issuedAt || po.createdAt)) + '</td></tr>' +
    (indent ? '<tr><td>Indent</td><td>' + e(getIndentDisplayId(indent, state.indents)) + '</td></tr>' : '') +
    (site ? '<tr><td>Site</td><td>' + e(site.name) + '</td></tr>' : '') + '</table></div>' +
    '<div class="parties"><div><div class="lbl">To (vendor)</div><div class="b">M/s ' + e(po.vendorName || vendor.name || '') + '</div>' + vendorLines.map(function(l) { return '<div>' + e(l) + '</div>'; }).join('') + '</div>' +
    '<div><div class="lbl">Bill to</div>' + billTo.map(function(l, i) { return '<div' + (i === 0 ? ' class="b"' : '') + '>' + e(l) + '</div>'; }).join('') +
    '<div class="lbl" style="margin-top:3mm">Deliver to</div>' + shipTo.map(function(l) { return '<div>' + e(l) + '</div>'; }).join('') + '</div></div>' +
    '<p style="margin:0 0 3mm 0">Please supply the following material as per the terms below.</p>' +
    '<table class="items"><thead><tr><th class="c">#</th><th>Description</th><th class="c">HSN</th><th class="r">Qty</th><th>Unit</th><th class="r">Rate (Rs.)</th><th class="r">Amount</th><th class="r">GST</th><th class="r">GST amt</th><th class="r">Total (Rs.)</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<table class="totals"><tr><td>Subtotal</td><td class="r">' + inr(subtotal) + '</td></tr><tr><td>GST</td><td class="r">' + inr(gstTotal) + '</td></tr><tr class="g"><td>Total (Rs.)</td><td class="r">' + inr(grand) + '</td></tr></table>' +
    '<div class="words">' + e(rupeesInWords(grand)) + '</div>' +
    '<div class="lbl">Terms and conditions</div><table class="terms">' + termLines.map(function(t, i) { return '<tr><td>' + (i + 1) + '. ' + e(t[0]) + '</td><td>' + e(t[1]) + '</td></tr>'; }).join('') + '</table>' +
    (po.notes ? '<div class="lbl" style="margin-top:4mm">Notes</div><div>' + e(po.notes) + '</div>' : '') +
    '<div class="sign"><div><div>Vendor\'s acceptance</div><div class="line">Signature, name and date</div></div>' +
    '<div><div>For ' + e(company) + '</div><div class="line">Authorised signatory</div></div></div>' +
    '<div class="foot">' + e(title) + ((po.version || 1) > 1 ? ' · version ' + (po.version || 1) : '') + ' · generated ' + e(dateOf(new Date().toISOString())) + ' from the Navya MIS. This order is valid only when issued; a copy marked "NOT ISSUED" is for internal review.</div>' +
    '</div></div></body></html>';

  var win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
