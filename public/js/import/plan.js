// ---------------------------------------------------------------------
// Turns parsed workbooks into a flat list of Firestore write operations.
// Nothing here talks to Firestore: it only needs the list of students
// that already exist, so the plan can be previewed (and unit-tested)
// before anything is written.
// ---------------------------------------------------------------------
import { clean, slug, hash, round2, sessionKey, classKey, classLabel, TERM_LABELS } from './util.js';
import { buildIndex, matchStudent, matchPaymentLabel } from './match.js';

const cleanCode = (s) => clean(s).replace(/[^A-Z0-9]/g, '');

/** Same format the old update_data.py used: LAST[:3] + FIRST[:3] + (index + 1000). */
export function makeCode(last, first, index) {
  return cleanCode(last).slice(0, 3) + cleanCode(first).slice(0, 3) + String(1000 + index);
}

export function statusOf(due, paid, balance) {
  if (due <= 0 && paid <= 0) return 'nofee';
  if (balance < 0) return 'over';
  if (balance === 0) return 'paid';
  if (paid <= 0) return 'unpaid';
  return 'part';
}

/**
 * When the same session+term appears in two uploaded files, keep the one
 * whose FILE NAME is that session (the 2023/24 file also holds a stale
 * draft of 2024/25), then the one with the most rows.
 */
export function chooseSheets(items, sizeOf) {
  const groups = new Map();
  for (const it of items) {
    if (!it.session) continue;
    const key = `${it.session.key}|${it.term}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const chosen = [];
  const skipped = [];
  for (const list of groups.values()) {
    list.sort((a, b) => (b.fromFileSession - a.fromFileSession) || (sizeOf(b) - sizeOf(a)));
    chosen.push(list[0]);
    skipped.push(...list.slice(1));
  }
  return { chosen, skipped };
}

/**
 * @param {object} input
 * @param {{id:string,name:string,alumni?:boolean}[]} input.existingStudents
 * @param {number} input.maxCodeIndex  highest `index` found in schoolCodes (or -1)
 * @param {string} input.currentSession e.g. "2026/2027" – new students in this session get parent codes
 * @param {object[]} input.fees    chosen fee sheets  (output of parseWorkbook().fees items, with session/term set)
 * @param {object[]} input.payments chosen payment sheets
 * @param {object[]} input.salary, input.grids, input.stock, input.invoice  (optional)
 */
export function buildPlan(input) {
  const { existingStudents = [], maxCodeIndex = -1, currentSession } = input;
  const ops = [];
  const warnings = [];
  const report = { sessions: {}, newStudents: [], alumni: [], fuzzy: [], ambiguous: [], payments: [], other: [] };
  const now = new Date().toISOString();

  const people = existingStudents.map((s) => ({ id: s.id, name: s.name, alumni: !!s.alumni }));
  let index = buildIndex(people);
  let nextIndex = maxCodeIndex + 1;
  const usedIds = new Set(people.map((p) => p.id));
  const studentDocs = new Map(); // id -> latest {name,class,classKey,session,term}

  // Newest session first, so current students are matched/created before alumni.
  const fees = [...(input.fees || [])].sort((a, b) =>
    (b.session.key.localeCompare(a.session.key)) || (b.term - a.term));

  const rosterByTerm = new Map(); // "2025-2026|1" -> [{id,name,last,first}]

  for (const sheet of fees) {
    const sKey = sheet.session.key;
    const sessLabel = sheet.session.session;
    const isCurrent = currentSession && sessLabel === currentSession;
    const recId = `${sKey}_t${sheet.term}`;
    const rows = [];
    const roster = [];
    let due = 0, paid = 0, balance = 0;

    for (const st of sheet.students) {
      let m = matchStudent(st.last, st.first, index);
      let id;
      if (m.person) {
        id = m.person.id;
        if (m.mode === 'fuzzy') report.fuzzy.push({ sheet: sheet.sheet, sheetName: st.name, matchedTo: m.person.name });
      } else {
        if (m.mode === 'ambiguous') report.ambiguous.push({ sheet: sheet.sheet, name: st.name });
        const coded = isCurrent;
        if (coded) {
          id = makeCode(st.last, st.first, nextIndex);
          while (usedIds.has(id)) { nextIndex++; id = makeCode(st.last, st.first, nextIndex); }
          ops.push({ path: `schoolCodes/${id}`, merge: true, data: { studentId: id, index: nextIndex, claimed: false, createdAt: now } });
          nextIndex++;
          report.newStudents.push({ id, name: st.name, class: st.class, session: sessLabel });
        } else {
          id = `h-${slug(st.name)}-${hash(st.name).slice(0, 4)}`;
          report.alumni.push({ id, name: st.name });
        }
        usedIds.add(id);
        const person = { id, name: st.name, alumni: !coded };
        people.push(person);
        index = buildIndex(people);
      }
      const person = people.find((p) => p.id === id);
      const status = statusOf(st.due, st.paid, st.balance);
      ops.push({
        path: `students/${id}/records/${recId}`,
        data: {
          session: sessLabel, sessionKey: sKey, term: sheet.term,
          class: st.class, classKey: st.classKey,
          due: st.due, paid: st.paid, balance: st.balance,
          discountRate: st.discountRate, discountAmount: st.discountAmount,
          items: st.items, status, updatedAt: now
        }
      });
      const prev = studentDocs.get(id);
      const rank = `${sKey}_${sheet.term}`;
      if (!prev || rank > prev.rank) {
        studentDocs.set(id, { rank, name: person.name || st.name, class: st.class, classKey: st.classKey, session: sessLabel, term: sheet.term, alumni: !!person.alumni });
      }
      const disc = st.discountAmount || 0;
      const arrears = (st.items.find((i) => i.label.startsWith('Outstanding')) || {}).amount || 0;
      rows.push({ id, n: st.name, c: st.class, ck: st.classKey, due: st.due, paid: st.paid, bal: st.balance, st: status, disc, arr: arrears });
      roster.push({ id, name: st.name, last: st.last, first: st.first });
      due += st.due; paid += st.paid; balance += st.balance;
      if (st.warn.length) warnings.push(`${sheet.sheet}, ${st.name}: ${st.warn.join(' ')}`);
    }

    rosterByTerm.set(`${sKey}|${sheet.term}`, roster);
    ops.push({
      path: `ledgers/${recId}`,
      data: { session: sessLabel, sessionKey: sKey, term: sheet.term, count: rows.length, rows, itemTotals: sheet.itemTotals, updatedAt: now }
    });
    ((report.sessions[sessLabel] ||= {})[sheet.term] = { sheet: sheet.sheet, students: rows.length, due: round2(due), paid: round2(paid), balance: round2(balance) });
    for (const w of sheet.warnings) warnings.push(`${sheet.sheet}: ${w}`);
  }

  // Student identity documents (name / latest class), merged so existing fields (e.g. legacy terms) survive.
  for (const [id, s] of studentDocs) {
    const data = { name: s.name, class: s.class, classKey: s.classKey, lastSession: s.session, lastTerm: s.term, updatedAt: now };
    if (s.alumni) data.alumni = true;
    ops.push({ path: `students/${id}`, merge: true, data });
  }

  // ----------------------------- payments -----------------------------
  const globalIndex = buildIndex(people);
  const seenPay = new Map();
  for (const sheet of input.payments || []) {
    const sKey = sheet.session.key;
    const sessLabel = sheet.session.session;
    const roster = rosterByTerm.get(`${sKey}|${sheet.term}`);
    const termIndex = roster ? buildIndex(roster.map((r) => ({ id: r.id, name: r.name, last: r.last, first: r.first }))) : null;
    let matched = 0, unmatched = 0, amountMatched = 0, amountTotal = 0;
    const lost = [];
    for (const p of sheet.payments) {
      const mm = p.unallocated
        ? { ids: [], mode: 'none' }
        : (termIndex && matchPaymentLabel(p.label, termIndex).ids.length ? matchPaymentLabel(p.label, termIndex) : matchPaymentLabel(p.label, globalIndex));
      const dupKey = `${sKey}|${sheet.term}|${p.date}|${p.amount}|${slug(p.label)}`;
      const n = (seenPay.get(dupKey) || 0) + 1;
      seenPay.set(dupKey, n);
      const pid = `${sKey}_t${sheet.term}_${hash(dupKey)}${n > 1 ? `_${n}` : ''}`;
      const isStaffMoney = /TEACHER|STAFF|DUES/i.test(p.purpose);
      const ids = isStaffMoney ? [] : mm.ids;
      amountTotal += p.amount;
      if (ids.length) { matched++; amountMatched += p.amount; } else { unmatched++; lost.push(p); }
      ops.push({
        path: `payments/${pid}`,
        data: {
          session: sessLabel, sessionKey: sKey, term: sheet.term, date: p.date, amount: p.amount,
          bank: p.bank, narration: p.narration, label: p.label, purpose: p.purpose,
          studentIds: ids, matched: ids.length > 0, mode: mm.mode, unallocated: !!p.unallocated, staffMoney: isStaffMoney, updatedAt: now
        }
      });
      for (const sid of ids) {
        ops.push({
          path: `students/${sid}/payments/${pid}`,
          data: { session: sessLabel, sessionKey: sKey, term: sheet.term, date: p.date, amount: p.amount, purpose: p.purpose, label: p.label, family: ids.length > 1, bank: p.bank }
        });
      }
    }
    report.payments.push({ sheet: sheet.sheet, session: sessLabel, term: sheet.term, count: sheet.payments.length, matched, unmatched, amount: round2(amountTotal), amountMatched: round2(amountMatched), lost: lost.slice(0, 25).map((p) => ({ label: p.label, amount: p.amount, date: p.date })) });
    for (const w of sheet.warnings) warnings.push(`${sheet.sheet}: ${w}`);
  }

  // ------------------------------- salary -----------------------------
  for (const s of input.salary || []) {
    ops.push({ path: `salaries/${s.id}`, data: { title: s.title, year: s.year, group: s.group, columns: s.columns, months: s.months, updatedAt: now } });
    report.other.push(`Salary: ${s.title} (${s.months.length} months)`);
  }

  // ------------------------- remittance / stipend ---------------------
  for (const g of input.grids || []) {
    const id = slug(`${g.kind}-${g.session ? g.session.key : ''}-t${g.term}-${g.sheet}`);
    ops.push({ path: `ownerSheets/${id}`, data: { kind: g.kind, title: g.sheet, session: g.session ? g.session.session : '', sessionKey: g.session ? g.session.key : '', term: g.term, grid: g.grid, updatedAt: now } });
    report.other.push(`${g.kind === 'stipend' ? 'Stipend' : 'Remittance'}: ${g.sheet}`);
  }

  // -------------------------------- stock ------------------------------
  const st = input.stock;
  if (st) {
    if (st.textbooks) {
      ops.push({ path: 'stock/textbooks', data: { rows: st.textbooks.map(({ classKey: ck, class: cl, subject, title, qty, sell }) => ({ ck, cl, subject, title, qty, sell })), updatedAt: now } });
    }
    if (st.stationery) {
      ops.push({ path: 'stock/stationery', data: { classes: st.stationery.classes, classTotals: st.stationery.classTotals, items: st.stationery.items.map(({ item, sell, perClass }) => ({ item, sell, perClass })), updatedAt: now } });
    }
    if (st.inventory) {
      ops.push({ path: 'stock/inventory', data: { rows: st.inventory.map(({ item, available, needed }) => ({ item, available, needed })), updatedAt: now } });
    }
    // Everything that reveals what the school PAYS lives in an owner-only document.
    ops.push({
      path: 'stockCosts/main',
      data: {
        textbooks: (st.textbooks || []).map((t) => ({ ck: t.classKey, title: t.title, provider: t.provider, qty: t.qty, cost: t.cost, sell: t.sell })),
        stationery: ((st.stationery || {}).items || []).map((i) => ({ item: i.item, cost: i.cost, sell: i.sell })),
        inventory: st.inventory || [], uniforms: st.uniforms || [], updatedAt: now
      }
    });
    // Parent-safe lists per class: titles and quantities only, never prices paid by the school.
    const classKeys = new Set([...(st.textbooks || []).map((t) => t.classKey), ...(((st.stationery || {}).classes) || [])]);
    for (const ck of classKeys) {
      if (!ck) continue;
      ops.push({
        path: `parentCatalog/${ck}`,
        data: {
          classKey: ck, class: classLabel(ck),
          textbooks: (st.textbooks || []).filter((t) => t.classKey === ck && t.qty > 0).map((t) => ({ subject: t.subject, title: t.title })),
          stationery: ((st.stationery || {}).items || []).filter((i) => i.perClass[ck]).map((i) => ({ item: i.item, qty: i.perClass[ck] })),
          updatedAt: now
        }
      });
    }
    report.other.push('Stock: textbooks, stationery, inventory, uniform costs');
  }

  if (input.invoice) {
    ops.push({ path: 'invoices/main', data: { rows: input.invoice, updatedAt: now } });
    report.other.push(`New-student invoice: ${input.invoice.length} classes`);
  }

  // The "current session / term" the dashboards open on.
  if (currentSession && fees.length) {
    const curr = fees.filter((f) => f.session.session === currentSession);
    if (curr.length) {
      const latestTerm = Math.max(...curr.map((f) => f.term));
      ops.push({ path: 'config/app', merge: true, data: { currentSession, currentSessionKey: sessionKey(currentSession), currentTerm: latestTerm, updatedAt: now } });
    }
  }

  return { ops, warnings, report, writeCount: ops.length, termLabels: TERM_LABELS };
}
