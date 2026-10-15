# Legacy files (not used by the website)

These are the old command-line tools and data files from the previous version of the portal. **The new portal does not use them** — data is now imported from the *Import data* page in the owner portal.

They are kept only for reference and for rollback. Once the new import has been checked, they can be deleted. Note they contain real student information, so this repository must stay private.

| File | What it was |
|---|---|
| `update_data.py`, `migrate_to_firestore.py`, `repair_claimed_codes.py`, `check_parent_login.py`, `requirements.txt` | The scripts you used to run on your computer |
| `2026 - 2027 FEE.xlsx`, `parent_codes.xlsx`, `students_1st_term.json`, `code_registry.json` | The data those scripts read and wrote |
| `legacy-lookup.html` | The first, passcode-only version of the site |
