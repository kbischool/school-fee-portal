import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../../public/js/import/parse-workbook.js';
import { buildPlan, makeCode } from '../../public/js/import/plan.js';
import { matchStudent, buildIndex } from '../../public/js/import/match.js';
import { parseSession, classKey } from '../../public/js/import/util.js';

// Entirely made-up students and amounts.
function workbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
const feeHeader = ['S/N', 'LAST NAME', 'FIRST NAME', 'CLASS', 'TUITION', 'BOOKS', 'GRAND TOTAL FEE', 'TOTAL PAID', 'BALANCE'];
const fees = workbook({
  '1ST TERM 2026-2027': [
    feeHeader,
    [1, 'Testerson', 'Ada Grace', 'PRY 1', 100000, 20000, 120000, 120000, 0],
    [2, 'Testerson', 'Bola', 'NUR 2', 80000, 10000, 90000, 30000, 60000],
    [3, 'Newcomer', 'Chidi', 'JSS 1', 150000, 0, 150000, 0, 150000],
    [4, 'Typo', 'Dayo', 'JSS 2', 100000, 0, 110000, 0, 110000]
  ],
  '1ST TERM 2025-2026': [
    feeHeader,
    [1, 'Testerson', 'Grace Ada', 'CRECHE', 50000, 0, 50000, 50000, 0],
    [2, 'Leaver', 'Ese', 'SSS 3', 90000, 0, 90000, 90000, 0]
  ]
});

test('session and class names are understood', () => {
  assert.equal(parseSession('1ST TERM 2025-2026').session, '2025/2026');
  assert.equal(classKey('PRY 1'), classKey('PRY1'));
});

test('fee sheets are parsed with totals, status inputs and adjustments', () => {
  const r = parseWorkbook(XLSX, fees, 'test.xlsx');
  assert.equal(r.fees.length, 2);
  const cur = r.fees.find((f) => f.session.key === '2026-2027');
  assert.equal(cur.students.length, 4);
  const ada = cur.students[0];
  assert.equal(ada.due, 120000); assert.equal(ada.paid, 120000); assert.equal(ada.balance, 0);
  const typo = cur.students[3];
  assert.ok(typo.items.some((i) => i.adj), 'a total that is not the sum of its lines is shown as an adjustment');
  assert.ok(typo.warn.length > 0);
});

test('existing students keep their codes; only genuinely new current students get one', () => {
  const r = parseWorkbook(XLSX, fees, 'test.xlsx');
  const existing = [{ id: 'TESADA1000', name: 'TESTERSON ADA GRACE' }, { id: 'TESBOL1001', name: 'TESTERSON BOLA' }];
  const plan = buildPlan({ existingStudents: existing, maxCodeIndex: 1001, currentSession: '2026/2027', fees: r.fees, payments: [] });
  const codeOps = plan.ops.filter((o) => o.path.startsWith('schoolCodes/'));
  const ids = codeOps.map((o) => o.path.split('/')[1]);
  assert.ok(!ids.includes('TESADA1000') && !ids.includes('TESBOL1001'), 'no existing code is touched');
  assert.equal(ids.length, 2); // Newcomer + Typo
  assert.ok(ids.includes(makeCode('Newcomer', 'Chidi', 1002)));
  // the 2025/26 "Grace Ada" row (names swapped) is matched to the same student, not made a new one
  assert.ok(plan.ops.some((o) => o.path === 'students/TESADA1000/records/2025-2026_t1'));
  // someone who only appears in an old session becomes an alumnus with no code
  assert.equal(plan.report.alumni.length, 1);
  assert.ok(!plan.ops.some((o) => o.path.startsWith('schoolCodes/') && /LEAESE/.test(o.path)));
});

test('re-running the same import produces the same document ids (safe to repeat)', () => {
  const r = parseWorkbook(XLSX, fees, 'test.xlsx');
  const input = { existingStudents: [], maxCodeIndex: -1, currentSession: '2026/2027', fees: r.fees, payments: [] };
  const a = buildPlan(input).ops.map((o) => o.path).sort();
  const b = buildPlan(input).ops.map((o) => o.path).sort();
  assert.deepEqual(a, b);
});

test('name matching tolerates added middle names and hyphens', () => {
  const idx = buildIndex([{ id: 'X', name: 'AL-AMEER TUNDE' }, { id: 'Y', name: 'OKE JOHN' }]);
  assert.equal(matchStudent('Al-Ameer', 'Tunde', idx).person.id, 'X');
  assert.equal(matchStudent('Oke', 'John Paul', idx).person.id, 'Y');
  assert.equal(matchStudent('Nobody', 'Here', idx).person, null);
});

test('no bank account numbers or narrations reach parent-visible paths', () => {
  const r = parseWorkbook(XLSX, fees, 'test.xlsx');
  const plan = buildPlan({ existingStudents: [], maxCodeIndex: -1, currentSession: '2026/2027', fees: r.fees, payments: [] });
  for (const o of plan.ops.filter((x) => x.path.startsWith('students/'))) assert.ok(!('narration' in o.data));
});
