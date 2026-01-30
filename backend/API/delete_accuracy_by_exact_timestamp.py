#!/usr/bin/env python3
"""
Delete a single row from rating_accuracy by exact timestamp.

Usage:
  py delete_accuracy_by_exact_timestamp.py "2026-01-27T13:00:00.016927"

If no arg provided, script will prompt for the timestamp.
"""
import sqlite3
import sys

DB_FILE = "ratings.sqlite"

def main():
    ts = sys.argv[1] if len(sys.argv) > 1 else input("Timestamp to delete: ").strip()
    if not ts:
        print("No timestamp provided. Exiting.")
        return

    con = sqlite3.connect(DB_FILE)
    cur = con.cursor()

    cur.execute("SELECT COUNT(*) FROM rating_accuracy WHERE timestamp = ?", (ts,))
    row = cur.fetchone()
    count = row[0] if row else 0

    print(f"Found {count} rows in rating_accuracy with timestamp = {ts}")
    if count == 0:
        con.close()
        return

    confirm = input("Type YES to confirm deletion: ")
    if confirm.strip() != "YES":
        print("Aborted.")
        con.close()
        return

    cur.execute("DELETE FROM rating_accuracy WHERE timestamp = ?", (ts,))
    con.commit()

    print(f"Deleted {count} rows from rating_accuracy.")
    con.close()

if __name__ == "__main__":
    main()
