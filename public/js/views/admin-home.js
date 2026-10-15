// Administrator home: headcounts and shortcuts only. No school-wide money totals.
import { esc, termLabel, statCard, empty, icon, money } from '../ui.js';
import { getLedgers, getCurrent } from '../data.js';

export async function adminHomeView({ el, roleData }) {
  const [ledgers, cur] = await Promise.all([getLedgers(), getCurrent()]);
  const L = ledgers.find((l) => l.session === cur.session && l.term === cur.term) || ledgers[ledgers.length - 1];
  const name = ((roleData && roleData.displayName) || '').split(' ')[0];
  if (!L) { el.innerHTML = `<div class="page-head"><div><h2>Welcome${name ? ', ' + esc(name) : ''}</h2></div></div><div class="card">${empty('No fee records yet', 'The school owner has not imported any fee records yet.')}</div>`; return; }
  const n = (f) => L.rows.filter(f).length;
  const done = n((r) => r.st === 'paid' || r.st === 'over'), part = n((r) => r.st === 'part'), none = n((r) => r.st === 'unpaid');
  const link = (st) => `#/students?session=${encodeURIComponent(L.session)}&term=${L.term}&status=${st}`;
  const biggest = [...L.rows].filter((r) => r.bal > 0).sort((a, b) => b.bal - a.bal).slice(0, 5);
  el.innerHTML = `
  <div class="page-head"><div><h2>Welcome${name ? ', ' + esc(name) : ''}</h2><p>${esc(L.session)} · ${termLabel(L.term)} · ${L.rows.length} students</p></div></div>
  <div class="grid cols-4 keep2 reveal">
    <a href="${link('paid')}" style="text-decoration:none;color:inherit">${statCard('Completed payment', done, { sub: 'students', tone: 'ok' })}</a>
    <a href="${link('part')}" style="text-decoration:none;color:inherit">${statCard('Part-paid', part, { sub: 'students', tone: 'warn' })}</a>
    <a href="${link('unpaid')}" style="text-decoration:none;color:inherit">${statCard('Not paid yet', none, { sub: 'students', tone: 'bad' })}</a>
    <a href="${link('owing')}" style="text-decoration:none;color:inherit">${statCard('Still owing', part + none, { sub: 'students in total', tone: 'info' })}</a>
  </div>
  <div class="grid cols-2" style="margin-top:16px">
    <div class="card"><div class="card-head"><h3>Where to?</h3></div><div class="stack">
      <a class="btn" href="#/students">${icon('users')} Find a student</a>
      <a class="btn" href="${link('owing')}">${icon('alert')} Students who are owing</a>
      <a class="btn" href="${link('paid')}">${icon('check')} Students who have completed</a>
      <a class="btn" href="#/invoices">${icon('doc')} New-student invoice</a>
      <a class="btn" href="#/stock">${icon('box')} Stock</a></div></div>
    <div class="card"><div class="card-head"><h3>Largest individual balances</h3><a class="small" href="${link('owing')}">See all</a></div>
      ${biggest.length ? `<div class="ledger">${biggest.map((r) => `<a class="ledger-row" style="text-decoration:none;color:inherit" href="#/students/${encodeURIComponent(r.id)}"><span>${esc(r.n)} <span class="muted small">· ${esc(r.c)}</span></span><span class="money num" style="color:var(--bad);font-weight:650">${money(r.bal)}</span></a>`).join('')}</div>` : '<p class="muted">Nobody owes anything this term.</p>'}</div>
  </div>`;
}
