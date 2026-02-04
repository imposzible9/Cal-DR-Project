import sqlite3
import sys

DB_PATH = "ratings.sqlite"

USAGE = '''Usage:
  py delete_history_by_timestamp.py                 # default: 2026-01-28
  py delete_history_by_timestamp.py 2026-01-26     # delete single date
  py delete_history_by_timestamp.py "2026-01-16 2026-01-26"  # delete range (quoted)
  py delete_history_by_timestamp.py 2026-01-16 2026-01-26   # delete range (two args)
'''

def parse_args():
    """Return (mode, params)
    mode: 'single' or 'range'
    params: (date,) or (start_date, end_date)
    """
    if len(sys.argv) <= 1:
        return ('single', ('2026-01-28',))

    # join remaining args into one string and split by whitespace to support quoted range
    raw = " ".join(sys.argv[1:]).strip()
    parts = raw.split()
    if len(parts) == 1:
        return ('single', (parts[0],))
    elif len(parts) >= 2:
        # take first two as start/end
        return ('range', (parts[0], parts[1]))
    else:
        return (None, None)


def main():
    mode, params = parse_args()
    if mode is None:
        print(USAGE)
        return

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    try:
        # Ensure timestamp column exists
        cur.execute("PRAGMA table_info(rating_history)")
        cols = [r[1] for r in cur.fetchall()]
        if "timestamp" not in cols:
            print("rating_history ไม่มีคอลัมน์ 'timestamp' — ยกเลิกการลบ")
            con.close()
            return

        if mode == 'single':
            target = params[0]
            cur.execute("SELECT COUNT(*) FROM rating_history WHERE date(timestamp) = ?", (target,))
            row = cur.fetchone()
            count = row[0] if row else 0

            print(f"พบ {count} แถวใน rating_history ที่มี date(timestamp) = {target}")
            if count == 0:
                con.close()
                return

            confirm = input(f"พิมพ์ YES เพื่อยืนยันการลบทั้งหมดใน {target}: ")
            if confirm.strip() != "YES":
                print("ยกเลิกการลบ")
                con.close()
                return

            cur.execute("DELETE FROM rating_history WHERE date(timestamp) = ?", (target,))
            con.commit()
            print(f"ลบเรียบร้อยแล้ว: {count} แถวถูกลบ")

        elif mode == 'range':
            start, end = params[0], params[1]
            cur.execute("SELECT COUNT(*) FROM rating_history WHERE date(timestamp) BETWEEN ? AND ?", (start, end))
            row = cur.fetchone()
            count = row[0] if row else 0

            print(f"พบ {count} แถวใน rating_history ที่ date(timestamp) BETWEEN {start} AND {end}")
            if count == 0:
                con.close()
                return

            confirm = input(f"พิมพ์ YES เพื่อยืนยันการลบช่วง {start} .. {end}: ")
            if confirm.strip() != "YES":
                print("ยกเลิกการลบ")
                con.close()
                return

            cur.execute("DELETE FROM rating_history WHERE date(timestamp) BETWEEN ? AND ?", (start, end))
            con.commit()
            print(f"ลบเรียบร้อยแล้ว: {count} แถวถูกลบ")

    except Exception as e:
        print(f"เกิดข้อผิดพลาดขณะลบ: {e}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
