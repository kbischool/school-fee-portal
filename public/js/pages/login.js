import { db, doc, getDoc } from '../firebase.js';
import { getUserRole, claimParentCode, claimAdminCode, loginEmail, loginGoogle, linkGoogleUserWithCode, watchAuthState, resetPassword, HOME } from '../auth.js';
import { icon, esc, openModal, withLoading } from '../ui.js';
const $ = (s) => document.querySelector(s);
const modeTabs = $('#modeTabs'), loginForm = $('#loginForm'), claimForm = $('#claimForm'), forgotForm = $('#forgotForm'), msgBox = $('#msgBox');
let mode = 'login';
// Parent codes can be looked up by anyone; anything else is treated as a staff code.
const isParentCode = async (code) => { try { return (await getDoc(doc(db, 'schoolCodes', String(code).trim().toUpperCase()))).exists(); } catch (e) { return false; } };
const seenBefore = () => { try { return localStorage.getItem('kbis-seen') === '1'; } catch (e) { return true; } };
const markSeen = () => { try { localStorage.setItem('kbis-seen', '1'); } catch (e) { /* private mode */ } };
const msg = (t, type = 'error') => { msgBox.innerHTML = `<div class="msg ${type}">${t}</div>`; };
const clear = () => { msgBox.innerHTML = ''; };
const go = (r) => {
  markSeen(); location.href = HOME[r] || HOME.parent; };

document.querySelectorAll('.pwt').forEach((b) => { b.innerHTML = icon('eye'); b.addEventListener('click', () => {
  const i = document.getElementById(b.dataset.for), show = i.type === 'password'; i.type = show ? 'text' : 'password';
  b.innerHTML = icon(show ? 'eyeoff' : 'eye'); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.setAttribute('aria-pressed', String(show)); }); });

const HINTS = { claim: 'New here? Enter the code the school gave you and choose your own email and password. You only do this once.', login: 'Already set up? Log in with your email and password.' };
function setMode(m) { mode = m; $('#modeHint').textContent = HINTS[m]; [...modeTabs.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m))); loginForm.hidden = m !== 'login'; claimForm.hidden = m !== 'claim'; forgotForm.hidden = true; clear(); }
modeTabs.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
setMode(seenBefore() ? 'login' : 'claim');
$('#forgotLink').onclick = () => { clear(); loginForm.hidden = true; claimForm.hidden = true; forgotForm.hidden = false; $('#forgotEmail').value = $('#loginEmail').value; $('#forgotEmail').focus(); };
$('#backLink').onclick = () => setMode('login');

function friendly(err) {
  const m = (err && err.message) || String(err);
  if (/invalid-credential|wrong-password/.test(m)) return 'Email or password did not match. Try again, or use “First time” if this is your first login.';
  if (/user-not-found/.test(m)) return 'No account found with that email. If this is your first login, use the “First time” tab.';
  if (/email-already-in-use/.test(m)) return 'An account already exists with that email. Try logging in instead.';
  if (/weak-password/.test(m)) return 'Please choose a password with at least 6 characters.';
  if (/too-many-requests/.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (/network/.test(m)) return 'No internet connection. Check your network and try again.';
  return esc(m.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim());
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault(); clear();
  await withLoading(loginForm.querySelector('[type=submit]'), async () => {
    try {
      const uid = await loginEmail($('#loginEmail').value.trim(), $('#loginPassword').value);
      const r = await getUserRole(uid);
      if (!r.role) { msg('This account is not linked to a student or staff record yet. Please contact the school office.'); return; }
      go(r.role);
    } catch (err) { msg(friendly(err)); }
  });
});

claimForm.addEventListener('submit', async (e) => {
  e.preventDefault(); clear();
  await withLoading(claimForm.querySelector('[type=submit]'), async () => {
    try {
      const a = [$('#claimCode').value, $('#claimEmail').value.trim(), $('#claimPassword').value, $('#claimName').value.trim()];
      if (await isParentCode(a[0])) { await claimParentCode(a[0], a[1], a[2], a[3]); go('parent'); }
      else { await claimAdminCode(a[0], a[1], a[2], a[3]); go('admin'); }
    } catch (err) { msg(friendly(err)); }
  });
});

forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault(); clear();
  const b = forgotForm.querySelector('[type=submit]'); if (b.disabled) return;
  b.disabled = true;
  const done = () => msg('If that email has an account, a reset link is on its way. Check your inbox and spam folder. Only the newest link works.', 'ok');
  try { await resetPassword($('#forgotEmail').value.trim()); done(); }
  catch (err) { if (/invalid-email/.test(String(err.message))) msg('That does not look like a valid email address.'); else done(); }
  setTimeout(() => { b.disabled = false; }, 15000);
});

$('#googleBtn').addEventListener('click', async () => {
  clear();
  await withLoading($('#googleBtn'), async () => {
    try {
      const user = await loginGoogle();
      const r = await getUserRole(user.uid);
      if (r.role) { go(r.role); return; }
      const m = openModal({ title: 'Almost there', subtitle: 'First time with Google — enter your code to finish setting up.', body: `<form id="gf" class="stack"><div class="field"><label for="gc">Your code</label><input id="gc" required autocomplete="off" autocapitalize="characters" style="text-transform:uppercase"></div><div id="ge" role="alert"></div><button class="btn btn-primary" type="submit">Finish setup</button></form>` });
      m.el.querySelector('#gc').focus();
      m.el.querySelector('#gf').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        await withLoading(ev.target.querySelector('button'), async () => {
          try { await linkGoogleUserWithCode(user.uid, user.email, user.displayName || user.email, ev.target.gc.value, !(await isParentCode(ev.target.gc.value))); go((await getUserRole(user.uid)).role || 'parent'); }
          catch (err) { m.el.querySelector('#ge').innerHTML = `<div class="msg error">${friendly(err)}</div>`; }
        });
      });
    } catch (err) { if (!/popup-closed|cancelled-popup/.test(String(err.message))) msg(friendly(err)); }
  });
});

watchAuthState(async (user) => { if (user) { try { const r = await getUserRole(user.uid); if (r.role) go(r.role); } catch (e) { /* stay on login */ } } });
