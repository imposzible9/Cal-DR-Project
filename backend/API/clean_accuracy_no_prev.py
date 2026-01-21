import sqlite3

DB_FILE = "ratings.sqlite"

def clean_accuracy_records():
    """ลบ records ที่ไม่มี price_prev ออกจาก rating_accuracy"""
    try:
        con = sqlite3.connect(DB_FILE)
        cur = con.cursor()
        
        # นับจำนวน records ที่จะลบ
        cur.execute("SELECT COUNT(*) FROM rating_accuracy WHERE price_prev IS NULL")
        count_to_delete = cur.fetchone()[0]
        
        print(f"พบ {count_to_delete} records ที่ไม่มี price_prev")
        
        if count_to_delete > 0:
            # ลบ records ที่ price_prev เป็น NULL
            cur.execute("DELETE FROM rating_accuracy WHERE price_prev IS NULL")
            con.commit()
            print(f"✅ ลบ {count_to_delete} records เรียบร้อยแล้ว")
        else:
            print("✅ ไม่มี records ที่ต้องลบ")
        
        # แสดงจำนวน records ที่เหลือ
        cur.execute("SELECT COUNT(*) FROM rating_accuracy")
        remaining = cur.fetchone()[0]
        print(f"📊 เหลือ {remaining} records ในตาราง rating_accuracy")
        
        con.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    clean_accuracy_records()
