// New-student invoice: what each class pays on joining (owner and admins).
import { esc, money, empty } from '../ui.js';
import { getInvoices } from '../data.js';
import { classRank } from '../import/util.js';

export async function invoicesView({ el }) {
  const inv = await getInvoices();
  if (!inv || !inv.rows || !inv.rows.length) { el.innerHTML = `<div class="card">${empty('No invoice sheet yet', 'The new-student invoice appears here after it is imported.', 'doc')}</div>`; return; }
  const rows = [...inv.rows].sort((a, b) => classRank(a.classKey) - classRank(b.classKey));
  const labels = [...new Set(rows.flatMap((r) => r.items.map((i) => i.label)))];
  let open = rows[0].classKey;
  el.innerHTML = `<div class="page-head"><div><h2>New-student invoice</h2><p>What a new student in each class is billed on joining.</p></div><button class="btn btn-sm no-print" id="printBtn">Print</button></div>
    <div class="grid cols-2" style="grid-template-columns:minmax(0,260px) minmax(0,1fr);align-items:start" id="g">
      <div class="card pad-0 no-print"><ul class="nav" style="list-style:none;margin:0;padding:8px" id="cl">${rows.map((r) => `<li><a href="#" data-k="${esc(r.classKey)}"><span>${esc(r.class)}</span><span class="num" style="margin-left:auto">${money(r.total)}</span></a></li>`).join('')}</ul></div>
      <div id="one"></div></div>
    <div class="card pad-0" style="margin-top:16px"><div class="card-head" style="padding:16px 16px 0"><h3>All classes side by side</h3></div>
      <div class="table-wrap" style="border:0"><table class="t"><thead><tr><th>Class</th>${labels.map((l) => `<th class="r">${esc(l)}</th>`).join('')}<th class="r">Total</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td><b>${esc(r.class)}</b></td>${labels.map((l) => { const it = r.items.find((i) => i.label === l); return `<td class="r money num">${it ? money(it.amount) : '—'}</td>`; }).join('')}<td class="r money num"><b>${money(r.total)}</b></td></tr>`).join('')}</tbody></table></div></div>`;
  el.querySelector('#printBtn').addEventListener('click', () => window.print());
  const one = el.querySelector('#one');
  const paint = () => {
    const r = rows.find((x) => x.classKey === open);
    el.querySelectorAll('#cl a').forEach((a) => (a.dataset.k === open ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    one.innerHTML = `<div class="card"><div class="card-head"><h3>${esc(r.class)}</h3></div><div class="ledger">${r.items.map((i) => `<div class="ledger-row"><span>${esc(i.label)}</span><span class="money num">${money(i.amount)}</span></div>`).join('')}</div>
      <div class="ledger-total"><span>Total on joining</span><span class="due money num" style="color:var(--ink)">${money(r.total)}</span></div></div>`;
  };
  el.addEventListener('click', (e) => { const a = e.target.closest('#cl a'); if (a) { e.preventDefault(); open = a.dataset.k; paint(); } });
  const mq = () => { const g = el.querySelector('#g'); if (!g || !g.isConnected) { window.removeEventListener('resize', mq); return; } g.style.gridTemplateColumns = window.innerWidth < 860 ? '1fr' : 'minmax(0,260px) minmax(0,1fr)'; };
  mq(); window.addEventListener('resize', mq); paint();
}
