#!/usr/bin/env python3
"""
ลบข้อมูลของวันที่ 2026-01-07 และ 2026-01-08 ออกจากตาราง rating_history
"""
import sqlite3
import os
from datetime import datetime

# Path to database
DB_FILE = os.path.join(os.path.dirname(__file__), "ratings.sqlite")

# วันที่ที่ต้องการลบ
TARGET_DATES = ["2026-01-07", "2026-01-08"]

def delete_history_by_dates():
    """ลบข้อมูล rating_history ตามวันที่ที่ระบุ"""
    if not os.path.exists(DB_FILE):
        print(f"[ERROR] Database file not found: {DB_FILE}")
        return
    
    con = None
    try:
        con = sqlite3.connect(DB_FILE, timeout=10)
        cur = con.cursor()
        
        # ตรวจสอบจำนวนแถวก่อนลบ (ลองหลายวิธี)
        total_deleted = 0
        for date_str in TARGET_DATES:
            # วิธีที่ 1: ใช้ strftime
            cur.execute(
                """
                SELECT COUNT(*) FROM rating_history
                WHERE strftime('%Y-%m-%d', timestamp) = ?
                """,
                (date_str,)
            )
            count1 = cur.fetchone()[0]
            
            # วิธีที่ 2: ใช้ LIKE
            cur.execute(
                """
                SELECT COUNT(*) FROM rating_history
                WHERE timestamp LIKE ?
                """,
                (f"{date_str}%",)
            )
            count2 = cur.fetchone()[0]
            
            count = max(count1, count2)
            print(f"[INFO] วันที่ {date_str}: พบ {count} แถว (strftime={count1}, LIKE={count2})")
            total_deleted += count
        
        if total_deleted == 0:
            print("[OK] ไม่พบข้อมูลที่ต้องลบ")
            return
        
        # ยืนยันการลบ
        print(f"\n[WARNING] จะลบข้อมูลทั้งหมด {total_deleted} แถว")
        confirm = input("ยืนยันการลบ? (yes/no): ").strip().lower()
        
        if confirm != "yes":
            print("[CANCEL] ยกเลิกการลบ")
            return
        
        # ลบข้อมูล (ลองหลายวิธี)
        deleted_count = 0
        for date_str in TARGET_DATES:
            # ลบด้วย LIKE pattern (ครอบคลุมมากกว่า)
            cur.execute(
                """
                DELETE FROM rating_history
                WHERE timestamp LIKE ? OR strftime('%Y-%m-%d', timestamp) = ?
                """,
                (f"{date_str}%", date_str)
            )
            deleted = cur.rowcount
            deleted_count += deleted
            if deleted > 0:
                print(f"[OK] ลบวันที่ {date_str}: {deleted} แถว")
        
        con.commit()
        print(f"\n[SUCCESS] ลบข้อมูลสำเร็จ: {deleted_count} แถว")
        
        # ตรวจสอบจำนวนแถวที่เหลือ
        cur.execute("SELECT COUNT(*) FROM rating_history")
        remaining = cur.fetchone()[0]
        print(f"[INFO] จำนวนแถวที่เหลือในตาราง: {remaining}")
        
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()
        if con:
            con.rollback()
    finally:
        if con:
            con.close()

if __name__ == "__main__":
    print("=" * 60)
    print("ลบข้อมูล rating_history วันที่ 2026-01-07 และ 2026-01-08")
    print("=" * 60)
    delete_history_by_dates()

