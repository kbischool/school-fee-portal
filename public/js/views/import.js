// Owner-only data import. Replaces the Python scripts that used to be run
// on a computer: choose the Excel files, review, press Import.
import { esc, money, termLabel, statCard, empty, icon, toast, withLoading } from '../ui.js';
import { getAllStudents, getCodes, getCurrent, clearCache } from '../data.js';
import { parseWorkbook } from '../import/parse-workbook.js';
import { chooseSheets, buildPlan } from '../import/plan.js';
import { commitPlan } from '../import/commit.js';
import { round2 } from '../import/util.js';

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('The spreadsheet reader could not be loaded. Check your connection and try again.'));
    document.head.appendChild(s);
  });
}

export async function importView({ el }) {
  const cur = await getCurrent();
  const state = { files: [], items: [], currentSession: cur.session || '', plan: null };

  el.innerHTML = `<div class="page-head"><div><h2>Import data</h2><p>Upload your Excel files here. Nothing is run on your computer, and existing parent codes are kept.</p></div></div>
  <div id="step" class="stack"></div>`;
  const step = el.querySelector('#step');

  // ------------------------------------------------------------ step 1
  function pick() {
    step.innerHTML = `<div class="drop" id="drop"><p style="font-size:1.05rem"><b>Drop your Excel files here</b></p><p class="muted">Fee sheets (2022-2023_FEE.xlsx …), SALARY.xlsx, STOCKS.xlsx, INVOICE.xlsx. You can choose several at once.</p>
      <label class="btn btn-primary" for="file">${icon('upload')} Choose files</label><input id="file" type="file" accept=".xlsx,.xlsm" multiple class="sr-only"></div>
      <div class="msg info">Tip: import the <b>newest session first</b> (for example 2026/2027), then older ones. Only the term you choose is replaced; everything else stays as it is. Importing every session at once uses about 7,000 database writes, within the free daily limit of 20,000.</div><div id="err"></div>`;
    const drop = step.querySelector('#drop'), input = step.querySelector('#file');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => read([...e.dataTransfer.files]));
    input.addEventListener('change', () => read([...input.files]));
  }

  async function read(files) {
    files = files.filter((f) => /\.xlsx?m?$/i.test(f.name));
    if (!files.length) { toast('Please choose .xlsx files.'); return; }
    step.innerHTML = `<div class="card"><p><b>Reading ${files.length} file${files.length > 1 ? 's' : ''}…</b></p><div class="progress"><i style="width:30%"></i></div></div>`;
    try {
      const XLSX = await loadXLSX();
      state.files = [];
      for (const f of files) {
        const buf = new Uint8Array(await f.arrayBuffer());
        // Allow the browser to paint between big files.
        await new Promise((r) => setTimeout(r, 20));
        state.files.push(parseWorkbook(XLSX, buf, f.name));
      }
      buildItems(); review();
    } catch (err) {
      pick(); step.querySelector('#err').innerHTML = `<div class="msg error">${esc(err.message || 'That file could not be read.')}</div>`;
    }
  }

  // Flatten every recognised sheet into a checklist.
  function buildItems() {
    const items = [];
    const fees = state.files.flatMap((w) => w.fees.map((x) => ({ ...x, file: w.fileName })));
    const pays = state.files.flatMap((w) => w.payments.map((x) => ({ ...x, file: w.fileName })));
    const cf = chooseSheets(fees.filter((x) => x.session && x.term), (s) => s.students.length);
    const cp = chooseSheets(pays.filter((x) => x.session && x.term), (s) => s.payments.length);
    const dupNote = (kept) => `Skipped: the same term is also in ${kept.file}`;
    const mk = (kind, ref, label, detail, checked = true, note = '') => items.push({ id: items.length, kind, ref, label, detail, checked, note });
    const same = (a, b) => a.session.key === b.session.key && a.term === b.term;
    for (const f of [...cf.chosen, ...cf.skipped].sort((a, b) => (b.session.key + b.term).localeCompare(a.session.key + a.term))) {
      const skipped = cf.skipped.includes(f);
      const due = f.students.reduce((s, x) => s + x.due, 0), paid = f.students.reduce((s, x) => s + x.paid, 0);
      mk('fee', f, `${f.session.session} · ${termLabel(f.term)} fees`, `${f.students.length} students · fees ${money(due)} · paid ${money(paid)} · from ${f.file}${f.students.some((s) => s.warn.length) ? ` · ⚠ ${f.students.filter((s) => s.warn.length).length} to check` : ''}`, !skipped, skipped ? dupNote(cf.chosen.find((c) => same(c, f))) : '');
    }
    for (const p of [...cp.chosen, ...cp.skipped].sort((a, b) => (b.session.key + b.term).localeCompare(a.session.key + a.term))) {
      const skipped = cp.skipped.includes(p);
      mk('pay', p, `${p.session.session} · ${termLabel(p.term)} payments`, `${p.payments.length} payments · ${money(round2(p.payments.reduce((s, x) => s + x.amount, 0)))} · from ${p.file}`, !skipped && p.payments.length > 0, skipped ? dupNote(cp.chosen.find((c) => same(c, p))) : (p.payments.length ? '' : 'Empty sheet'));
    }
    for (const w of state.files) {
      w.salary.forEach((s) => mk('salary', s, `Salary · ${s.title}`, `${s.months.length} months · from ${w.fileName}`));
      if (w.stock) mk('stock', w.stock, 'Stock workbook', `${Object.keys(w.stock).join(', ')} · from ${w.fileName}`);
      if (w.invoice) mk('invoice', w.invoice, 'New-student invoice', `${w.invoice.length} classes · from ${w.fileName}`);
      w.grids.forEach((g) => mk('grid', g, `${g.kind === 'remit' ? 'Remittance' : 'Stipend'} · ${g.sheet}`, `from ${w.fileName}`));
      w.skipped.forEach((s) => items.push({ id: items.length, kind: 'skip', label: s.sheet, detail: s.why, checked: false, note: '', disabled: true }));
    }
    for (const w of state.files) for (const f of w.fees) if (!f.session || !f.term) items.push({ id: items.length, kind: 'skip', label: f.sheet, detail: 'Session or term could not be worked out', checked: false, disabled: true });
    state.items = items;
    const sessions = [...new Set(items.filter((i) => i.kind === 'fee').map((i) => i.ref.session.session))].sort().reverse();
    if (!state.currentSession || (sessions.length && !sessions.includes(state.currentSession) && !state.currentSession)) state.currentSession = sessions[0] || '';
    state.sessions = sessions;
  }

  // ------------------------------------------------------------ step 2
  function review() {
    const groups = [['fee', 'Fee sheets'], ['pay', 'Payment logs'], ['salary', 'Salary'], ['stock', 'Stock'], ['invoice', 'Invoice'], ['grid', 'Remittance and stipends'], ['skip', 'Not imported']];
    step.innerHTML = `<div class="card stack"><div class="field" style="max-width:320px;margin:0"><label for="cs">Which session is the current one?</label>
        <select id="cs">${[...new Set([...state.sessions, state.currentSession].filter(Boolean))].map((s) => `<option ${s === state.currentSession ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <span class="muted small">Students new to this session get new parent codes. Students from older sessions only get history.</span></div></div>
      ${groups.map(([k, title]) => { const list = state.items.filter((i) => i.kind === k); return list.length ? `<div class="card stack"><div class="card-head"><h3>${title}</h3>${k !== 'skip' ? `<button class="link-btn" data-all="${k}">Select / clear all</button>` : ''}</div>
        ${list.map((i) => `<label class="check"><input type="checkbox" data-i="${i.id}" ${i.checked ? 'checked' : ''} ${i.disabled ? 'disabled' : ''}><span><b>${esc(i.label)}</b><br><span class="muted small">${esc(i.detail)}${i.note ? ` · <span style="color:var(--warn)">${esc(i.note)}</span>` : ''}</span></span></label>`).join('')}</div>` : ''; }).join('')}
      <div class="toolbar"><button class="btn" id="back">Start again</button><button class="btn btn-primary" id="next">Check what will change</button></div>`;
  }

  function selected() { return state.items.filter((i) => i.checked && i.kind !== 'skip'); }

  // ------------------------------------------------------------ step 3
  async function preview(btn) {
    const sel = selected();
    if (!sel.length) { toast('Tick at least one item.'); return; }
    await withLoading(btn, async () => {
      const [students, codes] = await Promise.all([getAllStudents(), getCodes('schoolCodes')]);
      const maxIdx = codes.reduce((m, c) => Math.max(m, typeof c.index === 'number' ? c.index : -1), -1);
      const of = (k) => sel.filter((i) => i.kind === k).map((i) => i.ref);
      const stockOnly = of('stock')[0];
      state.plan = buildPlan({
        existingStudents: students.map((s) => ({ id: s.id, name: s.name, alumni: !!s.alumni })), maxCodeIndex: maxIdx, currentSession: state.currentSession,
        fees: of('fee'), payments: of('pay'), salary: of('salary'), grids: of('grid'), stock: stockOnly, invoice: of('invoice')[0]
      });
      state.scopes = [...of('fee').map((f) => ({ kind: 'fees', sessionKey: f.session.key, term: f.term })), ...of('pay').map((p) => ({ kind: 'payments', sessionKey: p.session.key, term: p.term }))];
      showPlan();
    });
  }

  function showPlan() {
    const { plan } = state, r = plan.report;
    const sess = Object.entries(r.sessions).sort().reverse();
    const unmatched = r.payments.reduce((s, p) => s + p.unmatched, 0);
    step.innerHTML = `<div class="grid auto">${statCard('Database writes', plan.writeCount.toLocaleString(), { sub: plan.writeCount > 15000 ? 'Large: consider importing fewer sessions at once' : 'Free daily limit: 20,000', tone: plan.writeCount > 15000 ? 'warn' : '' })}
        ${statCard('New parent codes', r.newStudents.length, { sub: r.newStudents.length ? 'created automatically' : 'every student already has one', tone: 'info' })}
        ${statCard('Past students (history only)', r.alumni.length)}${statCard('Payments to assign', unmatched, { sub: 'you can assign these afterwards', tone: unmatched ? 'warn' : 'ok' })}</div>
      ${sess.length ? `<div class="card pad-0"><div class="card-head" style="padding:16px 16px 0"><h3>Fee sheets</h3></div><div class="table-wrap" style="border:0"><table class="t cards"><thead><tr><th>Session</th><th>Term</th><th class="r">Students</th><th class="r">Fees</th><th class="r">Paid</th></tr></thead><tbody>${sess.flatMap(([s, terms]) => Object.entries(terms).map(([t, v]) => `<tr><td data-l="Session">${esc(s)}</td><td data-l="Term">${termLabel(Number(t))}</td><td class="r num" data-l="Students">${v.students}</td><td class="r money num" data-l="Fees">${money(v.due)}</td><td class="r money num" data-l="Paid">${money(v.paid)}</td></tr>`)).join('')}</tbody></table></div></div>` : ''}
      ${r.newStudents.length ? `<div class="card"><div class="card-head"><h3>New students getting a parent code</h3></div><div class="chips">${r.newStudents.map((s) => `<span class="chip">${esc(s.name)} <b class="num">${esc(s.id)}</b></span>`).join('')}</div></div>` : ''}
      ${r.fuzzy.length ? `<details class="card"><summary><b>${r.fuzzy.length} names matched approximately</b> — please glance at them</summary><div class="ledger" style="margin-top:10px">${[...new Map(r.fuzzy.map((f) => [f.sheetName + f.matchedTo, f])).values()].map((f) => `<div class="ledger-row"><span>${esc(f.sheetName)}</span><span class="muted">→ ${esc(f.matchedTo)}</span></div>`).join('')}</div></details>` : ''}
      ${r.payments.length ? `<details class="card"><summary><b>Payment matching</b> — ${r.payments.reduce((s, p) => s + p.matched, 0)} matched, ${unmatched} to assign</summary><div class="ledger" style="margin-top:10px">${r.payments.map((p) => `<div class="ledger-row"><span>${esc(p.session)} · ${termLabel(p.term)}</span><span class="num">${p.matched}/${p.count} matched</span></div>`).join('')}</div></details>` : ''}
      ${plan.warnings.length ? `<details class="card"><summary><b>${plan.warnings.length} thing${plan.warnings.length > 1 ? 's' : ''} in the sheets worth checking</b></summary><ul class="small" style="margin:10px 0 0;padding-left:18px">${plan.warnings.slice(0, 60).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      ${r.other.length ? `<div class="card"><div class="card-head"><h3>Also importing</h3></div><ul class="small" style="margin:0;padding-left:18px">${r.other.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
      <div class="msg info">Importing replaces the chosen terms with what is in your sheets. Terms you did not tick are not touched, and payments you assigned by hand are kept.</div>
      <div class="toolbar"><button class="btn" id="edit">Change selection</button><button class="btn btn-primary" id="go">Import now</button></div>`;
  }

  // ------------------------------------------------------------ step 4
  async function run(btn) {
    btn.disabled = true;
    step.insertAdjacentHTML('afterbegin', `<div class="card" id="prog"><p><b id="plabel">Starting…</b></p><div class="progress"><i id="pbar" style="width:2%"></i></div></div>`);
    try {
      const res = await commitPlan(state.plan, state.scopes, (d, t, label) => { step.querySelector('#plabel').textContent = `${label}… ${d.toLocaleString()} of ${t.toLocaleString()}`; step.querySelector('#pbar').style.width = `${Math.max(2, (d / t) * 100)}%`; });
      clearCache();
      step.innerHTML = `<div class="card" style="text-align:center">${icon('check', 'icon')}<h2 style="margin:8px 0">Import complete</h2><p class="muted">${res.writes.toLocaleString()} records saved${res.deletes ? `, ${res.deletes} old rows removed` : ''}.</p>
        <div class="toolbar" style="justify-content:center"><a class="btn btn-primary" href="#/overview">See the overview</a><a class="btn" href="#/payments">Assign unmatched payments</a><button class="btn" id="again">Import more</button></div></div>`;
    } catch (err) {
      console.error(err); // eslint-disable-line no-console
      step.querySelector('#prog')?.remove();
      const denied = /permission|insufficient/i.test(String(err && (err.code || err.message)));
      step.insertAdjacentHTML('afterbegin', `<div class="msg error">${denied ? 'Your account is not allowed to write data. Check that your owner record exists (see the setup guide).' : 'The import stopped part-way. Nothing is lost: pressing Import now again finishes the job safely.'}</div>`);
      btn.disabled = false;
    }
  }

  step.addEventListener('click', (e) => {
    if (e.target.closest('#back') || e.target.closest('#again')) { pick(); return; }
    if (e.target.closest('#edit')) { review(); return; }
    const all = e.target.closest('[data-all]'); if (all) { const l = state.items.filter((i) => i.kind === all.dataset.all && !i.disabled); const on = l.some((i) => !i.checked); l.forEach((i) => (i.checked = on)); review(); return; }
    const nxt = e.target.closest('#next'); if (nxt) { preview(nxt); return; }
    const go = e.target.closest('#go'); if (go) run(go);
  });
  step.addEventListener('change', (e) => {
    if (e.target.dataset.i !== undefined) state.items[Number(e.target.dataset.i)].checked = e.target.checked;
    if (e.target.id === 'cs') state.currentSession = e.target.value;
  });
  pick();
}
