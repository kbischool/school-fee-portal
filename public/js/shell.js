// ---------------------------------------------------------------------
// App shell shared by the owner and admin portals: sidebar (desktop),
// bottom navigation (phones), top bar with student search, theme switch,
// and a tiny hash router so each page shows ONE thing at a time.
// ---------------------------------------------------------------------
import { logout, HOME, watchAuthState, getUserRole } from './auth.js';
import { esc, icon, $, $$, debounce, skeleton, empty, openModal, copyText, labelCells } from './ui.js';
import { getAllStudents } from './data.js';

const LOGO = 'assets/logo.png';

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('kbis-theme', t); } catch (e) { /* private mode */ }
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'dark' ? '#08111f' : '#f4f7fb');
}
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

/**
 * Starts a portal page.
 * @param {object} o
 * @param {'owner'|'admin'} o.role   the role this page is for
 * @param {{key:string,label:string,icon:string,section?:string}[]} o.nav
 * @param {Record<string,(ctx:object)=>Promise<void>|void>} o.routes
 * @param {boolean} [o.search] show the student search box
 */
export function startPortal(o) {
  const app = $('#app');
  app.innerHTML = skeleton(4);
  watchAuthState(async (user) => {
    if (!user) { location.replace('index.html'); return; }
    let r;
    try { r = await getUserRole(user.uid); } catch (e) { app.innerHTML = empty('We could not check your account', 'Check your internet connection and refresh.', 'alert'); return; }
    if (!r.role) { await logout(); location.replace('index.html'); return; }
    // Send people to the portal that matches their role (rules enforce this too).
    if (r.role !== o.role) { location.replace(HOME[r.role]); return; }
    mount(o, user, r.data);
  });
}

function mount(o, user, roleData) {
  const name = (roleData && roleData.displayName) || user.email || 'Account';
  const roleName = o.role === 'owner' ? 'School owner' : 'Administrator';
  const navLink = (n) => `<li><a href="#/${n.key}" data-key="${n.key}">${icon(n.icon)}<span>${esc(n.label)}</span></a></li>`;
  let lastSection = '';
  const navHtml = o.nav.map((n) => {
    const head = n.section && n.section !== lastSection ? `<li class="nav-section" aria-hidden="true">${esc(n.section)}</li>` : '';
    lastSection = n.section || lastSection;
    return head + navLink(n);
  }).join('');
  const primary = o.nav.slice(0, o.nav.length > 5 ? 4 : o.nav.length);
  const more = o.nav.length > 5 ? o.nav.slice(4) : [];

  document.body.innerHTML = `
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="shell">
    <aside class="sidebar" aria-label="Main">
      <div class="brandrow"><img src="${LOGO}" alt="" width="40" height="42"><div><strong>KBIS Portal</strong><span>${roleName}</span></div></div>
      <nav aria-label="Sections"><ul class="nav">${navHtml}</ul></nav>
      <div class="sidebar-foot">
        <div class="who"><b title="${esc(name)}">${esc(name)}</b><span class="muted">${esc(user.email || '')}</span><br><span class="rolepill">${roleName}</span></div>
        <div class="toolbar"><button class="btn btn-sm" id="themeBtn" aria-label="Switch colour theme"></button><button class="btn btn-sm btn-ghost" id="logoutBtn">${icon('out')} Log out</button></div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <img class="mobile-brand" src="${LOGO}" alt="KBIS" width="34" height="36">
        <h1 id="pageTitle">Portal</h1>
        ${o.search ? `<div class="search global-search" role="search">${icon('search', '')}<input id="gsearch" type="search" placeholder="Find a student…" aria-label="Find a student" autocomplete="off"><div id="gresults" class="card pad-0" hidden style="position:absolute;top:50px;left:0;right:0;z-index:60;max-height:340px;overflow:auto"></div></div>` : ''}
      </header>
      <main id="main" class="content" tabindex="-1"></main>
    </div>
  </div>
  <nav class="bottomnav" aria-label="Main">
    ${primary.map((n) => `<a href="#/${n.key}" data-key="${n.key}">${icon(n.icon)}<span>${esc(n.short || n.label)}</span></a>`).join('')}
    ${more.length ? `<button id="moreBtn" aria-haspopup="dialog">${icon('more')}<span>More</span></button>` : `<button id="moreBtn">${icon('more')}<span>Menu</span></button>`}
  </nav>`;

  const themeBtn = $('#themeBtn');
  const paintTheme = () => { themeBtn.innerHTML = isDark() ? `${icon('sun')} Light` : `${icon('moon')} Dark`; };
  paintTheme();
  themeBtn.addEventListener('click', () => { applyTheme(isDark() ? 'light' : 'dark'); paintTheme(); });
  $('#logoutBtn').addEventListener('click', async () => { await logout(); location.replace('index.html'); });

  $('#moreBtn').addEventListener('click', () => {
    const m = openModal({
      title: 'Menu',
      body: `<ul class="nav" style="list-style:none;padding:0">${more.map(navLink).join('')}</ul>
        <div class="who"><b>${esc(name)}</b><span class="muted">${esc(user.email || '')}</span><br><span class="rolepill">${roleName}</span></div>
        <div class="toolbar"><button class="btn" id="mTheme">${isDark() ? 'Switch to light' : 'Switch to dark'}</button><button class="btn" id="mUid">Copy my account ID</button><button class="btn btn-danger" id="mOut">Log out</button></div>`
    });
    m.el.addEventListener('click', async (e) => {
      if (e.target.closest('a')) m.close();
      if (e.target.id === 'mTheme') { applyTheme(isDark() ? 'light' : 'dark'); paintTheme(); m.close(); }
      if (e.target.id === 'mUid') copyText(user.uid);
      if (e.target.id === 'mOut') { await logout(); location.replace('index.html'); }
    });
  });

  // ---- student search ----
  if (o.search) {
    const input = $('#gsearch'), box = $('#gresults');
    const run = debounce(async () => {
      const q = input.value.trim().toUpperCase();
      if (q.length < 2) { box.hidden = true; return; }
      const all = await getAllStudents();
      const hits = all.filter((s) => (s.name || '').toUpperCase().includes(q) || s.id.toUpperCase() === q).slice(0, 8);
      box.hidden = false;
      box.innerHTML = hits.length
        ? hits.map((s) => `<a class="who-cell" style="display:block;padding:10px 14px;text-decoration:none;color:inherit;border-bottom:1px solid var(--line)" href="#/students/${encodeURIComponent(s.id)}"><b>${esc(s.name)}</b><span>${esc(s.class || '')}${s.alumni ? ' · past student' : ''}</span></a>`).join('')
        : `<div class="muted" style="padding:12px 14px">No student found</div>`;
    });
    input.addEventListener('input', run);
    document.addEventListener('click', (e) => { if (!e.target.closest('.global-search')) box.hidden = true; });
    box.addEventListener('click', () => { box.hidden = true; input.value = ''; });
  }

  // ---- router ----
  const main = $('#main');
  const first = o.nav[0].key;
  const ctx = { user, roleData, role: o.role, go: (path) => { location.hash = `#/${path}`; } };
  let token = 0;
  async function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [pathPart, queryPart] = hash.split('?');
    const [key, ...params] = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    const k = o.routes[key] ? key : first;
    const item = o.nav.find((n) => n.key === k) || { label: 'Portal' };
    $$('[data-key]').forEach((a) => (a.dataset.key === k ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $('#pageTitle').textContent = item.label;
    document.title = `${item.label} · KBIS Portal`;
    const my = ++token;
    main.innerHTML = skeleton(3);
    try {
      const html = await o.routes[k]({ ...ctx, params, query: new URLSearchParams(queryPart || ''), el: main, isCurrent: () => my === token });
      if (my !== token) return;
      if (typeof html === 'string') main.innerHTML = html;
    } catch (err) {
      if (my !== token) return;
      const denied = /permission|insufficient/i.test(String(err && (err.code || err.message)));
      main.innerHTML = `<div class="card">${empty(denied ? 'You do not have access to this page' : 'Something went wrong', denied ? 'Your account is not allowed to see this information.' : 'Check your internet connection and try again.', 'alert')}<div style="text-align:center"><button class="btn" id="retry">Try again</button></div></div>`;
      $('#retry').addEventListener('click', route);
      if (!denied) console.error(err); // eslint-disable-line no-console
    }
    if (my === token) { labelCells(main); main.scrollTop = 0; window.scrollTo({ top: 0 }); }
  }
  window.addEventListener('hashchange', route);
  if (!location.hash) location.replace(`#/${first}`);
  route();
}
