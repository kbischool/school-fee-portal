"""
repair_claimed_codes.py
------------------------
ONE-OFF REPAIR SCRIPT — run this ONCE to undo the damage caused by
re-running the old migrate_to_firestore.py (before it was fixed).

THE BUG (now fixed in migrate_to_firestore.py):
Every time the old script ran, it wrote "claimed": False to EVERY
document in schoolCodes/{code}, even ones that already belonged to a
parent who had registered. It did NOT touch claimedByUid / claimedAt,
so the link to that parent's account is still sitting in Firestore —
only the "claimed" flag itself got wiped back to false.

WHAT THIS SCRIPT DOES
Scans every document in the schoolCodes collection. For any doc where:
    claimedByUid is set (a real account is linked)
    AND claimed is False
it flips claimed back to True. It does NOT touch anything else, and it
does NOT touch documents that are genuinely still unclaimed (no
claimedByUid) — those are left alone, exactly as they should be.

This is safe to run multiple times — a doc that's already correct
(claimed: true, or genuinely unclaimed) is simply skipped and reported
as "already OK", nothing is written to it.

USAGE
    Put this in the same folder as migrate_to_firestore.py, with
    serviceAccountKey.json present (same one you used for migration).

    python3 repair_claimed_codes.py

    It will first show you a DRY-RUN list of exactly which codes it's
    about to fix and ask you to confirm before writing anything.
"""

import os
import sys
import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT_PATH = "serviceAccountKey.json"


def main():
    if not os.path.exists(SERVICE_ACCOUNT_PATH):
        print(f"ERROR: {SERVICE_ACCOUNT_PATH} not found.")
        print("Put this script in the same folder as your serviceAccountKey.json")
        sys.exit(1)

    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("Scanning schoolCodes collection...")
    codes_ref = db.collection("schoolCodes")
    all_docs = list(codes_ref.stream())
    print(f"Found {len(all_docs)} total codes.\n")

    to_fix = []
    already_ok_claimed = 0
    already_ok_unclaimed = 0

    for doc in all_docs:
        data = doc.to_dict()
        claimed = data.get("claimed", False)
        claimed_by_uid = data.get("claimedByUid")

        if claimed_by_uid and not claimed:
            to_fix.append((doc.id, data))
        elif claimed:
            already_ok_claimed += 1
        else:
            already_ok_unclaimed += 1

    print(f"Already correctly marked as claimed:   {already_ok_claimed}")
    print(f"Genuinely unclaimed (left alone):      {already_ok_unclaimed}")
    print(f"Incorrectly reset to unclaimed (BUG):  {len(to_fix)}\n")

    if not to_fix:
        print("Nothing to repair. Your data is already correct.")
        return

    print("The following codes have a linked account but show as unclaimed:")
    print("-" * 70)
    for code, data in to_fix:
        student_id = data.get("studentId", code)
        claimed_by = data.get("claimedByUid", "?")
        claimed_at = data.get("claimedAt", "unknown time")
        print(f"  {code}  (studentId: {student_id})")
        print(f"      claimedByUid: {claimed_by}")
        print(f"      originally claimed at: {claimed_at}")
    print("-" * 70)

    answer = input(f"\nFix these {len(to_fix)} codes by setting claimed=True? [y/N]: ").strip().lower()
    if answer != "y":
        print("Aborted. No changes were made.")
        return

    batch = db.batch()
    batch_count = 0

    def commit_if_full():
        nonlocal batch, batch_count
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0

    for code, _data in to_fix:
        code_ref = codes_ref.document(code)
        batch.set(code_ref, {"claimed": True}, merge=True)
        batch_count += 1
        commit_if_full()

    if batch_count > 0:
        batch.commit()

    print(f"\nDone. Repaired {len(to_fix)} codes — claimed flipped back to True.")
    print("claimedByUid / claimedAt were never touched, so accounts are")
    print("still linked to the same parents who originally registered.")


if __name__ == "__main__":
    main()
