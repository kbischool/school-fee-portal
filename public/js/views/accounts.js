// Owner-only: parent codes, administrator access, and who has registered.
import { esc, statCard, icon, toast, empty, withLoading, copyText, downloadCsv, debounce } from '../ui.js';
import { getCodes, getAdmins, getAllStudents, clearCache } from '../data.js';
import { db, doc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, arrayUnion } from '../firebase.js';
import { makeCode } from '../import/plan.js';
import { classKey, classLabel } from '../import/util.js';

// Letters and digits that cannot be confused (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode(len = 12) {
  const b = new Uint32Array(len); crypto.getRandomValues(b);
  return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}
const pill = (code) => `<button type="button" class="chip" data-copy="${esc(code)}" aria-label="Copy ${esc(code)}">${icon('copy')} <b class="num">${esc(code)}</b></button>`;

export async function accountsView({ el }) {
  const [codes, admins, students, adminCodes] = await Promise.all([getCodes('schoolCodes'), getAdmins(), getAllStudents(), getCodes('adminCodes')]);
  const nameOf = new Map(students.map((s) => [s.id, s]));
  const real = codes.filter((c) => nameOf.has(c.id));
  const done = real.filter((c) => c.claimed), pending = real.filter((c) => !c.claimed);
  let q = '';

  el.innerHTML = `<div class="page-head"><div><h2>Accounts &amp; codes</h2><p>Parent codes never change. Each code is used once to create a login.</p></div></div>
  <div class="stack">
    <div class="grid cols-3 keep2">${statCard('Parent accounts created', done.length, { tone: 'ok', sub: `of ${real.length} families` })}${statCard('Codes not yet used', pending.length, { tone: pending.length ? 'warn' : 'ok' })}${statCard('Administrators', admins.length)}</div>

    <div class="card"><div class="card-head"><h3>Give an administrator access</h3></div>
      <p class="muted small">Create a one-time code and send it to your staff member. They choose <b>School staff → First time</b> on the login page, enter it, and set their own password. Each code works once.</p>
      <form id="adminForm" class="inline-form"><div class="field"><label for="al">Who is it for?</label><input id="al" required placeholder="e.g. Bursar" maxlength="40"></div><button class="btn btn-primary" type="submit">Create code</button></form><div id="adminOut"></div>
      ${adminCodes.filter((c) => !c.claimed).length ? `<p class="small" style="margin:14px 0 6px"><b>Unused codes</b></p><div class="chips">${adminCodes.filter((c) => !c.claimed).map((c) => `<span class="chip">${esc(c.label || '')} ${pill(c.id)}<button class="link-btn" data-revoke-code="${esc(c.id)}" aria-label="Cancel code">${icon('x')}</button></span>`).join('')}</div>` : ''}</div>

    <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>Current administrators</h3></div>
      ${admins.length ? `<div class="table-wrap" style="border:0"><table class="t cards"><thead><tr><th>Name</th><th>Email</th><th>Since</th><th></th></tr></thead><tbody>${admins.map((a) => `<tr><td data-l="Name"><b>${esc(a.displayName || a.label || '—')}</b></td><td data-l="Email">${esc(a.email || '')}</td><td data-l="Since" class="num">${esc((a.createdAt || '').slice(0, 10))}</td><td><button class="btn btn-sm btn-danger" data-remove-admin="${esc(a.id)}">Remove access</button></td></tr>`).join('')}</tbody></table></div>` : `<div style="padding:16px">${empty('No administrators yet')}</div>`}</div>

    <div class="card"><div class="card-head"><h3>Add a new student (new parent code)</h3></div>
      <form id="stuForm" class="inline-form"><div class="field"><label for="sn">Student name (SURNAME first)</label><input id="sn" required placeholder="e.g. ADEBAYO TOLUWANI"></div><div class="field"><label for="sc">Class</label><input id="sc" required placeholder="e.g. Primary 3"></div><button class="btn btn-primary" type="submit">Create code</button></form><div id="stuOut"></div>
      <p class="muted small" style="margin:10px 0 0">For many new students, import the new term's sheet instead — codes are created automatically.</p></div>

    <div class="card"><div class="card-head"><h3>Add another child to a parent's login</h3></div>
      <form id="linkForm" class="inline-form"><div class="field"><label for="le">Parent's email</label><input id="le" type="email" required></div><div class="field"><label for="lc">Child's code</label><input id="lc" required style="text-transform:uppercase"></div><button class="btn btn-primary" type="submit">Link</button></form><div id="linkOut"></div></div>

    <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>Parents who have not signed up yet</h3><button class="btn btn-sm" id="csv">${icon('download')} CSV</button></div>
      <div style="padding:0 16px 12px"><div class="search">${icon('search', '')}<input id="q" type="search" placeholder="Search by student name"></div></div><div id="pend"></div></div>
  </div>`;
  const $ = (s) => el.querySelector(s);

  function paintPending() {
    const rows = pending.map((c) => ({ c, s: nameOf.get(c.id) })).filter((x) => !q || (x.s.name || '').toUpperCase().includes(q.toUpperCase()))
      .sort((a, b) => (a.s.name || '').localeCompare(b.s.name || ''));
    $('#pend').innerHTML = rows.length ? `<div class="table-wrap" style="border:0;max-height:460px;overflow:auto"><table class="t cards"><thead><tr><th>Student</th><th>Class</th><th>Code</th></tr></thead><tbody>${rows.map(({ c, s }) => `<tr><td data-l="Student"><b>${esc(s.name)}</b></td><td data-l="Class">${esc(s.class || '')}</td><td data-l="Code">${pill(c.id)}</td></tr>`).join('')}</tbody></table></div>` : `<div style="padding:16px">${empty('Everyone has signed up', '', 'check')}</div>`;
  }
  paintPending();

  el.addEventListener('input', debounce((e) => { if (e.target.id === 'q') { q = e.target.value.trim(); paintPending(); } }, 150));
  el.addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copy]'); if (cp) { copyText(cp.dataset.copy); return; }
    if (e.target.closest('#csv')) { downloadCsv('kbis-unused-codes.csv', ['Student', 'Class', 'Code'], pending.map((c) => [nameOf.get(c.id).name, nameOf.get(c.id).class || '', c.id])); return; }
    const rm = e.target.closest('[data-remove-admin]');
    if (rm && confirm('Remove this administrator’s access? They will no longer be able to open the portal.')) {
      try { await deleteDoc(doc(db, 'admins', rm.dataset.removeAdmin)); clearCache(); toast('Access removed', 'ok'); location.reload(); } catch (err) { toast('Could not remove access.', 'bad'); }
    }
    const rc = e.target.closest('[data-revoke-code]');
    if (rc && confirm('Cancel this unused code?')) { try { await deleteDoc(doc(db, 'adminCodes', rc.dataset.revokeCode)); clearCache(); location.reload(); } catch (err) { toast('Could not cancel the code.', 'bad'); } }
  });

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    if (e.target.id === 'adminForm') await withLoading(btn, async () => {
      const code = randomCode(); const label = $('#al').value.trim();
      try { await setDoc(doc(db, 'adminCodes', code), { label, claimed: false, createdAt: new Date().toISOString() }); clearCache();
        $('#adminOut').innerHTML = `<div class="msg ok" style="margin-top:12px">Code for <b>${esc(label)}</b>: ${pill(code)}<br><span class="small">Send it to them privately. It works once.</span></div>`; e.target.reset();
      } catch (err) { toast('Could not create the code.', 'bad'); }
    });
    if (e.target.id === 'stuForm') await withLoading(btn, async () => {
      try {
        const name = $('#sn').value.trim().toUpperCase().replace(/\s+/g, ' '); const [last, ...rest] = name.split(' '); const first = rest.join(' ') || last;
        const max = codes.reduce((m, c) => Math.max(m, typeof c.index === 'number' ? c.index : -1), -1);
        const id = makeCode(last, first, max + 1); const ck = classKey($('#sc').value);
        await setDoc(doc(db, 'students', id), { name, class: classLabel(ck), classKey: ck, createdAt: new Date().toISOString() }, { merge: true });
        await setDoc(doc(db, 'schoolCodes', id), { studentId: id, index: max + 1, claimed: false, createdAt: new Date().toISOString() });
        clearCache(); $('#stuOut').innerHTML = `<div class="msg ok" style="margin-top:12px">Code for <b>${esc(name)}</b>: ${pill(id)}</div>`; e.target.reset();
      } catch (err) { toast('Could not create the code.', 'bad'); }
    });
    if (e.target.id === 'linkForm') await withLoading(btn, async () => {
      const out = $('#linkOut');
      try {
        const email = $('#le').value.trim(); const code = $('#lc').value.trim().toUpperCase();
        const snap = await getDocs(query(collection(db, 'parents'), where('email', '==', email)));
        if (snap.empty) { out.innerHTML = `<div class="msg error" style="margin-top:12px">No parent login found with that email.</div>`; return; }
        const c = codes.find((x) => x.id === code); if (!c) { out.innerHTML = `<div class="msg error" style="margin-top:12px">That code was not recognised.</div>`; return; }
        if (c.claimed) { out.innerHTML = `<div class="msg error" style="margin-top:12px">That code has already been used.</div>`; return; }
        const uid = snap.docs[0].id;
        await updateDoc(doc(db, 'parents', uid), { linkedStudents: arrayUnion(c.studentId || code) });
        await updateDoc(doc(db, 'schoolCodes', code), { claimed: true, claimedByUid: uid, claimedAt: new Date().toISOString() });
        clearCache(); out.innerHTML = `<div class="msg ok" style="margin-top:12px">Linked. That child now shows on the parent's login.</div>`; e.target.reset();
      } catch (err) { out.innerHTML = `<div class="msg error" style="margin-top:12px">Could not link. Try again.</div>`; }
    });
  });
}
