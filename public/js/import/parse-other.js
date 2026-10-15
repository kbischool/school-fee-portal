// ---------------------------------------------------------------------
// Parsers for the non-fee workbooks: salary, stock, new-student invoice,
// and the free-form "remittance" / "stipend" sheets.
// ---------------------------------------------------------------------
import { clean, num, isNum, round2, slug, classKey, classLabel, findHeaderRow, toISODate, itemLabel } from './util.js';

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const titleCase = (s) => String(s).trim().toLowerCase().replace(/(^|[\s/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

// ------------------------------- SALARY -------------------------------
export function isSalarySheet(rows) {
  return findHeaderRow(rows, ['BASIC SALARY'], 4) >= 0;
}

/**
 * One salary sheet -> months of staff rows. Bank ACCOUNT NUMBERS are
 * deliberately never read: the portal has no need for them.
 */
export function parseSalarySheet(rows, title) {
  const h = findHeaderRow(rows, ['BASIC SALARY'], 4);
  const rawHeaders = rows[h].map((c) => (c == null ? '' : String(c).trim()));
  const cols = rawHeaders.map(clean);
  const nameI = cols.indexOf('NAME');
  const firstI = cols.indexOf('FIRSTNAME');
  const lastI = cols.indexOf('LASTNAME');
  const bankI = cols.indexOf('BANK');
  const contractI = cols.indexOf('CONTRACT');
  const SKIP = new Set(['NAME', 'FIRSTNAME', 'LASTNAME', 'BANK', 'ACCOUNT NUMBER', 'CONTRACT', 'DATE DUE', '']);
  const valueCols = cols.map((c, i) => (SKIP.has(c) ? -1 : i)).filter((i) => i >= 0);

  const months = [];
  let current = null;
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const filled = row.map((v, i) => [i, v]).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (!filled.length) continue;
    // A month heading is a month name in the first column; stray zeros in other cells are ignored.
    if (typeof row[0] === 'string' && filled.slice(1).every(([, v]) => v === 0 || v === '0')) {
      const m = clean(row[0]).split(' ')[0];
      if (MONTH_NAMES.includes(m)) { current = { month: titleCase(m), rows: [] }; months.push(current); continue; }
    }
    if (!current) continue;
    let name = '';
    // Names are always text: a bare number in the name column is a month's total row.
    if (nameI >= 0) name = typeof row[nameI] === 'string' ? row[nameI].trim() : '';
    else if (firstI >= 0 || lastI >= 0) {
      const f = typeof row[firstI] === 'string' ? row[firstI] : '';
      const l = typeof row[lastI] === 'string' ? row[lastI] : '';
      name = `${f} ${l}`.replace(/\s+/g, ' ').trim();
    }
    if (!name || /^TOTAL/i.test(name)) continue;
    const vals = {};
    let any = false;
    for (const i of valueCols) {
      const v = num(row[i]);
      if (v !== 0) { vals[titleCase(rawHeaders[i])] = round2(v); any = true; }
    }
    if (!any) continue;
    current.rows.push({
      name: name.toUpperCase(),
      bank: bankI >= 0 && row[bankI] != null ? String(row[bankI]).trim().toUpperCase() : '',
      contract: contractI >= 0 && row[contractI] != null ? String(row[contractI]).trim().toUpperCase() : '',
      vals
    });
  }
  const year = (String(title).match(/(20\d{2})/) || [])[1] || '';
  const group = /PRIMARY/i.test(title) ? 'Primary' : /SECONDARY/i.test(title) ? 'Secondary' : /SUPPORT/i.test(title) ? 'Support' : 'All staff';
  return {
    id: slug(title), title: String(title).trim(), year, group,
    columns: valueCols.map((i) => titleCase(rawHeaders[i])),
    months: months.filter((m) => m.rows.length)
  };
}

// ------------------------------- STOCKS -------------------------------
export function parseTextbooks(rows) {
  const h = findHeaderRow(rows, ['CLASS', 'TEXTBOOK']);
  if (h < 0) return [];
  const c = rows[h].map(clean);
  const ix = (n) => c.indexOf(n);
  const out = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const title = row[ix('TEXTBOOK')];
    if (typeof title !== 'string' || !title.trim() || !row[ix('CLASS')]) continue;
    const ck = classKey(row[ix('CLASS')]);
    out.push({
      classKey: ck, class: classLabel(ck),
      subject: String(row[ix('SUBJECTS')] ?? '').trim(),
      title: title.trim(),
      provider: String(row[ix('PROVIDER')] ?? '').trim(),
      qty: num(row[ix('NEEDED QTY')]),
      cost: num(row[ix('COST PRICE')]), sell: num(row[ix('SELL PRICE')])
    });
  }
  return out;
}

export function parseStationery(rows) {
  const h = findHeaderRow(rows, ['ITEM', 'SELLING PRICE']);
  if (h < 0) return { classes: [], items: [], classTotals: {} };
  const c = rows[h].map(clean);
  const sellI = c.indexOf('SELLING PRICE');
  const classCols = c.map((k, i) => [k, i]).filter(([, i]) => i > sellI && c[i]);
  const items = [];
  let classTotals = {};
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = row[0];
    const perClass = {};
    for (const [k, i] of classCols) if (num(row[i]) !== 0) perClass[k] = num(row[i]);
    if (typeof name === 'string' && name.trim()) {
      if (!Object.keys(perClass).length) continue; // an item nobody is issued
      items.push({ item: name.trim(), cost: num(row[c.indexOf('COST PRICE')]), sell: num(row[sellI]), perClass });
    } else if (Object.keys(perClass).length && !Object.keys(classTotals).length) {
      classTotals = perClass; // the unlabelled row of per-class totals
    }
  }
  return { classes: classCols.map(([k]) => k), items, classTotals };
}

export function parseInventory(rows) {
  const h = findHeaderRow(rows, ['ITEMS', 'NEEDED QTY']);
  if (h < 0) return [];
  const c = rows[h].map(clean);
  const ix = (n) => c.indexOf(n);
  const out = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const item = row[0];
    if (typeof item !== 'string' || !item.trim()) continue;
    out.push({
      item: item.trim(), available: num(row[ix('AVAILABLE QTY')]), needed: num(row[ix('NEEDED QTY')]),
      cost: num(row[ix('COST PER ITEM')]), totalCost: num(row[ix('TOTAL COST')]),
      paid: num(row[ix('AMOUNT PAID')]), balance: num(row[ix('BALANCE')])
    });
  }
  return out;
}

export function parseUniformCosts(rows) {
  const h = findHeaderRow(rows, ['UNIFORM', 'HOODY']);
  if (h < 0) return [];
  const c = rows[h].map(clean);
  const out = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (typeof row[0] !== 'string' || !row[0].trim()) continue;
    out.push({ group: row[0].trim(), uniform: num(row[c.indexOf('UNIFORM')]), hoody: num(row[c.indexOf('HOODY')]), sportswear: num(row[c.indexOf('SPORTSWEAR')]) });
  }
  return out;
}

// ------------------------------- INVOICE ------------------------------
export function parseInvoice(rows) {
  const h = findHeaderRow(rows, ['CLASS', 'GRAND TOTAL']);
  if (h < 0) return [];
  const raw = rows[h].map((v) => (v == null ? '' : String(v)));
  const c = raw.map(clean);
  const totalI = c.indexOf('GRAND TOTAL');
  const out = [];
  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (typeof row[0] !== 'string' || !row[0].trim()) continue;
    const items = [];
    for (let i = 1; i < totalI; i++) {
      const v = num(row[i]);
      if (c[i] && v !== 0) items.push({ label: itemLabel(raw[i]), amount: round2(v) });
    }
    const ck = classKey(row[0]);
    out.push({ classKey: ck, class: classLabel(ck), items, total: round2(num(row[totalI]) || items.reduce((s, x) => s + x.amount, 0)) });
  }
  return out;
}

// -------------------- FREE-FORM GRID (remit, stipend) -----------------
/**
 * Keeps a sheet exactly as it looks: a grid of text/number/date cells.
 * Firestore cannot store arrays of arrays, so each row is { cells: [...] }.
 */
export function sheetToGrid(ws, XLSX) {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows = [];
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 300); r++) {
    const cells = [];
    let any = false;
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 15); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      let v = null;
      if (cell && cell.v !== undefined && cell.v !== '') {
        if (cell.t === 'n' && cell.z && /[dmy]/i.test(String(cell.z)) && !/[#0]/.test(String(cell.z))) v = toISODate(cell.v, XLSX) || cell.v;
        else v = cell.v instanceof Date ? toISODate(cell.v, XLSX) : cell.v;
        any = true;
      }
      cells.push(v);
    }
    rows.push({ cells });
    if (!any) { /* keep blank spacer rows so the layout is preserved */ }
  }
  // Trim trailing empty rows and columns.
  while (rows.length && rows[rows.length - 1].cells.every((v) => v === null)) rows.pop();
  let maxC = 0;
  rows.forEach((r) => r.cells.forEach((v, i) => { if (v !== null) maxC = Math.max(maxC, i + 1); }));
  rows.forEach((r) => { r.cells = r.cells.slice(0, maxC); });
  return rows;
}
