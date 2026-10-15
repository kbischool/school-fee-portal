# Importing data (no scripts, no computer setup)

Log in as the owner → **Import data**. Everything happens in your browser: the Excel files are read on your device and written to the database. They are not uploaded anywhere else.

## What you can import
| Workbook | What it feeds |
|---|---|
| `2026-2027_FEE.xlsx` (and each older year) | Term fee sheets → students, itemised fees, balances; the **PAY LOG** sheet → payment history |
| `INVOICE.xlsx` | New-student invoice (owner + admins) |
| `STOCKS.xlsx` | Textbooks, notebooks & stationery, inventory (owner + admins see quantities; costs and profit are owner-only; parents see only their class's list) |
| `SALARY.xlsx` | Salaries by year/month (owner only). **Bank account numbers are never read.** |
| Sheets named *REMIT* / *STIPEND* | Lesson remittance and stipends (owner only) |

## Steps
1. **Choose files** (several at once is fine). Import the **newest session first**.
2. **Review**: the page lists every sheet it recognised (tick/untick), warns about oddities (for example a total that does not equal its lines) and asks which session is *current*.
3. **Check what will change**: counts of students, new parent codes, past students and unmatched payments, plus the number of database writes.
4. **Import now** and wait for the progress bar. Then open **Overview**.

## Rules the importer follows
- **Existing parent codes never change.** Students are matched to existing records by name (middle names, hyphens and swapped given names are tolerated; 16 such matches were needed for the real sheets). Only a student new to the *current* session receives a new code. Students who appear only in older sessions become *past students* with no code.
- **Safe to repeat.** Document IDs are fixed (`session_term`), so importing the same sheet again replaces that term instead of duplicating it. Terms you did not tick are untouched.
- **Manual payment assignments are kept** when you re-import a term.
- A duplicated student name inside one sheet is skipped with a warning (it would double-count money).
- Two files containing the same session/term (the 2023/24 workbook also holds a stale 2024/25 draft): the file whose **name** matches the session wins.

## Payments that are not matched
Bank-log rows whose label cannot be tied to a student (for example “(no name given)”) are listed under **Payments → Not assigned**. Click one, search the student, assign. These never affect a student's balance (the fee sheet is the official balance); they only fill the student's payment history.

## Free-plan write limit
Spark allows 20,000 writes per day. A full import of every session is about 6,700 writes. If the preview shows more than 18,000, import in two days.

## Each new term
Add the new term's sheet(s) to your workbook, upload it, tick only the new term, import. Nothing else.
