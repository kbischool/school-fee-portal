# Security

## What protects the data
- **Firestore rules** (`firestore.rules`) are the real protection. Everything is denied unless a rule allows it. The three roles are decided by documents that exist in Firestore: `owners/{uid}` (created by hand in the Firebase console — no website visitor can create one), `admins/{uid}` and `parents/{uid}` (created at sign-up with a valid, unused code).
- Owner-only collections (`salaries`, `ownerSheets`, `stockCosts`, `payments`, `imports`) cannot be read by admins or parents, even by calling Firebase directly.
- Bank narrations (payer names) and account numbers are never copied to anything a parent or admin can read. Staff **account numbers are never imported at all**.
- Security headers (CSP, HSTS, no framing, nosniff) are set in `firebase.json`. CodeQL and Dependabot run on this repository.

## Known limits (please read)
- **School admins are kept away from school-wide money totals by the screens they are shown.** Admins *can* read individual student fee records (they need to), so a technically skilled admin could add the figures up themselves. This is acceptable for trusted staff; it is not a defence against a hostile admin.
- **Parent codes** are short and guessable by design (unchanged so existing parents keep working). A guessed *unused* code would let someone register as that child's parent. Mitigations: turn on App Check ([guide](docs/FIREBASE_LOGIN_SETUP.md#app-check)), check a student's page (it shows the parent account's email) if a parent tells you their code was already used, and fix a wrongly claimed code in the Firebase console (Firestore → `schoolCodes` → set `claimed` to `false`; delete that person's `parents/{uid}` document).
- Firebase web configuration in `public/js/firebase-config.js` identifies the project; it is not a secret.

## If something leaks
1. Firebase console → Authentication → disable the affected user; Firestore → delete their `admins/{uid}` or `parents/{uid}` document.
2. If a service-account key leaked: Google Cloud console → IAM → Service accounts → Keys → delete the key, create a new one, update the `FIREBASE_SERVICE_ACCOUNT` GitHub secret.
3. Rotate staff codes in *Accounts & codes*.

## Reporting a problem
Contact the school owner directly. Please do not post details publicly.
