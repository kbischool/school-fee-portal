// ---------------------------------------------------------------------
// Small, dependency-free helpers shared by every workbook parser.
// These run in the browser (import page) and in Node (automated tests).
// ---------------------------------------------------------------------

/** Upper-case, trim and collapse internal whitespace. */
export const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Round to 2 decimal places (kobo) without floating-point noise. */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Convert a cell to a number. Text such as "1,500" is understood; anything else is 0. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,\s₦]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** True when the cell holds a real number (not blank text). */
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Lower-case url/id-safe slug. */
export const slug = (s) =>
  clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** "LAST FIRST" – the name format already stored on every student document. */
export const fullName = (last, first) => `${clean(last)} ${clean(first)}`.trim();

/** Small, stable string hash (FNV-1a) – used to make deterministic document ids. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------
// Sessions and terms
// ---------------------------------------------------------------------

/** "1ST TERM 2025-2026" -> { session: "2025/2026", key: "2025-2026" } (or null). */
export function parseSession(text) {
  const m = String(text ?? '').match(/(20\d{2})\s*[-/]\s*(20\d{2})/);
  if (!m) return null;
  return { session: `${m[1]}/${m[2]}`, key: `${m[1]}-${m[2]}` };
}

/** "2ND TERM ..." -> 2. Returns 0 when the text names no term. */
export function parseTerm(text) {
  const m = clean(text).match(/\b(1ST|2ND|3RD)\b/);
  return m ? { '1ST': 1, '2ND': 2, '3RD': 3 }[m[1]] : 0;
}

export const sessionKey = (session) => String(session).replace('/', '-');
export const TERM_LABELS = { 1: '1st Term', 2: '2nd Term', 3: '3rd Term' };

// ---------------------------------------------------------------------
// Classes – the sheets spell them many ways ("02 PG1", "PLAYGROUP 1",
// "PG1", "JUNIOR SECONDARY SCHOOL 1", "JSS1"). Everything is reduced to
// one short key so that fees, textbooks and invoices line up.
// ---------------------------------------------------------------------
export function classKey(raw) {
  const c = clean(raw).replace(/^\d+\s+/, ''); // drop sort prefixes like "02 "
  let m;
  if (/^CRECHE/.test(c)) return 'CRECHE';
  if ((m = c.match(/^(?:PG|PLAY\s?GROUP)\s*(\d)/))) return `PG${m[1]}`;
  if ((m = c.match(/^(?:NUR|NURSERY)\s*(\d)/))) return `NUR${m[1]}`;
  if ((m = c.match(/^(?:PRY|PRIMARY)\s*(\d)/))) return `PRY${m[1]}`;
  if ((m = c.match(/^(?:JSS|JUNIOR SECONDARY(?: SCHOOL)?)\s*(\d)/))) return `JSS${m[1]}`;
  if ((m = c.match(/^(?:SSS|SS|SENIOR SECONDARY(?: SCHOOL)?)\s*(\d)/))) return `SSS${m[1]}`;
  return c;
}

const SECTION_NAMES = {
  CRECHE: 'Creche & Playgroup', PG: 'Creche & Playgroup', NUR: 'Nursery',
  PRY: 'Primary', JSS: 'Junior Secondary', SSS: 'Senior Secondary'
};
export const SECTIONS = ['Creche & Playgroup', 'Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'];

export function classLabel(key) {
  let m;
  if (key === 'CRECHE') return 'Creche';
  if ((m = key.match(/^PG(\d)$/))) return `Playgroup ${m[1]}`;
  if ((m = key.match(/^NUR(\d)$/))) return `Nursery ${m[1]}`;
  if ((m = key.match(/^PRY(\d)$/))) return `Primary ${m[1]}`;
  if ((m = key.match(/^JSS(\d)$/))) return `JSS ${m[1]}`;
  if ((m = key.match(/^SSS(\d)$/))) return `SSS ${m[1]}`;
  return key;
}

export function sectionOf(key) {
  const m = String(key).match(/^(CRECHE|PG|NUR|PRY|JSS|SSS)/);
  return m ? SECTION_NAMES[m[1]] : 'Other';
}

/** Sort order: Creche, Playgroup, Nursery, Primary 1-6, JSS, SSS. */
export function classRank(key) {
  const order = ['CRECHE', 'PG', 'NUR', 'PRY', 'JSS', 'SSS'];
  const m = String(key).match(/^(CRECHE|PG|NUR|PRY|JSS|SSS)(\d?)/);
  if (!m) return 999;
  return order.indexOf(m[1]) * 10 + (m[2] ? parseInt(m[2], 10) : 0);
}

// ---------------------------------------------------------------------
// Fee item labels – turns sheet headers into parent-friendly wording.
// ---------------------------------------------------------------------
const LABELS = {
  'AD_FORM': 'Admission form', 'AD-FORM': 'Admission form', 'ADMISSION FORM': 'Admission form',
  'TUITION': 'Tuition', 'TUITION FEE': 'Tuition', 'SCHOOL FEE': 'Tuition',
  'PTA&EXAM': 'PTA & exam', 'PTA/EXAM': 'PTA & exam',
  'REPORT_CARD': 'Report card', 'REPORT CARD': 'Report card',
  'PRACTICAL': 'Practicals', 'PRACTICALS': 'Practicals',
  'TEXTBOOKS': 'Textbooks', 'TEXTBOOKS & STATIONARIES': 'Textbooks & stationery', 'BOOKS': 'Books',
  'NB & STAT': 'Notebooks & stationery', 'NOTEBOOKS': 'Notebooks',
  'UNIFORM': 'Uniform', 'SCHOOL UNIFORM': 'Uniform', 'HOODY': 'Hoody', 'HAT': 'Hat',
  'SPORTSWEAR': 'Sportswear', 'SPORT WEAR': 'Sportswear',
  'AFTERSCHOOL': 'After-school', 'AFTER SCHOOL CLUB': 'After-school club',
  'EXCURSION': 'Excursion', 'EXTERNAL EXAMINATION': 'External exam', 'EXTERNAL EXAM': 'External exam',
  'GRADUATION/ SPORTS/PARTY': 'Graduation, sports & party', 'GRADUATION': 'Graduation',
  'END OF YEAR PARTY': 'End-of-year party', 'HOLIDAY LESSON': 'Holiday lesson',
  'OUTSTANDING': 'Outstanding (brought forward)', 'MAINTENANCE': 'Maintenance',
  'COMPUTER': 'Computer', 'COMPUTER PRACTICAL': 'Computer practical', 'SCHOOL MAGAZINE': 'School magazine',
  'YEAR BOOK': 'Year book', 'INTER-HOUSE SPORT': 'Inter-house sport',
  'PREVOCATIONAL': 'Prevocational', 'PREVOCATIONAL PRACTICAL': 'Prevocational practical',
  'PHONICS': 'Phonics', 'XXX': 'Other charges', 'EARLY MORNING CLASS': 'Early-morning class',
  'EARLY MORNING LESSON': 'Early-morning lesson', 'EARLY MORNING REVISION CLASSES': 'Early-morning revision'
};
export function itemLabel(header) {
  const key = clean(header);
  if (LABELS[key]) return LABELS[key];
  const t = key.replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n) => String(n).padStart(2, '0');

/**
 * Turns an Excel serial number, a JS Date, or text such as "Aug 27, 2022"
 * into "YYYY-MM-DD". Returns "" when the value is not a date.
 * `XLSX` is passed in so this file has no hard dependency on SheetJS.
 */
export function toISODate(v, XLSX) {
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (isNum(v) && v > 20000 && v < 80000 && XLSX) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
      const mi = MONTHS.indexOf(m[1].toUpperCase());
      if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(parseInt(m[2], 10))}`;
    }
    const iso = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return '';
}

/** Find the first row (within `limit` rows) that contains all of the given header patterns. */
export function findHeaderRow(rows, patterns, limit = 12) {
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const cells = (rows[i] || []).map(clean);
    if (patterns.every((p) => cells.some((c) => (p instanceof RegExp ? p.test(c) : c === p)))) return i;
  }
  return -1;
}
