// Stock: textbooks, notebooks & stationery, inventory. The owner also gets
// the cost side (what the school pays, profit, supplier balances); admins never do.
import { esc, money, empty, statCard } from '../ui.js';
import { getStock, getCosts } from '../data.js';
import { classRank, classLabel } from '../import/util.js';

export async function stockView({ el, showCosts }) {
  const [stock, costs] = await Promise.all([getStock(), showCosts ? getCosts().catch(() => null) : null]);
  const tb = stock.textbooks?.rows || [], st = stock.stationery, inv = stock.inventory?.rows || [];
  if (!tb.length && !st && !inv.length) { el.innerHTML = `<div class="card">${empty('No stock sheet yet', 'Stock appears here after the stock workbook is imported.', 'box')}</div>`; return; }

  const TABS = [['books', 'Textbooks'], ['stat', 'Notebooks & stationery'], ['inv', 'Inventory'], ...(showCosts ? [['cost', 'Costs & profit']] : [])];
  let tab = 'books', cls = '';
  el.innerHTML = `<div class="page-head"><div><h2>Stock</h2><p>What is needed, what is on hand${showCosts ? ', and what it costs' : ''}.</p></div></div>
    <div class="scroll-x"><div class="seg" id="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-t="${k}">${l}</button>`).join('')}</div></div><div id="p" style="margin-top:16px"></div>`;
  const p = el.querySelector('#p');

  const classOpts = (keys) => `<div class="field" style="max-width:260px"><label for="cls">Class</label><select id="cls"><option value="">All classes</option>${keys.map((k) => `<option value="${esc(k)}" ${k === cls ? 'selected' : ''}>${esc(classLabel(k))}</option>`).join('')}</select></div>`;

  function paint() {
    el.querySelectorAll('#tabs [data-t]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
    if (tab === 'books') {
      const keys = [...new Set(tb.map((r) => r.ck))].sort((a, b) => classRank(a) - classRank(b));
      const rows = tb.filter((r) => !cls || r.ck === cls);
      const needed = rows.reduce((s, r) => s + r.qty, 0);
      p.innerHTML = classOpts(keys) + `<div class="grid auto" style="margin-bottom:16px">${statCard('Titles', rows.length)}${statCard('Copies needed', needed)}</div>
        <div class="table-wrap"><table class="t cards"><thead><tr><th>Class</th><th>Subject</th><th>Textbook</th><th class="r">Needed</th><th class="r">Price</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-l="Class">${esc(r.cl)}</td><td data-l="Subject">${esc(r.subject)}</td><td data-l="Textbook"><b>${esc(r.title)}</b></td><td class="r num" data-l="Needed">${r.qty}</td><td class="r money num" data-l="Price">${money(r.sell)}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (tab === 'stat') {
      if (!st || !st.items?.length) { p.innerHTML = empty('No stationery list', '', 'box'); return; }
      const keys = [...st.classes].sort((a, b) => classRank(a) - classRank(b));
      const shown = cls ? [cls] : keys;
      p.innerHTML = classOpts(keys) + `<div class="table-wrap"><table class="t"><thead><tr><th>Item</th><th class="r">Price</th>${shown.map((k) => `<th class="r">${esc(classLabel(k))}</th>`).join('')}</tr></thead><tbody>
        ${st.items.filter((i) => !cls || i.perClass[cls]).map((i) => `<tr><td><b>${esc(i.item)}</b></td><td class="r money num">${money(i.sell)}</td>${shown.map((k) => `<td class="r num">${i.perClass[k] || '·'}</td>`).join('')}</tr>`).join('')}</tbody>
        <tfoot><tr><td>Pack price per child</td><td></td>${shown.map((k) => `<td class="r money num">${st.classTotals?.[k] ? money(st.classTotals[k]) : '·'}</td>`).join('')}</tr></tfoot></table></div>`;
    } else if (tab === 'inv') {
      p.innerHTML = `<div class="table-wrap"><table class="t cards"><thead><tr><th>Item</th><th class="r">On hand</th><th class="r">Needed</th><th class="r">Still to buy</th></tr></thead><tbody>${inv.map((r) => { const need = Math.max(0, r.needed - r.available); return `<tr><td data-l="Item"><b>${esc(r.item)}</b></td><td class="r num" data-l="On hand">${r.available}</td><td class="r num" data-l="Needed">${r.needed}</td><td class="r num" data-l="Still to buy" style="${need ? 'color:var(--warn);font-weight:650' : 'color:var(--ok)'}">${need || 'Complete'}</td></tr>`; }).join('')}</tbody></table></div>`;
    } else if (tab === 'cost') {
      if (!costs) { p.innerHTML = empty('No cost data', 'Import the stock workbook to see costs.'); return; }
      const bookCost = costs.textbooks.reduce((s, r) => s + r.cost * r.qty, 0), bookSell = costs.textbooks.reduce((s, r) => s + r.sell * r.qty, 0);
      const invCost = costs.inventory.reduce((s, r) => s + r.totalCost, 0), invOwed = costs.inventory.reduce((s, r) => s + r.balance, 0), invPaid = costs.inventory.reduce((s, r) => s + r.paid, 0);
      p.innerHTML = `<div class="grid auto" style="margin-bottom:16px">${statCard('Textbooks: cost', money(bookCost))}${statCard('Textbooks: selling value', money(bookSell))}${statCard('Textbooks: profit', money(bookSell - bookCost), { tone: 'ok' })}
        ${statCard('Stationery purchases', money(invCost))}${statCard('Paid to suppliers', money(invPaid), { tone: 'ok' })}${statCard('Still owed to suppliers', money(invOwed), { tone: invOwed ? 'bad' : 'ok' })}</div>
        <div class="card pad-0" style="margin-bottom:16px"><div class="card-head" style="padding:16px 16px 0"><h3>Textbooks by supplier</h3></div><div class="table-wrap" style="border:0"><table class="t cards"><thead><tr><th>Textbook</th><th>Supplier</th><th class="r">Qty</th><th class="r">Cost</th><th class="r">Sell</th><th class="r">Profit</th></tr></thead><tbody>
        ${costs.textbooks.filter((r) => r.qty > 0).map((r) => `<tr><td data-l="Textbook">${esc(r.title)}</td><td data-l="Supplier">${esc(r.provider)}</td><td class="r num" data-l="Qty">${r.qty}</td><td class="r money num" data-l="Cost">${money(r.cost)}</td><td class="r money num" data-l="Sell">${money(r.sell)}</td><td class="r money num" data-l="Profit">${money((r.sell - r.cost) * r.qty)}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="card pad-0" style="margin-bottom:16px"><div class="card-head" style="padding:16px 16px 0"><h3>Stationery purchases</h3></div><div class="table-wrap" style="border:0"><table class="t cards"><thead><tr><th>Item</th><th class="r">Needed</th><th class="r">Unit cost</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th></tr></thead><tbody>
        ${costs.inventory.map((r) => `<tr><td data-l="Item">${esc(r.item)}</td><td class="r num" data-l="Needed">${r.needed}</td><td class="r money num" data-l="Unit cost">${money(r.cost)}</td><td class="r money num" data-l="Total">${money(r.totalCost)}</td><td class="r money num" data-l="Paid">${money(r.paid)}</td><td class="r money num" data-l="Balance" style="${r.balance ? 'color:var(--bad)' : ''}">${money(r.balance)}</td></tr>`).join('')}</tbody></table></div></div>
        ${costs.uniforms.length ? `<div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>Uniform procurement cost</h3></div><div class="table-wrap" style="border:0"><table class="t cards"><thead><tr><th>Group</th><th class="r">Uniform</th><th class="r">Hoody</th><th class="r">Sportswear</th></tr></thead><tbody>${costs.uniforms.map((u) => `<tr><td data-l="Group">${esc(u.group)}</td><td class="r money num" data-l="Uniform">${money(u.uniform)}</td><td class="r money num" data-l="Hoody">${money(u.hoody)}</td><td class="r money num" data-l="Sportswear">${money(u.sportswear)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    }
  }
  el.addEventListener('click', (e) => { const t = e.target.closest('#tabs [data-t]'); if (t) { tab = t.dataset.t; cls = ''; paint(); } });
  el.addEventListener('change', (e) => { if (e.target.id === 'cls') { cls = e.target.value; paint(); } });
  paint();
}
