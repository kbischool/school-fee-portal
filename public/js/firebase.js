// ---------------------------------------------------------------------
// The one place that imports the Firebase SDK. Every other file imports
// from here, so the SDK version is pinned in a single line.
// ---------------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider,
  signInWithPopup, onAuthStateChanged, signOut, sendPasswordResetEmail, confirmPasswordReset,
  verifyPasswordResetCode, deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, collection,
  query, where, limit, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, appCheckSiteKey } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);

// App Check (optional): blocks traffic that does not come from this website.
if (appCheckSiteKey) {
  import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js")
    .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    })
    .catch(() => { /* the site keeps working without it */ });
}

export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
  onAuthStateChanged, signOut, sendPasswordResetEmail, confirmPasswordReset, verifyPasswordResetCode, deleteUser,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, collection, query, where, limit, arrayUnion
};
