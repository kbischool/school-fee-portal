# KBIS Portal

**The fee and school-information portal of Knowledge Base International Schools.**
Parents see their child's fees, payments and what to collect. School staff see who has paid and who owes. The owner sees the whole school's financial health and runs the data imports.

Live site: <https://school-fee-portal-4f0e6.web.app/>

> This is a private school system. The code is public-quality, but **the data lives in Firebase, not in this repository**. Keep this repository **private** and never commit spreadsheets, exports or keys (see [SECURITY.md](SECURITY.md)).

## Three views, one portal

| | Parents | School admins | Owner |
|---|---|---|---|
| Their child's fees, itemised, with a payment ring | ✅ | | |
| Past sessions' fee history and own payment history | ✅ | | |
| Textbooks to collect, notebooks & stationery list | ✅ | | |
| Find any student; who has completed / who is owing | | ✅ | ✅ |
| Past sessions' fee records | | ✅ | ✅ |
| New-student invoice, stock quantities | | ✅ | ✅ |
| School-wide totals: expected, paid, to be received, trends | | | ✅ |
| Bank payment log with payer names, assigning payments | | | ✅ |
| Stock cost price and profit | | | ✅ |
| Salaries, lesson remittance, stipends | | | ✅ |
| Parent codes, staff codes, import from Excel | | | ✅ |

Light and dark themes, works on phones (bottom navigation) and desktops (sidebar), prints cleanly.

## How it works

- A static website in [`public/`](public) (HTML, CSS and ES modules — no build step) on **Firebase Hosting**.
- **Firebase Authentication** for sign-in (email + password, Google).
- **Cloud Firestore** for data, protected by role-based [`firestore.rules`](firestore.rules): deny by default; owner / admin / parent are decided by which document exists for the signed-in account.
- **No scripts to run on a computer.** The owner uploads the Excel sheets on the *Import data* page; the browser reads them (SheetJS, bundled in `public/vendor`) and writes to Firestore. Existing parent codes are never changed.
- **GitHub Actions** tests and deploys every change merged to `main`.

```
public/        the website (pages, css, js, fonts, vendor)
public/js/import/   Excel parsers and the import planner (shared with the tests)
public/js/views/    one file per screen
firestore.rules     who can read/write what
tests/              importer unit tests, security-rules tests, browser tests
docs/               owner guides
legacy/             the old Python scripts and data (kept for reference only)
```

## Documentation

| Guide | For |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Publishing the site with GitHub Actions — no terminal needed |
| [docs/FIREBASE_LOGIN_SETUP.md](docs/FIREBASE_LOGIN_SETUP.md) | One-time Firebase steps: owner account, sign-in methods, domains, App Check |
| [docs/IMPORTING_DATA.md](docs/IMPORTING_DATA.md) | Each term: upload sheets, review, import |
| [docs/CUSTOMIZING.md](docs/CUSTOMIZING.md) | Changing colours, logo, wording and navigation |
| [SECURITY.md](SECURITY.md) | What is protected, how, and what to do if something leaks |

## Developing

Requires Node 22+. Nothing is needed to *run* the site beyond a static file server.

```bash
npm install
npm run test:unit      # importer tests (synthetic data)
npm run test:rules     # security-rules tests (needs Java; downloads the Firestore emulator)
npm run test:e2e       # opens every page as owner, admin and parent against a fake Firestore; writes screenshots
npx serve public       # view the login page locally (sign-in needs the live Firebase project)
```

## Licence

Copyright © Knowledge Base International Schools. All rights reserved. Bundled third-party software (SheetJS Community Edition, Inter, Bricolage Grotesque) keeps its own licence — see `public/vendor/xlsx.LICENSE.txt` and `public/fonts/`.
