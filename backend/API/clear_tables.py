import sqlite3
import os

DB_FILE = "ratings.sqlite"

def clear_tables():
    """Clear data from rating_history and rating_accuracy tables"""
    
    if not os.path.exists(DB_FILE):
        print(f"❌ Database file '{DB_FILE}' not found!")
        return
    
    try:
        con = sqlite3.connect(DB_FILE)
        cur = con.cursor()
        
        # Check which tables exist
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = [row[0] for row in cur.fetchall()]
        print(f"📊 Existing tables: {existing_tables}")
        
        # Clear rating_history if exists
        if "rating_history" in existing_tables:
            cur.execute("DELETE FROM rating_history")
            count_history = cur.rowcount
            print(f"✅ Deleted {count_history} rows from rating_history")
        else:
            print("⚠️ Table 'rating_history' not found")
        
        # Clear rating_accuracy if exists
        if "rating_accuracy" in existing_tables:
            cur.execute("DELETE FROM rating_accuracy")
            count_accuracy = cur.rowcount
            print(f"✅ Deleted {count_accuracy} rows from rating_accuracy")
        else:
            print("⚠️ Table 'rating_accuracy' not found")
        
        con.commit()
        con.close()
        print("\n✅ Tables cleared successfully!")
        
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    clear_tables()
