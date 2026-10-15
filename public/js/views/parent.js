// Parent portal: one calm page per child — this term, history, payments, what to collect.
import { esc, money, fmtDate, termLabel, badge, icon, empty, toast, openModal, withLoading, labelCells } from '../ui.js';
import { getStudent, getRecords, getStudentPayments, getParentCatalog, getConfig } from '../data.js';
import { ledgerHtml, ringHtml, historyTable, paymentsTable, dedupePayments } from './common.js';
import { linkAdditionalStudentCode } from '../auth.js';
import { sessionKey } from '../import/util.js';

/** Older data (before sessions were imported) lived on students/{id}.terms — still shown if that is all there is. */
function legacyRecords(student, cfg) {
  const session = cfg.currentSession || 'Current session';
  return Object.entries(student.terms || {}).map(([t, v]) => {
    const due = v.totalDue || 0, paid = v.totalPaid || 0;
    const balance = typeof v.balance === 'number' ? v.balance : due - paid;
    return { id: `legacy_${t}`, session, sessionKey: cfg.currentSession ? sessionKey(session) : 'legacy', term: Number(t) || 1, class: student.class || '', classKey: student.classKey || '',
      due, paid, balance, items: v.items || [], status: balance < 0 ? 'over' : balance === 0 ? (due ? 'paid' : 'nofee') : paid > 0 ? 'part' : 'unpaid' };
  });
}


function openAddChild(parent, onAddChild) {
  const m = openModal({ title: 'Add another child', body: `<form id="f" class="stack"><div class="field"><label for="c">Your child’s school code</label><input id="c" required autocomplete="off" autocapitalize="characters" placeholder="e.g. ADEBAN1001"></div><div id="e" role="alert"></div><button class="btn btn-primary" type="submit">Add child</button></form>` });
  m.el.querySelector('#c').focus();
  m.el.querySelector('#f').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await withLoading(ev.target.querySelector('button'), async () => {
      try { await linkAdditionalStudentCode(parent.uid, ev.target.c.value); toast('Child added', 'ok'); m.close(); onAddChild && onAddChild(true); }
      catch (err) { m.el.querySelector('#e').innerHTML = `<div class="msg error">${esc(err.message)}</div>`; }
    });
  });
}

export async function parentView({ el, parent, onAddChild }) {
  const ids = parent.linkedStudents || [];
  if (!ids.length) { el.innerHTML = `<div class="card">${empty('No child linked yet', 'Add your child’s code to see their fees.', 'users')}<div style="text-align:center"><button class="btn btn-primary" id="addKid">Add a child</button></div></div>`; el.querySelector('#addKid').onclick = () => openAddChild(parent, onAddChild); return; }

  const cfg = await getConfig();
  const kids = (await Promise.all(ids.map(async (id) => ({ id, s: await getStudent(id).catch(() => null) })))).filter((k) => k.s);
  if (!kids.length) { el.innerHTML = `<div class="card">${empty('We could not find your child’s record', 'Please contact the school office.', 'alert')}</div>`; return; }

  let cur = kids[0].id, tab = 'now', sel = null;
  const state = new Map();
  async function load(id) {
    if (state.has(id)) return state.get(id);
    const s = kids.find((k) => k.id === id).s;
    let [records, pays] = await Promise.all([getRecords(id).catch(() => []), getStudentPayments(id).catch(() => [])]);
    if (!records.length) records = legacyRecords(s, cfg);
    const cat = s.classKey ? await getParentCatalog(s.classKey).catch(() => null) : null;
    const v = { s, records, pays: dedupePayments(pays), cat };
    state.set(id, v); return v;
  }

  if (el._ac) el._ac.abort();
  const ac = (el._ac = new AbortController());
  el.innerHTML = `<div id="kidbar" class="no-print"></div><div id="panel" style="margin-top:16px"></div>`;
  const panel = el.querySelector('#panel'), kidbar = el.querySelector('#kidbar');

  async function paint() {
    const v = await load(cur);
    kidbar.innerHTML = `<div class="chips">${kids.map((k) => `<button class="chip" data-kid="${esc(k.id)}" aria-pressed="${k.id === cur}" style="${k.id === cur ? 'border-color:var(--primary);background:var(--primary-soft);font-weight:650' : ''}">${esc(k.s.name.split(' ').slice(1).join(' ') || k.s.name)}</button>`).join('')}
      <button class="chip" id="addKid">${icon('users')} Add another child</button></div>`;
    const latest = v.records[v.records.length - 1];
    if (!sel || !v.records.find((r) => r.id === sel)) sel = latest && latest.id;
    const rec = v.records.find((r) => r.id === sel);
    const TABS = [['now', 'Fees'], ['history', 'Past sessions'], ['pay', 'Payments'], ['collect', 'To collect']];
    let body = '';
    if (tab === 'now') {
      body = !rec ? `<div class="card">${empty('No fees recorded yet', 'Fee details will appear here once the school has published them.')}</div>` : `
      <div class="card stack"><div class="child-head">
        <div style="flex:1;min-width:200px"><div class="muted small">${esc(rec.session)} · ${termLabel(rec.term)}</div><h2>${esc(v.s.name)}</h2><div class="muted">${esc(rec.class || v.s.class || '')}</div></div>
        ${badge(rec.status)}${ringHtml(rec.paid, rec.due, rec.balance <= 0)}</div>
        ${v.records.length > 1 ? `<div class="field no-print" style="margin:0;max-width:300px"><label for="recSel">Session and term</label><select id="recSel">${[...v.records].reverse().map((r) => `<option value="${esc(r.id)}" ${r.id === rec.id ? 'selected' : ''}>${esc(r.session)} · ${termLabel(r.term)}</option>`).join('')}</select></div>` : ''}
        ${rec.discountRate ? `<div class="msg info">${Math.round(rec.discountRate * 100)}% tuition discount applied.</div>` : ''}
        ${ledgerHtml(rec)}
        <div class="toolbar no-print"><button class="btn btn-sm" id="print">${icon('print')} Print statement</button></div></div>`;
    } else if (tab === 'history') {
      body = historyTable(v.records, { onClickAttr: true });
    } else if (tab === 'pay') {
      body = paymentsTable(v.pays);
    } else {
      const cat = v.cat;
      body = !cat || (!(cat.textbooks || []).length && !(cat.stationery || []).length) ? `<div class="card">${empty('Nothing listed yet', 'The school will publish the textbook and stationery lists for your child’s class here.', 'book')}</div>` : `
      <div class="grid cols-2"><div class="card"><div class="card-head"><h3>${icon('book')} Textbooks to collect</h3></div>
        ${(cat.textbooks || []).length ? `<div class="ledger">${cat.textbooks.map((t) => `<div class="ledger-row"><span>${esc(t.title)}</span><span class="muted small">${esc(t.subject || '')}</span></div>`).join('')}</div>` : '<p class="muted">No textbooks listed.</p>'}</div>
      <div class="card"><div class="card-head"><h3>${icon('pencil')} Notebooks &amp; stationery</h3></div>
        ${(cat.stationery || []).length ? `<div class="ledger">${cat.stationery.map((i) => `<div class="ledger-row"><span>${esc(i.item)}</span><b class="num">× ${esc(i.qty)}</b></div>`).join('')}</div>` : '<p class="muted">No list yet.</p>'}</div></div>
      <p class="muted small">Class: ${esc(cat.class || '')}. Collect these from the school office.</p>`;
    }
    panel.innerHTML = `<div class="seg no-print" role="tablist" style="margin-bottom:16px">${TABS.map(([k, l]) => `<button role="tab" data-t="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div>${body}`;
    labelCells(panel);
  }

  el.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-kid]'); if (k) { cur = k.dataset.kid; sel = null; tab = 'now'; paint(); return; }
    const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; paint(); return; }
    const r = e.target.closest('tr[data-rec]'); if (r) { sel = r.dataset.rec; tab = 'now'; paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (e.target.closest('#print')) window.print();
    if (e.target.closest('#addKid')) openAddChild(parent, onAddChild);
  }, { signal: ac.signal });
  el.addEventListener('change', (e) => { if (e.target.id === 'recSel') { sel = e.target.value; paint(); } }, { signal: ac.signal });
  paint();
}
