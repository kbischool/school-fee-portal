// Owner-only: staff salary by year / month, lesson remittance and stipend sheets.
import { esc, money, moneyShort, statCard, empty, columnChart, fmtDate } from '../ui.js';
import { getSalaries, getOwnerSheets } from '../data.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pay = (r) => r.vals['Amount Payable'] ?? 0;
const paid = (r) => r.vals['Paid'] ?? pay(r);

export async function payrollView({ el, params }) {
  const [sal, sheets] = await Promise.all([getSalaries(), getOwnerSheets()]);
  if (!sal.length && !sheets.length) { el.innerHTML = `<div class="card">${empty('No payroll data yet', 'Import the salary workbook to see it here.', 'briefcase')}</div>`; return; }
  let tab = params[0] || 'salary';
  const years = [...new Set(sal.map((s) => s.year))].sort().reverse();
  let year = years[0], group = 'all', month = 'all';

  el.innerHTML = `<div class="page-head"><div><h2>Staff &amp; payroll</h2><p>Visible to you only.</p></div></div>
    <div class="seg" id="tabs" role="tablist"><button role="tab" data-t="salary">Salaries</button><button role="tab" data-t="remit">Lesson remittance</button><button role="tab" data-t="stipend">Stipends</button></div><div id="p" style="margin-top:16px"></div>`;
  const p = el.querySelector('#p');

  function salary() {
    if (!sal.length) { p.innerHTML = empty('No salary sheets imported'); return; }
    const docs = sal.filter((s) => s.year === year);
    const groups = docs.map((d) => d.group);
    if (group !== 'all' && !groups.includes(group)) group = 'all';
    const use = docs.filter((d) => group === 'all' || d.group === group);
    const monthsInUse = MONTHS.filter((m) => use.some((d) => d.months.some((x) => x.month === m)));
    if (month !== 'all' && !monthsInUse.includes(month)) month = 'all';
    const rowsFor = (m) => use.flatMap((d) => d.months.filter((x) => x.month === m).flatMap((x) => x.rows.map((r) => ({ ...r, group: d.group, month: m }))));
    const perMonth = monthsInUse.map((m) => { const r = rowsFor(m); return { m, n: r.length, payable: r.reduce((s, x) => s + pay(x), 0), paid: r.reduce((s, x) => s + paid(x), 0) }; });
    const total = perMonth.reduce((s, x) => s + x.payable, 0), totalPaid = perMonth.reduce((s, x) => s + x.paid, 0);
    const chosen = month === 'all' ? null : rowsFor(month);
    const cols = [...new Set(use.flatMap((d) => d.columns))].filter((c) => ['Basic Salary', '1% Tax Deduction', 'Extra Bonus', 'Deduction', 'Outstanding', 'Amount Payable', 'Paid', 'Balance'].includes(c));
    p.innerHTML = `<div class="toolbar no-print" style="margin-bottom:16px"><select id="y" aria-label="Year">${years.map((y) => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <select id="g" aria-label="Staff group"><option value="all">All groups</option>${groups.map((g) => `<option ${g === group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
      <select id="m" aria-label="Month"><option value="all">Whole year</option>${monthsInUse.map((m) => `<option ${m === month ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="grid auto" style="margin-bottom:16px">${statCard('Payroll for the period', money(total), { tone: 'info' })}${statCard('Paid out', money(totalPaid), { tone: 'ok' })}${statCard('Months recorded', monthsInUse.length)}${statCard('Average per month', money(monthsInUse.length ? total / monthsInUse.length : 0))}</div>
      <div class="card" style="margin-bottom:16px"><div class="card-head"><h3>Payroll each month, ${esc(year)}</h3></div>${columnChart(perMonth.map((x) => ({ label: x.m.slice(0, 3), value: x.payable })), { color: 'var(--chart-2)' })}</div>
      ${chosen ? `<div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>${esc(month)} ${esc(year)}</h3></div><div class="table-wrap" style="border:0"><table class="t cards"><thead><tr><th>Name</th><th>Group</th>${cols.map((c) => `<th class="r">${esc(c)}</th>`).join('')}</tr></thead><tbody>
        ${chosen.map((r) => `<tr><td data-l="Name"><div class="who-cell"><b>${esc(r.name)}</b><span>${esc(r.bank || '')}${r.contract ? ' · ' + esc(r.contract) : ''}</span></div></td><td data-l="Group">${esc(r.group)}</td>${cols.map((c) => `<td class="r money num" data-l="${esc(c)}">${r.vals[c] !== undefined ? money(r.vals[c]) : '—'}</td>`).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr><td>${chosen.length} staff</td><td></td>${cols.map((c) => `<td class="r money num">${money(chosen.reduce((s, r) => s + (r.vals[c] || 0), 0))}</td>`).join('')}</tr></tfoot></table></div></div>`
        : `<div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>By month</h3><span class="muted small">Pick a month above to see each person</span></div><div class="table-wrap" style="border:0"><table class="t cards"><thead><tr><th>Month</th><th class="r">Staff</th><th class="r">Payable</th><th class="r">Paid</th></tr></thead><tbody>${perMonth.map((x) => `<tr class="click" data-m="${x.m}"><td data-l="Month"><b>${x.m}</b></td><td class="r num" data-l="Staff">${x.n}</td><td class="r money num" data-l="Payable">${money(x.payable)}</td><td class="r money num" data-l="Paid">${money(x.paid)}</td></tr>`).join('')}</tbody></table></div></div>`}`;
  }

  function grids(kind) {
    const list = sheets.filter((s) => s.kind === kind).sort((a, b) => (b.sessionKey + b.term).localeCompare(a.sessionKey + a.term));
    if (!list.length) { p.innerHTML = empty(kind === 'remit' ? 'No remittance sheets imported' : 'No stipend sheets imported'); return; }
    p.innerHTML = `<div class="stack">${list.map((s) => `<div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>${esc(s.title)}</h3><span class="muted small">${esc(s.session || '')}</span></div><div class="table-wrap" style="border:0"><table class="t"><tbody>
      ${(s.grid || []).filter((r) => r.cells.some((c) => c !== null)).map((r, i) => `<tr>${r.cells.map((c) => {
        const isDate = typeof c === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c);
        return `<td class="${typeof c === 'number' ? 'r money num' : ''}" ${i === 0 ? 'style="font-weight:700"' : ''}>${c === null ? '' : isDate ? fmtDate(c) : typeof c === 'number' ? money(c) : esc(c)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></div>`).join('')}</div>`;
  }

  function paint() {
    el.querySelectorAll('#tabs [data-t]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
    if (tab === 'remit') grids('remit'); else if (tab === 'stipend') grids('stipend'); else salary();
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('#tabs [data-t]'); if (t) { tab = t.dataset.t; paint(); return; }
    const m = e.target.closest('tr[data-m]'); if (m) { month = m.dataset.m; paint(); }
  });
  el.addEventListener('change', (e) => { if (e.target.id === 'y') year = e.target.value; else if (e.target.id === 'g') group = e.target.value; else if (e.target.id === 'm') month = e.target.value; else return; paint(); });
  paint();
}
