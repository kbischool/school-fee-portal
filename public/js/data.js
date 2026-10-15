// ---------------------------------------------------------------------
// Every Firestore read the portal makes lives here, with a short
// in-memory cache so moving between pages does not re-read everything.
// (No data is written to disk, so nothing is left behind on shared phones.)
// ---------------------------------------------------------------------
import { db, doc, getDoc, getDocs, collection, query, where } from './firebase.js';
import { sessionKey } from './import/util.js';

const cache = new Map();
const TTL = 3 * 60 * 1000;
async function cached(key, fn, ttl = TTL) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}
export const clearCache = () => cache.clear();

const docData = (s) => (s.exists() ? { id: s.id, ...s.data() } : null);
const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export const getConfig = () => cached('config', async () => docData(await getDoc(doc(db, 'config', 'app'))) || {});

/** All imported term ledgers (one small document per session + term), oldest first. */
export const getLedgers = () => cached('ledgers', async () =>
  list(await getDocs(collection(db, 'ledgers'))).sort((a, b) => (a.sessionKey + a.term).localeCompare(b.sessionKey + b.term)));

/** The session/term the dashboards open on. */
export async function getCurrent() {
  const [cfg, ledgers] = await Promise.all([getConfig(), getLedgers()]);
  const last = ledgers[ledgers.length - 1];
  const session = cfg.currentSession || (last && last.session) || '';
  const term = cfg.currentTerm || (last && last.term) || 1;
  return { session, sessionKey: session ? sessionKey(session) : '', term, hasData: ledgers.length > 0 };
}

export const getAllStudents = () => cached('students', async () => list(await getDocs(collection(db, 'students'))));
export const getStudent = (id) => cached(`student:${id}`, async () => docData(await getDoc(doc(db, 'students', id))));
export const getRecords = (id) => cached(`records:${id}`, async () =>
  list(await getDocs(collection(db, 'students', id, 'records'))).sort((a, b) => (a.sessionKey + a.term).localeCompare(b.sessionKey + b.term)));
export const getStudentPayments = (id) => cached(`pay:${id}`, async () =>
  list(await getDocs(collection(db, 'students', id, 'payments'))).sort((a, b) => String(b.date).localeCompare(String(a.date))));
export const getCodeInfo = (id) => cached(`code:${id}`, async () => { try { return docData(await getDoc(doc(db, 'schoolCodes', id))); } catch (e) { return null; } });
export const getParent = async (uid) => docData(await getDoc(doc(db, 'parents', uid)));

// ---- staff-only documents ----
export const getStock = () => cached('stock', async () => {
  const [t, s, i] = await Promise.all(['textbooks', 'stationery', 'inventory'].map(async (k) => docData(await getDoc(doc(db, 'stock', k)))));
  return { textbooks: t, stationery: s, inventory: i };
});
export const getInvoices = () => cached('invoices', async () => docData(await getDoc(doc(db, 'invoices', 'main'))));

// ---- owner-only documents ----
export const getCosts = () => cached('costs', async () => docData(await getDoc(doc(db, 'stockCosts', 'main'))));
export const getSalaries = () => cached('salaries', async () => list(await getDocs(collection(db, 'salaries'))).sort((a, b) => (a.year + a.title).localeCompare(b.year + b.title)));
export const getOwnerSheets = () => cached('ownerSheets', async () => list(await getDocs(collection(db, 'ownerSheets'))));
export const getPaymentsFor = (sKey, term) => cached(`payments:${sKey}:${term}`, async () =>
  list(await getDocs(query(collection(db, 'payments'), where('sessionKey', '==', sKey), where('term', '==', term)))).sort((a, b) => String(b.date).localeCompare(String(a.date))));
export const getAdmins = () => cached('admins', async () => list(await getDocs(collection(db, 'admins'))));
export const getCodes = (name) => cached(`codes:${name}`, async () => list(await getDocs(collection(db, name))));

// ---- parent-safe catalogue ----
export const getParentCatalog = (classKey) => cached(`cat:${classKey}`, async () => docData(await getDoc(doc(db, 'parentCatalog', classKey))));

// ---- helpers shared by dashboards ----
/** Totals for a ledger's rows (owner only ever displays these). */
export function totalsOf(rows) {
  const t = { count: rows.length, due: 0, paid: 0, owed: 0, credit: 0, disc: 0, arrears: 0, status: { paid: 0, part: 0, unpaid: 0, over: 0, nofee: 0 } };
  for (const r of rows) {
    t.due += r.due; t.paid += r.paid; t.disc += r.disc || 0; t.arrears += r.arr || 0;
    if (r.bal > 0) t.owed += r.bal; else if (r.bal < 0) t.credit += -r.bal;
    t.status[r.st] = (t.status[r.st] || 0) + 1;
  }
  return t;
}
