// Student list: searchable, filterable by session / term / class / payment status.
// Shown to the owner (with totals) and to admins (individual figures only).
import { esc, money, badge, STATUS, termLabel, downloadCsv, debounce, empty, icon, statCard, sortByClass, classRank } from '../ui.js';
import { getLedgers, getCurrent, totalsOf } from '../data.js';

const PAGE = window.innerWidth < 700 ? 15 : 40;

export async function studentsView({ el, query, showTotals }) {
  const [ledgers, cur] = await Promise.all([getLedgers(), getCurrent()]);
  if (!ledgers.length) { el.innerHTML = `<div class="card">${empty('No fee records yet', showTotals ? 'Open “Import data” to upload your fee sheets.' : 'The school owner has not imported any fee records yet.')}</div>`; return; }

  const sessions = [...new Set(ledgers.map((l) => l.session))].sort().reverse();
  const f = {
    session: query.get('session') || cur.session || sessions[0],
    term: Number(query.get('term')) || 0,
    status: query.get('status') || 'all',
    cls: query.get('cls') || '', q: '', page: 0, sort: 'name'
  };
  const termsOf = (s) => ledgers.filter((l) => l.session === s).map((l) => l.term).sort();
  if (!termsOf(f.session).includes(f.term)) f.term = f.session === cur.session && termsOf(f.session).includes(cur.term) ? cur.term : termsOf(f.session).slice(-1)[0];

  el.innerHTML = `
  <div class="page-head"><div><h2>Students</h2><p id="sub"></p></div>
    <div class="toolbar no-print"><button class="btn btn-sm" id="csv">${icon('download')} Export CSV</button><button class="btn btn-sm" id="print">${icon('print')} Print</button></div></div>
  <div class="card stack no-print">
    <div class="grid cols-4" style="gap:12px">
      <div class="field" style="margin:0"><label for="fs">Session</label><select id="fs"></select></div>
      <div class="field" style="margin:0"><label for="ft">Term</label><select id="ft"></select></div>
      <div class="field" style="margin:0"><label for="fc">Class</label><select id="fc"></select></div>
      <div class="field" style="margin:0"><label for="fq">Search</label><div class="search">${icon('search', '')}<input id="fq" type="search" placeholder="Name or class" autocomplete="off"></div></div>
    </div>
    <div class="scroll-x"><div class="seg" id="tabs" role="tablist" aria-label="Payment status"></div></div>
  </div>
  <div id="totals" class="grid auto" style="margin:16px 0"></div>
  <div id="list"></div>`;

  const $id = (i) => el.querySelector('#' + i);
  const ledger = () => ledgers.find((l) => l.session === f.session && l.term === f.term);

  function fillSelects() {
    $id('fs').innerHTML = sessions.map((s) => `<option ${s === f.session ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $id('ft').innerHTML = termsOf(f.session).map((t) => `<option value="${t}" ${t === f.term ? 'selected' : ''}>${termLabel(t)}</option>`).join('');
    const classes = [...new Map((ledger()?.rows || []).map((r) => [r.ck, r.c])).entries()].sort((a, b) => classRank(a[0]) - classRank(b[0]));
    $id('fc').innerHTML = `<option value="">All classes</option>` + classes.map(([k, l]) => `<option value="${esc(k)}" ${k === f.cls ? 'selected' : ''}>${esc(l)}</option>`).join('');
  }

  // Filters other than payment status (class + search).
  const base = (r) => {
    if (f.cls && r.ck !== f.cls) return false;
    if (f.q) { const q = f.q.toUpperCase(); if (!r.n.toUpperCase().includes(q) && !(r.c || '').toUpperCase().includes(q)) return false; }
    return true;
  };
  const byStatus = {
    all: () => true,
    paid: (r) => r.st === 'paid' || r.st === 'over',
    owing: (r) => r.st === 'part' || r.st === 'unpaid',
    part: (r) => r.st === 'part',
    unpaid: (r) => r.st === 'unpaid'
  };

  function render() {
    const L = ledger();
    const all = (L ? L.rows : []).filter(base);
    const TABS = [['all', 'All'], ['paid', 'Completed'], ['owing', 'Owing'], ['part', 'Part-paid'], ['unpaid', 'Not paid']];
    $id('tabs').innerHTML = TABS.map(([k, l]) => `<button role="tab" data-s="${k}" aria-selected="${f.status === k}">${l} <span class="count">${all.filter(byStatus[k]).length}</span></button>`).join('');

    const rows = all.filter(byStatus[f.status] || byStatus.all).sort(f.sort === 'balance' ? (a, b) => b.bal - a.bal : sortByClass);
    $id('sub').textContent = `${f.session} · ${termLabel(f.term)} · ${rows.length} student${rows.length === 1 ? '' : 's'}`;

    // Money totals are for the owner only; admins see counts, never overall amounts.
    const t = totalsOf(rows);
    $id('totals').innerHTML = showTotals
      ? statCard('Fees', money(t.due), { tone: 'info' }) + statCard('Paid', money(t.paid), { tone: 'ok' }) + statCard('Outstanding', money(t.owed), { tone: t.owed ? 'bad' : 'ok' })
      : '';

    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    f.page = Math.min(f.page, pages - 1);
    const slice = rows.slice(f.page * PAGE, f.page * PAGE + PAGE);
    $id('list').innerHTML = rows.length ? `<div class="table-wrap"><table class="t cards"><thead><tr><th>Student</th><th class="r">Fees</th><th class="r">Paid</th><th class="r"><button class="link-btn" id="sortBal" style="text-decoration:none;color:inherit;font-weight:700">Balance ${f.sort === 'balance' ? '↓' : ''}</button></th><th>Status</th></tr></thead><tbody>
      ${slice.map((r) => `<tr class="click" data-id="${esc(r.id)}" tabindex="0"><td data-l="Student"><div class="who-cell"><b>${esc(r.n)}</b><span>${esc(r.c)}</span></div></td>
        <td class="r money num" data-l="Fees">${money(r.due)}</td><td class="r money num" data-l="Paid">${money(r.paid)}</td>
        <td class="r money num" data-l="Balance" style="${r.bal > 0 ? 'color:var(--bad);font-weight:650' : ''}">${money(r.bal)}</td><td data-l="Status">${badge(r.st)}</td></tr>`).join('')}</tbody></table>
      <div class="pager"><span>Showing ${f.page * PAGE + 1}–${f.page * PAGE + slice.length} of ${rows.length}</span><span class="toolbar"><button class="btn btn-sm" id="prev" ${f.page === 0 ? 'disabled' : ''}>Previous</button><button class="btn btn-sm" id="next" ${f.page >= pages - 1 ? 'disabled' : ''}>Next</button></span></div></div>`
      : `<div class="card">${empty('No students match', 'Try another status, class or search.', 'search')}</div>`;
    f.rows = rows;
  }

  el.addEventListener('change', (e) => {
    if (e.target.id === 'fs') { f.session = e.target.value; f.term = termsOf(f.session).slice(-1)[0]; f.cls = ''; }
    else if (e.target.id === 'ft') f.term = Number(e.target.value);
    else if (e.target.id === 'fc') f.cls = e.target.value;
    else return;
    f.page = 0; fillSelects(); render();
  });
  el.addEventListener('input', debounce((e) => { if (e.target.id === 'fq') { f.q = e.target.value.trim(); f.page = 0; render(); } }, 150));
  el.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-s]'); if (tab) { f.status = tab.dataset.s; f.page = 0; render(); return; }
    if (e.target.closest('#sortBal')) { f.sort = f.sort === 'balance' ? 'name' : 'balance'; render(); return; }
    if (e.target.closest('#prev')) { f.page--; render(); return; }
    if (e.target.closest('#next')) { f.page++; render(); return; }
    if (e.target.closest('#print')) { window.print(); return; }
    if (e.target.closest('#csv')) {
      const hdr = ['Student', 'Class', 'Session', 'Term', 'Fees (NGN)', 'Paid (NGN)', 'Balance (NGN)', 'Status'];
      downloadCsv(`kbis-students-${f.session.replace('/', '-')}-t${f.term}.csv`, hdr, f.rows.map((r) => [r.n, r.c, f.session, termLabel(f.term), r.due, r.paid, r.bal, STATUS[r.st]]));
      return;
    }
    const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/students/${encodeURIComponent(tr.dataset.id)}`;
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = `#/students/${encodeURIComponent(tr.dataset.id)}`; } });

  fillSelects(); render();
}
