// ---------------------------------------------------------------------
// Parses a bank "PAY LOG" / "PAYMENT SHEET" into payment rows.
// The columns move around between years, so they are found by header.
// ---------------------------------------------------------------------
import { clean, num, isNum, round2, toISODate } from './util.js';

export function isPaymentSheet(rows, title) {
  if (!/LOG|PAYMENT/i.test(title) || /REMIT/i.test(title)) return false;
  return findCols(rows) !== null;
}

function findCols(rows) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const cells = (rows[i] || []).map(clean);
    const amt = cells.findIndex((c) => /^AMOUNT CREDIT$/.test(c));
    const credit = cells.findIndex((c) => c === 'CREDIT');
    const student = cells.findIndex((c) => c === 'STUDENT');
    if ((amt >= 0 || credit >= 0) && student >= 0) {
      const dateI = cells.findIndex((c) => /DATE/.test(c));
      // "Amount Credit" is the amount; a bare "CREDIT" column then holds the bank name.
      const amountI = amt >= 0 ? amt : credit;
      const bankI = amt >= 0 ? (credit >= 0 ? credit : cells.findIndex((c) => c === 'BANK')) : cells.findIndex((c) => c === 'BANK');
      return {
        header: i, dateI, amountI, bankI,
        narrationI: cells.findIndex((c) => /NARRATION/.test(c)),
        studentI: student,
        purposeI: cells.findIndex((c) => c === 'PURPOSE')
      };
    }
  }
  return null;
}

/** @returns {{payments: object[], warnings: string[]}} */
export function parsePaymentSheet(rows, XLSX) {
  const c = findCols(rows);
  const warnings = [];
  if (!c) return { payments: [], warnings: ['No payment columns found.'] };
  const out = [];
  for (let r = c.header + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const amount = isNum(row[c.amountI]) ? round2(row[c.amountI]) : num(row[c.amountI]);
    let label = row[c.studentI] == null ? '' : String(row[c.studentI]).trim();
    if (!(amount > 0) || /^X+$/i.test(label)) continue; // blank or "XXX" placeholder rows
    let unallocated = false;
    if (!label) { label = '(no name given)'; unallocated = true; }
    const date = toISODate(row[c.dateI], XLSX);
    if (!date) warnings.push(`Row ${r + 1}: payment of ${amount} for "${label}" has no readable date.`);
    out.push({
      rowNo: r + 1,
      date,
      amount,
      bank: c.bankI >= 0 && row[c.bankI] != null ? String(row[c.bankI]).trim() : '',
      narration: c.narrationI >= 0 && row[c.narrationI] != null ? String(row[c.narrationI]).trim() : '',
      label,
      unallocated,
      purpose: c.purposeI >= 0 && row[c.purposeI] != null ? String(row[c.purposeI]).trim() : 'School Fee'
    });
  }
  return { payments: out, warnings };
}
