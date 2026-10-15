// One student: fees by session/term, payments and the account (code) status.
import { esc, money, badge, termLabel, icon, copyText, empty, openModal } from '../ui.js';
import { getStudent, getRecords, getStudentPayments, getCodeInfo, getParent } from '../data.js';
import { ledgerHtml, ringHtml, historyTable, paymentsTable, dedupePayments } from './common.js';

export async function studentDetailView({ el, params, role }) {
  const id = params[0];
  const [student, records, pays, code] = await Promise.all([
    getStudent(id), getRecords(id), getStudentPayments(id).catch(() => []), getCodeInfo(id)
  ]);
  if (!student) { el.innerHTML = `<div class="card">${empty('Student not found', 'This record may have been removed.', 'search')}<div style="text-align:center"><a class="btn" href="#/students">Back to students</a></div></div>`; return; }

  let parentEmail = '';
  if (role === 'owner' && code && code.claimedByUid) { try { parentEmail = (await getParent(code.claimedByUid))?.email || ''; } catch (e) { /* ignore */ } }

  const latest = records[records.length - 1];
  let sel = latest ? latest.id : '';
  let tab = 'fees';

  const accountBadge = student.alumni ? '<span class="badge">Past student · no parent code</span>'
    : code ? (code.claimed ? '<span class="badge ok">Parent account created</span>' : '<span class="badge warn">Code not yet used</span>') : '';

  el.innerHTML = `
  <p><a href="#/students" class="small">← All students</a></p>
  <div class="card stack">
    <div class="child-head"><div style="flex:1;min-width:200px"><h2>${esc(student.name)}</h2>
      <div class="muted">${esc(student.class || '')}${student.lastSession ? ` · last seen ${esc(student.lastSession)}` : ''}</div></div>
      ${accountBadge}</div>
    ${!student.alumni ? `<div class="toolbar"><span class="muted small">Parent code</span><button class="chip" id="copyCode" aria-label="Copy parent code">${icon('copy')} <b class="num">${esc(id)}</b></button>${parentEmail ? `<span class="muted small">Account: ${esc(parentEmail)}</span>` : ''}</div>` : ''}
  </div>
  <div class="seg" role="tablist" style="margin:16px 0" id="tabs">
    <button role="tab" data-t="fees" aria-selected="true">Fees</button>
    <button role="tab" data-t="history" aria-selected="false">All sessions <span class="count">${records.length}</span></button>
    <button role="tab" data-t="pay" aria-selected="false">Payments <span class="count">${pays.length}</span></button>
  </div>
  <div id="panel"></div>`;

  const panel = el.querySelector('#panel');
  function paint() {
    el.querySelectorAll('#tabs [data-t]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
    if (tab === 'history') { panel.innerHTML = historyTable(records, { onClickAttr: true }); return; }
    if (tab === 'pay') { panel.innerHTML = paymentsTable(dedupePayments(pays)); return; }
    if (!records.length) { panel.innerHTML = `<div class="card">${empty('No fee records yet', 'Nothing has been imported for this student.')}</div>`; return; }
    const rec = records.find((r) => r.id === sel) || latest;
    panel.innerHTML = `<div class="card stack">
      <div class="child-head"><div class="field" style="margin:0;min-width:220px"><label for="recSel">Session and term</label>
        <select id="recSel">${[...records].reverse().map((r) => `<option value="${esc(r.id)}" ${r.id === rec.id ? 'selected' : ''}>${esc(r.session)} · ${termLabel(r.term)}</option>`).join('')}</select></div>
        <div style="flex:1"></div>${badge(rec.status)}${ringHtml(rec.paid, rec.due, rec.balance <= 0)}</div>
      <div class="muted small">${esc(rec.class)}${rec.discountRate ? ` · ${Math.round(rec.discountRate * 100)}% tuition discount` : ''}</div>
      ${ledgerHtml(rec)}</div>`;
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('#tabs [data-t]'); if (t) { tab = t.dataset.t; paint(); return; }
    if (e.target.closest('#copyCode')) { copyText(id); return; }
    const r = e.target.closest('tr[data-rec]'); if (r) { sel = r.dataset.rec; tab = 'fees'; paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  el.addEventListener('change', (e) => { if (e.target.id === 'recSel') { sel = e.target.value; paint(); } });
  paint();
}
