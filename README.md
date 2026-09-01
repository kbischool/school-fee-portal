# School Fee Payment Portal — 2026/2027 Session

Real accounts for parents and administrators, backed by Firebase — no more sharing a code every time.

- **Parents**: use their existing school code **once** to create an email + password login (or link Google). Every visit after that is a normal login.
- **Admins**: same idea, with a separate admin code, landing on a dashboard to view students and issue new codes.
- Fee data now lives in Firestore, only readable by the parent it belongs to (or an admin) — this closes the "anyone can view the raw JSON" gap the previous version's README flagged.

> ⚠️ This repo contains real student and financial data (`2026 - 2027 FEE.xlsx`, `parent_codes.xlsx`, `students_1st_term.json`, `code_registry.json`). Keep this repo **private**, same as before. `serviceAccountKey.json` (created in Step 6 below) is even more sensitive — never commit it; it's already in `.gitignore`.

---

## 🔖 QUICK REFERENCE — what to run, and when

Bookmark this section. Whenever you're not sure what command to type, come back here first.

### "I added/removed/updated students in the Excel file"
Run these two, in this exact order, in your terminal (in the project folder):
```bash
python update_data.py
python migrate_to_firestore.py
```
- `update_data.py` reads `2026 - 2027 FEE.xlsx` and rewrites the JSON files + `code_registry.json` + `parent_codes.xlsx` on your computer.
- `migrate_to_firestore.py` pushes those updated files into the live Firestore database, so the website shows the new data.
- Safe to re-run any time. It will **not** un-claim any parent's account or reset their password status — it only adds new students and refreshes fee numbers. (See "Known bug that was fixed" below for why this matters.)
- You do **not** need to run `firebase deploy` for this — student data lives in the database, not in the deployed website files.

### "I changed a website file" (index.html, admin-dashboard.html, parent-dashboard.html, anything in css/ or js/, manifest.json, sw.js, assets/)
Run:
```bash
firebase deploy
```
- This uploads the actual site files (pages, styling, scripts) to your live URL.
- It does **not** touch student/fee data at all — `firebase.json` is set to ignore `.json`, `.xlsx`, and `.py` files during deploy.

### "Some parents show 'Code not yet used' even though they already registered"
This was a one-time bug (now fixed) — see "Known bug that was fixed" below. If you ever see it again, run:
```bash
python3 repair_claimed_codes.py
```
It will list exactly which codes look wrong and ask you to confirm (type `y`) before changing anything.

### Simple summary table

| What you did | What to run |
|---|---|
| Added/edited/removed students in the Excel file | `update_data.py` then `migrate_to_firestore.py` |
| Changed a webpage, CSS, or JS file | `firebase deploy` |
| Parents wrongly showing as "not registered" | `repair_claimed_codes.py` |
| First-time project setup | Part 2 below, Steps 1–8 |

---

## What's new in this version

| File | Purpose |
|---|---|
| `index.html` | **Replaced.** Now the login / first-time code claim page (parent or admin, email+password or Google), instead of the passcode-only lookup. |
| `legacy-lookup.html` | Your old `index.html`, kept for reference — not linked from anywhere, safe to delete once you're confident in the new flow. |
| `parent-dashboard.html` | **New.** Where a logged-in parent sees their child's fee ledger. |
| `admin-dashboard.html` | **New.** Where a logged-in admin sees all students/codes and can issue new ones. |
| `js/firebase-config.js` | **New.** Your Firebase project's connection details — you'll fill this in during setup. |
| `js/auth.js` | **New.** Shared login/signup/code-claim logic used by the pages above. |
| `css/style.css` | **New.** Shared styling for the new pages. |
| `firestore.rules` | **New.** The real access control — who can read/write what in the database. |
| `migrate_to_firestore.py` | **New.** Imports/refreshes `code_registry.json` + `students_*_term.json` into Firestore. Safe to re-run every time you add students — see Quick Reference above. |
| `repair_claimed_codes.py` | **New.** One-off repair tool — only needed if a parent shows as "not registered" even though they already are. See Quick Reference above. |
| `2026 - 2027 FEE.xlsx`, `update_data.py`, `code_registry.json`, `parent_codes.xlsx`, `requirements.txt` | **Unchanged.** You still edit the spreadsheet and run `update_data.py` exactly as before each term — see below. |

---

## Part 1: Updating fee data each term

### One-time setup
```bash
pip install -r requirements.txt
pip install firebase-admin --break-system-packages
```

### Every time you update fees or add/remove students
1. Edit `2026 - 2027 FEE.xlsx` directly:
   - **1st Term** goes in the sheet named `1ST TERM ACCOUNT`.
   - When 2nd term starts, add a sheet named exactly `2ND TERM ACCOUNT` (same column layout).
   - When 3rd term starts, add a sheet named exactly `3RD TERM ACCOUNT`.
   - You can delete a student's row, or add a brand new row for a new student, at any time.
   - **Do not rename an existing student** (their code is tied to their name).
2. Run:
   ```bash
   python3 update_data.py
   ```
   This regenerates `students_1st_term.json` (and 2nd/3rd once those sheets exist), `parent_codes.xlsx`, and `code_registry.json` on your computer.
3. Then run:
   ```bash
   python3 migrate_to_firestore.py
   ```
   This pushes the refreshed data into the live Firestore database, so the website actually shows it.
   Safe to re-run any time — existing codes and claimed accounts are left alone (see note below), only fee amounts and any brand-new students get written.
4. No need to run `firebase deploy` for this — student data lives in the database, not in the deployed site files.

### ⚠️ Known bug that was fixed (for reference)
Earlier versions of `migrate_to_firestore.py` reset **every** code's `claimed` status back to `false` on every run — even for parents who had already registered — because it wrote `"claimed": False` unconditionally instead of only when a code was brand new. This made already-registered parents show as "Code not yet used" on the admin dashboard.

This is now fixed: the script only sets `claimed: False` the first time a code appears in Firestore, and leaves it alone on every run after that. If you ever see already-registered parents wrongly marked as "not used" again, run `python3 repair_claimed_codes.py` — it finds and fixes exactly those codes (with a confirmation prompt before changing anything).

---

## Part 2: Firebase setup (do this once)

You've never touched Firebase before — follow this in order.

### Step 1: Create the Firebase project
1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with a Google account (a school Google account is a good idea if you don't want to use a personal one).
2. Click **Add project**. Name it something like `school-fee-portal`.
3. You can turn **off** Google Analytics for this project — not needed.
4. Click **Create project** and wait for it to finish.

### Step 2: Register a web app
1. On the project's home screen, click the **`</>`** (web) icon to add a web app.
2. Nickname it "School Fee Portal Web".
3. Skip "Set up Firebase Hosting" for now (Step 7 covers hosting).
4. Click **Register app**. Copy the `firebaseConfig` object it shows you — you need it next.

### Step 3: Paste your config into the project
1. Open `js/firebase-config.js` in this project.
2. Replace the placeholder values with the real ones from Step 2 (`apiKey`, `authDomain`, `projectId`, etc.).
3. Save. These values aren't secret — access is controlled by the rules in Step 5, not by hiding this file.

### Step 4: Turn on Authentication
1. Left sidebar -> **Build -> Authentication -> Get started**.
2. Under **Sign-in method**, enable:
   - **Email/Password** — toggle on, Save.
   - **Google** — toggle on, pick a support email, Save.

### Step 5: Turn on Firestore and set the security rules
1. Left sidebar -> **Build -> Firestore Database -> Create database**.
2. Choose **Start in production mode** (real rules are ready to paste in, no need for test mode).
3. Pick the region closest to your school — can't be changed later, but not critical which one.
4. Once created, go to the **Rules** tab.
5. Delete everything there and paste in the entire contents of `firestore.rules` from this project.
6. Click **Publish**.

### Step 6: Import your existing codes and students
1. Get a service account key: ⚙️ **Project settings -> Service accounts -> Generate new private key**. A file downloads — rename it to `serviceAccountKey.json` and put it in this project folder, next to `migrate_to_firestore.py`.
   - **Never share or commit this file** — it gives full admin access to your database. Already excluded in `.gitignore`.
2. Make sure `code_registry.json` and `students_1st_term.json` are in this same folder (they already are, if you're working from this zip).
3. Install the one Python package this needs:
   ```bash
   pip install firebase-admin --break-system-packages
   ```
4. Run it:
   ```bash
   python3 migrate_to_firestore.py
   ```
5. It reports how many students and codes it imported. This script was written to match your actual `code_registry.json` / `students_1st_term.json` format exactly, so it should run without needing edits.

### Create your first admin code
The migration script only imports parent codes. Add one admin code by hand for your first login:
1. Firestore Database -> **Start collection** -> collection ID: `adminCodes`.
2. Document ID: a code you'll remember, e.g. `ADMIN001`.
3. Add fields: `claimed` (boolean, `false`), `label` (string, e.g. `"Head Admin"`).
4. Save. Use `ADMIN001` to claim your admin account the first time you open the site.

### Step 7: Host the site
Simplest option since you're already in Firebase:
1. Install Node.js if you don't have it, then: `npm install -g firebase-tools`
2. In this folder: `firebase login`, then `firebase init hosting`:
   - "Use an existing project" -> pick the one you made.
   - Public directory: `.` (a single dot).
   - Configure as a single-page app: **No**.
   - Don't overwrite `index.html`.
3. `firebase deploy` — gives you a live URL like `school-fee-portal-xxxxx.web.app`.

(You can keep using GitHub Pages instead if you prefer — nothing here requires Firebase Hosting specifically.)

### Step 8: Test before telling anyone
1. Claim one real parent code end-to-end on the live site — set an email + password, confirm you see the right child's fees.
2. In a second browser/incognito window, claim your `ADMIN001` code and confirm you land on the admin dashboard.
3. Log out, log back in with the password you set, and try "Continue with Google" too.
4. Only then, share the link with parents — everyone uses the **same code they already have**, just once, to set a password.

---

## How codes stay stable (unchanged)

Each family's code is generated once, from their name:
```
LAST NAME (first 3 letters) + FIRST NAME (first 3 letters) + a reserved number
e.g. ABDULAZEEZ, ABDULLAH → ABDABD1000
```
Saved permanently in `code_registry.json`, keyed to the student's name — not their row. Deleting or adding students elsewhere in the sheet never changes anyone else's code. If `code_registry.json` is ever lost, everyone would be issued fresh codes — keep a backup alongside the spreadsheet.

## Known limitation this version fixes

The previous version's README noted that `students_1st_term.json` shipped as a plain public file — anyone with dev tools could see every family's code and balance, not just their own. That's now fixed: fee data lives in Firestore, and `firestore.rules` enforces that a parent can only ever read their own linked child's record; only admins can read everyone's.
