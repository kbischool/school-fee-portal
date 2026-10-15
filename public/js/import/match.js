// ---------------------------------------------------------------------
// Matching: which student does a sheet row (or a bank-log label such as
// "ADEDOJA FAMILY") belong to? Existing students are always matched by
// NAME so that every parent code stays exactly as it is.
// ---------------------------------------------------------------------
import { clean, fullName } from './util.js';

const STOP = new Set(['FAMILY', 'FAMILIES', 'AND', 'THE', 'MR', 'MRS', 'MISS', 'OF', 'FAM', '']);
const tokens = (s) => clean(s).replace(/-/g, '').replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(Boolean);

/**
 * @param {{id:string,name:string,last?:string,first?:string}[]} people
 */
export function buildIndex(people) {
  const byName = new Map();
  const byLast = new Map();
  for (const p of people) {
    const name = clean(p.name);
    if (!byName.has(name)) byName.set(name, p);
    // The stored name is "LAST FIRST…": the first word is the last name.
    const last = clean(p.last ?? name.split(' ')[0]);
    const first = clean(p.first ?? name.split(' ').slice(1).join(' '));
    const rec = { ...p, last, first, firstTokens: tokens(first) };
    if (!byLast.has(last)) byLast.set(last, []);
    byLast.get(last).push(rec);
  }
  return { byName, byLast };
}

/** Match a sheet row's LAST and FIRST name to a known student. */
export function matchStudent(last, first, index) {
  const exact = index.byName.get(fullName(last, first));
  if (exact) return { person: exact, mode: 'exact' };

  const L = clean(last);
  const A = tokens(first);
  const pool = index.byLast.get(L) || [];
  // Same surname and the given names overlap (middle name added/dropped, order swapped).
  const cands = pool.filter((p) => {
    const B = p.firstTokens;
    if (!A.length || !B.length) return false;
    const inter = A.filter((t) => B.includes(t));
    return inter.length > 0 && (A[0] === B[0] || inter.length === Math.min(A.length, B.length));
  });
  if (cands.length === 1) return { person: cands[0], mode: 'fuzzy' };
  return { person: null, mode: cands.length > 1 ? 'ambiguous' : 'none' };
}

/**
 * Match a bank-log "Student" label to one or more students.
 * "ADEDOJA FAMILY" -> every ADEDOJA child; "Olatunji Jemimah & Inioluwa" -> those two.
 * @returns {{ids:string[], mode:'family'|'names'|'surname'|'none'}}
 */
export function matchPaymentLabel(label, index) {
  const norm = clean(label).replace(/[^A-Z0-9\- ]/g, ' ');
  const isFamily = /\bFAMIL/.test(norm);
  const T = tokens(label).filter((t) => !STOP.has(t) && !/^FAMIL/.test(t));
  if (!T.length) return { ids: [], mode: 'none' };

  const surnameKeys = (t) => [t, t.replace(/S$/, '')].filter((x, i, a) => x && a.indexOf(x) === i);

  if (isFamily) {
    const ids = new Set();
    for (const t of T) for (const k of surnameKeys(t)) for (const p of index.byLast.get(k) || []) ids.add(p.id);
    if (ids.size) return { ids: [...ids], mode: 'family' };
  }

  // "SURNAME GIVEN [& GIVEN]": surname plus at least one given-name token.
  const hits = [];
  for (const t of T) {
    for (const p of index.byLast.get(t) || []) {
      const others = T.filter((x) => x !== t);
      if (p.firstTokens.some((f) => others.includes(f))) hits.push(p);
    }
  }
  // Also allow the label to be written "GIVEN SURNAME".
  const uniq = [...new Map(hits.map((p) => [p.id, p])).values()];
  if (uniq.length) return { ids: uniq.map((p) => p.id), mode: 'names' };

  // A lone surname: treat as that family only if it is unambiguous that it is a surname.
  if (T.length === 1) {
    for (const k of surnameKeys(T[0])) {
      const pool = index.byLast.get(k);
      if (pool && pool.length) return { ids: pool.map((p) => p.id), mode: 'surname' };
    }
  }
  return { ids: [], mode: 'none' };
}
