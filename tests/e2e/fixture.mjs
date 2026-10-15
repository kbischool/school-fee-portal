// Builds a made-up school (no real names or amounts) by running the REAL importer on generated sheets.
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../../public/js/import/parse-workbook.js';
import { buildPlan, chooseSheets } from '../../public/js/import/plan.js';

const wbBuf = (sheets) => { const wb = XLSX.utils.book_new(); for (const [n, r] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r), n); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }); };
const SURN = ['Adeyemi', 'Bello', 'Chukwu', 'Danjuma', 'Eze', 'Fashola', 'Gbadamosi', 'Hassan', 'Ibrahim', 'Johnson', 'Kalu', 'Lawal'];
const FIRST = ['Ada', 'Bola', 'Chidi', 'Dayo', 'Emeka', 'Funmi', 'Gozie', 'Halima', 'Ife', 'Jide'];
const CLASSES = ['CRECHE', 'NUR 1', 'PRY 1', 'PRY 3', 'JSS 1', 'SSS 2'];
const hdr = ['S/N', 'LAST NAME', 'FIRST NAME', 'CLASS', 'TUITION', 'BOOKS', 'UNIFORM', 'GRAND TOTAL FEE', 'TOTAL PAID', 'BALANCE'];

export function buildFixture() {
  const kids = []; let n = 0;
  for (const s of SURN) for (let i = 0; i < 3; i++) kids.push({ last: s, first: FIRST[(n++ * 3 + i) % FIRST.length] + (i ? ' ' + FIRST[(n + 4) % FIRST.length] : ''), cls: CLASSES[n % CLASSES.length] });
  const sheet = (ver, pr) => [hdr, ...kids.map((k, i) => { const t = 90000 + (i % 6) * 15000, b = 12000, u = i % 4 ? 8000 : 0, total = t + b + u; const paid = i % 5 === 0 ? total : i % 5 === 1 ? Math.round(total * pr) : i % 5 === 2 ? 0 : total; return [i + 1, k.last, k.first, ver ? k.cls : 'PRY 1', t, b, u, total, paid, total - paid]; })];
  const fees = parseWorkbook(XLSX, wbBuf({ '1ST TERM 2026-2027': sheet(true, .5), '3RD TERM 2025-2026': sheet(false, .7), '2ND TERM 2025-2026': sheet(false, .9), '1ST TERM 2025-2026': sheet(false, 1) }), 'fees.xlsx');
  const pay = parseWorkbook(XLSX, wbBuf({ '1ST TERM 2026-2027 PAY LOG': [['DATE', 'NARRATION', 'STUDENT', 'Amount Credit', 'PURPOSE', 'BANK'],
    ['2026-09-10', 'TRF FROM A. ADEYEMI SECRET-NARRATION', 'Adeyemi family', 100000, 'School fees', 'GTB'], ['2026-09-12', 'TRF', 'Bello Ada', 50000, 'School fees', 'GTB'], ['2026-09-15', 'TRF', '', 20000, 'School fees', 'GTB']] }), 'pay.xlsx');
  const stock = parseWorkbook(XLSX, wbBuf({
    TEXTBOOKS: [['CLASS', 'SUBJECTS', 'TEXTBOOK', 'PROVIDER', 'NEEDED QTY', 'COST PRICE', 'SELL PRICE'], ['PRY 1', 'Maths', 'Maths Book 1', 'SECRET-SUPPLIER', 30, 1500, 2500], ['PRY 1', 'English', 'English 1', 'SECRET-SUPPLIER', 30, 1200, 2000], ['JSS 1', 'Science', 'Science JSS1', 'SECRET-SUPPLIER', 0, 1000, 1800]],
    'NB & STAT': [['ITEM', 'COST PRICE', 'SELLING PRICE', 'PRY1', 'JSS1'], ['Notebook 80L', 200, 400, 6, 8], ['Pencil', 50, 100, 4, 0]],
    STOCK: [['ITEMS', 'AVAILABLE QTY', 'NEEDED QTY', 'COST PER ITEM', 'TOTAL COST', 'AMOUNT PAID', 'BALANCE'], ['Chalk box', 5, 20, 300, 6000, 3000, 3000]] }), 'STOCKS.xlsx');
  const inv = parseWorkbook(XLSX, wbBuf({ 'FEE BREAKDOWN': [['CLASS', 'TUITION', 'ADMISSION FORM', 'GRAND TOTAL'], ['PRY 1', 100000, 5000, 105000], ['JSS 1', 150000, 5000, 155000]] }), 'INVOICE.xlsx');
  const sal = parseWorkbook(XLSX, wbBuf({ 'SALARY 2026 PRIMARY': [['NAME', 'BASIC SALARY', 'Amount Payable'], ['JANUARY', 0, 0], ['SECRET STAFFNAME', 100000, 100000]] }), 'SALARY.xlsx');

  const chosen = chooseSheets(fees.fees, (f) => f.students.length).chosen;
  const plan = buildPlan({ existingStudents: [], maxCodeIndex: -1, currentSession: '2026/2027', fees: chosen, payments: pay.payments, salary: sal.salary, grids: [], stock: stock.stock, invoice: inv.invoice });
  const docs = {};
  for (const o of plan.ops) docs[o.path] = o.merge ? { ...(docs[o.path] || {}), ...o.data } : o.data;
  docs['owners/u-owner'] = { displayName: 'Olu Owner', email: 'owner@test.dev' };
  docs['admins/u-admin'] = { displayName: 'Ada Admin', email: 'admin@test.dev', role: 'admin' };
  const codes = Object.keys(docs).filter((k) => k.startsWith('schoolCodes/')).map((k) => k.split('/')[1]);
  const a = codes[0], b = codes[1], c = codes[2];
  docs['parents/u-parent'] = { displayName: 'Pat Parent', email: 'parent@test.dev', role: 'parent', linkedStudents: [a, b] };
  docs['parents/u-lonely'] = { displayName: 'No Kids', email: 'lonely@test.dev', role: 'parent', linkedStudents: [] };
  for (const k of [a, b]) docs['schoolCodes/' + k] = { ...docs['schoolCodes/' + k], claimed: true, claimedByUid: 'u-parent' };
  docs['adminCodes/ADMIN-ONE'] = { claimed: false, label: 'Front desk' };
  return {
    docs, plan, codes, parentChildren: [a, b], other: c,
    accounts: { 'u-owner': { email: 'owner@test.dev', pw: 'pw', name: 'Olu Owner' }, 'u-admin': { email: 'admin@test.dev', pw: 'pw', name: 'Ada Admin' }, 'u-parent': { email: 'parent@test.dev', pw: 'pw', name: 'Pat Parent' }, 'u-lonely': { email: 'lonely@test.dev', pw: 'pw', name: 'No Kids' } }
  };
}
