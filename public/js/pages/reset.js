import { completePasswordReset } from '../auth.js';
import { icon } from '../ui.js';
const q = new URLSearchParams(location.search), oob = q.get('oobCode');
const $ = (s) => document.querySelector(s);
document.querySelectorAll('.pwt').forEach((b) => { b.innerHTML = icon('eye'); b.addEventListener('click', () => { const i = document.getElementById(b.dataset.for), s = i.type === 'password'; i.type = s ? 'text' : 'password'; b.innerHTML = icon(s ? 'eyeoff' : 'eye'); b.setAttribute('aria-label', s ? 'Hide password' : 'Show password'); }); });
if (q.get('mode') !== 'resetPassword' || !oob) { $('#resetForm').hidden = true; $('#invalidBox').hidden = false; }
$('#resetForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#msgBox').innerHTML = '';
  if ($('#newPassword').value !== $('#confirmPassword').value) { $('#msgBox').innerHTML = '<div class="msg error">Those passwords do not match.</div>'; return; }
  const b = $('#submitBtn'); b.disabled = true;
  try { await completePasswordReset(oob, $('#newPassword').value); $('#resetForm').hidden = true; $('#successBox').hidden = false; }
  catch (err) {
    if (/weak-password/.test(String(err.message))) { $('#msgBox').innerHTML = '<div class="msg error">Please choose a password with at least 6 characters.</div>'; b.disabled = false; }
    else { $('#resetForm').hidden = true; $('#invalidBox').hidden = false; }
  }
});
