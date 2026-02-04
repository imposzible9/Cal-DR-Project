#!/usr/bin/env python3
"""
Delete rows from rating_accuracy where date(timestamp) is between start and end.

Usage:
  py delete_accuracy_range.py [YYYY-MM-DD] [YYYY-MM-DD]

If no args provided, defaults to 2026-01-16 .. 2026-01-26
"""
import sqlite3
import sys

DB_FILE = "ratings.sqlite"

def main():
    start_date = sys.argv[1] if len(sys.argv) > 1 else "2026-01-16"
    end_date = sys.argv[2] if len(sys.argv) > 2 else "2026-01-26"

    con = sqlite3.connect(DB_FILE)
    cur = con.cursor()
    cur.execute("PRAGMA foreign_keys=ON")

    cur.execute(
        "SELECT COUNT(*) FROM rating_accuracy WHERE date(timestamp) BETWEEN ? AND ?",
        (start_date, end_date)
    )
    row = cur.fetchone()
    count = row[0] if row else 0

    print(f"Found {count} rows in rating_accuracy with date(timestamp) between {start_date} and {end_date}.")
    if count == 0:
        con.close()
        return

    confirm = input("Type YES to confirm deletion: ")
    if confirm.strip() != "YES":
        print("Aborted.")
        con.close()
        return

    cur.execute(
        "DELETE FROM rating_accuracy WHERE date(timestamp) BETWEEN ? AND ?",
        (start_date, end_date)
    )
    con.commit()

    print(f"Deleted {count} rows from rating_accuracy.")
    con.close()

if __name__ == "__main__":
    main()
