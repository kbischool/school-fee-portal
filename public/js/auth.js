// ---------------------------------------------------------------------
// Sign-in, sign-up with a school code, and role lookup.
// Parent codes are unchanged: a parent still uses the code they were
// given, once, to create an email + password login.
// ---------------------------------------------------------------------
import {
  auth, db, doc, getDoc, setDoc, updateDoc, writeBatch, arrayUnion,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
  onAuthStateChanged, signOut, sendPasswordResetEmail, confirmPasswordReset, verifyPasswordResetCode, deleteUser
} from "./firebase.js";

export { auth, db };
const googleProvider = new GoogleAuthProvider();
const nowIso = () => new Date().toISOString();

/**
 * Who is this signed-in account?
 * Returns { role: 'owner' | 'admin' | 'parent' | null, data }.
 *  - owner: has a document at owners/{uid} (created by hand in the Firebase console, once)
 *  - admin: has a document at admins/{uid}
 *  - parent: has a document at parents/{uid}
 */
export async function getUserRole(uid) {
  try {
    const o = await getDoc(doc(db, "owners", uid));
    if (o.exists()) return { role: "owner", data: o.data() };
  } catch (e) { /* not an owner */ }
  const a = await getDoc(doc(db, "admins", uid));
  if (a.exists()) return { role: "admin", data: a.data() };
  const p = await getDoc(doc(db, "parents", uid));
  if (p.exists()) return { role: "parent", data: p.data() };
  return { role: null, data: null };
}

/** Where each role lands after signing in. */
export const HOME = { owner: "owner-dashboard.html", admin: "admin-dashboard.html", parent: "parent-dashboard.html" };

const normalise = (code) => String(code || "").trim().toUpperCase();

// -----------------------------------------------------------------
// First-time claim: PARENT. The code is looked up in schoolCodes/{code}.
// -----------------------------------------------------------------
export async function claimParentCode(code, email, password, displayName) {
  const c = normalise(code);
  const codeRef = doc(db, "schoolCodes", c);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) throw new Error("That code wasn't recognized. Double-check it and try again.");
  const codeData = codeSnap.data();
  if (codeData.claimed) throw new Error("This code has already been used to set up an account. Try logging in instead, or use 'Forgot password'.");

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  try {
    // One atomic write: the parent record and the "code is used" flag succeed or fail together.
    const batch = writeBatch(db);
    batch.set(doc(db, "parents", uid), {
      email, displayName: displayName || email, role: "parent",
      linkedStudents: [codeData.studentId], claimedFrom: c, createdAt: nowIso()
    });
    batch.update(codeRef, { claimed: true, claimedByUid: uid, claimedAt: nowIso() });
    await batch.commit();
  } catch (err) {
    await deleteUser(cred.user).catch(() => {});
    throw new Error("We couldn't finish setting up your account. Please try again, or contact the school office.");
  }
  return uid;
}

// -----------------------------------------------------------------
// First-time claim: STAFF ADMIN. The account is created first so that
// admin codes can only be looked up by a signed-in user.
// -----------------------------------------------------------------
export async function claimAdminCode(code, email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await linkAdminCode(cred.user.uid, email, displayName || email, code);
  } catch (err) {
    await deleteUser(cred.user).catch(() => {});
    throw err;
  }
  return cred.user.uid;
}

async function linkAdminCode(uid, email, displayName, code) {
  const c = normalise(code);
  const codeRef = doc(db, "adminCodes", c);
  let snap;
  try { snap = await getDoc(codeRef); } catch (e) { throw new Error("That code wasn't recognized. Double-check it and try again."); }
  if (!snap.exists()) throw new Error("That code wasn't recognized. Double-check it and try again.");
  if (snap.data().claimed) throw new Error("This admin code has already been used. Try logging in instead.");
  const batch = writeBatch(db);
  batch.set(doc(db, "admins", uid), { email, displayName, role: "admin", claimedFrom: c, label: snap.data().label || "", createdAt: nowIso() });
  batch.update(codeRef, { claimed: true, claimedByUid: uid, claimedAt: nowIso() });
  await batch.commit();
}

export async function loginEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user.uid;
}

export async function loginGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

/** A Google account seen for the first time must supply its code. */
export async function linkGoogleUserWithCode(uid, email, displayName, code, asAdmin) {
  if (asAdmin) return linkAdminCode(uid, email, displayName, code);
  const c = normalise(code);
  const codeRef = doc(db, "schoolCodes", c);
  const snap = await getDoc(codeRef);
  if (!snap.exists()) throw new Error("That code wasn't recognized.");
  if (snap.data().claimed) throw new Error("This code has already been used.");
  const batch = writeBatch(db);
  batch.set(doc(db, "parents", uid), {
    email, displayName, role: "parent", linkedStudents: [snap.data().studentId], claimedFrom: c, createdAt: nowIso()
  });
  batch.update(codeRef, { claimed: true, claimedByUid: uid, claimedAt: nowIso() });
  await batch.commit();
}

/** A parent with more than one child adds the second child's code to the same login. */
export async function linkAdditionalStudentCode(uid, code) {
  const c = normalise(code);
  const codeRef = doc(db, "schoolCodes", c);
  const snap = await getDoc(codeRef);
  if (!snap.exists()) throw new Error("That code wasn't recognized.");
  if (snap.data().claimed) throw new Error("This code has already been used.");
  const batch = writeBatch(db);
  batch.update(doc(db, "parents", uid), { linkedStudents: arrayUnion(snap.data().studentId) });
  batch.update(codeRef, { claimed: true, claimedByUid: uid, claimedAt: nowIso() });
  await batch.commit();
}

export const watchAuthState = (cb) => onAuthStateChanged(auth, cb);
export const logout = () => signOut(auth);

// "Forgot password": Firebase emails the link; this site never sees the password.
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email, { url: window.location.origin + "/index.html" });
}

// Completing a reset happens only on a button click (never on page load) because some
// mail scanners open links automatically and would use up the one-time code.
export const checkResetCodeValid = (oobCode) => verifyPasswordResetCode(auth, oobCode);
export const completePasswordReset = (oobCode, newPassword) => confirmPasswordReset(auth, oobCode, newPassword);
