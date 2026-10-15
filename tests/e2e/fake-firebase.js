// In-browser stand-in for the Firebase SDK, used ONLY by the browser tests.
// It keeps documents in memory and enforces the same role boundaries as firestore.rules,
// so a page that reaches for something its role may not read fails exactly as it would live.
(function () {
  const SEED = window.__SEED || {};
  const store = new Map(Object.entries(SEED.docs || {}));
  const accounts = SEED.accounts || {};
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const log = (window.__DENIED = []);
  let uid = null; try { uid = localStorage.getItem('fake-uid'); } catch (e) {}
  const listeners = new Set();
  const auth = { currentUser: uid && accounts[uid] ? { uid, email: accounts[uid].email, displayName: accounts[uid].name } : null };

  const exists = (p) => store.has(p);
  const roleOf = (u) => (!u ? null : exists('owners/' + u) ? 'owner' : exists('admins/' + u) ? 'admin' : exists('parents/' + u) ? 'parent' : null);
  const OWNER_ONLY = new Set(['stockCosts', 'salaries', 'ownerSheets', 'payments', 'imports']);
  function canRead(path, isList) {
    const seg = path.split('/');
    const u = auth.currentUser && auth.currentUser.uid; const role = roleOf(u);
    const c = seg[0];
    if (c === 'schoolCodes') return seg.length === 2 && !isList ? true : role === 'owner';
    if (c === 'adminCodes') return !!u && (role === 'owner' || !isList);
    if (!u) return false;
    if (role === 'owner') return c !== 'mystery';
    if (c === 'owners') return seg[1] === u && !isList;
    if (c === 'admins' || c === 'parents') return seg[1] === u && !isList;
    if (c === 'students') {
      if (role === 'admin') return true;
      const linked = (store.get('parents/' + u) || {}).linkedStudents || [];
      return role === 'parent' && seg.length > 1 && !(seg.length === 2 && isList) && linked.includes(seg[1]);
    }
    if (['ledgers', 'invoices', 'stock'].includes(c)) return role === 'admin';
    if (c === 'parentCatalog' || c === 'config') return true;
    if (OWNER_ONLY.has(c)) return false;
    return false;
  }
  function canWrite(path) {
    const u = auth.currentUser && auth.currentUser.uid; const role = roleOf(u); const c = path.split('/')[0];
    if (role === 'owner') return c !== 'owners';
    return ['parents', 'admins', 'schoolCodes', 'adminCodes'].includes(c) && !!u;
  }
  const deny = (op, path) => { log.push(op + ' ' + path); const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; };

  const doc = (_db, ...s) => ({ path: s.join('/'), type: 'doc', id: s.join('/').split('/').pop() });
  const collection = (_db, ...s) => ({ path: s.join('/'), type: 'col' });
  const where = (f, op, v) => ({ f, op, v });
  const limit = (n) => ({ limit: n });
  const query = (col, ...cons) => ({ type: 'query', col, cons });
  const mk = (path) => ({ id: path.split('/').pop(), ref: { path }, exists: () => store.has(path), data: () => clone(store.get(path)) });
  const getDoc = async (ref) => { if (!canRead(ref.path, false)) deny('get', ref.path); return mk(ref.path); };
  const getDocs = async (q) => {
    const col = q.type === 'query' ? q.col : q; const cons = q.type === 'query' ? q.cons : [];
    if (!canRead(col.path, true)) deny('list', col.path);
    let keys = [...store.keys()].filter((k) => k.startsWith(col.path + '/') && !k.slice(col.path.length + 1).includes('/'));
    for (const c of cons) if (c.f) keys = keys.filter((k) => store.get(k)[c.f] === c.v);
    const docs = keys.map(mk); return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
  };
  const resolve = (old, data) => { const out = { ...old }; for (const [k, v] of Object.entries(data)) out[k] = v && v.__au ? [...new Set([...(old[k] || []), ...v.__au])] : clone(v); return out; };
  const setDoc = async (ref, data, opt) => { if (!canWrite(ref.path)) deny('set', ref.path); store.set(ref.path, opt && opt.merge ? resolve(store.get(ref.path) || {}, data) : resolve({}, data)); };
  const updateDoc = async (ref, data) => { if (!canWrite(ref.path)) deny('update', ref.path); if (!store.has(ref.path)) throw new Error('No document to update'); store.set(ref.path, resolve(store.get(ref.path), data)); };
  const deleteDoc = async (ref) => { if (!canWrite(ref.path)) deny('delete', ref.path); store.delete(ref.path); };
  const writeBatch = () => { const ops = []; return {
    set: (r, d, o) => ops.push(() => setDoc(r, d, o)), update: (r, d) => ops.push(() => updateDoc(r, d)), delete: (r) => ops.push(() => deleteDoc(r)),
    commit: async () => { for (const f of ops) await f(); window.__COMMITS = (window.__COMMITS || 0) + 1; } }; };
  const arrayUnion = (...v) => ({ __au: v });

  const emit = () => { for (const cb of listeners) setTimeout(() => cb(auth.currentUser), 0); };
  const signIn = async (_a, email, pw) => {
    const u = Object.entries(accounts).find(([, a]) => a.email === email);
    if (!u || u[1].pw !== pw) { const e = new Error('Firebase: Error (auth/invalid-credential).'); e.code = 'auth/invalid-credential'; throw e; }
    auth.currentUser = { uid: u[0], email, displayName: u[1].name }; try { localStorage.setItem('fake-uid', u[0]); } catch (e) {} emit(); return { user: auth.currentUser };
  };
  window.__fb = {
    initializeApp: () => ({}), getAuth: () => auth, getFirestore: () => ({}),
    onAuthStateChanged: (_a, cb) => { listeners.add(cb); setTimeout(() => cb(auth.currentUser), 0); return () => listeners.delete(cb); },
    signOut: async () => { auth.currentUser = null; try { localStorage.removeItem('fake-uid'); } catch (e) {} emit(); },
    signInWithEmailAndPassword: signIn,
    createUserWithEmailAndPassword: async () => { throw new Error('not used in tests'); },
    GoogleAuthProvider: function () {}, signInWithPopup: async () => { throw new Error('not used in tests'); },
    sendPasswordResetEmail: async () => {}, confirmPasswordReset: async () => {}, verifyPasswordResetCode: async () => 'x', deleteUser: async () => {},
    doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, collection, query, where, limit, arrayUnion,
    _store: store
  };
})();
