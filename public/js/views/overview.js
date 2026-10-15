// Owner overview: the financial health of the school for one term, plus how it
// compares with earlier terms. Never shown to administrators.
import { esc, money, moneyShort, pct, termLabel, statCard, bars, statusBar, columnChart, empty, sortByClass, icon } from '../ui.js';
import { getLedgers, getCurrent, totalsOf } from '../data.js';
import { classRank } from '../import/util.js';

export async function overviewView({ el, query }) {
  const [ledgers, cur] = await Promise.all([getLedgers(), getCurrent()]);
  if (!ledgers.length) {
    el.innerHTML = `<div class="card">${empty('Welcome — there is no data yet', 'Open “Import data” in the menu and upload your fee sheets. Your existing parent codes are kept.', 'upload')}<div style="text-align:center"><a class="btn btn-primary" href="#/import">Import data</a></div></div>`;
    return;
  }
  const sessions = [...new Set(ledgers.map((l) => l.session))].sort().reverse();
  let session = query.get('session') || cur.session || sessions[0];
  const termsOf = (s) => ledgers.filter((l) => l.session === s).map((l) => l.term).sort();
  let term = Number(query.get('term')) || (termsOf(session).includes(cur.term) && session === cur.session ? cur.term : termsOf(session).slice(-1)[0]);

  el.innerHTML = `<div class="page-head"><div><h2>Overview</h2><p id="sub"></p></div>
    <div class="toolbar no-print"><select id="s" aria-label="Session"></select><select id="t" aria-label="Term"></select></div></div><div id="body" class="stack"></div>`;
  const body = el.querySelector('#body');

  function paint() {
    el.querySelector('#s').innerHTML = sessions.map((s) => `<option ${s === session ? 'selected' : ''}>${esc(s)}</option>`).join('');
    el.querySelector('#t').innerHTML = termsOf(session).map((t) => `<option value="${t}" ${t === term ? 'selected' : ''}>${termLabel(t)}</option>`).join('');
    const L = ledgers.find((l) => l.session === session && l.term === term);
    if (!L) { body.innerHTML = `<div class="card">${empty('No data for this term')}</div>`; return; }
    const t = totalsOf(L.rows);
    el.querySelector('#sub').textContent = `${session} · ${termLabel(term)} · ${t.count} students`;
    const rate = pct(t.paid, t.due);

    // by class
    const byClass = new Map();
    for (const r of L.rows) { const c = byClass.get(r.ck) || { label: r.c, ck: r.ck, n: 0, due: 0, paid: 0, owed: 0, full: 0 }; c.n++; c.due += r.due; c.paid += r.paid; if (r.bal > 0) c.owed += r.bal; if (r.st === 'paid' || r.st === 'over') c.full++; byClass.set(r.ck, c); }
    const classes = [...byClass.values()].sort((a, b) => classRank(a.ck) - classRank(b.ck));

    // by item
    const items = Object.entries(L.itemTotals || {}).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0).slice(0, 10);

    // trend (every imported term, oldest first)
    const trend = ledgers.map((l) => { const x = totalsOf(l.rows); return { label: `${l.session.slice(2, 4)}/${l.session.slice(7)} T${l.term}`, value: x.paid, value2: x.due, name2: 'Billed' }; });
    const debtors = [...L.rows].filter((r) => r.bal > 0).sort((a, b) => b.bal - a.bal).slice(0, 8);

    body.innerHTML = `
    <div class="grid cols-4 keep2 reveal">
      ${statCard('Total expected', money(t.due), { sub: `${t.count} students billed`, tone: 'info' })}
      ${statCard('Total paid', money(t.paid), { sub: `${rate}% collected`, tone: 'ok' })}
      ${statCard('To be received', money(t.owed), { sub: `${t.status.part + t.status.unpaid} students owing`, tone: t.owed ? 'bad' : 'ok' })}
      ${statCard('Collection rate', rate + '%', { sub: `<div class="progress ${rate >= 100 ? 'done' : ''}" style="margin-top:6px"><i style="width:${Math.min(100, rate)}%"></i></div>` })}
    </div>
    <div class="grid cols-4 keep2">
      ${statCard('Fully paid', t.status.paid + t.status.over, { sub: 'students' })}
      ${statCard('Part-paid', t.status.part, { sub: 'students' })}
      ${statCard('Not paid', t.status.unpaid, { sub: 'students' })}
      ${statCard('Discounts given', money(t.disc), { sub: t.arrears ? `Arrears brought forward ${money(t.arrears)}` : 'on tuition' })}
    </div>
    <div class="grid cols-2" style="align-items:start">
      <div class="card"><div class="card-head"><h3>Payment status</h3></div>${statusBar(t.status)}</div>
      <div class="card"><div class="card-head"><h3>Biggest balances</h3><a class="small" href="#/students?session=${encodeURIComponent(session)}&term=${term}&status=owing">See everyone owing</a></div>
        ${debtors.length ? `<div class="ledger">${debtors.map((r) => `<a class="ledger-row" style="text-decoration:none;color:inherit" href="#/students/${encodeURIComponent(r.id)}"><span>${esc(r.n)} <span class="muted small">· ${esc(r.c)}</span></span><span class="money num" style="color:var(--bad);font-weight:650">${money(r.bal)}</span></a>`).join('')}</div>` : `<p class="muted">Nobody owes anything this term. ${icon('check')}</p>`}</div>
    </div>
    <div class="card"><div class="card-head"><h3>Collection by class</h3></div>
      ${bars(classes.map((c) => ({ label: c.label, value: c.paid, max: Math.max(c.due, 1), display: `${pct(c.paid, c.due)}%`, tone: c.paid >= c.due ? 'ok' : '' })), { max: 1 })}
    </div>
    <div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>Summary by class</h3></div><div class="table-wrap" style="border:0"><table class="t cards"><thead><tr><th>Class</th><th class="r">Students</th><th class="r">Expected</th><th class="r">Paid</th><th class="r">To receive</th><th class="r">Collected</th><th class="r">Fully paid</th></tr></thead><tbody>
      ${classes.map((c) => `<tr><td data-l="Class"><b>${esc(c.label)}</b></td><td class="r num" data-l="Students">${c.n}</td><td class="r money num" data-l="Expected">${money(c.due)}</td><td class="r money num" data-l="Paid">${money(c.paid)}</td><td class="r money num" data-l="To receive">${money(c.owed)}</td><td class="r num" data-l="Collected">${pct(c.paid, c.due)}%</td><td class="r num" data-l="Fully paid">${c.full}/${c.n}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>All classes</td><td class="r num">${t.count}</td><td class="r money num">${money(t.due)}</td><td class="r money num">${money(t.paid)}</td><td class="r money num">${money(t.owed)}</td><td class="r num">${rate}%</td><td class="r num">${t.status.paid + t.status.over}/${t.count}</td></tr></tfoot></table></div></div>
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h3>Where the fees come from</h3></div>${items.length ? bars(items.map(([k, v]) => ({ label: k, value: v, display: moneyShort(v) }))) : empty('No itemised fees')}</div>
      <div class="card"><div class="card-head"><h3>Every term: billed vs collected</h3></div>${columnChart(trend, { pairs: true, color: 'var(--chart-4)', color2: 'var(--line-strong)' })}<div class="legend"><span><i style="background:var(--line-strong)"></i>Billed</span><span><i style="background:var(--chart-4)"></i>Collected</span></div></div>
    </div>`;
  }
  el.addEventListener('change', (e) => {
    if (e.target.id === 's') { session = e.target.value; term = termsOf(session).slice(-1)[0]; }
    else if (e.target.id === 't') term = Number(e.target.value); else return;
    paint();
  });
  paint();
}
