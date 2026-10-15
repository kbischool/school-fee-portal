// ---------------------------------------------------------------------
// Reads one uploaded workbook and sorts every sheet into what it is:
// term account, payment log, salary, stock, invoice or free-form grid.
// ---------------------------------------------------------------------
import { clean, parseSession, parseTerm, sessionKey } from './util.js';
import { isFeeSheet, parseFeeSheet } from './parse-fees.js';
import { isPaymentSheet, parsePaymentSheet } from './parse-payments.js';
import {
  isSalarySheet, parseSalarySheet, parseTextbooks, parseStationery, parseInventory,
  parseUniformCosts, parseInvoice, sheetToGrid
} from './parse-other.js';

const rowsOf = (XLSX, ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

/** The session a file belongs to, from its file name ("2025 - 2026 FEE.xlsx"). */
export function sessionFromFileName(name) {
  return parseSession(String(name).replace(/_/g, ' ')) || null;
}

/**
 * @param XLSX  the SheetJS module
 * @param data  ArrayBuffer / Uint8Array of the .xlsx file
 * @param fileName  original file name (used to infer the session when sheets do not say)
 */
export function parseWorkbook(XLSX, data, fileName) {
  const wb = XLSX.read(data, { type: 'array', cellNF: true });
  const fileSession = sessionFromFileName(fileName);
  const out = { fileName, kind: 'unknown', sheets: [], fees: [], payments: [], salary: [], stock: null, invoice: null, grids: [], skipped: [], warnings: [] };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const title = sheetName.trim();
    const rows = rowsOf(XLSX, ws);
    if (!rows.length) { out.skipped.push({ sheet: title, why: 'Empty sheet' }); continue; }

    const sess = parseSession(title) || fileSession;
    const term = parseTerm(title);

    if (isFeeSheet(rows)) {
      const parsed = parseFeeSheet(rows);
      out.fees.push({
        sheet: title, session: sess, term, fromFileSession: !!fileSession && !!sess && sess.key === fileSession.key && !parseSession(title) ? true : !!(fileSession && sess && fileSession.key === sess.key),
        ...parsed
      });
      continue;
    }
    if (isPaymentSheet(rows, title)) {
      const parsed = parsePaymentSheet(rows, XLSX);
      out.payments.push({ sheet: title, session: sess, term, fromFileSession: !!(fileSession && sess && fileSession.key === sess.key), ...parsed });
      continue;
    }
    if (/REMIT|STIPEND/i.test(title)) {
      out.grids.push({ sheet: title, kind: /STIPEND/i.test(title) ? 'stipend' : 'remit', session: sess, term, fromFileSession: !!(fileSession && sess && fileSession.key === sess.key), grid: sheetToGrid(ws, XLSX) });
      continue;
    }
    if (isSalarySheet(rows)) { out.salary.push({ sheet: title, ...parseSalarySheet(rows, title) }); continue; }

    const up = clean(title);
    if (up === 'TEXTBOOKS') { (out.stock ||= {}).textbooks = parseTextbooks(rows); continue; }
    if (up === 'NB & STAT') { (out.stock ||= {}).stationery = parseStationery(rows); continue; }
    if (up === 'STOCK') { (out.stock ||= {}).inventory = parseInventory(rows); continue; }
    if (up === 'UNIFORMS') { (out.stock ||= {}).uniforms = parseUniformCosts(rows); continue; }
    if (/FEE BREAKDOWN|INVOICE/.test(up)) { out.invoice = parseInvoice(rows); continue; }

    out.skipped.push({ sheet: title, why: 'Not recognised as a sheet the portal uses' });
  }

  out.kind = out.fees.length ? 'fees' : out.salary.length ? 'salary' : out.stock ? 'stock' : out.invoice ? 'invoice' : 'unknown';
  // Fee sheets whose name carries no session or term cannot be placed – the import page asks the owner.
  for (const f of out.fees) {
    if (!f.session) out.warnings.push(`Sheet "${f.sheet}": session could not be worked out – choose it on the import page.`);
    if (!f.term) out.warnings.push(`Sheet "${f.sheet}": term could not be worked out – choose it on the import page.`);
  }
  return out;
}

export { sessionKey };
