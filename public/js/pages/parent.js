import { watchAuthState, getUserRole, logout, HOME } from '../auth.js';
import { parentView } from '../views/parent.js';
import { icon, esc, skeleton, empty, $ } from '../ui.js';
import { clearCache } from '../data.js';

const themeBtn = $('#theme');
const dark = () => document.documentElement.getAttribute('data-theme') === 'dark';
const paint = () => { themeBtn.innerHTML = icon(dark() ? 'sun' : 'moon'); };
paint();
themeBtn.onclick = () => { const t = dark() ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('kbis-theme', t); } catch (e) {} paint(); };
$('#out').onclick = async () => { await logout(); location.replace('index.html'); };

const app = $('#app');
app.innerHTML = skeleton(3);
watchAuthState(async (user) => {
  if (!user) { location.replace('index.html'); return; }
  let r;
  try { r = await getUserRole(user.uid); } catch (e) { app.innerHTML = `<div class="card">${empty('We could not check your account', 'Check your internet connection and refresh.', 'alert')}</div>`; return; }
  if (!r.role) { await logout(); location.replace('index.html'); return; }
  if (r.role !== 'parent') { location.replace(HOME[r.role]); return; }
  const first = (r.data.displayName || '').split(' ')[0];
  $('#hi').textContent = first ? `Hello, ${first}` : 'Hello';
  $('#who').textContent = r.data.email || 'Parent';
  const show = async (reload) => {
    if (reload) { clearCache(); const again = await getUserRole(user.uid); r = again; }
    app.innerHTML = skeleton(3);
    try { await parentView({ el: app, parent: { ...r.data, uid: user.uid }, onAddChild: (reload) => show(reload === true) }); }
    catch (err) { console.error(err); app.innerHTML = `<div class="card">${empty('Something went wrong', 'Check your internet connection and refresh the page.', 'alert')}</div>`; }
  };
  show();
});
