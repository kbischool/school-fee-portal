// Owner-only payment log: every bank credit, who it was matched to, and a
// way to assign the ones the importer could not match.
import { esc, money, fmtDate, termLabel, statCard, empty, openModal, toast, icon, debounce, downloadCsv, withLoading } from '../ui.js';
import { getLedgers, getCurrent, getPaymentsFor, getAllStudents, clearCache } from '../data.js';
import { db, doc, setDoc, updateDoc } from '../firebase.js';

export async function paymentsView({ el, query }) {
  const [ledgers, cur] = await Promise.all([getLedgers(), getCurrent()]);
  if (!ledgers.length) { el.innerHTML = `<div class="card">${empty('No payments yet', 'Import a fee workbook that includes the pay log.', 'wallet')}</div>`; return; }
  const sessions = [...new Set(ledgers.map((l) => l.session))].sort().reverse();
  let session = query.get('session') || cur.session || sessions[0];
  const termsOf = (s) => ledgers.filter((l) => l.session === s).map((l) => l.term).sort();
  let term = Number(query.get('term')) || (session === cur.session ? cur.term : termsOf(session).slice(-1)[0]);
  let filter = 'all', q = '', pays = [];

  el.innerHTML = `<div class="page-head"><div><h2>Payments</h2><p id="sub"></p></div>
    <div class="toolbar no-print"><select id="s" aria-label="Session"></select><select id="t" aria-label="Term"></select><button class="btn btn-sm" id="csv">${icon('download')} CSV</button></div></div>
    <div id="stats" class="grid auto" style="margin-bottom:16px"></div>
    <div class="card stack no-print"><div class="search">${icon('search', '')}<input id="q" type="search" placeholder="Search payer, family or student"></div>
      <div class="seg" id="f" role="tablist"></div></div><div id="list" style="margin-top:16px"></div>`;
  const $ = (s) => el.querySelector(s);
  const nameOf = new Map();

  async function load() {
    $('#list').innerHTML = '<div class="sk sk-card"></div>';
    pays = await getPaymentsFor(session.replace('/', '-'), term);
    const L = ledgers.find((l) => l.session === session && l.term === term);
    (L ? L.rows : []).forEach((r) => nameOf.set(r.id, r.n));
    paint();
  }
  function paint() {
    $('#s').innerHTML = sessions.map((s) => `<option ${s === session ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $('#t').innerHTML = termsOf(session).map((t) => `<option value="${t}" ${t === term ? 'selected' : ''}>${termLabel(t)}</option>`).join('');
    const total = pays.reduce((s, p) => s + p.amount, 0);
    const un = pays.filter((p) => !p.matched);
    $('#sub').textContent = `${session} · ${termLabel(term)} · ${pays.length} payments`;
    $('#stats').innerHTML = statCard('Received', money(total), { tone: 'ok', sub: `${pays.length} payments` }) +
      statCard('Matched to students', money(total - un.reduce((s, p) => s + p.amount, 0)), { tone: 'info' }) +
      statCard('Needs a student', money(un.reduce((s, p) => s + p.amount, 0)), { tone: un.length ? 'warn' : 'ok', sub: `${un.length} payments` });
    const F = [['all', 'All', pays.length], ['un', 'Needs a student', un.length], ['fee', 'School fee', pays.filter((p) => /school fee/i.test(p.purpose)).length], ['other', 'Other purposes', pays.filter((p) => !/school fee/i.test(p.purpose)).length]];
    $('#f').innerHTML = F.map(([k, l, n]) => `<button role="tab" data-f="${k}" aria-selected="${filter === k}">${l} <span class="count">${n}</span></button>`).join('');
    const needle = q.toUpperCase();
    const rows = pays.filter((p) => (filter === 'all' || (filter === 'un' && !p.matched) || (filter === 'fee' && /school fee/i.test(p.purpose)) || (filter === 'other' && !/school fee/i.test(p.purpose))) &&
      (!needle || `${p.label} ${p.narration} ${(p.studentIds || []).map((i) => nameOf.get(i) || '').join(' ')}`.toUpperCase().includes(needle)));
    $('#list').innerHTML = rows.length ? `<div class="table-wrap"><table class="t cards"><thead><tr><th>Date</th><th>From (bank narration)</th><th>Recorded for</th><th>Purpose</th><th class="r">Amount</th><th></th></tr></thead><tbody>
      ${rows.map((p) => `<tr><td class="num" data-l="Date">${fmtDate(p.date)}<div class="muted small">${esc(p.bank)}</div></td>
        <td data-l="From"><span class="small">${esc(p.narration || '—')}</span></td>
        <td data-l="For"><b>${esc(p.label)}</b>${p.matched ? `<div class="muted small">${(p.studentIds || []).map((i) => esc(nameOf.get(i) || i)).join(', ')}</div>` : '<div><span class="badge warn">Needs a student</span></div>'}</td>
        <td data-l="Purpose">${esc(p.purpose)}</td><td class="r money num" data-l="Amount">${money(p.amount)}</td>
        <td>${!p.matched && !p.staffMoney ? `<button class="btn btn-sm" data-assign="${esc(p.id)}">Assign</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('Nothing to show', 'Try another filter.')}</div>`;
  }

  async function assign(pid) {
    const p = pays.find((x) => x.id === pid);
    const students = await getAllStudents();
    const m = openModal({ title: 'Assign payment', subtitle: `${esc(money(p.amount))} · ${esc(p.label)} · ${fmtDate(p.date)}`,
      body: `<div class="search">${icon('search', '')}<input id="aq" type="search" placeholder="Type the student's name" autocomplete="off"></div><div id="ar" class="stack"></div>` });
    const ar = m.el.querySelector('#ar');
    const show = debounce(() => {
      const n = m.el.querySelector('#aq').value.trim().toUpperCase();
      if (n.length < 2) { ar.innerHTML = '<p class="muted small">Type at least two letters.</p>'; return; }
      const hits = students.filter((s) => (s.name || '').toUpperCase().includes(n)).slice(0, 8);
      ar.innerHTML = hits.map((s) => `<button class="btn" style="justify-content:space-between" data-pick="${esc(s.id)}"><span>${esc(s.name)}</span><span class="muted small">${esc(s.class || '')}</span></button>`).join('') || '<p class="muted small">No match.</p>';
    });
    m.el.querySelector('#aq').addEventListener('input', show); show();
    ar.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      await withLoading(b, async () => {
        try {
          const sid = b.dataset.pick;
          await updateDoc(doc(db, 'payments', pid), { studentIds: [sid], matched: true, manual: true, mode: 'manual' });
          await setDoc(doc(db, 'students', sid, 'payments', pid), { session: p.session, sessionKey: p.sessionKey, term: p.term, date: p.date, amount: p.amount, purpose: p.purpose, label: p.label, family: false, bank: p.bank || '' });
          clearCache(); nameOf.set(sid, students.find((s) => s.id === sid)?.name || sid);
          Object.assign(p, { studentIds: [sid], matched: true });
          toast('Payment assigned', 'ok'); m.close(); paint();
        } catch (err) { toast('Could not save. Check your connection.', 'bad'); }
      });
    });
  }

  el.addEventListener('change', (e) => { if (e.target.id === 's') { session = e.target.value; term = termsOf(session).slice(-1)[0]; load(); } else if (e.target.id === 't') { term = Number(e.target.value); load(); } });
  el.addEventListener('input', debounce((e) => { if (e.target.id === 'q') { q = e.target.value.trim(); paint(); } }, 150));
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; paint(); return; }
    const a = e.target.closest('[data-assign]'); if (a) { assign(a.dataset.assign); return; }
    if (e.target.closest('#csv')) downloadCsv(`kbis-payments-${session.replace('/', '-')}-t${term}.csv`, ['Date', 'Bank', 'Narration', 'Recorded for', 'Purpose', 'Amount (NGN)', 'Matched'], pays.map((p) => [p.date, p.bank, p.narration, p.label, p.purpose, p.amount, p.matched ? 'yes' : 'no']));
  });
  await load();
}
