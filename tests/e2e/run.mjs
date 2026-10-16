// Browser tests: opens every page as each role against an in-memory fake of Firebase.
// Usage: node tests/e2e/run.mjs   (screenshots land in test-results/screens)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildFixture } from './fixture.mjs';

const ROOT = path.resolve('public');
const OUT = path.resolve('test-results/screens');
fs.mkdirSync(OUT, { recursive: true });
// Serve pages with the same Content-Security-Policy as production, so anything it would block fails here too.
const CSP = (JSON.parse(fs.readFileSync('firebase.json', 'utf8')).hosting.headers.find((h) => h.source === '**').headers.find((h) => h.key === 'Content-Security-Policy') || {}).value;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'content-type': 'text/html' }); res.end(fs.readFileSync(path.join(ROOT, '404.html'))); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', ...(CSP ? { 'content-security-policy': CSP } : {}) }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;

const fx = buildFixture();
const SEED = { docs: fx.docs, accounts: fx.accounts };
const fakeSrc = fs.readFileSync(new URL('./fake-firebase.js', import.meta.url), 'utf8');
const FB = (names) => `const F = window.__fb; ${names.map((n) => `export const ${n} = F.${n};`).join(' ')}`;
const MODS = {
  'firebase-app.js': FB(['initializeApp']),
  'firebase-auth.js': FB(['getAuth', 'createUserWithEmailAndPassword', 'signInWithEmailAndPassword', 'GoogleAuthProvider', 'signInWithPopup', 'onAuthStateChanged', 'signOut', 'sendPasswordResetEmail', 'confirmPasswordReset', 'verifyPasswordResetCode', 'deleteUser']),
  'firebase-firestore.js': FB(['getFirestore', 'doc', 'getDoc', 'getDocs', 'setDoc', 'updateDoc', 'deleteDoc', 'writeBatch', 'collection', 'query', 'where', 'limit', 'arrayUnion'])
};

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); };

async function open({ uid, w = 1280, h = 800, theme = 'light', seed = SEED } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', colorScheme: theme });
  await ctx.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith('data:'), (r) => r.abort());
  await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => { const f = r.request().url().split('/').pop(); r.fulfill({ contentType: 'text/javascript', body: MODS[f] || 'export {}' }); });
  await ctx.addInitScript(({ uid, theme }) => { try { if (uid) localStorage.setItem('fake-uid', uid); else localStorage.removeItem('fake-uid'); localStorage.setItem('kbis-theme', theme); } catch (e) {} }, { uid, theme });
  await ctx.addInitScript(`window.__SEED = ${JSON.stringify(seed)};`);
  await ctx.addInitScript(fakeSrc);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => { if (r.url().startsWith(BASE) && !/ABORTED/.test(r.failure().errorText)) errors.push('requestfailed: ' + r.url()); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) errors.push('http ' + r.status() + ' ' + r.url()); });
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  return { ctx, page, errors };
}
const text = (page) => page.evaluate(() => document.body.innerText);
const settle = async (page) => { await page.waitForTimeout(250); await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 8000 }).catch(() => {}); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const SECRETS = ['SECRET-SUPPLIER', 'SECRET STAFFNAME', 'SECRET-NARRATION'];

// ---------------------------------------------------------------- login page
console.log('\nLogin page');
{
  const { ctx, page, errors } = await open({});
  await page.goto(BASE + '/index.html'); await settle(page);
  ok((await text(page)).includes('Fee portal'), 'login page renders');
  ok(await page.isVisible('#claimForm') && !(await page.$('#roleTabs')), 'first-time visitors land on the First time form; no parent/staff switch');
  await shot(page, 'login-desktop');
  await page.click('[data-mode=login]'); await page.fill('#loginEmail', 'parent@test.dev'); await page.fill('#loginPassword', 'wrong'); await page.click('#loginForm [type=submit]');
  await page.waitForSelector('.msg.error'); ok(/did not match/.test(await text(page)), 'wrong password shows a friendly message');
  await page.fill('#loginPassword', 'pw'); await page.click('#loginForm [type=submit]');
  await page.waitForURL('**/parent-dashboard.html'); ok(true, 'parent login lands on parent portal');
  ok(errors.length === 0, 'no console errors on login flow ' + errors.join('|'));
  await ctx.close();
}
for (const [uid, dest] of [['u-owner', 'owner-dashboard.html'], ['u-admin', 'admin-dashboard.html']]) {
  const { ctx, page } = await open({});
  await page.goto(BASE + '/index.html'); await page.click('[data-mode=login]');
  await page.fill('#loginEmail', fx.accounts[uid].email); await page.fill('#loginPassword', 'pw'); await page.click('#loginForm [type=submit]');
  await page.waitForURL('**/' + dest); ok(true, `${uid} login lands on ${dest}`); await ctx.close();
}
{ // signed-out visitors are sent to login
  for (const p of ['owner-dashboard.html', 'admin-dashboard.html', 'parent-dashboard.html']) {
    const { ctx, page } = await open({}); await page.goto(BASE + '/' + p); await page.waitForURL('**/index.html'); ok(true, `signed-out ${p} -> login`); await ctx.close();
  }
}
{ const { ctx, page } = await open({}); await page.goto(BASE + '/index.html#x'); await page.goto(BASE + '/nope'); ok((await text(page)).includes('find that page'), '404 page'); await shot(page, '404'); await ctx.close(); }

// ---------------------------------------------------------------- owner
console.log('\nOwner');
const OWNER_ROUTES = ['overview', 'students', 'history', 'payments', 'stock', 'invoices', 'payroll', 'accounts', 'import'];
for (const [w, h, theme, tag] of [[1280, 800, 'light', 'desktop'], [390, 800, 'dark', 'mobile-dark']]) {
  const { ctx, page, errors } = await open({ uid: 'u-owner', w, h, theme });
  await page.goto(BASE + '/owner-dashboard.html'); await settle(page);
  for (const r of OWNER_ROUTES) {
    await page.evaluate((r) => { location.hash = '#/' + r; }, r); await settle(page);
    const t = await text(page);
    ok(!/Something went wrong|do not have access/.test(t), `[${tag}] owner /${r} renders`);
    ok(await noOverflow(page), `[${tag}] owner /${r} has no sideways scroll`);
    await shot(page, `owner-${r}-${tag}`);
  }
  await page.evaluate(() => { location.hash = '#/overview'; }); await settle(page);
  ok(/Total expected/.test(await text(page)) && /To be received/.test(await text(page)), `[${tag}] owner sees total expected / to be received`);
  await page.evaluate(() => { location.hash = '#/stock'; }); await settle(page); await page.click('[data-t=cost]');
  ok((await text(page)).length > 200, `[${tag}] owner cost tab opens`);
  await page.evaluate((id) => { location.hash = '#/students/' + id; }, fx.parentChildren[0]); await settle(page);
  ok((await text(page)).includes(fx.parentChildren[0]), `[${tag}] student detail shows the parent code`);
  await shot(page, `owner-student-${tag}`);
  await page.evaluate(() => { location.hash = '#/payroll'; }); await settle(page); await page.selectOption('#m', 'January'); await settle(page);
  ok((await text(page)).includes('SECRET STAFFNAME'), `[${tag}] owner sees salary data`);
  ok(errors.length === 0, `[${tag}] no console errors ${errors.slice(0, 3).join('|')}`);
  await ctx.close();
}

// owner import flow
{
  const { ctx, page, errors } = await open({ uid: 'u-owner' });
  await page.goto(BASE + '/owner-dashboard.html#/import'); await settle(page);
  const xlsx = (await import('xlsx')).default || (await import('xlsx'));
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([['S/N', 'LAST NAME', 'FIRST NAME', 'CLASS', 'TUITION', 'GRAND TOTAL FEE', 'TOTAL PAID', 'BALANCE'], [1, 'Adeyemi', 'Ada', 'PRY 1', 100000, 100000, 40000, 60000], [2, 'Brandnew', 'Kemi', 'PRY 2', 100000, 100000, 0, 100000]]), '2ND TERM 2026-2027');
  const buf = Buffer.from(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  await page.setInputFiles('#file', { name: '2026-2027_FEE.xlsx', mimeType: 'application/octet-stream', buffer: buf });
  await page.waitForSelector('#next', { timeout: 15000 }); ok(true, 'import: workbook read in the browser');
  await shot(page, 'owner-import-review');
  await page.click('#next'); await page.waitForSelector('#go', { timeout: 15000 }); ok(true, 'import: preview shown');
  await shot(page, 'owner-import-preview');
  await page.click('#go'); await page.waitForSelector('a[href="#/overview"]', { timeout: 20000 }); ok(true, 'import: finished');
  const wrote = await page.evaluate(() => [...window.__fb._store.keys()].filter((k) => k.startsWith('ledgers/2026-2027_t2')));
  ok(wrote.length === 1, 'import: new term ledger written');
  const codes = await page.evaluate(() => [...window.__fb._store.keys()].filter((k) => k.startsWith('schoolCodes/BRAKEM')));
  ok(codes.length === 1, 'import: genuinely new student got a code');
  ok(await page.evaluate((id) => !!window.__fb._store.get('schoolCodes/' + id).claimed, fx.parentChildren[0]), 'import: existing claimed code left claimed');
  ok(errors.length === 0, 'import: no console errors ' + errors.slice(0, 3).join('|'));
  await ctx.close();
}

// ---------------------------------------------------------------- admin
console.log('\nAdmin');
for (const [w, h, theme, tag] of [[1280, 800, 'light', 'desktop'], [390, 800, 'light', 'mobile']]) {
  const { ctx, page, errors } = await open({ uid: 'u-admin', w, h, theme });
  await page.goto(BASE + '/admin-dashboard.html'); await settle(page);
  const nav = await page.$$eval(w > 860 ? '.sidebar .nav a' : '.bottomnav a', (a) => a.map((x) => x.textContent.trim()));
  ok(nav.length >= 4 && !nav.some((n) => /Payments|payroll|Accounts|Import|Overview/i.test(n)), `[${tag}] admin menu has no owner pages (${nav.join(', ')})`);
  for (const r of ['home', 'students', 'history', 'invoices', 'stock']) {
    await page.evaluate((r) => { location.hash = '#/' + r; }, r); await settle(page);
    const t = await text(page);
    ok(!/Something went wrong|do not have access/.test(t), `[${tag}] admin /${r} renders`);
    ok(!/Total expected|Total paid|To be received|Collection rate|Discounts given/i.test(t), `[${tag}] admin /${r} shows no school-wide money totals`);
    ok(!SECRETS.some((s) => t.includes(s)), `[${tag}] admin /${r} leaks no owner-only text`);
    ok(await noOverflow(page), `[${tag}] admin /${r} has no sideways scroll`);
    await shot(page, `admin-${r}-${tag}`);
  }
  // students page: no totals cards, but individual balances are there
  await page.evaluate(() => { location.hash = '#/students?status=owing'; }); await settle(page);
  const t = await text(page); ok(/₦/.test(t), `[${tag}] admin sees individual balances`);
  await page.evaluate(() => { location.hash = '#/stock'; }); await settle(page);
  ok(!(await page.$('[data-t=cost]')), `[${tag}] admin has no cost tab`);
  await page.evaluate((id) => { location.hash = '#/students/' + id; }, fx.parentChildren[0]); await settle(page);
  ok(/Fees/.test(await text(page)), `[${tag}] admin student detail opens`);
  await page.evaluate(() => { location.hash = '#/payroll'; }); await settle(page);
  ok(/Welcome|Home/.test(await text(page)) && !/SECRET STAFFNAME/.test(await text(page)), `[${tag}] admin cannot open owner route (falls back to home)`);
  const denied = await page.evaluate(() => window.__DENIED);
  ok(denied.length === 0, `[${tag}] admin pages never asked for forbidden data ${denied.join(',')}`);
  ok(errors.length === 0, `[${tag}] no console errors ${errors.slice(0, 3).join('|')}`);
  await ctx.close();
}
{ // admin hitting the owner page is bounced
  const { ctx, page } = await open({ uid: 'u-admin' }); await page.goto(BASE + '/owner-dashboard.html'); await page.waitForURL('**/admin-dashboard.html'); ok(true, 'admin opening owner-dashboard is redirected'); await ctx.close();
}

// ---------------------------------------------------------------- parent
console.log('\nParent');
for (const [w, h, theme, tag] of [[390, 800, 'light', 'mobile'], [1280, 800, 'dark', 'desktop-dark']]) {
  const { ctx, page, errors } = await open({ uid: 'u-parent', w, h, theme });
  await page.goto(BASE + '/parent-dashboard.html'); await settle(page);
  let t = await text(page);
  ok(/Hello, Pat/.test(t), `[${tag}] greets the parent`);
  ok(await page.$$eval('[data-kid]', (b) => b.length) === 2, `[${tag}] child switcher lists both children`);
  ok(/Paid|Fully paid|Part-paid|Not paid/.test(t), `[${tag}] shows fee status`);
  await shot(page, `parent-fees-${tag}`);
  for (const k of ['history', 'pay', 'collect']) {
    await page.click(`[data-t=${k}]`); await settle(page);
    t = await text(page); ok(!/Something went wrong/.test(t) && !SECRETS.some((s) => t.includes(s)), `[${tag}] parent ${k} tab`);
    ok(await noOverflow(page), `[${tag}] parent ${k} has no sideways scroll`);
    await shot(page, `parent-${k}-${tag}`);
  }
  await page.click('[data-kid]:nth-of-type(2)'); await settle(page); ok(true, `[${tag}] switching child works`);
  const denied = await page.evaluate(() => window.__DENIED);
  ok(denied.length === 0, `[${tag}] parent never asked for forbidden data ${denied.join(',')}`);
  ok(errors.length === 0, `[${tag}] no console errors ${errors.slice(0, 3).join('|')}`);
  await ctx.close();
}
{ const { ctx, page } = await open({ uid: 'u-parent' }); await page.goto(BASE + '/owner-dashboard.html'); await page.waitForURL('**/parent-dashboard.html'); ok(true, 'parent opening owner-dashboard is redirected'); await ctx.close(); }
{ const { ctx, page } = await open({ uid: 'u-lonely' }); await page.goto(BASE + '/parent-dashboard.html'); await settle(page); ok(/Add a child/.test(await text(page)), 'parent with no child sees how to add one'); await shot(page, 'parent-empty'); await ctx.close(); }
{ // add another child by code
  const { ctx, page } = await open({ uid: 'u-lonely' }); await page.goto(BASE + '/parent-dashboard.html'); await settle(page);
  await page.click('#addKid'); await page.fill('#c', fx.other); await page.click('.sheet form button[type=submit]'); await page.waitForTimeout(600);
  await settle(page); ok(await page.$$eval('[data-kid]', (b) => b.length) === 1, 'add child by code links the child'); await ctx.close();
}

await browser.close(); server.close();
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
