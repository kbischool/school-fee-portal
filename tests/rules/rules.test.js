import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, writeBatch, arrayUnion } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-kbis', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'owners/own'), { name: 'Owner' });
    await setDoc(doc(db, 'admins/adm'), { role: 'admin' });
    await setDoc(doc(db, 'parents/par'), { role: 'parent', linkedStudents: ['S1'] });
    await setDoc(doc(db, 'parents/par2'), { role: 'parent', linkedStudents: ['S2'] });
    await setDoc(doc(db, 'students/S1'), { name: 'A' });
    await setDoc(doc(db, 'students/S1/records/r1'), { due: 1 });
    await setDoc(doc(db, 'students/S1/payments/p1'), { amount: 1 });
    await setDoc(doc(db, 'students/S2'), { name: 'B' });
    await setDoc(doc(db, 'ledgers/l'), { rows: [] });
    await setDoc(doc(db, 'invoices/main'), {});
    await setDoc(doc(db, 'stock/textbooks'), {});
    await setDoc(doc(db, 'stockCosts/main'), {});
    await setDoc(doc(db, 'salaries/s'), {});
    await setDoc(doc(db, 'ownerSheets/o'), {});
    await setDoc(doc(db, 'payments/p'), { narration: 'x' });
    await setDoc(doc(db, 'parentCatalog/PRY1'), {});
    await setDoc(doc(db, 'config/app'), {});
    await setDoc(doc(db, 'schoolCodes/ABC1000'), { studentId: 'S1', claimed: false });
    await setDoc(doc(db, 'adminCodes/ADM1'), { claimed: false });
  });
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

test('signed-out visitors can read nothing but a single parent code', async () => {
  const db = anon();
  for (const p of ['students/S1', 'ledgers/l', 'config/app', 'parentCatalog/PRY1', 'invoices/main', 'adminCodes/ADM1']) await assertFails(getDoc(doc(db, p)));
  await assertSucceeds(getDoc(doc(db, 'schoolCodes/ABC1000')));
  await assertFails(getDocs(collection(db, 'schoolCodes')));
});

test('owner can read everything', async () => {
  const db = as('own');
  for (const p of ['students/S1', 'students/S1/records/r1', 'ledgers/l', 'invoices/main', 'stock/textbooks', 'stockCosts/main', 'salaries/s', 'ownerSheets/o', 'payments/p', 'parentCatalog/PRY1']) await assertSucceeds(getDoc(doc(db, p)));
  await assertSucceeds(setDoc(doc(db, 'ledgers/new'), {}));
});

test('admin sees staff data but never owner-only data', async () => {
  const db = as('adm');
  for (const p of ['students/S1', 'students/S1/records/r1', 'students/S1/payments/p1', 'ledgers/l', 'invoices/main', 'stock/textbooks', 'parentCatalog/PRY1', 'config/app']) await assertSucceeds(getDoc(doc(db, p)));
  for (const p of ['stockCosts/main', 'salaries/s', 'ownerSheets/o', 'payments/p']) await assertFails(getDoc(doc(db, p)));
  await assertFails(getDocs(collection(db, 'payments')));
  await assertFails(getDocs(collection(db, 'schoolCodes')));
  await assertFails(setDoc(doc(db, 'ledgers/l'), { rows: [1] }));
  await assertFails(setDoc(doc(db, 'students/S1'), { name: 'hacked' }));
});

test('parent sees only linked children and the class catalogue', async () => {
  const db = as('par');
  await assertSucceeds(getDoc(doc(db, 'students/S1')));
  await assertSucceeds(getDoc(doc(db, 'students/S1/records/r1')));
  await assertSucceeds(getDoc(doc(db, 'students/S1/payments/p1')));
  await assertSucceeds(getDoc(doc(db, 'parentCatalog/PRY1')));
  await assertFails(getDoc(doc(db, 'students/S2')));
  await assertFails(getDocs(collection(db, 'students')));
  for (const p of ['ledgers/l', 'invoices/main', 'stock/textbooks', 'stockCosts/main', 'salaries/s', 'payments/p']) await assertFails(getDoc(doc(db, p)));
});

test('nobody can make themselves owner', async () => {
  await assertFails(setDoc(doc(as('par'), 'owners/par'), {}));
  await assertFails(setDoc(doc(as('newbie'), 'owners/newbie'), {}));
  await assertFails(setDoc(doc(as('adm'), 'owners/adm'), {}));
});

test('admin sign-up needs a real unused code', async () => {
  const db = as('newadm');
  await assertFails(setDoc(doc(db, 'admins/newadm'), { claimedFrom: 'NOPE' }));
  await assertFails(setDoc(doc(db, 'admins/newadm'), { role: 'admin' }));
  const b = writeBatch(db);
  b.set(doc(db, 'admins/newadm'), { claimedFrom: 'ADM1', role: 'admin' });
  b.update(doc(db, 'adminCodes/ADM1'), { claimed: true, claimedByUid: 'newadm', claimedAt: 'now' });
  await assertSucceeds(b.commit());
  await assertFails(getDoc(doc(anon(), 'adminCodes/ADM1')));
});

test('parent sign-up claims a code once, and cannot tamper with it', async () => {
  const db = as('newpar');
  await assertFails(updateDoc(doc(db, 'schoolCodes/ABC1000'), { claimed: true, claimedByUid: 'someoneelse' }));
  await assertFails(updateDoc(doc(db, 'schoolCodes/ABC1000'), { claimed: true, claimedByUid: 'newpar', studentId: 'S2' }));
  const b = writeBatch(db);
  b.set(doc(db, 'parents/newpar'), { role: 'parent', linkedStudents: ['S1'] });
  b.update(doc(db, 'schoolCodes/ABC1000'), { claimed: true, claimedByUid: 'newpar', claimedAt: 'now' });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(as('other'), 'schoolCodes/ABC1000'), { claimed: true, claimedByUid: 'other', claimedAt: 'x' }));
});

test('a parent can add a child but cannot change other profile fields', async () => {
  const db = as('par');
  await assertSucceeds(updateDoc(doc(db, 'parents/par'), { linkedStudents: arrayUnion('S3') }));
  await assertFails(updateDoc(doc(db, 'parents/par'), { role: 'admin' }));
  await assertFails(getDoc(doc(db, 'parents/par2')));
});

test('unknown collections are closed', async () => {
  await assertFails(getDoc(doc(as('own'), 'mystery/x')));
  await assertFails(setDoc(doc(as('own'), 'mystery/x'), {}));
});
