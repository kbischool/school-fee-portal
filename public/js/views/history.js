// Fee history by session. Owner sees money; admins see headcounts only.
import { esc, money, moneyShort, pct, termLabel, columnChart, statCard, statusBar, empty, bars } from '../ui.js';
import { getLedgers, totalsOf } from '../data.js';

export async function historyView({ el, showTotals }) {
  const ledgers = await getLedgers();
  if (!ledgers.length) { el.innerHTML = `<div class="card">${empty('No history yet', 'Imported sessions will be listed here.')}</div>`; return; }
  const sessions = [...new Set(ledgers.map((l) => l.session))].sort().reverse();

  const sessionCard = (s) => {
    const terms = ledgers.filter((l) => l.session === s);
    const rows = terms.map((l) => {
      const t = totalsOf(l.rows);
      return `<tr class="click" data-go="${esc(s)}|${l.term}"><td data-l="Term"><b>${termLabel(l.term)}</b></td><td class="r num" data-l="Students">${t.count}</td>
        ${showTotals ? `<td class="r money num" data-l="Fees">${money(t.due)}</td><td class="r money num" data-l="Paid">${money(t.paid)}</td><td class="r money num" data-l="Outstanding">${money(t.owed)}</td><td class="r num" data-l="Collected">${pct(t.paid, t.due)}%</td>` : ''}
        <td class="r num" data-l="Completed">${t.status.paid + t.status.over}</td><td class="r num" data-l="Owing">${t.status.part + t.status.unpaid}</td></tr>`;
    }).join('');
    return `<div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>${esc(s)} session</h3></div>
      <div class="table-wrap" style="border:0"><table class="t cards"><thead><tr><th>Term</th><th class="r">Students</th>${showTotals ? '<th class="r">Fees</th><th class="r">Paid</th><th class="r">Outstanding</th><th class="r">Collected</th>' : ''}<th class="r">Completed</th><th class="r">Owing</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };

  let trend = '';
  if (showTotals) {
    const series = ledgers.map((l) => { const t = totalsOf(l.rows); return { label: `${l.session.slice(2, 4)}/${l.session.slice(7)} T${l.term}`, value: t.paid, value2: t.due, name2: 'Fees billed' }; });
    trend = `<div class="card"><div class="card-head"><h3>Fees billed vs collected, every term</h3></div>${columnChart(series, { pairs: true, color: 'var(--chart-4)', color2: 'var(--line-strong)' })}
      <div class="legend"><span><i style="background:var(--line-strong)"></i>Fees billed</span><span><i style="background:var(--chart-4)"></i>Collected</span></div></div>`;
  } else {
    const series = ledgers.map((l) => ({ label: `${l.session.slice(2, 4)}/${l.session.slice(7)} T${l.term}`, value: l.rows.length }));
    trend = `<div class="card"><div class="card-head"><h3>Number of students per term</h3></div>${columnChart(series, { format: (v) => String(v), color: 'var(--chart-1)' })}</div>`;
  }
  el.innerHTML = `<div class="page-head"><div><h2>Past sessions</h2><p>Choose a term to open its student list.</p></div></div><div class="stack">${trend}${sessions.map(sessionCard).join('')}</div>`;
  el.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-go]'); if (!tr) return;
    const [s, t] = tr.dataset.go.split('|'); location.hash = `#/students?session=${encodeURIComponent(s)}&term=${t}`;
  });
}
