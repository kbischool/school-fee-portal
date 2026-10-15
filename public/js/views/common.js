// Pieces used by more than one portal (owner, admin, parent).
import { esc, money, pct, termLabel, badge, fmtDate, empty } from '../ui.js';

export function ringHtml(paid, due, cleared) {
  const p = Math.max(0, Math.min(100, due > 0 ? (paid / due) * 100 : cleared ? 100 : 0));
  const R = 34, C = 2 * Math.PI * R;
  return `<div class="ring ${cleared ? 'done' : ''}" role="img" aria-label="${Math.round(p)} percent paid">
    <svg width="84" height="84" viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="${R}" fill="none" stroke-width="8"/>
    <circle class="bar" cx="42" cy="42" r="${R}" fill="none" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C - (p / 100) * C}"/></svg>
    <b>${Math.round(p)}%</b></div>`;
}

/** One term's itemised statement. `rec` is a document from students/{id}/records. */
export function ledgerHtml(rec) {
  const rows = (rec.items || []).map((i) => `<div class="ledger-row ${i.amount < 0 ? 'neg' : ''}"><span>${esc(i.label)}</span><span class="money num">${money(i.amount)}</span></div>`).join('');
  const bal = rec.balance;
  const cleared = bal <= 0 && (rec.due > 0 || rec.paid > 0);
  return `<div class="ledger">${rows || '<div class="ledger-row"><span class="muted">No itemised charges recorded.</span></div>'}</div>
    <div class="ledger-total"><span>Paid <b class="money num">${money(rec.paid)}</b> of <b class="money num">${money(rec.due)}</b></span>
    <span class="${cleared ? 'cleared' : 'due'} money num">${bal < 0 ? money(-bal) + ' credit' : bal === 0 ? 'Fully paid' : money(bal) + ' due'}</span></div>`;
}

/** Session history table from a student's records. */
export function historyTable(records, { onClickAttr = '' } = {}) {
  if (!records.length) return empty('No fee history yet', 'Records appear here once they have been imported.');
  const rows = [...records].reverse().map((r) => `<tr ${onClickAttr ? `data-rec="${esc(r.id)}" class="click"` : ''}>
    <td><b>${esc(r.session)}</b><br><span class="muted small">${termLabel(r.term)}</span></td><td>${esc(r.class)}</td>
    <td class="r money num">${money(r.due)}</td><td class="r money num">${money(r.paid)}</td><td class="r money num">${money(r.balance)}</td><td>${badge(r.status)}</td></tr>`).join('');
  return `<div class="table-wrap"><table class="t cards"><thead><tr><th>Session</th><th>Class</th><th class="r">Fees</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function paymentsTable(pays) {
  if (!pays.length) return empty('No payments recorded', 'Payments credited to this family appear here.');
  const total = pays.filter((p) => !p.dup).reduce((s, p) => s + p.amount, 0);
  const rows = pays.map((p) => `<tr><td class="num">${fmtDate(p.date)}</td><td>${esc(p.session)} · ${termLabel(p.term)}</td><td>${esc(p.purpose || 'School fee')}${p.family ? ' <span class="badge info">Family payment</span>' : ''}</td><td class="r money num">${money(p.amount)}</td></tr>`).join('');
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Date</th><th>Term</th><th>For</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">Total of payments listed</td><td class="r money num">${money(total)}</td></tr></tfoot></table></div>
    <p class="muted small" style="margin-top:8px">Payments made for several children at once appear under each child. The statement above is the official balance.</p>`;
}

export function dedupePayments(pays) {
  const seen = new Set();
  return pays.map((p) => { const dup = seen.has(p.id); seen.add(p.id); return { ...p, dup }; });
}
export { pct };
