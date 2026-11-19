// Loads every script listed in index.html into a fake browser, with a stub of
// React that just records what would be drawn. No packages needed: node run only.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);

let ctxValue = null;
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  Fragment: 'Fragment',
  // A '' state takes the value of global.__variant, to open forms that start closed
  useState: (i) => { let v = typeof i === 'function' ? i() : i; if (v === '' && global.__variant) v = global.__variant; return [v, () => {}]; },
  useReducer: (r, i) => [i, () => {}],
  useContext: () => ctxValue,
  createContext: () => ({ Provider: 'Provider' }),
  useEffect: () => {}, useCallback: f => f, useMemo: f => f(), useRef: v => ({ current: v }),
  Component: class {},
};
const noop = () => {};
const resolved = { then: () => resolved, catch: () => resolved };
const chain = new Proxy(function () {}, { get: (t, k) => k === 'then' ? resolved.then : (k === 'catch' ? resolved.catch : chain), apply: () => chain });
const fakeWindow = () => ({ document: { write: noop, close: noop }, focus: noop, print: noop, close: noop, location: {} });
const sandbox = {
  React, ReactDOM: { createRoot: () => ({ render: noop }), render: noop },
  window: { supabase: { createClient: () => chain }, location: { hash: '#dashboard', origin: 'https://example.test' }, addEventListener: noop, removeEventListener: noop,
            open: fakeWindow, confirm: () => true, history: { back: noop }, print: noop, NC_MIS_LOG: [] },
  document: { getElementById: () => ({}), addEventListener: noop, querySelector: () => null, createElement: () => ({ style: {}, click: noop }), body: { appendChild: noop, removeChild: noop } },
  console, setTimeout, clearTimeout, Promise, Date, Math, JSON, crypto: require('crypto').webcrypto, navigator: { onLine: true },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, confirm: () => true, alert: noop,
  FileReader: function () {}, Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: noop },
};
sandbox.window.React = React; sandbox.globalThis = sandbox; sandbox.self = sandbox.window;
vm.createContext(sandbox);
let loadErrors = 0;
for (const f of files) {
  let code = fs.readFileSync(path.join(root, f), 'utf8');
  // top-level const/let/class are per-script in a real page too, but vm needs them on the global
  code = code.replace(/^(const|let) /gm, 'var ').replace(/^class (\w+)/gm, 'var $1 = class $1');
  try { vm.runInContext(code, sandbox, { filename: f }); } catch (e) { loadErrors++; console.log('LOAD ERROR', f, e.message); }
}
module.exports = { sandbox, React, setCtx: (v) => { ctxValue = v; }, files, loadErrors };
