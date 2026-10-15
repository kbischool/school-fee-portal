"""
check_parent_login.py
----------------------
Temporarily sets a password YOU choose on a parent's account, so you can
log in and see exactly what they see. Does not need or reveal their real
password. Afterward, tell the parent to use "Forgot password?" on the
site to set their own new password again (or run this script again with
a note to remind them).

USAGE
    python3 check_parent_login.py
    (then follow the prompts — it will ask for the parent's email and a
    temporary password for you to use)

Needs serviceAccountKey.json in this same folder, same one you already
use for migrate_to_firestore.py.
"""

import os
import sys
import firebase_admin
from firebase_admin import credentials, auth

SERVICE_ACCOUNT_PATH = "serviceAccountKey.json"


def main():
    if not os.path.exists(SERVICE_ACCOUNT_PATH):
        print(f"ERROR: {SERVICE_ACCOUNT_PATH} not found in this folder.")
        sys.exit(1)

    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)

    email = input("Parent's email to check: ").strip()
    temp_password = input("Temporary password to set (min 6 characters): ").strip()

    if len(temp_password) < 6:
        print("Password must be at least 6 characters.")
        sys.exit(1)

    try:
        user = auth.get_user_by_email(email)
    except auth.UserNotFoundError:
        print(f"No account found with email: {email}")
        sys.exit(1)

    auth.update_user(user.uid, password=temp_password)
    print(f"\nDone. You can now log in at your site with:")
    print(f"  Email: {email}")
    print(f"  Password: {temp_password}")
    print("\nIMPORTANT: this replaced their real password. Once you're done")
    print("checking, tell the parent to use 'Forgot password?' on the login")
    print("page to set their own password again.")


if __name__ == "__main__":
    main()
