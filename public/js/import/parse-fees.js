// ---------------------------------------------------------------------
// Parses one "term account" sheet (one row per student) into a uniform
// shape, whichever year's layout it uses. Layouts differ a lot between
// 2021/22 and 2026/27, so columns are found by HEADER NAME, never by
// position.
// ---------------------------------------------------------------------
import { clean, num, round2, fullName, classKey, classLabel, itemLabel, findHeaderRow } from './util.js';

// Headers that are never a fee line (totals, payments, metadata).
const NOT_AN_ITEM =
  /^(S\/N|TOTAL( FEE)?\d*|GRAND TOTAL.*|50% FEE|.*DEPOSIT|DATE PAID|PAY \d+|1ST 50% PAY|2ND 50% PAY|BALANCE.*|COMMENT|LESSON FEE.*|PARTY FEE REMIT|DISCOUNT|ACTUAL TUITION|FULL TUITION|CLASS|LAST NAME|FIRST NAME|)$/;

/** True if this sheet looks like a term account (has LAST NAME + CLASS headers). */
export function isFeeSheet(rows) {
  return findHeaderRow(rows, ['LAST NAME', 'CLASS']) >= 0;
}

/**
 * @param {any[][]} rows  sheet as an array of rows
 * @returns {{students: object[], warnings: string[], itemTotals: object}}
 */
export function parseFeeSheet(rows) {
  const warnings = [];
  const h = findHeaderRow(rows, ['LAST NAME', 'CLASS']);
  if (h < 0) return { students: [], warnings: ['No "LAST NAME" / "CLASS" header found.'], itemTotals: {} };

  const rawHeaders = rows[h].map((c) => (c == null ? '' : String(c)));
  const cols = rawHeaders.map(clean);
  const find = (re, from = 0) => {
    for (let i = from; i < cols.length; i++) if (re.test(cols[i])) return i;
    return -1;
  };

  const lastI = find(/^LAST NAME$/);
  const firstI = find(/^FIRST NAME$/);
  const classI = find(/^CLASS$/);
  const discountI = find(/^DISCOUNT$/);
  const fullTuitionI = find(/^FULL TUITION$/);

  // Where the real (possibly discounted) fee lines begin.
  const adFormUnderscore = find(/^AD_FORM$/); // 2024+ layouts repeat the list; the 2nd copy is what was billed
  const start = adFormUnderscore >= 0 ? adFormUnderscore : classI + 1;

  // Totals.
  let dueI = find(/^GRAND TOTAL FEE$/);
  if (dueI < 0) dueI = find(/^TOTAL FEE$/, start);
  if (dueI < 0) dueI = find(/^TOTAL$/);
  const paidI = (() => { const a = find(/^GRAND TOTAL PAID$/); return a >= 0 ? a : find(/^TOTAL PAID$/); })();
  const balI = (() => {
    const a = find(/^GRAND TOTAL BALANCE$/); if (a >= 0) return a;
    const b = find(/^BALANCE REMAINING$/); if (b >= 0) return b;
    return find(/^BALANCE$/);
  })();
  if (dueI < 0) warnings.push('No total-fee column found.');

  // Where the fee lines stop.
  let end = cols.length;
  for (let i = start; i < cols.length; i++) {
    if (/DEPOSIT|^DATE PAID$|^PAY \d+$|^TOTAL FEE$|^GRAND TOTAL|^TOTAL PAID$/.test(cols[i]) && i > start) {
      // the 2022/23 2nd-term sheet has subtotal columns *inside* the list: keep going until GRAND TOTAL
      if (/^TOTAL FEE\d?$/.test(cols[i]) && dueI >= 0 && cols[dueI] === 'GRAND TOTAL FEE') continue;
      end = i; break;
    }
  }
  const itemIdx = [];
  for (let i = start; i < end; i++) if (!NOT_AN_ITEM.test(cols[i])) itemIdx.push(i);

  const students = [];
  const itemTotals = {};
  const seen = new Map();

  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const last = row[lastI];
    if (typeof last !== 'string' || !last.trim()) continue;
    if (/^TOTAL/i.test(last.trim())) continue;
    const first = firstI >= 0 && row[firstI] != null ? String(row[firstI]) : '';
    const name = fullName(last, first);
    const ck = classKey(row[classI]);

    const items = [];
    for (const i of itemIdx) {
      const v = num(row[i]);
      if (v !== 0) items.push({ label: itemLabel(rawHeaders[i]), amount: round2(v) });
    }

    const due = dueI >= 0 ? round2(num(row[dueI])) : round2(items.reduce((s, x) => s + x.amount, 0));
    let paid, balance;
    if (paidI >= 0) paid = round2(num(row[paidI]));
    else if (balI >= 0) paid = round2(due - num(row[balI]));
    else paid = 0;
    balance = balI >= 0 ? round2(num(row[balI])) : round2(due - paid);

    // Some sheets carry a total that is not the sum of the lines (a hand-typed figure).
    // Show the gap openly as its own line so the statement always adds up, and flag it.
    let sum = round2(items.reduce((s, x) => s + x.amount, 0));
    const gap = round2(due - sum);
    const adjusted = Math.abs(gap) >= 1 && dueI >= 0;
    if (adjusted) { items.push({ label: 'Other charges / adjustment', amount: gap, adj: true }); sum = round2(sum + gap); }
    const rec = {
      rowNo: r + 1,
      name, last: String(last).trim(), first: first.trim(),
      classRaw: row[classI] == null ? '' : String(row[classI]).trim(),
      classKey: ck, class: classLabel(ck),
      due, paid, balance,
      discountRate: discountI >= 0 ? num(row[discountI]) : 0,
      discountAmount: fullTuitionI >= 0
        ? Math.max(0, round2(num(row[fullTuitionI]) - num(row[find(/^TUITION$/, start)])))
        : 0,
      items,
      warn: []
    };
    if (adjusted) rec.warn.push(`Fee lines add up to ${round2(sum - gap)} but the sheet total is ${due}; the difference (${gap}) is shown as "Other charges / adjustment".`);
    if (Math.abs(round2(due - paid) - balance) > 1) rec.warn.push(`Total minus paid is ${round2(due - paid)} but the sheet balance is ${balance}.`);

    // The same student twice in one sheet would double-count money – keep the first, flag it.
    if (seen.has(name)) {
      warnings.push(`Row ${r + 1}: "${name}" appears twice in this sheet (first at row ${seen.get(name)}). The second row was skipped.`);
      continue;
    }
    seen.set(name, r + 1);

    for (const it of items) itemTotals[it.label] = round2((itemTotals[it.label] || 0) + it.amount);
    students.push(rec);
  }
  return { students, warnings, itemTotals };
}
