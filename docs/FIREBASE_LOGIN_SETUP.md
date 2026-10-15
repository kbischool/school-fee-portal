# Firebase setup — one time

Everything here is clicking in the [Firebase console](https://console.firebase.google.com/) (project **school-fee-portal**). Most of it is already done because the old portal worked; check each item once.

## 1. Sign-in methods
**Build → Authentication → Sign-in method**: *Email/Password* **Enabled**; *Google* **Enabled** (set the support email to yours).

## 2. Authorised domains
**Authentication → Settings → Authorised domains** must contain `school-fee-portal-4f0e6.web.app` and `school-fee-portal-4f0e6.firebaseapp.com`. Add your own domain here too if you ever connect one. Without this, Google sign-in and password-reset emails fail.

## 3. Your owner account
The owner view appears for the account that has a document in the Firestore collection **`owners`** whose ID is that account's user ID. Nobody can create this from the website — only you, here.

*If you could already open the previous admin dashboard as the owner, this document exists and you can skip to step 4.* Otherwise:
1. Sign up once on the site (any role, or Authentication → Users → **Add user**).
2. **Authentication → Users**: copy your **User UID**.
3. **Firestore Database → Start collection** (or **Add document** inside `owners`): collection ID `owners`, **Document ID** = the UID you copied, one field `displayName` (string) = your name → **Save**.
4. Log out and in again. You land on the owner portal.

## 4. Publish the security rules
They are published automatically by the deploy (see [DEPLOYMENT.md](DEPLOYMENT.md)). To check: **Firestore Database → Rules** should start with `// KBIS Portal — Firestore security rules.`

## 5. Your two existing school admins
They keep working: their `admins/{uid}` documents are untouched. They will see the new simplified admin view after the next login. New admins: owner portal → **Accounts & codes → Give an administrator access**; send them the generated code and tell them to use *School staff → First time*.

## 6. Parent codes
Unchanged. Parents who already registered keep their login; parents who have a code but have not registered can still use it. The import **never** edits, regenerates or deletes an existing code. It only creates a code for a student who is genuinely new in the current session.

## 7. Cost and limits
The free (Spark) plan is enough. A full import is roughly 7,000 database writes against a 20,000 per day limit — see [IMPORTING_DATA.md](IMPORTING_DATA.md) if you ever import everything twice in one day.

## <a id="app-check"></a>8. App Check (recommended, 10 minutes)
App Check makes Firebase refuse traffic that does not come from your website.
1. Firebase console → **App Check → Apps → your web app → reCAPTCHA v3** → register; copy the **site key**.
2. Paste the key between the quotes of `appCheckSiteKey` in `public/js/firebase-config.js` (GitHub web editor is fine), commit and merge.
3. Let it run for a day, check **App Check → APIs** shows mostly *verified* requests, then press **Enforce** for Cloud Firestore.

## 9. Backups
Firestore → **Disaster recovery** (needs the paid plan) or simply keep your Excel sheets: everything in the portal can be rebuilt from them with the import page, except manual payment assignments and account links.
