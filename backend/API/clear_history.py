import sqlite3

DB_FILE = "ratings.sqlite"

con = sqlite3.connect(DB_FILE)
cur = con.cursor()

# ลบข้อมูล rating_history ที่ market = 'TH'
cur.execute("DELETE FROM rating_history WHERE market = 'TH'")
rows_deleted = cur.rowcount

con.commit()
con.close()

print(f"✅ Deleted {rows_deleted} rows with market='TH' from rating_history.")

