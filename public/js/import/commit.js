// ---------------------------------------------------------------------
// Writes an import plan to Firestore: removes rows that no longer exist
// in a re-imported term, then writes everything in safe batches.
// Safe to run again: every document id is deterministic.
// ---------------------------------------------------------------------
import { db, doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, writeBatch } from '../firebase.js';

const BATCH = 400; // Firestore allows 500 per batch; keep headroom.
const PRIORITY = (p) =>
  p.startsWith('schoolCodes/') ? 0 : /^students\/[^/]+$/.test(p) ? 1 : p.startsWith('config/') ? 9 : 5;

/**
 * @param {{ops:object[]}} plan
 * @param {{kind:'fees'|'payments', sessionKey:string, term:number}[]} scopes terms being (re)imported
 * @param {(done:number,total:number,label:string)=>void} onProgress
 */
export async function commitPlan(plan, scopes, onProgress = () => {}) {
  const deletes = [];
  const skipPaths = new Set();

  // 1) Work out what to remove, so a re-import mirrors the sheet exactly.
  for (const s of scopes) {
    if (s.kind === 'fees') {
      const id = `${s.sessionKey}_t${s.term}`;
      const old = await getDoc(doc(db, 'ledgers', id));
      if (old.exists()) {
        const keep = new Set(plan.ops.filter((o) => o.path === `ledgers/${id}`).flatMap((o) => o.data.rows.map((r) => r.id)));
        for (const r of old.data().rows || []) if (!keep.has(r.id)) deletes.push(`students/${r.id}/records/${id}`);
      }
    } else if (s.kind === 'payments') {
      const snap = await getDocs(query(collection(db, 'payments'), where('sessionKey', '==', s.sessionKey), where('term', '==', s.term)));
      const next = new Map(plan.ops.filter((o) => /^payments\/[^/]+$/.test(o.path)).map((o) => [o.path.split('/')[1], o.data]));
      snap.forEach((d) => {
        const old = d.data();
        if (old.manual) {
          // The owner assigned this payment by hand: never overwrite it.
          skipPaths.add(`payments/${d.id}`);
          (old.studentIds || []).forEach((sid) => skipPaths.add(`students/${sid}/payments/${d.id}`));
          return;
        }
        const now = next.get(d.id);
        if (!now) { deletes.push(`payments/${d.id}`); (old.studentIds || []).forEach((sid) => deletes.push(`students/${sid}/payments/${d.id}`)); return; }
        for (const sid of old.studentIds || []) if (!now.studentIds.includes(sid)) deletes.push(`students/${sid}/payments/${d.id}`);
      });
    }
  }

  const writes = plan.ops.filter((o) => !skipPaths.has(o.path)).sort((a, b) => PRIORITY(a.path) - PRIORITY(b.path));
  const total = writes.length + deletes.length;
  let done = 0;

  // 2) Deletions, then writes, in batches.
  for (let i = 0; i < deletes.length; i += BATCH) {
    const b = writeBatch(db);
    deletes.slice(i, i + BATCH).forEach((p) => b.delete(doc(db, p)));
    await b.commit();
    done += Math.min(BATCH, deletes.length - i);
    onProgress(done, total, 'Removing old rows');
  }
  for (let i = 0; i < writes.length; i += BATCH) {
    const chunk = writes.slice(i, i + BATCH);
    for (let attempt = 1; ; attempt++) {
      try {
        const b = writeBatch(db);
        for (const o of chunk) o.merge ? b.set(doc(db, o.path), o.data, { merge: true }) : b.set(doc(db, o.path), o.data);
        await b.commit();
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    done += chunk.length;
    onProgress(done, total, 'Saving');
  }

  // 3) A small audit record of what was imported.
  await setDoc(doc(db, 'imports', String(Date.now())), { at: new Date().toISOString(), writes: writes.length, deletes: deletes.length, scopes });
  return { writes: writes.length, deletes: deletes.length };
}
