# Customising the portal

Edit files in GitHub Desktop (or the GitHub web editor), commit on a branch, open a pull request and merge — see [DEPLOYMENT.md](DEPLOYMENT.md).

| To change | Edit |
|---|---|
| Colours (light and dark) | `public/css/app.css`, the `:root { … }` and `:root[data-theme="dark"] { … }` blocks at the top. `--primary` is the button/link blue; `--brand` the crest blue |
| Logo and app icons | Replace `public/assets/logo.png` and `public/assets/icons/*` (same file names and sizes) |
| School name in the login page | `public/index.html` (search “Knowledge Base International Schools”) |
| Menu items and their order | The `nav: [...]` list near the bottom of `public/owner-dashboard.html` and `public/admin-dashboard.html`. Remove an item *and* its line under `routes` to hide a screen |
| Which screens admins can reach | `public/admin-dashboard.html`. This is only the screen list; **what data an admin may read is enforced by `firestore.rules`** — change both together and run the tests |
| Fee item names shown to parents | `itemLabel` in `public/js/import/util.js` |
| Class names / order | `classKey`, `classLabel`, `classRank` in `public/js/import/util.js` |
| Wording on parent pages | `public/js/views/parent.js` and `public/parent-dashboard.html` |
| Fonts | `public/css/fonts.css` and `public/fonts/` (self-hosted) |

## Adding a new screen
1. Create `public/js/views/my-screen.js` exporting `async function myScreen({ el })` that fills `el.innerHTML`.
2. Import it and add a `nav` item and a `routes` entry in the dashboard page.
3. If it reads a new Firestore collection, add a rule for it in `firestore.rules` (everything not listed is denied) and a test in `tests/rules`.
