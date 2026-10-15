# Publishing the site (no terminal needed)

The site is published automatically by **GitHub Actions** whenever a change is merged into the `main` branch of <https://github.com/kbischool/school-fee-portal>. You do everything in the browser and in GitHub Desktop.

## One-time setup (about 10 minutes)

### 1. Create a deploy key for GitHub
1. Open the [Firebase console](https://console.firebase.google.com/) → your project **school-fee-portal** → the ⚙ gear → **Project settings** → **Service accounts**.
2. Click **Generate new private key** → **Generate key**. A `.json` file downloads. This file is a password — treat it that way.
3. Open the file in Notepad and copy **everything** in it.
4. On GitHub open the repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: paste the whole file contents → **Add secret**.
5. Delete the downloaded `.json` file from your computer (and the Downloads bin).
6. If you ever used an older `serviceAccountKey.json` for the Python scripts: in the Google Cloud console → **IAM & Admin → Service accounts** → your Firebase account → **Keys**, delete the **old** key. It is no longer needed.

### 2. Give the deploy account permission
In the Google Cloud console → **IAM & Admin → IAM**, find the `firebase-adminsdk-…` account and make sure it has the roles **Firebase Hosting Admin** and **Firebase Rules Admin** (the default *Firebase Admin SDK Administrator* role is usually enough). If a deploy fails with "permission denied", this is the cause.

### 3. Turn on the security scanners
Repository → **Settings → Code security**: switch on **Dependabot alerts**, **Dependabot security updates** and **Secret scanning** (and *Push protection*). CodeQL is already set up by `.github/workflows/codeql.yml`.

## Every time you change the site

1. In **GitHub Desktop** make your change on a branch, **Commit**, **Publish branch**, then **Create Pull Request** (it opens GitHub).
2. On the pull request page wait for the **Test and deploy** check to turn green (about a minute).
3. Click **Merge pull request → Confirm merge**.
4. Open the **Actions** tab. The *Test and deploy* run for `main` publishes the site and the security rules. When it turns green, the new version is live at <https://school-fee-portal-4f0e6.web.app/>. Refresh twice on a phone.

To publish without changing anything: **Actions → Test and deploy → Run workflow**.

## Reviewing and merging the redesign pull request
1. GitHub → **Pull requests** → open **“Premium redesign and role-based portals”**.
2. Read the **Files changed** tab if you like; the checks at the bottom must be green.
3. Do the one-time setup above **before** merging (the first deploy needs the secret).
4. **Merge pull request → Confirm merge.** Wait for the deploy to finish, then follow [FIREBASE_LOGIN_SETUP.md](FIREBASE_LOGIN_SETUP.md) and [IMPORTING_DATA.md](IMPORTING_DATA.md).

## Rolling back
Pull requests → the merged one → **Revert** → merge the revert. The deploy runs again with the old site. (Data in Firestore is not affected by a revert; old and new pages both read it.)

## If a deploy fails
Actions → click the red run → open the failed step. Common causes: the secret is missing or was pasted incomplete; the deploy account lacks a role (step 2); a test failed (the message says which).
