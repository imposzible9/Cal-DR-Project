from fastapi import FastAPI, Query, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx
import uvicorn
import asyncio
import json
import os
print("--- RELOADED RATINGS API (UPDATED) ---")
import re
import random
import sqlite3
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

# Debug logging setup
DEBUG_LOG_PATH = r"c:\Users\Thoz\Desktop\New-Cal-DR-Project-main\.cursor\debug.log"

def debug_log(session_id, run_id, hypothesis_id, location, message, data):
    """Write debug log to NDJSON file"""
    try:
        log_entry = {
            "sessionId": session_id,
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(datetime.now().timestamp() * 1000)
        }
        with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
    except Exception:
        pass  

# ---------- CONFIG ----------
DR_LIST_URL = "http://172.17.1.85:8333/dr"
TRADINGVIEW_BASE = "https://scanner.tradingview.com/symbol"
TV_FIELDS = "Recommend.All,Recommend.All|1W,close,change,change_abs,high,low,volume,currency"

MAX_CONCURRENCY = 4       
REQUEST_TIMEOUT = 15      
UPDATE_INTERVAL_SECONDS = 180 
BATCH_SLEEP_SECONDS = 1.0




MARKET_CLOSE_CONFIG = {
    # US – NYSE / NASDAQ
    "US": {"winter": time(4, 0), "summer": time(3, 0)},   # หน้าหนาว 04:00, หน้าร้อน 03:00

    # Europe
    "DK": {"winter": time(23, 0), "summer": time(22, 0)},  # หน้าหนาว 23:00, หน้าร้อน 22:00
    "NL": {"winter": time(23, 30), "summer": time(22, 30)}, # หน้าหนาว 23:30, หน้าร้อน 22:30
    "FR": {"winter": time(23, 30), "summer": time(22, 30)}, # หน้าหนาว 23:30, หน้าร้อน 22:30
    "IT": {"winter": time(23, 30), "summer": time(22, 30)}, # หน้าหนาว 23:30, หน้าร้อน 22:30

    # Asia (เวลาไม่เปลี่ยนตามฤดูกาล)
    "HK": {"winter": time(15, 0), "summer": time(15, 0)},  # 15:00 ไทย
    "JP": {"winter": time(13, 0), "summer": time(13, 0)},  # 13:00 ไทย
    "SG": {"winter": time(16, 0), "summer": time(16, 0)},  # 16:00 ไทย
    "TW": {"winter": time(12, 30), "summer": time(12, 30)}, # 12:30 ไทย
    "CN": {"winter": time(14, 0), "summer": time(14, 0)},  # 14:00 ไทย
    "VN": {"winter": time(15, 0), "summer": time(15, 0)},  # 15:00 ไทย (ใช้ 15:00 แทน 14:45)
}

# --- Database Config ---
DB_FILE = "ratings.sqlite"
# --- Old JSON file paths for migration ---
OLD_CACHE_FILE = "ratings_cache_smart.json"
OLD_STATS_FILE = "ratings_stats.json" 
OLD_HISTORY_FILE = "ratings_history.json"

# --- Mock Data Config ---
USE_MOCK_DATA = False  # Enable mock rating history from AAPL JSON file 

FAKE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
    "Accept": "application/json, text/plain, */*",
}

# --- Database Initialization & Migration ---

def check_table_schema(cur, table_name):
    """Check if table exists and has the correct schema (new structure without timeframe)."""
    try:
        cur.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
        if not cur.fetchone():
            return False  
               
        cur.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cur.fetchall()]
        
        has_daily_rating = "daily_rating" in columns
        has_weekly_rating = "weekly_rating" in columns
        has_timeframe = "timeframe" in columns
        
        return has_daily_rating and has_weekly_rating and not has_timeframe
    except:
        return False

def init_database():
    """Initializes the SQLite database and creates tables if they don't exist.
    If old schema is detected, drops and recreates tables with new schema.
    """
    try:
        con = sqlite3.connect(DB_FILE)
        cur = con.cursor()
        
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")
        
        needs_recreate = False
        if os.path.exists(DB_FILE):
            if not check_table_schema(cur, "rating_stats") or \
               not check_table_schema(cur, "rating_main") or \
               not check_table_schema(cur, "rating_history"):
                needs_recreate = True
                print("[WARN] Old database schema detected. Recreating tables with new schema...")
        
        if needs_recreate:
            # Drop old tables
            cur.execute("DROP TABLE IF EXISTS rating_stats")
            cur.execute("DROP TABLE IF EXISTS rating_main")
            cur.execute("DROP TABLE IF EXISTS rating_history")
            print("   -> Dropped old tables")
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rating_stats (
                ticker TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                daily_val REAL,
                daily_rating TEXT,
                daily_changed_at TEXT,
                weekly_val REAL,
                weekly_rating TEXT,
                weekly_changed_at TEXT,
                PRIMARY KEY (ticker, timestamp)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS rating_main (
                ticker TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                daily_val REAL,
                daily_rating TEXT,
                daily_prev TEXT,
                daily_changed_at TEXT,
                weekly_val REAL,
                weekly_rating TEXT,
                weekly_prev TEXT,
                weekly_changed_at TEXT,
                currency TEXT,
                price REAL,
                change_pct REAL,
                change_abs REAL,
                high REAL,
                low REAL,
                PRIMARY KEY (ticker, timestamp)
            )
        """)
        
        # Create index on rating_main for faster queries (WHERE ticker=? ORDER BY timestamp DESC)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_rating_main_ticker_timestamp 
            ON rating_main(ticker, timestamp DESC)
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS rating_history (
                ticker TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                daily_val REAL,
                daily_rating TEXT,
                daily_prev TEXT,
                daily_changed_at TEXT,
                weekly_val REAL,
                weekly_rating TEXT,
                weekly_prev TEXT,
                weekly_changed_at TEXT,
                exchange TEXT,
                market TEXT,
                currency TEXT,
                price REAL,
                change_pct REAL,
                change_abs REAL,
                high REAL,
                low REAL,
                PRIMARY KEY (ticker, timestamp)
            )
        """)

        # Ensure new market-data / market-info columns exist on old databases
        try:
            cur.execute("PRAGMA table_info(rating_history)")
            existing_cols = {row[1] for row in cur.fetchall()}
            for col_def in [
                ("exchange", "TEXT"),
                ("market", "TEXT"),
                ("currency", "TEXT"),
                ("price", "REAL"),
                ("change_pct", "REAL"),
                ("change_abs", "REAL"),
                ("high", "REAL"),
                ("low", "REAL"),
            ]:
                col_name, col_type = col_def
                if col_name not in existing_cols:
                    cur.execute(f"ALTER TABLE rating_history ADD COLUMN {col_name} {col_type}")
        except Exception as e:
            print(f"[WARN] Failed to ensure rating_history market-data columns: {e}")

        try:
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", ("rating_accuracy",))
            if cur.fetchone():
                cur.execute("PRAGMA table_info(rating_accuracy)")
                columns = [row[1] for row in cur.fetchall()]
                if "timeframe" in columns or "currency" not in columns or "high" not in columns or "low" not in columns or "price_prev" not in columns:
                    print("[WARN] Old rating_accuracy schema detected. Dropping and recreating table...")
                    cur.execute("DROP TABLE IF EXISTS rating_accuracy")
                    print("   -> Dropped old rating_accuracy table")
        except Exception as e:
            print(f"[WARN] Error checking rating_accuracy schema: {e}")
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rating_accuracy (
                ticker TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                price REAL,
                price_prev REAL,
                change_pct REAL,
                currency TEXT,
                high REAL,
                low REAL,
                window_day INTEGER NOT NULL,
                daily_rating TEXT,
                daily_prev TEXT,
                samplesize_daily INTEGER NOT NULL,
                correct_daily INTEGER NOT NULL,
                incorrect_daily INTEGER NOT NULL,
                accuracy_daily REAL NOT NULL,
                weekly_rating TEXT,
                weekly_prev TEXT,
                samplesize_weekly INTEGER NOT NULL,
                correct_weekly INTEGER NOT NULL,
                incorrect_weekly INTEGER NOT NULL,
                accuracy_weekly REAL NOT NULL,
                PRIMARY KEY (ticker, timestamp)
            )
        """)

        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_rating_accuracy_ticker 
            ON rating_accuracy(ticker)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_rating_accuracy_ticker_timestamp 
            ON rating_accuracy(ticker, timestamp DESC)
        """)

        # Check and migrate tracking tables - force recreate to use ip_address schema
        try:
            cur.execute("PRAGMA table_info(visitor_stats)")
            visitor_cols = {row[1] for row in cur.fetchall()}
            # Force recreate if using old schema (user_id instead of ip_address)
            if "user_id" in visitor_cols or ("ip_address" not in visitor_cols and len(visitor_cols) > 0):
                print("[WARN] Old tracking tables schema detected (using user_id). Recreating with ip_address...")
                cur.execute("DROP TABLE IF EXISTS visitor_stats")
                cur.execute("DROP TABLE IF EXISTS user_page_analytics")
                cur.execute("DROP TABLE IF EXISTS user_behavior")
                print("   -> Dropped old tracking tables")
        except Exception as e:
            print(f"[WARN] Error checking tracking tables schema: {e}")

        # Create tracking tables using IP address as primary identifier
        cur.execute("""
            CREATE TABLE IF NOT EXISTS visitor_stats (
                ip_address TEXT PRIMARY KEY,
                visit_count INTEGER DEFAULT 0,
                last_visit TEXT
            )
        """)

        # Check if user_page_analytics has old schema (with total_pages, pages_visited, or last_viewed column)
        try:
            cur.execute("PRAGMA table_info(user_page_analytics)")
            page_cols = {row[1] for row in cur.fetchall()}
            if "total_pages" in page_cols or "pages_visited" in page_cols or "last_viewed" in page_cols:
                print("[WARN] Old user_page_analytics schema detected. Recreating...")
                cur.execute("DROP TABLE IF EXISTS user_page_analytics")
                print("   -> Dropped old user_page_analytics table")
        except Exception as e:
            print(f"[WARN] Error checking user_page_analytics schema: {e}")

        # Page analytics - one row per IP + page combination
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_page_analytics (
                ip_address TEXT,
                page_path TEXT,
                view_count INTEGER DEFAULT 0,
                PRIMARY KEY (ip_address, page_path)
            )
        """)

        # User behavior table - stores all tracking events with full details
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_behavior (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT NOT NULL,
                session_id TEXT,
                event_type TEXT NOT NULL,
                event_data TEXT,
                page_path TEXT,
                timestamp TEXT NOT NULL,
                user_agent TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes for faster queries on user_behavior
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_behavior_ip_address 
            ON user_behavior(ip_address)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_behavior_event_type 
            ON user_behavior(event_type)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_behavior_timestamp 
            ON user_behavior(timestamp DESC)
        """)

        con.commit()
        con.close()
        if needs_recreate:
            print("[OK] SQLite database recreated with new schema successfully.")
        else:
            print("[OK] SQLite database and tables initialized successfully.")
    except Exception as e:
        print(f"[ERROR] Database initialization failed: {e}")
        import traceback
        traceback.print_exc()

def migrate_from_json_if_needed():
    """Reads data from old JSON files and loads it into the SQLite database."""
    if not os.path.exists(DB_FILE):
        print("[INFO] New database, migration not possible.")
        return

    try:
        con = sqlite3.connect(DB_FILE)
        cur = con.cursor()
        
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")

        cur.execute("SELECT COUNT(*) FROM rating_stats")
        if cur.fetchone()[0] > 0:
            print("[OK] Database already contains data. Skipping migration.")
            con.close()
            return
        
        print("[INFO] Starting data migration from JSON to SQLite...")

        if os.path.exists(OLD_STATS_FILE):
            print(f"  -> Migrating {OLD_STATS_FILE}...")
            with open(OLD_STATS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                
                # Group by ticker and timestamp
                stats_by_ticker_timestamp = {}
                for key, items in data.items():
                    parts = key.split('_')
                    ticker = "_".join(parts[:-1])
                    timeframe = parts[-1]
                    
                    for item in items:
                        timestamp = item["timestamp"]
                        rating = item["rating"]
                        key_ts = (ticker, timestamp)
                        
                        if key_ts not in stats_by_ticker_timestamp:
                            stats_by_ticker_timestamp[key_ts] = {
                                "ticker": ticker,
                                "timestamp": timestamp,
                                "daily_val": None,
                                "daily_rating": None,
                                "weekly_val": None,
                                "weekly_rating": None
                            }
                        
                        if timeframe == "1D":
                            stats_by_ticker_timestamp[key_ts]["daily_rating"] = rating
                        elif timeframe == "1W":
                            stats_by_ticker_timestamp[key_ts]["weekly_rating"] = rating
                
                # Convert to list for insertion
                stats_to_insert = []
                for stats in stats_by_ticker_timestamp.values():
                    stats_to_insert.append((
                        stats["ticker"], stats["timestamp"],
                        stats["daily_val"], stats["daily_rating"],
                        stats["timestamp"] if stats["daily_rating"] else None,  # daily_changed_at
                        stats["weekly_val"], stats["weekly_rating"],
                        stats["timestamp"] if stats["weekly_rating"] else None  # weekly_changed_at
                    ))
                
                cur.executemany("""
                    INSERT OR IGNORE INTO rating_stats 
                    (ticker, timestamp, daily_val, daily_rating, daily_changed_at,
                     weekly_val, weekly_rating, weekly_changed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, stats_to_insert)
            print(f"     Done migrating {len(stats_to_insert)} records from {OLD_STATS_FILE}.")
            os.rename(OLD_STATS_FILE, f"{OLD_STATS_FILE}.migrated")

        # Note: Old format has separate entries for daily and weekly, need to combine them
        if os.path.exists(OLD_HISTORY_FILE):
            print(f"  -> Migrating {OLD_HISTORY_FILE}...")
            with open(OLD_HISTORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                
                # Group by ticker and timestamp
                history_by_ticker_timestamp = {}
                for key, items in data.items():
                    parts = key.split('_')
                    ticker = "_".join(parts[:-1])
                    timeframe = parts[-1]
                    
                    for item in items:
                        timestamp = item["timestamp"]
                        rating = item["rating"]
                        key_ts = (ticker, timestamp)
                        
                        if key_ts not in history_by_ticker_timestamp:
                            history_by_ticker_timestamp[key_ts] = {
                                "ticker": ticker,
                                "timestamp": timestamp,
                                "daily_rating": None,
                                "weekly_rating": None
                            }
                        
                        if timeframe == "1D":
                            history_by_ticker_timestamp[key_ts]["daily_rating"] = rating
                        elif timeframe == "1W":
                            history_by_ticker_timestamp[key_ts]["weekly_rating"] = rating
                
                # Convert to list for insertion
                history_to_insert = []
                for hist in history_by_ticker_timestamp.values():
                    history_to_insert.append((
                        hist["ticker"], hist["timestamp"],
                        None, hist["daily_rating"], None, hist["timestamp"] if hist["daily_rating"] else None,
                        None, hist["weekly_rating"], None, hist["timestamp"] if hist["weekly_rating"] else None
                    ))
                
                cur.executemany("""
                    INSERT OR IGNORE INTO rating_history 
                    (ticker, timestamp, daily_val, daily_rating, daily_prev, daily_changed_at,
                     weekly_val, weekly_rating, weekly_prev, weekly_changed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, history_to_insert)
            print(f"     Done migrating {len(history_to_insert)} records from {OLD_HISTORY_FILE}.")
            os.rename(OLD_HISTORY_FILE, f"{OLD_HISTORY_FILE}.migrated")
        
        con.commit()
        print("[OK] Migration completed successfully!")

    except Exception as e:
        print(f"[ERROR] Migration Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if 'con' in locals() and con:
            con.close()


# --- Helper Functions ---
def rating_from_recommend_tradingview(v):
    try:
        val = float(v)
    except (ValueError, TypeError):
        return "Unknown"
    
    if val >= 0.5: return "Strong Buy"
    if val >= 0.1: return "Buy"
    if val > -0.1: return "Neutral"
    if val > -0.5: return "Sell"
    return "Strong Sell"

def rating_from_recommend_custom(v):
    """
    Custom mapping for Recommend.All / Recommend.All|1W used for backtest/history:
        v >= 0.5        -> Strong Buy
        0 <= v < 0.5    -> Buy
        -0.5 < v < 0    -> Sell
        v <= -0.5       -> Strong Sell
    """
    try:
        val = float(v)
    except (ValueError, TypeError):
        return "Unknown"

    if val >= 0.5:
        return "Strong Buy"
    if 0 <= val < 0.5:
        return "Buy"
    if -0.5 < val < 0:
        return "Sell"
    return "Strong Sell"

def _find_key_recursive(obj, key):
    if obj is None: return None
    if isinstance(obj, dict):
        if key in obj: return obj[key]
        for v in obj.values():
            r = _find_key_recursive(v, key)
            if r is not None: return r
    elif isinstance(obj, list):
        for item in obj:
            r = _find_key_recursive(item, key)
            if r is not None: return r
    return None

def construct_tv_symbol(ticker: str, name: str, exchange: str, dr_symbol: str):
    ticker = ticker.strip().upper()
    exchange = " ".join(exchange.upper().split()) if exchange else ""
    name = name.strip() if name else ""
    dr_symbol = dr_symbol.strip().upper() if dr_symbol else ""

    real_ticker = ticker 
    match = re.search(r'\(([A-Z0-9.\-_]+)\)$', name) 
    if match:
        real_ticker = match.group(1)
    else:
        if dr_symbol:
            if re.search(r'\d{2}$', dr_symbol):
                candidate = dr_symbol[:-2] 
                if len(candidate) >= 2: 
                    real_ticker = candidate
            else:
                if len(dr_symbol) >= 2:
                    real_ticker = dr_symbol

    if any(k in exchange for k in ("MILAN", "MIL")): return f"MIL:{real_ticker}"
    if any(k in exchange for k in ("COPENHAGEN", "OMX")): return f"OMXCOP:{real_ticker.replace('-', '_')}"
    if any(k in exchange for k in ("EURONEXT", "PARIS", "AMSTERDAM", "BRUSSELS", "FRANCE", "NETHERLANDS")): return f"EURONEXT:{real_ticker}"
    if any(k in exchange for k in ("SHANGHAI", "SSE", "SHANGHAI STOCK EXCHANGE")): return f"SSE:{real_ticker}"
    if any(k in exchange for k in ("SHENZHEN", "SZSE")): return f"SZSE:{real_ticker}"
    if any(k in exchange for k in ("HONG", "HK", "HKEX")): return f"HKEX:{real_ticker}"
    if any(k in exchange for k in ("VIET", "HOCHIMINH", "HOSE", "HNX")): return f"HOSE:{real_ticker}"
    if any(k in exchange for k in ("TOKYO", "JAPAN", "TSE", "JP")): return f"TSE:{real_ticker}"
    if any(k in exchange for k in ("SINGAPORE", "SGX", "SG")): return f"SGX:{real_ticker}"
    if any(k in exchange for k in ("TAIWAN", "TWSE", "TW")): return f"TWSE:{real_ticker}"
    if "NASDAQ" in exchange: return f"NASDAQ:{real_ticker}"
    if any(k in exchange for k in ("NEW YORK", "NYSE", "NY")):     
        if any(sub_k in exchange for sub_k in ("ARCHIPELAGO", "ARCA", "AMEX")): return f"AMEX:{real_ticker}"
        return f"NYSE:{real_ticker}"
    if re.match(r'^\d+$', real_ticker): return f"HKEX:{real_ticker}" 
    return f"NASDAQ:{real_ticker}" 


def market_code_from_exchange(exchange: str) -> str:
    """
    Map exchange/market description from DR API to high-level market code
    used in MARKET_CLOSE_CONFIG.
    """
    if not exchange:
        return "US"

    ex = exchange.upper()

    # ใช้การ map แบบเดียวกับ frontend (DRList.jsx) - ตรวจสอบแบบเต็มก่อน
    ex_lower = ex.lower()
    
    # Europe - ตรวจสอบแบบเต็มตาม frontend
    if "euronext amsterdam" in ex_lower:
        return "NL"
    if "euronext milan" in ex_lower:
        return "IT"
    if "euronext paris" in ex_lower:
        return "FR"
    if "nasdaq copenhagen" in ex_lower:
        return "DK"
    
    if ("ho chi minh" in ex_lower or "hochiminh" in ex_lower or 
        "hanoi" in ex_lower or "hnx" in ex_lower):
        return "VN"
    
    if "shenzhen" in ex_lower or "shanghai" in ex_lower:
        return "CN" 
  
    if "singapore exchange" in ex_lower or "sgx" in ex_lower:
        return "SG"
   
    if "taiwan stock exchange" in ex_lower:
        return "TW"
    
    if "stock exchange of hong kong" in ex_lower or "hkex" in ex_lower:
        return "HK"
    
    if "tokyo stock exchange" in ex_lower:
        return "JP"
    
    if ("nasdaq global select market" in ex_lower or 
        "nasdaq stock market" in ex_lower or 
        "new york stock exchange archipelago" in ex_lower or  # ตรวจสอบ Archipelago ก่อน (เพราะมี "new york stock exchange" อยู่ด้วย)
        "new york stock exchange" in ex_lower or 
        "nyse" in ex_lower or 
        "nasdaq" in ex_lower):
        return "US"
    
    # Fallback: ตรวจสอบแบบย่อสำหรับกรณีที่ไม่ได้ระบุแบบเต็ม
    if any(k in ex for k in ("COPENHAGEN", "DENMARK", "OMXCOP", "DK")):
        return "DK"
    if any(k in ex for k in ("AMSTERDAM", "NETHERLANDS")):
        return "NL"
    if any(k in ex for k in ("PARIS", "FRANCE")):
        return "FR"
    if any(k in ex for k in ("MILAN", "ITALY", "BORSA ITALIANA")):
        return "IT"
    if any(k in ex for k in ("VIET", "VIETNAM", "HOCHIMINH", "HOSE", "HNX", "VN")):
        return "VN"
    if any(k in ex for k in ("SHANGHAI", "SSE", "SZSE", "SHENZHEN", "CHINA", "CN")):
        return "CN"
    if any(k in ex for k in ("SINGAPORE", "SGX", "SG")):
        return "SG"
    if any(k in ex for k in ("TAIWAN", "TWSE", "TW")):
        return "TW"
    if any(k in ex for k in ("HONG", "HKEX", "HONG KONG", "HK")):
        return "HK"
    if any(k in ex for k in ("TOKYO", "JAPAN", "TSE", "JP")):
        return "JP"
    if any(k in ex for k in ("NASDAQ", "NYSE", "NEW YORK", "AMEX", "ARCHIPELAGO", "ARCA")):
        return "US"
    # Note: ไม่มี TH (Thailand) เพราะระบบไม่มีหุ้นไทย

    # Default: treat as US if ไม่แมตช์
    return "US"


def is_summer_time(ref_thai: datetime) -> bool:
    """
    ตรวจสอบว่าตอนนี้เป็นหน้าร้อน (Summer/DST) หรือหน้าหนาว (Winter)
    โดยตรวจสอบจาก US DST schedule:
    - Summer: วันอาทิตย์ที่ 2 ของมีนาคม ถึง วันอาทิตย์แรกของพฤศจิกายน
    - Winter: นอกช่วง Summer
    """
    year = ref_thai.year
    month = ref_thai.month
    
    # ถ้าเป็นเดือน พ.ย. - ก.พ. = หน้าหนาว
    if month in [11, 12, 1, 2]:
        return False
    # ถ้าเป็นเดือน เม.ย. - ต.ค. = หน้าร้อน
    if month in [4, 5, 6, 7, 8, 9, 10]:
        return True
    
    # มีนาคม: ตรวจสอบว่าหลังวันอาทิตย์ที่ 2 ของมีนาคมหรือไม่
    if month == 3:
        # หาวันอาทิตย์แรกของมีนาคม
        first_day = datetime(year, 3, 1, tzinfo=ref_thai.tzinfo)
        first_sunday = first_day + timedelta(days=(6 - first_day.weekday()) % 7)
        # วันอาทิตย์ที่ 2 = วันอาทิตย์แรก + 7 วัน
        second_sunday = first_sunday + timedelta(days=7)
        return ref_thai >= second_sunday
    
    # พฤศจิกายน: ตรวจสอบว่าก่อนวันอาทิตย์แรกของพฤศจิกายนหรือไม่
    if month == 11:
        # หาวันอาทิตย์แรกของพฤศจิกายน
        first_day = datetime(year, 11, 1, tzinfo=ref_thai.tzinfo)
        first_sunday = first_day + timedelta(days=(6 - first_day.weekday()) % 7)
        return ref_thai < first_sunday
    
    return False

def get_market_close_thai(market_code: str, ref_thai: datetime) -> datetime:
    """
    Given market code (US, JP, etc.) and current Thai time, return today's close datetime in Thai time
    for that market.
    
    รองรับทั้งหน้าหนาวและหน้าร้อนตาม MARKET_CLOSE_CONFIG
    """
    cfg = MARKET_CLOSE_CONFIG.get(market_code, MARKET_CLOSE_CONFIG["US"])
    
    # ตรวจสอบว่าตอนนี้เป็นหน้าร้อนหรือหน้าหนาว
    is_summer = is_summer_time(ref_thai)
    
    # เลือกเวลาตามฤดูกาล
    if "winter" in cfg and "summer" in cfg:
        close_time = cfg["summer"] if is_summer else cfg["winter"]
    else:
        # ถ้าไม่มีกำหนดฤดูกาล ให้ใช้ค่าเดียว (กรณี Asia)
        close_time = cfg.get("winter") or cfg.get("summer") or time(3, 0)
    
    # ใช้วันที่ของเวลาไทยที่ส่งมา
    thai_date = ref_thai.date()
    close_thai = datetime.combine(thai_date, close_time, tzinfo=ref_thai.tzinfo)
    
    # ถ้าเวลาปิดตลาดยังไม่มาถึง (เป็นอนาคต) ให้ใช้ของเมื่อวาน
    if close_thai > ref_thai:
        thai_date_yesterday = thai_date - timedelta(days=1)
        close_thai = datetime.combine(thai_date_yesterday, close_time, tzinfo=ref_thai.tzinfo)
    
    return close_thai

async def fetch_single_ticker(client: httpx.AsyncClient, item_data):
    ticker = item_data.get("u_code")
    # ... (rest of the function is identical to the user's provided code)
    name = item_data.get("u_name")
    exchange = item_data.get("u_exch")
    dr_symbol = item_data.get("dr_sym")

    tv_symbol = construct_tv_symbol(ticker, name, exchange, dr_symbol)
    
    params = {
        "symbol": tv_symbol, 
        "fields": TV_FIELDS,
        "no_404": "true",
        "label-product": "popup-technicals",
    }
    
    await asyncio.sleep(random.uniform(0.1, 0.5))

    for attempt in range(3):
        try:
            resp = await client.get(TRADINGVIEW_BASE, params=params, headers=FAKE_HEADERS, timeout=REQUEST_TIMEOUT)
            
            if resp.status_code == 429:
                wait_time = 2 * (2 ** attempt)
                await asyncio.sleep(wait_time)
                continue 
            
            resp.raise_for_status()
            payload = resp.json()

            rec_daily = None
            rec_weekly = None
            p_close = p_change_pct = p_change_abs = p_high = p_low = p_currency = None

            if isinstance(payload, dict):
                if "data" in payload and isinstance(payload["data"], dict):
                    d = payload["data"]
                    rec_daily = d.get("Recommend.All")
                    rec_weekly = d.get("Recommend.All|1W")
                    p_close = d.get("close")
                    p_change_pct = d.get("change")
                    p_change_abs = d.get("change_abs")
                    p_high = d.get("high")
                    p_low = d.get("low")
                    p_currency = d.get("currency")
                
                if rec_daily is None: rec_daily = _find_key_recursive(payload, "Recommend.All")
                if rec_weekly is None: rec_weekly = _find_key_recursive(payload, "Recommend.All|1W")
                if p_close is None: p_close = _find_key_recursive(payload, "close")
                if p_change_pct is None: p_change_pct = _find_key_recursive(payload, "change")
                if p_change_abs is None: p_change_abs = _find_key_recursive(payload, "change_abs")
                if p_high is None: p_high = _find_key_recursive(payload, "high")
                if p_low is None: p_low = _find_key_recursive(payload, "low")
                if p_currency is None: p_currency = _find_key_recursive(payload, "currency")

            def safe_float(x):
                try: return float(x) if x is not None else None
                except: return None

            d_val = safe_float(rec_daily)
            w_val = safe_float(rec_weekly)
            val_close = safe_float(p_close)
            val_change_pct = safe_float(p_change_pct)
            val_change_abs = safe_float(p_change_abs)
            val_high = safe_float(p_high)
            val_low = safe_float(p_low)

            return {
                "ticker": ticker, 
                "tv_symbol": tv_symbol,
                "success": True,
                "data": {
                    "daily": {"val": d_val, "rating": rating_from_recommend_tradingview(d_val) if d_val is not None else "Unknown"},
                    "weekly": {"val": w_val, "rating": rating_from_recommend_tradingview(w_val) if w_val is not None else "Unknown"},
                    "currency": str(p_currency) if p_currency else "",
                    "market_data": {
                        "price": val_close,
                        "change_pct": val_change_pct,
                        "change_abs": val_change_abs,
                        "high": val_high,
                        "low": val_low
                    }
                }
            }
        except Exception as e:
            print(f"      - Error fetching {ticker} (attempt {attempt + 1}/3): {e}")
            await asyncio.sleep(1)
            
    print(f"      - ❌ Failed to fetch data for {ticker} after 3 attempts")
    return {"ticker": ticker, "success": False, "error": "Max retries exceeded"}


async def fetch_single_ticker_for_history(client: httpx.AsyncClient, item_data):

    ticker = item_data.get("u_code")
    name = item_data.get("u_name")
    exchange = item_data.get("u_exch") or ""
    dr_symbol = item_data.get("dr_sym")

    tv_symbol = construct_tv_symbol(ticker, name, exchange, dr_symbol)

    params = {
        "symbol": tv_symbol,
        "fields": TV_FIELDS,
        "no_404": "true",
        "label-product": "popup-technicals",
    }

    await asyncio.sleep(random.uniform(0.05, 0.2))

    for attempt in range(3):
        try:
            resp = await client.get(TRADINGVIEW_BASE, params=params, headers=FAKE_HEADERS, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 429:
                wait_time = 2 * (2 ** attempt)
                await asyncio.sleep(wait_time)
                continue

            resp.raise_for_status()
            payload = resp.json()

            rec_daily = None
            rec_weekly = None
            p_close = p_change_pct = p_change_abs = p_high = p_low = p_currency = None

            if isinstance(payload, dict):
                if "data" in payload and isinstance(payload["data"], dict):
                    d = payload["data"]
                    rec_daily = d.get("Recommend.All")
                    rec_weekly = d.get("Recommend.All|1W")
                    p_close = d.get("close")
                    p_change_pct = d.get("change")
                    p_change_abs = d.get("change_abs")
                    p_high = d.get("high")
                    p_low = d.get("low")
                    p_currency = d.get("currency")

                if rec_daily is None:
                    rec_daily = _find_key_recursive(payload, "Recommend.All")
                if rec_weekly is None:
                    rec_weekly = _find_key_recursive(payload, "Recommend.All|1W")
                if p_close is None:
                    p_close = _find_key_recursive(payload, "close")
                if p_change_pct is None:
                    p_change_pct = _find_key_recursive(payload, "change")
                if p_change_abs is None:
                    p_change_abs = _find_key_recursive(payload, "change_abs")
                if p_high is None:
                    p_high = _find_key_recursive(payload, "high")
                if p_low is None:
                    p_low = _find_key_recursive(payload, "low")
                if p_currency is None:
                    p_currency = _find_key_recursive(payload, "currency")

            def safe_float(x):
                try:
                    return float(x) if x is not None else None
                except Exception:
                    return None

            d_val = safe_float(rec_daily)
            w_val = safe_float(rec_weekly)
            val_close = safe_float(p_close)
            val_change_pct = safe_float(p_change_pct)
            val_change_abs = safe_float(p_change_abs)
            val_high = safe_float(p_high)
            val_low = safe_float(p_low)

            daily_rating = rating_from_recommend_custom(d_val) if d_val is not None else "Unknown"
            weekly_rating = rating_from_recommend_custom(w_val) if w_val is not None else "Unknown"

            return {
                "ticker": ticker,
                "exchange": exchange,
                "tv_symbol": tv_symbol,
                "success": True,
                "data": {
                    "daily_val": d_val,
                    "daily_rating": daily_rating,
                    "weekly_val": w_val,
                    "weekly_rating": weekly_rating,
                    "currency": str(p_currency) if p_currency else "",
                    "market_data": {
                        "price": val_close,
                        "change_pct": val_change_pct,
                        "change_abs": val_change_abs,
                        "high": val_high,
                        "low": val_low,
                    },
                },
            }
        except Exception as e:
            print(f"      - [history] Error fetching {ticker} (attempt {attempt + 1}/3): {e}")
            await asyncio.sleep(1)

    print(f"      - ❌ [history] Failed to fetch data for {ticker} after 3 attempts")
    return {"ticker": ticker, "exchange": exchange, "success": False, "error": "Max retries exceeded"}


# --- History Logic: A-B-C / A-B-A Filter ---
def filter_noise_from_stats(stats_list):
    if not stats_list:
        return []
    
    filtered = [stats_list[0]]
    a_idx = 0 
    i = 1
    while i < len(stats_list):
        b = stats_list[i]
        if i + 1 < len(stats_list):
            c = stats_list[i + 1]
            a = stats_list[a_idx]
            if c["rating"] == a["rating"]:
                i += 2 
            else:
                filtered.append(b)
                filtered.append(c)
                a_idx = i + 1 
                i += 2
        else:
            break
    return filtered

def update_rating_stats(cur, ticker, timestamp_str, daily_val, daily_rating, weekly_val, weekly_rating):
    cur.execute("""
        SELECT daily_rating, weekly_rating 
        FROM rating_stats 
        WHERE ticker=? 
        ORDER BY ticker, timestamp DESC 
        LIMIT 1
    """, (ticker,))
    last_record = cur.fetchone()
    
    # Check if rating has changed
    rating_changed = False
    
    if not last_record:
        # First record for this ticker - always insert
        rating_changed = True
    else:
        last_daily_rating = last_record[0]
        last_weekly_rating = last_record[1]
        
        # Check if daily or weekly rating has changed
        if (daily_rating and daily_rating != last_daily_rating) or \
           (weekly_rating and weekly_rating != last_weekly_rating):
            rating_changed = True
    
    # Insert only if rating has changed
    if rating_changed:
        cur.execute("""
            INSERT INTO rating_stats 
            (ticker, timestamp, daily_val, daily_rating, daily_changed_at, weekly_val, weekly_rating, weekly_changed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ticker, timestamp_str, 
            daily_val, daily_rating, timestamp_str,
            weekly_val, weekly_rating, timestamp_str
        ))

def update_rating_main(cur, ticker, timestamp_str, daily_val, daily_rating, weekly_val, weekly_rating, market_data):

    cur.execute("""
        SELECT daily_val, daily_rating, daily_prev, daily_changed_at,
               weekly_val, weekly_rating, weekly_prev, weekly_changed_at
        FROM rating_main 
        WHERE ticker=? 
        ORDER BY timestamp DESC 
        LIMIT 1
    """, (ticker,))
    current_main = cur.fetchone()
    
    # Current values from latest record
    current_daily_val = current_main[0] if current_main and current_main[0] else None
    current_daily_rating = current_main[1] if current_main and current_main[1] else None
    current_daily_prev = current_main[2] if current_main and current_main[2] else None
    current_daily_changed_at = current_main[3] if current_main and current_main[3] else None
    current_weekly_val = current_main[4] if current_main and current_main[4] else None
    current_weekly_rating = current_main[5] if current_main and current_main[5] else None
    current_weekly_prev = current_main[6] if current_main and current_main[6] else None
    current_weekly_changed_at = current_main[7] if current_main and current_main[7] else None
    
    # Determine what to update
    update_daily = False
    update_weekly = False
    should_insert = False
    
    # Check if this is the first record for this ticker
    is_first_record = current_main is None

    if daily_rating:
        if is_first_record:
            # First record: always store
            update_daily = True
            should_insert = True
        else:
            # Subsequent records: only store if NOT Neutral AND different from current
            if daily_rating.lower() != "neutral" and daily_rating != current_daily_rating:
                update_daily = True
                should_insert = True

    if weekly_rating:
        if is_first_record:
            # First record: always store
            update_weekly = True
            should_insert = True
        else:
            # Subsequent records: only store if NOT Neutral AND different from current
            if weekly_rating.lower() != "neutral" and weekly_rating != current_weekly_rating:
                update_weekly = True
                should_insert = True
    
    # Insert record if needed
    if should_insert:
        # Get previous ratings from latest record
        prev_daily = current_daily_rating if current_daily_rating else None
        prev_weekly = current_weekly_rating if current_weekly_rating else None
        
        # Prepare daily values
        if update_daily and daily_rating and daily_rating.lower() != "neutral":
            # Daily rating changed: use new values
            final_daily_val = daily_val
            final_daily_rating = daily_rating
            final_daily_prev = prev_daily
            final_daily_changed_at = timestamp_str
        elif update_daily:
            # Daily rating changed to Neutral: store as NULL
            final_daily_val = None
            final_daily_rating = None
            final_daily_prev = None
            final_daily_changed_at = None
        else:
            # Daily rating not changed: preserve values from latest record
            final_daily_val = current_daily_val
            final_daily_rating = current_daily_rating
            final_daily_prev = current_daily_prev
            final_daily_changed_at = current_daily_changed_at
        
        # Prepare weekly values
        if update_weekly and weekly_rating and weekly_rating.lower() != "neutral":
            # Weekly rating changed: use new values
            final_weekly_val = weekly_val
            final_weekly_rating = weekly_rating
            final_weekly_prev = prev_weekly
            final_weekly_changed_at = timestamp_str
        elif update_weekly:
            # Weekly rating changed to Neutral: store as NULL
            final_weekly_val = None
            final_weekly_rating = None
            final_weekly_prev = None
            final_weekly_changed_at = None
        else:
            # Weekly rating not changed: preserve values from latest record
            final_weekly_val = current_weekly_val
            final_weekly_rating = current_weekly_rating
            final_weekly_prev = current_weekly_prev
            final_weekly_changed_at = current_weekly_changed_at
        
        # Insert new record
        cur.execute("""
            INSERT INTO rating_main 
            (ticker, timestamp, daily_val, daily_rating, daily_prev, daily_changed_at,
             weekly_val, weekly_rating, weekly_prev, weekly_changed_at,
             currency, price, change_pct, change_abs, high, low)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ticker, timestamp_str,
            final_daily_val, final_daily_rating, final_daily_prev, final_daily_changed_at,
            final_weekly_val, final_weekly_rating, final_weekly_prev, final_weekly_changed_at,
            market_data.get("currency", ""),
            market_data.get("price"),
            market_data.get("change_pct"),
            market_data.get("change_abs"),
            market_data.get("high"),
            market_data.get("low")
        ))

def update_rating_history(cur, ticker):

    # Deprecated: history is now built by a dedicated history updater from TradingView directly.
    # This function is kept for backward compatibility but does nothing.
    return

def cleanup_old_records_by_date(cur):

    try:
        # Calculate the date to delete (today - 30 days) using Thai time
        bkk_tz = ZoneInfo("Asia/Bangkok")
        now_thai = datetime.now(bkk_tz)
        target_date = (now_thai.date() - timedelta(days=30))
        target_date_str = target_date.isoformat()  # Format: YYYY-MM-DD
        
        # Delete from rating_stats where date matches (using strftime for SQLite compatibility)
        cur.execute("""
            DELETE FROM rating_stats 
            WHERE strftime('%Y-%m-%d', timestamp) = ?
        """, (target_date_str,))
        stats_deleted = cur.rowcount
        
        # Delete from rating_main where date matches
        cur.execute("""
            DELETE FROM rating_main 
            WHERE strftime('%Y-%m-%d', timestamp) = ?
        """, (target_date_str,))
        main_deleted = cur.rowcount
        
        # Delete from rating_history where date matches (keep 30 days rolling window)
        cur.execute("""
            DELETE FROM rating_history 
            WHERE strftime('%Y-%m-%d', timestamp) = ?
        """, (target_date_str,))
        history_deleted = cur.rowcount
        
        # Delete from rating_accuracy where date matches (keep 30 days rolling window)
        cur.execute("""
            DELETE FROM rating_accuracy 
            WHERE strftime('%Y-%m-%d', timestamp) = ?
        """, (target_date_str,))
        accuracy_deleted = cur.rowcount
        
        if stats_deleted > 0 or main_deleted > 0 or history_deleted > 0 or accuracy_deleted > 0:
            print(f"   -> ✅ Cleanup (30-day rolling window): Deleted records from {target_date_str}")
            print(f"      - rating_stats: {stats_deleted} records")
            print(f"      - rating_main: {main_deleted} records")
            print(f"      - rating_history: {history_deleted} records")
            print(f"      - rating_accuracy: {accuracy_deleted} records")
        
        return stats_deleted, main_deleted, history_deleted, accuracy_deleted
    except Exception as e:
        print(f"   -> ❌ Error during cleanup by date (30-day window): {e}")
        import traceback
        traceback.print_exc()
        return 0, 0, 0, 0

# --- Background Updater ---
async def background_updater():
    bkk_tz = ZoneInfo("Asia/Bangkok")
    while True:
        try:
            now_thai = datetime.now(bkk_tz)
            print(f"[Background] Starting ratings update cycle at {now_thai.strftime('%Y-%m-%d %H:%M:%S')} ไทย")
            
            async with httpx.AsyncClient() as client:
                # Get the full list of DRs
                try:
                    r_dr = await client.get(DR_LIST_URL, timeout=20)
                    r_dr.raise_for_status()
                    rows = r_dr.json().get("rows", [])
                    print(f"Found {len(rows)} total items from DR API.")
                except Exception as dr_e:
                    print(f"❌ Could not fetch DR list: {dr_e}. Retrying in {UPDATE_INTERVAL_SECONDS}s.")
                    await asyncio.sleep(UPDATE_INTERVAL_SECONDS)
                    continue

                # Create a unique list of underlying stocks to query
                underlying_map = {}
                for item in rows:
                    u_code = item.get("underlying") or (item.get("symbol") or "").replace("80", "").replace("19", "")
                    if u_code:
                        u_code = u_code.strip().upper()
                        if u_code not in underlying_map or (not underlying_map[u_code]["u_exch"] and item.get("underlyingExchange")):
                            underlying_map[u_code] = {
                                "u_code": u_code, "u_name": item.get("underlyingName", ""),
                                "u_exch": item.get("underlyingExchange", ""), "dr_sym": item.get("symbol", "")
                            }
                
                tasks_data = list(underlying_map.values())
                print(f"Processing {len(tasks_data)} unique underlying tickers.")
                if not tasks_data:
                    await asyncio.sleep(UPDATE_INTERVAL_SECONDS)
                    continue

                # Process tickers in batches
                total_batches = (len(tasks_data) + MAX_CONCURRENCY - 1) // MAX_CONCURRENCY
                for i in range(0, len(tasks_data), MAX_CONCURRENCY):
                    batch_num = i // MAX_CONCURRENCY + 1
                    batch_data = tasks_data[i:i+MAX_CONCURRENCY]
                    
                    results = await asyncio.gather(*[fetch_single_ticker(client, item) for item in batch_data])
                    
                    successful_updates_in_batch = 0
                    con = None # Ensure 'con' is defined before try block
                    try:
                        con = sqlite3.connect(DB_FILE, timeout=10)
                        con.row_factory = sqlite3.Row
                        cur = con.cursor()
                        
                        # Enable WAL mode for better concurrency
                        cur.execute("PRAGMA journal_mode=WAL")
                        cur.execute("PRAGMA busy_timeout=30000")
                        
                        # ใช้เวลาไทยเท่านั้น
                        now_thai = datetime.now(bkk_tz)
                        current_timestamp_str = now_thai.replace(tzinfo=None).isoformat()

                        for res in results:
                            if not res.get("success"):
                                print(f"      - Ticker {res.get('ticker', 'N/A')} failed: {res.get('error', 'Unknown reason')}")
                                continue

                            ticker = res["ticker"]
                            new_data = res["data"]
                            
                            daily_rating = new_data["daily"]["rating"]
                            weekly_rating = new_data["weekly"]["rating"]
                            
                            # If we get an invalid rating from TradingView, skip the entire update for this ticker.
                            if daily_rating == "Unknown" or weekly_rating == "Unknown":
                                print(f"      - Ticker {ticker} has an Unknown rating. Skipping all DB updates for this cycle.")
                                continue

                            # This is a successful update
                            successful_updates_in_batch += 1
                            
                            # Prepare market data
                            market_data = {
                                "currency": new_data.get("currency", ""),
                                "price": new_data.get("market_data", {}).get("price"),
                                "change_pct": new_data.get("market_data", {}).get("change_pct"),
                                "change_abs": new_data.get("market_data", {}).get("change_abs"),
                                "high": new_data.get("market_data", {}).get("high"),
                                "low": new_data.get("market_data", {}).get("low")
                            }
                            
                            # Step 1: Update rating_stats (raw data - both daily and weekly in one row)
                            update_rating_stats(cur, ticker, current_timestamp_str, 
                                              new_data["daily"]["val"], daily_rating,
                                              new_data["weekly"]["val"], weekly_rating)
                            
                            # Step 2: Update rating_main (filtered: no Neutral, no duplicates - separate for daily/weekly)
                            update_rating_main(cur, ticker, current_timestamp_str,
                                             new_data["daily"]["val"], daily_rating,
                                             new_data["weekly"]["val"], weekly_rating,
                                             market_data)
                            
                            # Step 3: Update rating_history (from rating_main with A-B-A filter - separate for daily/weekly)
                            update_rating_history(cur, ticker)
                        
                        con.commit()
                        # แสดง log เฉพาะทุก 10 batches หรือ batch สุดท้าย
                        if batch_num % 10 == 0 or batch_num == total_batches:
                            print(f"    Batch {batch_num}/{total_batches}: {successful_updates_in_batch} updates committed")

                    except Exception as batch_e:
                        print(f"    ❌ Error during DB operation for batch {batch_num}: {batch_e}")
                    finally:
                        if con:
                            con.close()

                    await asyncio.sleep(BATCH_SLEEP_SECONDS)
            
            # Cleanup old records by specific date after all batches are done
            try:
                print("🧹 Cleaning up old records by date...")
                con = sqlite3.connect(DB_FILE, timeout=10)
                cur = con.cursor()
                
                # Enable WAL mode for better concurrency
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA busy_timeout=30000")
                
                cleanup_old_records_by_date(cur)
                con.commit()
                con.close()
            except Exception as cleanup_e:
                print(f"   -> ❌ Error during cleanup: {cleanup_e}")
            finally:
                if 'con' in locals() and con:
                    con.close()


            print(f"✅ Background update cycle finished.")

        except Exception as e:
            print(f"❌ An unexpected critical error occurred in the background updater: {e}")
            if 'con' in locals() and con:
                con.close()
        
        print(f"--- Sleeping for {UPDATE_INTERVAL_SECONDS} seconds before next cycle ---")
        await asyncio.sleep(UPDATE_INTERVAL_SECONDS)


def upsert_history_snapshot(
    cur,
    ticker: str,
    market_code: str,
    snapshot_ts_thai: datetime,
    daily_val,
    daily_rating: str,
    weekly_val,
    weekly_rating: str,
    exchange: str,
    market_data: dict,
):

    if snapshot_ts_thai.tzinfo is None:
        # ถ้าไม่มี timezone ให้ถือว่าเป็นเวลาไทย
        bkk_tz = ZoneInfo("Asia/Bangkok")
        snapshot_ts_thai = snapshot_ts_thai.replace(tzinfo=bkk_tz)
    
    ts_str = snapshot_ts_thai.replace(tzinfo=None).isoformat()
    date_str = snapshot_ts_thai.date().isoformat()
    
    # Check if we already have a record for this ticker and date
    cur.execute(
        """
        SELECT timestamp, daily_rating, weekly_rating
        FROM rating_history
        WHERE ticker=? AND strftime('%Y-%m-%d', timestamp)=?
        LIMIT 1
        """,
        (ticker, date_str),
    )
    existing = cur.fetchone()
    if existing:
        # Already have snapshot for this day -> nothing to do
        return

    # Find previous history record (for prev fields)
    cur.execute(
        """
        SELECT daily_rating, weekly_rating
        FROM rating_history
        WHERE ticker=? AND timestamp < ?
        ORDER BY timestamp DESC
        LIMIT 1
        """,
        (ticker, ts_str),
    )
    prev = cur.fetchone()
    prev_daily = prev[0] if prev else None
    prev_weekly = prev[1] if prev else None

    cur.execute(
        """
        INSERT INTO rating_history (
            ticker, timestamp,
            daily_val, daily_rating, daily_prev, daily_changed_at,
            weekly_val, weekly_rating, weekly_prev, weekly_changed_at,
            exchange, market,
            currency, price, change_pct, change_abs, high, low
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ticker,
            ts_str,
            daily_val,
            daily_rating,
            prev_daily,
            ts_str,
            weekly_val,
            weekly_rating,
            prev_weekly,
            ts_str,
            exchange or "",
            market_code or "",
            market_data.get("currency", ""),
            market_data.get("price"),
            market_data.get("change_pct"),
            market_data.get("change_abs"),
            market_data.get("high"),
            market_data.get("low"),
        ),
    )


async def analyze_all_tickers():
    """
    วิเคราะห์ tickers ทั้งหมดจาก DR API และแสดงสรุปการ mapping
    """
    try:
        async with httpx.AsyncClient() as client:
            r_dr = await client.get(DR_LIST_URL, timeout=20)
            r_dr.raise_for_status()
            rows = r_dr.json().get("rows", [])
            
            print("\n" + "=" * 80)
            print("[MAPPING ANALYSIS] วิเคราะห์การ Mapping Tickers ทั้งหมด")
            print("=" * 80)
            
            total_tickers = 0
            market_counts = {}
            exchange_counts = {}
            unmapped_tickers = []
            
            for item in rows:
                u_code = item.get("underlying") or (item.get("symbol") or "").replace("80", "").replace("19", "")
                if u_code:
                    u_code = u_code.strip().upper()
                    exchange = item.get("underlyingExchange", "")
                    market = market_code_from_exchange(exchange)
                    
                    total_tickers += 1
                    
                    # นับตาม market
                    if market not in market_counts:
                        market_counts[market] = 0
                    market_counts[market] += 1
                    
                    # นับตาม exchange
                    if exchange:
                        if exchange not in exchange_counts:
                            exchange_counts[exchange] = {"count": 0, "market": market}
                        exchange_counts[exchange]["count"] += 1
                    else:
                        unmapped_tickers.append(u_code)
            
            print(f"\n[SUMMARY] สรุปการ Mapping:")
            print(f"  จำนวน Tickers ทั้งหมดจาก DR API: {total_tickers}")
            print(f"  จำนวน Markets ที่พบ: {len(market_counts)}")
            print(f"  จำนวน Exchanges ที่พบ: {len(exchange_counts)}")
            if unmapped_tickers:
                print(f"  Tickers ที่ไม่มี Exchange: {len(unmapped_tickers)}")
            
            print(f"\n[MARKET DISTRIBUTION] แยกตาม Market:")
            for market in sorted(market_counts.keys()):
                count = market_counts[market]
                pct = (count / total_tickers * 100) if total_tickers > 0 else 0
                print(f"  {market:3s}: {count:4d} tickers ({pct:5.1f}%)")
            
            print(f"\n[EXCHANGE DISTRIBUTION] แยกตาม Exchange (Top 20):")
            sorted_exchanges = sorted(exchange_counts.items(), key=lambda x: x[1]["count"], reverse=True)
            for exchange, info in sorted_exchanges[:20]:
                count = info["count"]
                market = info["market"]
                print(f"  {exchange:60s} -> {market:3s} ({count:3d} tickers)")
            
            if len(sorted_exchanges) > 20:
                print(f"  ... และอีก {len(sorted_exchanges) - 20} exchanges")
            
            # ตรวจสอบ US exchanges
            print(f"\n[US EXCHANGES] Exchange ที่ Map เป็น US:")
            us_exchanges = {ex: info for ex, info in exchange_counts.items() if info["market"] == "US"}
            if us_exchanges:
                total_us = sum(info["count"] for info in us_exchanges.values())
                print(f"  พบ {len(us_exchanges)} unique exchanges, รวม {total_us} tickers")
                for exchange, info in sorted(us_exchanges.items(), key=lambda x: x[1]["count"], reverse=True):
                    print(f"    {exchange:60s}: {info['count']:3d} tickers")
            else:
                print("  ไม่พบ exchange ที่ map เป็น US")
            
            # ตรวจสอบ HK exchanges
            print(f"\n[HK EXCHANGES] Exchange ที่ Map เป็น HK:")
            hk_exchanges = {ex: info for ex, info in exchange_counts.items() if info["market"] == "HK"}
            if hk_exchanges:
                total_hk = sum(info["count"] for info in hk_exchanges.values())
                print(f"  พบ {len(hk_exchanges)} unique exchanges, รวม {total_hk} tickers")
                for exchange, info in sorted(hk_exchanges.items(), key=lambda x: x[1]["count"], reverse=True):
                    print(f"    {exchange:60s}: {info['count']:3d} tickers")
            else:
                print("  ไม่พบ exchange ที่ map เป็น HK")
            
            print("=" * 80 + "\n")
            
            return {
                "total_tickers": total_tickers,
                "market_counts": market_counts,
                "exchange_counts": exchange_counts,
            }
    except Exception as e:
        print(f"[MAPPING ANALYSIS] Error: {e}")
        import traceback
        traceback.print_exc()
        return None


async def fetch_market_history(market_code: str):
    """
    ดึงข้อมูล history สำหรับ market ที่ระบุ
    เรียกใช้เมื่อถึงเวลาปิดตลาดของ market นั้น
    """
    bkk_tz = ZoneInfo("Asia/Bangkok")
    now_thai = datetime.now(bkk_tz)
    
    print(f"[History] [{market_code}] Starting fetch at {now_thai.strftime('%Y-%m-%d %H:%M:%S')} ไทย")
    
    async with httpx.AsyncClient() as client:
        # Get DR list
        try:
            r_dr = await client.get(DR_LIST_URL, timeout=20)
            r_dr.raise_for_status()
            rows = r_dr.json().get("rows", [])
        except Exception as dr_e:
            print(f"[History] [{market_code}] Could not fetch DR list: {dr_e}")
            return
        
        # วิเคราะห์ข้อมูลทั้งหมดก่อน (แสดงครั้งแรกเท่านั้น)
        if not hasattr(fetch_market_history, "_analysis_done"):
            await analyze_all_tickers()
            fetch_market_history._analysis_done = True
        
        # Filter tickers for this market
        market_tickers = []
        all_exchanges = set()  # Debug: เก็บ exchange names ทั้งหมด
        total_from_dr = 0
        
        for item in rows:
            u_code = item.get("underlying") or (item.get("symbol") or "").replace("80", "").replace("19", "")
            if u_code:
                u_code = u_code.strip().upper()
                total_from_dr += 1
                exchange = item.get("underlyingExchange", "")
                if exchange:
                    all_exchanges.add(exchange)  # Debug: เก็บ exchange name
                ticker_market = market_code_from_exchange(exchange)
                if ticker_market == market_code:
                    market_tickers.append({
                        "u_code": u_code,
                        "u_name": item.get("underlyingName", ""),
                        "u_exch": exchange,
                        "dr_sym": item.get("symbol", ""),
                    })
        
        print(f"[History] [{market_code}] Total tickers from DR API: {total_from_dr}")
        print(f"[History] [{market_code}] Tickers mapped to {market_code}: {len(market_tickers)}")
        
        if not market_tickers:
            print(f"[History] [{market_code}] No tickers found for this market")
            # Debug: แสดง exchange names ที่มี (เฉพาะที่อาจเกี่ยวข้อง)
            upper_exchanges = [ex.upper() for ex in all_exchanges]
            if market_code in ["NL", "IT"]:
                relevant_exchanges = [ex for ex in upper_exchanges if any(k in ex for k in ("AMSTERDAM", "NETHERLANDS", "MILAN", "ITALY", "EURONEXT"))]
                if relevant_exchanges:
                    print(f"[History] [{market_code}] Debug (EU): {', '.join(sorted(relevant_exchanges))}")
            elif market_code == "HK":
                # Debug: แสดง exchange ทั้งหมดที่ map เป็น HK
                hk_exchanges_found = []
                for ex in all_exchanges:
                    mapped = market_code_from_exchange(ex)
                    if mapped == "HK":
                        hk_exchanges_found.append(ex)
                if hk_exchanges_found:
                    print(f"[History] [HK] Debug: Found {len(hk_exchanges_found)} exchanges that map to HK:")
                    for ex in sorted(set(hk_exchanges_found))[:10]:
                        print(f"[History] [HK]   - {ex}")
                # Debug: แสดง exchange ที่มีคำว่า HONG, HK, HKEX แต่ไม่ map เป็น HK
                relevant_exchanges = [ex for ex in upper_exchanges if any(k in ex for k in ("HONG", "HK", "HKEX", "SEHK"))]
                if relevant_exchanges:
                    print(f"[History] [HK] Debug: Exchanges containing HONG/HK/HKEX keywords: {len(relevant_exchanges)}")
                    non_hk_exchanges = []
                    for ex in relevant_exchanges:
                        mapped = market_code_from_exchange(ex)
                        if mapped != "HK":
                            non_hk_exchanges.append(f"{ex} -> {mapped}")
                    if non_hk_exchanges:
                        print(f"[History] [HK] Warning: {len(non_hk_exchanges)} exchanges with HK keywords but mapped to other market:")
                        for ex_map in non_hk_exchanges[:5]:
                            print(f"[History] [HK]   - {ex_map}")
                else:
                    print(f"[History] [HK] Debug: No exchanges found with HONG/HK/HKEX keywords")
            elif market_code == "VN":
                relevant_exchanges = [ex for ex in upper_exchanges if any(k in ex for k in ("VIET", "HOCHIMINH", "HOSE", "HNX"))]
                if relevant_exchanges:
                    print(f"[History] [VN] Debug exchanges: {', '.join(sorted(relevant_exchanges))}")
            elif market_code == "US":
                # Debug สำหรับ US: แสดง exchange ทั้งหมดที่ map เป็น US
                us_exchanges_found = []
                for ex in all_exchanges:
                    mapped = market_code_from_exchange(ex)
                    if mapped == "US":
                        us_exchanges_found.append(ex)
                if us_exchanges_found:
                    print(f"[History] [US] Debug: Found {len(us_exchanges_found)} exchanges that map to US:")
                    for ex in sorted(set(us_exchanges_found))[:10]:
                        print(f"[History] [US]   - {ex}")
                # แสดง exchange ที่ไม่ map เป็น US (เพื่อ debug)
                non_us_exchanges = [ex for ex in all_exchanges if market_code_from_exchange(ex) != "US"]
                if non_us_exchanges:
                    print(f"[History] [US] Debug: {len(non_us_exchanges)} exchanges that DON'T map to US (sample):")
                    for ex in sorted(set(non_us_exchanges))[:5]:
                        mapped = market_code_from_exchange(ex)
                        print(f"[History] [US]   - {ex} -> {mapped}")
            else:
                if upper_exchanges:
                    print(f"[History] [{market_code}] Debug exchanges sample: {', '.join(sorted(upper_exchanges)[:10])}")
            return
        
        print(f"[History] [{market_code}] Found {len(market_tickers)} tickers")
        
        # Debug: แสดง exchange distribution สำหรับ US
        if market_code == "US":
            exchange_dist = {}
            for item in market_tickers:
                ex = item.get("u_exch", "") or "NULL"
                if ex not in exchange_dist:
                    exchange_dist[ex] = 0
                exchange_dist[ex] += 1
            print(f"[History] [US] Exchange distribution:")
            for ex, count in sorted(exchange_dist.items(), key=lambda x: x[1], reverse=True):
                print(f"[History] [US]   {ex:60s}: {count:3d} tickers")
        
        con = None
        max_retries = 5
        retry_delay = 0.5  # seconds
        session_id = "concurrent-db-check"
        run_id = "run1"
        
        # #region agent log
        debug_log(session_id, run_id, "A", f"fetch_market_history:{market_code}:connection_start", 
                  f"Starting connection for {market_code}", {"market_code": market_code, "timestamp": now_thai.isoformat()})
        # #endregion
        
        for retry in range(max_retries):
            try:

                debug_log(session_id, run_id, "B", f"fetch_market_history:{market_code}:before_connect",
                          f"Before connecting to DB for {market_code}", {"market_code": market_code, "retry": retry})
                # #endregion
                
                con = sqlite3.connect(DB_FILE, timeout=3)  # ลด timeout เป็น 5 วินาที (ลด lock time)
                con.row_factory = sqlite3.Row
                cur = con.cursor()
                
                cur.execute("PRAGMA journal_mode=WAL")
                wal_result = cur.fetchone()
                
                # #region agent log
                debug_log(session_id, run_id, "B", f"fetch_market_history:{market_code}:after_wal",
                          f"WAL mode set for {market_code}", {"market_code": market_code, "wal_mode": wal_result[0] if wal_result else "unknown"})
                # #endregion
                
                # ตั้ง timeout สำหรับ database lock (ลดลงเพื่อลด lock time)
                cur.execute("PRAGMA busy_timeout=2000")  # 2 seconds timeout (ลดจาก 30 วินาที)
                # ปรับเพิ่ม cache size เพื่อ performance
                cur.execute("PRAGMA cache_size=-64000")  # 64MB cache
                
                # #region agent log
                debug_log(session_id, run_id, "C", f"fetch_market_history:{market_code}:connection_success",
                          f"Connection established for {market_code}", {"market_code": market_code, "retry": retry})
                # #endregion
                
                break  # Connection successful, exit retry loop
            except sqlite3.OperationalError as e:
                # #region agent log
                debug_log(session_id, run_id, "D", f"fetch_market_history:{market_code}:connection_error",
                          f"Database connection error for {market_code}", {"market_code": market_code, "error": str(e), "retry": retry, "is_locked": "locked" in str(e).lower()})
                # #endregion
                
                if "locked" in str(e).lower() and retry < max_retries - 1:
                    print(f"[History] [{market_code}] Database locked, retrying in {retry_delay}s (attempt {retry + 1}/{max_retries})...")
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                    if con:
                        con.close()
                else:
                    raise
        
        try:
            fetched_count = 0
            skipped_count = 0
            fetched_tickers = []  # เก็บ list ของ tickers ที่เพิ่ง upsert สำเร็จ (สำหรับคำนวณ accuracy)
            
            for item in market_tickers:
                ticker = item.get("u_code")
                exchange = item.get("u_exch") or ""
                
                # ใช้วันที่ของ now_thai โดยตรง (ไม่ใช้ get_market_close_thai เพราะอาจคำนวณผิด)
                date_str = now_thai.date().isoformat()
                ts_str = now_thai.replace(tzinfo=None).isoformat()
                cur.execute(
                    """
                    SELECT 1 FROM rating_history
                    WHERE ticker=? AND strftime('%Y-%m-%d', timestamp)=?
                    LIMIT 1
                    """,
                    (ticker, date_str),
                )
                if cur.fetchone():
                    skipped_count += 1
                    continue
                
                # Fetch data from TradingView
                res = await fetch_single_ticker_for_history(client, item)
                if not res.get("success"):
                    print(f"[History] [{market_code}] Failed to fetch {ticker}: {res.get('error', 'Unknown error')}")
                    continue
                
                data = res["data"]
                daily_val = data.get("daily_val")
                weekly_val = data.get("weekly_val")
                daily_rating = data.get("daily_rating")
                weekly_rating = data.get("weekly_rating")
                
                if (not daily_rating or daily_rating == "Unknown") and (
                    not weekly_rating or weekly_rating == "Unknown"
                ):
                    print(f"[History] [{market_code}] Warning: {ticker} has both daily and weekly as Unknown, but will still be saved")
                
                market_data = {
                    "currency": data.get("currency", ""),
                    "price": data.get("market_data", {}).get("price"),
                    "change_pct": data.get("market_data", {}).get("change_pct"),
                    "change_abs": data.get("market_data", {}).get("change_abs"),
                    "high": data.get("market_data", {}).get("high"),
                    "low": data.get("market_data", {}).get("low"),
                }
                
                # Retry upsert with exponential backoff if database is locked
                upsert_success = False
                # #region agent log
                debug_log(session_id, run_id, "E", f"fetch_market_history:{market_code}:before_upsert",
                          f"Before upsert for {ticker}", {"market_code": market_code, "ticker": ticker})
                # #endregion
                
                for upsert_retry in range(3):
                    try:
                        upsert_history_snapshot(
                            cur,
                            ticker=ticker,
                            market_code=market_code,
                            snapshot_ts_thai=now_thai,
                            daily_val=daily_val,
                            daily_rating=daily_rating,
                            weekly_val=weekly_val,
                            weekly_rating=weekly_rating,
                            exchange=exchange,
                            market_data=market_data,
                        )
                        upsert_success = True
                        # #region agent log
                        debug_log(session_id, run_id, "E", f"fetch_market_history:{market_code}:upsert_success",
                                  f"Upsert successful for {ticker}", {"market_code": market_code, "ticker": ticker, "retry": upsert_retry})
                        # #endregion
                        break
                    except sqlite3.OperationalError as e:
                        # #region agent log
                        debug_log(session_id, run_id, "E", f"fetch_market_history:{market_code}:upsert_error",
                                  f"Upsert error for {ticker}", {"market_code": market_code, "ticker": ticker, "error": str(e), "retry": upsert_retry, "is_locked": "locked" in str(e).lower()})
                        # #endregion
                        
                        if "locked" in str(e).lower() and upsert_retry < 2:
                            await asyncio.sleep(0.2 * (upsert_retry + 1))  # 0.2s, 0.4s, 0.6s
                            continue
                        else:
                            raise
                
                if upsert_success:
                    fetched_count += 1
                    # เก็บ ticker, timestamp, price, change_pct สำหรับคำนวณ accuracy ภายหลัง
                    ts_str = now_thai.replace(tzinfo=None).isoformat()
                    fetched_tickers.append({
                        "ticker": ticker,
                        "timestamp": ts_str,
                        "price": market_data.get("price"),
                        "change_pct": market_data.get("change_pct"),
                        "currency": market_data.get("currency"),
                        "high": market_data.get("high"),
                        "low": market_data.get("low")
                    })
                else:
                    print(f"[History] [{market_code}] Failed to upsert {ticker} after retries")
                
                # Small delay between requests
                await asyncio.sleep(0.1)
            
            # Commit with retry
            commit_success = False
            # #region agent log
            debug_log(session_id, run_id, "F", f"fetch_market_history:{market_code}:before_commit",
                      f"Before commit for {market_code}", {"market_code": market_code, "fetched_count": fetched_count})
            # #endregion
            
            for commit_retry in range(3):
                try:
                    con.commit()
                    commit_success = True
                    # #region agent log
                    debug_log(session_id, run_id, "F", f"fetch_market_history:{market_code}:commit_success",
                              f"Commit successful for {market_code}", {"market_code": market_code, "retry": commit_retry})
                    # #endregion
                    break
                except sqlite3.OperationalError as e:
                    # #region agent log
                    debug_log(session_id, run_id, "F", f"fetch_market_history:{market_code}:commit_error",
                              f"Commit error for {market_code}", {"market_code": market_code, "error": str(e), "retry": commit_retry, "is_locked": "locked" in str(e).lower()})
                    # #endregion
                    
                    if "locked" in str(e).lower() and commit_retry < 2:
                        await asyncio.sleep(0.5 * (commit_retry + 1))
                        continue
                    else:
                        raise
            
            if commit_success:
                print(f"[History] [{market_code}] Completed: {fetched_count} fetched, {skipped_count} skipped (already exist)")
                # #region agent log
                debug_log(session_id, run_id, "G", f"fetch_market_history:{market_code}:completed",
                          f"Fetch completed for {market_code}", {"market_code": market_code, "fetched_count": fetched_count, "skipped_count": skipped_count})

                if fetched_tickers:
                    print(f"[Accuracy] [{market_code}] Calculating accuracy for {len(fetched_tickers)} tickers...")
                    accuracy_calculated = 0
                    accuracy_errors = 0
                    # ปิด connection เดิมก่อน (เพื่อไม่ให้ block)
                    con.close()
                    con = None
                    
                    # Batch size: commit ทุก 10 tickers (ลด lock time แต่ยังคงมี atomicity ในระดับ batch)
                    BATCH_SIZE = 10
                    failed_tickers = []  # เก็บ tickers ที่ error สำหรับ retry
                    
                    for batch_start in range(0, len(fetched_tickers), BATCH_SIZE):
                        batch_end = min(batch_start + BATCH_SIZE, len(fetched_tickers))
                        batch_tickers = fetched_tickers[batch_start:batch_end]
                        
                        # สร้าง connection ใหม่สำหรับแต่ละ batch
                        batch_con = None
                        try:
                            batch_con = sqlite3.connect(DB_FILE, timeout=3)  # ลด timeout เป็น 3 วินาที
                            batch_cur = batch_con.cursor()
                            batch_cur.execute("PRAGMA journal_mode=WAL")
                            batch_cur.execute("PRAGMA busy_timeout=1000")  # ลดเป็น 1 วินาที
                            
                            batch_success = True
                            for ticker_info in batch_tickers:
                                try:
                                    calculate_and_save_accuracy_for_ticker(
                                        batch_cur, 
                                        ticker_info["ticker"], 
                                        ticker_info["timestamp"],
                                        ticker_info["price"],
                                        ticker_info["change_pct"],
                                        ticker_info.get("currency"),
                                        ticker_info.get("high"),
                                        ticker_info.get("low"),
                                        window_days=90
                                    )
                                except Exception as ticker_e:
                                    print(f"[Accuracy] [{market_code}] Error calculating accuracy for {ticker_info['ticker']}: {ticker_e}")
                                    failed_tickers.append(ticker_info)
                                    batch_success = False
                                    # Rollback transaction สำหรับ batch นี้
                                    batch_con.rollback()
                                    break
                            
                            # Commit batch ถ้าทุก ticker สำเร็จ
                            if batch_success:
                                batch_con.commit()
                                accuracy_calculated += len(batch_tickers)
                            else:
                                # Batch failed - tickers ใน batch นี้จะถูกเก็บไว้สำหรับ retry
                                accuracy_errors += len(batch_tickers)
                                
                        except Exception as batch_e:
                            print(f"[Accuracy] [{market_code}] Error in batch ({batch_start}-{batch_end}): {batch_e}")
                            failed_tickers.extend(batch_tickers)
                            accuracy_errors += len(batch_tickers)
                        finally:
                            if batch_con:
                                batch_con.close()
                    
                    # Retry failed tickers ทีละตัว (connection แยก) เพื่อให้มีข้อมูลครบถ้วน
                    if failed_tickers:
                        print(f"[Accuracy] [{market_code}] Retrying {len(failed_tickers)} failed tickers individually...")
                        for ticker_info in failed_tickers:
                            retry_con = None
                            try:
                                retry_con = sqlite3.connect(DB_FILE, timeout=3)  # ลด timeout เป็น 3 วินาที
                                retry_cur = retry_con.cursor()
                                retry_cur.execute("PRAGMA journal_mode=WAL")
                                retry_cur.execute("PRAGMA busy_timeout=1000")  # ลดเป็น 1 วินาที
                                
                                calculate_and_save_accuracy_for_ticker(
                                    retry_cur, 
                                    ticker_info["ticker"], 
                                    ticker_info["timestamp"],
                                    ticker_info["price"],
                                    ticker_info["change_pct"],
                                    ticker_info.get("currency"),
                                    ticker_info.get("high"),
                                    ticker_info.get("low"),
                                    window_days=90
                                )
                                retry_con.commit()
                                accuracy_calculated += 1
                                accuracy_errors -= 1
                                print(f"[Accuracy] [{market_code}] ✅ Retry successful for {ticker_info['ticker']}")
                            except Exception as retry_e:
                                print(f"[Accuracy] [{market_code}] ❌ Retry failed for {ticker_info['ticker']}: {retry_e}")
                            finally:
                                if retry_con:
                                    retry_con.close()
                    
                    print(f"[Accuracy] [{market_code}] Completed: {accuracy_calculated}/{len(fetched_tickers)} tickers saved, {accuracy_errors} errors")
            else:
                print(f"[History] [{market_code}] Warning: Failed to commit after retries")
            
            # Debug: ตรวจสอบว่ามี ticker ไหนที่ยังไม่มีใน rating_history (เฉพาะ US)
            # ใช้ connection ใหม่สำหรับ debug query เพื่อไม่ให้ block
            if market_code == "US" and fetched_count + skipped_count < len(market_tickers):
                debug_con = None
                try:
                    debug_con = sqlite3.connect(DB_FILE, timeout=5.0)
                    debug_cur = debug_con.cursor()
                    debug_cur.execute("PRAGMA journal_mode=WAL")
                    date_str = now_thai.date().isoformat()
                    debug_cur.execute("""
                        SELECT DISTINCT ticker FROM rating_history
                        WHERE market = 'US' AND strftime('%Y-%m-%d', timestamp) = ?
                    """, (date_str,))
                    existing_tickers = {row[0] for row in debug_cur.fetchall()}
                    missing_tickers = [item["u_code"] for item in market_tickers if item["u_code"] not in existing_tickers]
                    if missing_tickers:
                        print(f"[History] [US] Warning: {len(missing_tickers)} tickers not inserted into rating_history:")
                        for ticker in missing_tickers[:10]:
                            print(f"[History] [US]   - {ticker}")
                        if len(missing_tickers) > 10:
                            print(f"[History] [US]   ... and {len(missing_tickers) - 10} more")
                finally:
                    if debug_con:
                        debug_con.close()
            
        except Exception as e:
            print(f"[History] [{market_code}] Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if con:
                con.close()


async def market_scheduler(market_code: str):

    bkk_tz = ZoneInfo("Asia/Bangkok")
    
    while True:
        try:
            now_thai = datetime.now(bkk_tz)
            cfg = MARKET_CLOSE_CONFIG.get(market_code, MARKET_CLOSE_CONFIG["US"])
            
            # ตรวจสอบฤดูกาล
            is_summer = is_summer_time(now_thai)
            if "winter" in cfg and "summer" in cfg:
                close_time = cfg["summer"] if is_summer else cfg["winter"]
            else:
                close_time = cfg.get("winter") or cfg.get("summer") or time(3, 0)
            
            # คำนวณเวลาปิดตลาดของวันนี้
            today = now_thai.date()
            close_today = datetime.combine(today, close_time, tzinfo=bkk_tz)
            
            # ถ้าเวลาปิดตลาดผ่านไปแล้ว ให้ใช้ของวันถัดไป
            if close_today <= now_thai:
                close_today = close_today + timedelta(days=1)
            
            # คำนวณเวลาที่เหลือจนถึงเวลาปิดตลาด
            wait_seconds = (close_today - now_thai).total_seconds()
            
            print(f"[Scheduler] [{market_code}] Next fetch at {close_today.strftime('%Y-%m-%d %H:%M:%S')} ไทย (in {wait_seconds/60:.1f} minutes)")
            
            # Sleep จนถึงเวลาปิดตลาด
            await asyncio.sleep(wait_seconds)
            
            # เมื่อถึงเวลา → ดึงข้อมูลทันที (สามารถดึงพร้อมกับ market อื่นได้)
            # ใช้ WAL mode + connection แยก + retry logic เพื่อรองรับ concurrent access
            await fetch_market_history(market_code)
            
        except Exception as e:
            print(f"[Scheduler] [{market_code}] Error: {e}")
            import traceback
            traceback.print_exc()
            # ถ้าเกิด error ให้รอ 1 นาทีแล้วลองใหม่
            await asyncio.sleep(60)


async def accuracy_updater():

    bkk_tz = ZoneInfo("Asia/Bangkok")
    
    while True:
        try:
            # Wait until next day at 05:00 Thai time (after all markets close)
            now_thai = datetime.now(bkk_tz)
            today = now_thai.date()
            
            # Target time: 05:00 next day (after all markets close)
            next_run = datetime.combine(today, time(5, 0), tzinfo=bkk_tz)
            if next_run <= now_thai:
                next_run = next_run + timedelta(days=1)
            
            wait_seconds = (next_run - now_thai).total_seconds()
            print(f"[Accuracy Updater] Next run at {next_run.strftime('%Y-%m-%d %H:%M:%S')} ไทย (in {wait_seconds/3600:.1f} hours)")
            
            await asyncio.sleep(wait_seconds)
            
            # Calculate accuracy for all tickers
            print("[Accuracy Updater] Starting accuracy recalculation...")
            
            try:
                con = sqlite3.connect(DB_FILE)
                cur = con.cursor()
                
                # Enable WAL mode for better concurrency
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA busy_timeout=30000")
                
                # Get all unique tickers
                cur.execute("SELECT DISTINCT ticker FROM rating_main")
                tickers = [row[0] for row in cur.fetchall()]
                
                con.close()
                
                print(f"[Accuracy Updater] Found {len(tickers)} tickers to process")
                
                # Recalculate for each ticker
                for ticker in tickers:
                    try:
                        # Recalculate for both timeframes
                        recalc_and_save_accuracy_for_ticker(ticker, "1D", 90)
                        recalc_and_save_accuracy_for_ticker(ticker, "1W", 90)
                    except Exception as e:
                        print(f"[Accuracy Updater] Error processing {ticker}: {e}")
                    
                    # Small delay between tickers
                    await asyncio.sleep(0.5)
                
                print(f"[Accuracy Updater] Completed recalculation for {len(tickers)} tickers")
                
            except Exception as e:
                print(f"[Accuracy Updater] Error during recalculation: {e}")
                import traceback
                traceback.print_exc()
                
        except Exception as e:
            print(f"[Accuracy Updater] Fatal error: {e}")
            import traceback
            traceback.print_exc()
            # If error, wait 1 hour before retry
            await asyncio.sleep(3600)

async def history_updater():
    """
    เริ่ม scheduler สำหรับทุก market
    แต่ละ market จะมี scheduler ของตัวเองที่รันแยกกัน
    """
    # วิเคราะห์ข้อมูลทั้งหมดเมื่อเริ่มต้นระบบ
    print("\n[History] Initializing history updater...")
    await analyze_all_tickers()
    
    # เริ่ม scheduler สำหรับทุก market
    markets = list(MARKET_CLOSE_CONFIG.keys())
    print(f"[History] Starting schedulers for {len(markets)} markets: {', '.join(markets)}")
    
    # สร้าง task สำหรับแต่ละ market
    tasks = [asyncio.create_task(market_scheduler(market_code)) for market_code in markets]
    
    # รอให้ทุก task รัน (จะรันตลอดไป)
    await asyncio.gather(*tasks)

# --- FastAPI Setup ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    """On startup, initialize DB, migrate data, and start background task."""
    init_database()
    migrate_from_json_if_needed()
    
    # Populate accuracy data สำหรับข้อมูลที่มีใน rating_history แล้ว
    print("\n[Startup] Populating accuracy data from existing rating_history...")
    populate_accuracy_on_startup()
    
    asyncio.create_task(background_updater())
    asyncio.create_task(history_updater())
    # accuracy_updater removed - accuracy is now calculated immediately when rating_history is updated
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/test_high")
def test_high():
    return {"status": "high", "message": "High priority route"}

# Simple health check endpoint
@app.get("/")
def root():
    return {"status": "ok", "message": "Ratings API is running"}

def calculate_accuracy_from_rating_change(history_rows, window_days=90):

    if not history_rows:
        return {
            "daily": {"rating": None, "prev": None, "sample_size": 0, "correct": 0, "incorrect": 0, "accuracy": 0.0},
            "weekly": {"rating": None, "prev": None, "sample_size": 0, "correct": 0, "incorrect": 0, "accuracy": 0.0}
        }
    
    # คำนวณ daily accuracy
    daily_correct = 0
    daily_incorrect = 0
    daily_rating = None
    daily_prev = None
    
    for row in history_rows:
        if "daily_rating" not in row.keys() or "daily_prev" not in row.keys() or "change_pct" not in row.keys():
            continue
            
        rating = row["daily_rating"]
        prev_rating = row["daily_prev"]
        change_pct = row["change_pct"] if row["change_pct"] is not None else None
        
        # Skip if missing data
        if not rating or not prev_rating or change_pct is None:
            continue
        
        rating_lower = rating.lower()
        prev_rating_lower = prev_rating.lower()
        
        # Skip Neutral and Unknown
        if rating_lower in ["neutral", "unknown", ""] or prev_rating_lower in ["neutral", "unknown", ""]:
            continue
        
        # เก็บ rating และ prev_rating ล่าสุด (สำหรับแสดงผล)
        if daily_rating is None:
            daily_rating = rating
            daily_prev = prev_rating
        
        # ตรวจสอบการเปลี่ยนแปลง rating และ change_pct
        is_correct = False
        
        # ถ้าเปลี่ยนจาก sell/strong sell -> buy/strong buy และ change_pct > 0 = correct
        if prev_rating_lower in ["sell", "strong sell"] and rating_lower in ["buy", "strong buy"]:
            is_correct = change_pct > 0
        # ถ้าเปลี่ยนจาก buy/strong buy -> sell/strong sell และ change_pct < 0 = correct
        elif prev_rating_lower in ["buy", "strong buy"] and rating_lower in ["sell", "strong sell"]:
            is_correct = change_pct < 0
        # ถ้า rating ไม่เปลี่ยน (เช่น buy -> buy หรือ sell -> sell) ไม่นับ
        elif rating_lower == prev_rating_lower:
            continue
        
        if is_correct:
            daily_correct += 1
        else:
            daily_incorrect += 1
    
    daily_total = daily_correct + daily_incorrect
    daily_accuracy = (daily_correct / daily_total * 100) if daily_total > 0 else 0.0
    
    # คำนวณ weekly accuracy (logic เดียวกัน)
    weekly_correct = 0
    weekly_incorrect = 0
    weekly_rating = None
    weekly_prev = None
    
    for row in history_rows:
        if "weekly_rating" not in row.keys() or "weekly_prev" not in row.keys() or "change_pct" not in row.keys():
            continue
            
        rating = row["weekly_rating"]
        prev_rating = row["weekly_prev"]
        change_pct = row["change_pct"] if row["change_pct"] is not None else None
        
        # Skip if missing data
        if not rating or not prev_rating or change_pct is None:
            continue
        
        rating_lower = rating.lower()
        prev_rating_lower = prev_rating.lower()
        
        # Skip Neutral and Unknown
        if rating_lower in ["neutral", "unknown", ""] or prev_rating_lower in ["neutral", "unknown", ""]:
            continue
        
        # เก็บ rating และ prev_rating ล่าสุด (สำหรับแสดงผล)
        if weekly_rating is None:
            weekly_rating = rating
            weekly_prev = prev_rating
        
        # ตรวจสอบการเปลี่ยนแปลง rating และ change_pct
        is_correct = False
        
        # ถ้าเปลี่ยนจาก sell/strong sell -> buy/strong buy และ change_pct > 0 = correct
        if prev_rating_lower in ["sell", "strong sell"] and rating_lower in ["buy", "strong buy"]:
            is_correct = change_pct > 0
        # ถ้าเปลี่ยนจาก buy/strong buy -> sell/strong sell และ change_pct < 0 = correct
        elif prev_rating_lower in ["buy", "strong buy"] and rating_lower in ["sell", "strong sell"]:
            is_correct = change_pct < 0
        # ถ้า rating ไม่เปลี่ยน (เช่น buy -> buy หรือ sell -> sell) ไม่นับ
        elif rating_lower == prev_rating_lower:
            continue
        
        if is_correct:
            weekly_correct += 1
        else:
            weekly_incorrect += 1
    
    weekly_total = weekly_correct + weekly_incorrect
    weekly_accuracy = (weekly_correct / weekly_total * 100) if weekly_total > 0 else 0.0
    
    return {
        "daily": {
            "rating": daily_rating,
            "prev": daily_prev,
            "sample_size": daily_total,
            "correct": daily_correct,
            "incorrect": daily_incorrect,
            "accuracy": round(daily_accuracy, 2)
        },
        "weekly": {
            "rating": weekly_rating,
            "prev": weekly_prev,
            "sample_size": weekly_total,
            "correct": weekly_correct,
            "incorrect": weekly_incorrect,
            "accuracy": round(weekly_accuracy, 2)
        }
    }

def save_accuracy_to_db_new(cur, ticker, timestamp, price, price_prev, change_pct, currency, high, low, window_days, accuracy_result):
    """
    บันทึก accuracy ลงในตาราง rating_accuracy (โครงสร้างใหม่)
    
    Args:
        cur: Database cursor
        ticker: Stock ticker
        timestamp: Timestamp (ISO format string)
        price: Current price (from rating_history at this timestamp)
        price_prev: Previous price (from rating_history at previous timestamp)
        change_pct: Price change percentage
        currency: Currency code
        high: High price
        low: Low price
        window_days: Number of days for the window
        accuracy_result: dict from calculate_accuracy_from_rating_change
    """
    cur.execute("""
        INSERT OR REPLACE INTO rating_accuracy 
        (ticker, timestamp, price, price_prev, change_pct, currency, high, low, window_day,
         daily_rating, daily_prev, samplesize_daily, correct_daily, incorrect_daily, accuracy_daily,
         weekly_rating, weekly_prev, samplesize_weekly, correct_weekly, incorrect_weekly, accuracy_weekly)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ticker.upper(),
        timestamp,
        price,
        price_prev,
        change_pct,
        currency or "",
        high,
        low,
        window_days,
        accuracy_result["daily"]["rating"],
        accuracy_result["daily"]["prev"],
        accuracy_result["daily"]["sample_size"],
        accuracy_result["daily"]["correct"],
        accuracy_result["daily"]["incorrect"],
        accuracy_result["daily"]["accuracy"],
        accuracy_result["weekly"]["rating"],
        accuracy_result["weekly"]["prev"],
        accuracy_result["weekly"]["sample_size"],
        accuracy_result["weekly"]["correct"],
        accuracy_result["weekly"]["incorrect"],
        accuracy_result["weekly"]["accuracy"]
    ))

def calculate_and_save_accuracy_for_ticker(cur, ticker, timestamp_str, price, change_pct, currency=None, high=None, low=None, window_days=90):

    try:
        # ดึงข้อมูล history จาก rating_history (ย้อนหลัง window_days วัน)
        # ใช้ datetime() function ใน SQLite กับ parameter
        cur.execute("""
            SELECT 
                daily_rating, daily_prev, daily_changed_at, change_pct,
                weekly_rating, weekly_prev, weekly_changed_at
            FROM rating_history
            WHERE ticker=? AND timestamp >= datetime(?, '-{} days')
            ORDER BY timestamp DESC
        """.format(window_days), (ticker.upper(), timestamp_str))
        
        history_rows = cur.fetchall()
        
        if not history_rows:
            return
        
        # คำนวณ accuracy
        accuracy_result = calculate_accuracy_from_rating_change(history_rows, window_days)
        
        # ดึง price_prev จาก rating_history (timestamp ก่อนล่าสุด)
        price_prev = None
        cur.execute("""
            SELECT price
            FROM rating_history
            WHERE ticker=? AND timestamp < ?
            ORDER BY timestamp DESC
            LIMIT 1
        """, (ticker.upper(), timestamp_str))
        prev_row = cur.fetchone()
        if prev_row:
            price_prev = prev_row["price"] if "price" in prev_row.keys() else None
        
        # บันทึกลงใน rating_accuracy
        save_accuracy_to_db_new(cur, ticker, timestamp_str, price, price_prev, change_pct, currency, high, low, window_days, accuracy_result)
        
    except Exception as e:
        print(f"⚠️ [Accuracy] Error calculating accuracy for {ticker}: {e}")
        import traceback
        traceback.print_exc()

def populate_accuracy_on_startup():
    """
    Populate accuracy data สำหรับทุก ticker ที่มีข้อมูลใน rating_history
    เรียกใช้ตอน startup เพื่อคำนวณ accuracy สำหรับข้อมูลที่มีอยู่แล้ว
    """
    try:
        con = sqlite3.connect(DB_FILE)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        
        # Enable WAL mode for better concurrency
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")

        cur.execute("""
            SELECT DISTINCT ticker, timestamp
            FROM rating_history
            ORDER BY ticker, timestamp DESC
        """)
        ticker_timestamps = cur.fetchall()
        
        if not ticker_timestamps:
            print("[Accuracy Startup] No ticker-timestamp pairs found in rating_history")
            con.close()
            return
        
        print(f"[Accuracy Startup] Found {len(ticker_timestamps)} ticker-timestamp pairs in rating_history, calculating accuracy...")
        
        populated_count = 0
        error_count = 0
        window_days = 90
        
        for row in ticker_timestamps:
            ticker = row["ticker"] if "ticker" in row.keys() else None
            timestamp_str = row["timestamp"] if "timestamp" in row.keys() else None
            
            if not ticker or not timestamp_str:
                continue
            
            try:
                # ดึงข้อมูลของ ticker นี้ที่ timestamp นี้จาก rating_history
                cur.execute("""
                    SELECT price, change_pct, currency, high, low
                    FROM rating_history
                    WHERE ticker=? AND timestamp=?
                    LIMIT 1
                """, (ticker, timestamp_str))
                
                row_data = cur.fetchone()
                if not row_data:
                    continue
                
                price = row_data["price"] if "price" in row_data.keys() else None
                change_pct = row_data["change_pct"] if "change_pct" in row_data.keys() else None
                currency = row_data["currency"] if "currency" in row_data.keys() else None
                high = row_data["high"] if "high" in row_data.keys() else None
                low = row_data["low"] if "low" in row_data.keys() else None
                
                # คำนวณและบันทึก accuracy
                calculate_and_save_accuracy_for_ticker(
                    cur, 
                    ticker, 
                    timestamp_str, 
                    price, 
                    change_pct,
                    currency,
                    high,
                    low,
                    window_days
                )
                
                populated_count += 1
                
                # Commit ทุก 100 records เพื่อไม่ให้ transaction ใหญ่เกินไป
                if populated_count % 100 == 0:
                    con.commit()
                    print(f"[Accuracy Startup] Progress: {populated_count} records processed...")
                    
            except Exception as e:
                error_count += 1
                print(f"[Accuracy Startup] Error processing {ticker} at {timestamp_str}: {e}")
                continue
        
        # Commit สุดท้าย
        con.commit()
        con.close()
        
        print(f"[Accuracy Startup] [OK] Completed: {populated_count} records populated, {error_count} errors")
        
    except Exception as e:
        print(f"[Accuracy Startup] [ERROR] Fatal error: {e}")
        import traceback
        traceback.print_exc()
        if 'con' in locals() and con:
            con.close()

def load_mock_aapl_data():
    try:
        mock_file = os.path.join(os.path.dirname(__file__), "mock_rating_history_aapl.json")
        if not os.path.exists(mock_file):
            return {"error": "Mock file not found", "path": mock_file}
        
        with open(mock_file, "r", encoding="utf-8") as f:
            mock_data = json.load(f)
        
        # Convert mock data to API format
        history = mock_data.get("history", [])
        
        # Get latest record (first one in history array - most recent)
        latest = history[0] if history else {}
        
        # Build daily history (เรียงจากใหม่ไปเก่า - descending)
        daily_history = []
        for h in reversed(history):  # Reverse เพื่อให้ใหม่สุดอยู่ก่อน
            if h.get("daily_rating") and h.get("daily_changed_at"):
                daily_history.append({
                    "rating": h["daily_rating"],
                    "timestamp": h["daily_changed_at"]
                })
        
        # Build weekly history (เรียงจากใหม่ไปเก่า - descending)
        weekly_history = []
        for h in reversed(history):  # Reverse เพื่อให้ใหม่สุดอยู่ก่อน
            if h.get("weekly_rating") and h.get("weekly_changed_at"):
                weekly_history.append({
                    "rating": h["weekly_rating"],
                    "timestamp": h["weekly_changed_at"]
                })
        
        # Return in same format as /ratings/from-dr-api
        return {
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "count": 1,
            "rows": [{
                "ticker": mock_data.get("ticker", "AAPL"),
                "currency": mock_data.get("currency", "USD"),
                "price": latest.get("price"),
                "changePercent": latest.get("change_pct"),
                "change": latest.get("change_abs"),
                "high": latest.get("high"),
                "low": latest.get("low"),
                "daily": {
                    "recommend_all": latest.get("daily_val"),
                    "rating": latest.get("daily_rating", "Unknown"),
                    "prev": latest.get("daily_prev", "Unknown"),
                    "changed_at": latest.get("daily_changed_at"),
                    "history": daily_history
                },
                "weekly": {
                    "recommend_all": latest.get("weekly_val"),
                    "rating": latest.get("weekly_rating", "Unknown"),
                    "prev": latest.get("weekly_prev", "Unknown"),
                    "changed_at": latest.get("weekly_changed_at"),
                    "history": weekly_history
                }
            }]
        }
    except Exception as e:
        print(f"❌ Mock API Error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

def get_rating_score(rating):

    if not rating:
        return 0
    rating_lower = rating.lower()
    if rating_lower == "strong buy":
        return 5
    elif rating_lower == "buy":
        return 4
    elif rating_lower == "neutral":
        return 3
    elif rating_lower == "sell":
        return 2
    elif rating_lower == "strong sell":
        return 1
    return 0

def calculate_accuracy_from_frontend_logic(history, filter_rating=None):
    """
    คำนวณ accuracy แบบ frontend logic
    - รับ history data (ไม่ว่าจะจาก mock หรือ database)
    - ถ้า filter_rating ระบุมา จะคำนวณเฉพาะสัญญาณที่ตรงกับ filter_rating
    - เปรียบเทียบ rating sentiment กับ price change
    
    Logic:
    1. เรียง history จากเก่าไปใหม่
    2. สำหรับแต่ละบรรทัด:
       - ถ้า rating ไม่เปลี่ยน (Buy→Buy, Sell→Sell):
         - Buy/Strong Buy rating + Price ↑ = Correct
         - Buy/Strong Buy rating + Price ↓ = Incorrect
         - Sell/Strong Sell rating + Price ↓ = Correct
         - Sell/Strong Sell rating + Price ↑ = Incorrect
       - ถ้า rating เปลี่ยน:
         - Rating ↑ + Price ↑ = Correct
         - Rating ↓ + Price ↓ = Correct
         - Rating ↑ + Price ↓ = Incorrect
         - Rating ↓ + Price ↑ = Incorrect
    """
    if not history or len(history) < 1:
        return {
            "accuracy": 0.0,
            "correct": 0,
            "incorrect": 0,
            "total": 0
        }
    
    # เรียงข้อมูลจากเก่าไปใหม่ (ปกติ history เป็นจากใหม่ไปเก่า)
    sorted_history = list(reversed(history))
    
    correct = 0
    incorrect = 0
    comparisons = []
    
    # ประมวลผลแต่ละรายการ
    for i in range(len(sorted_history)):
        curr_item = sorted_history[i]
        
        # ดึง rating ปัจจุบันและ rating ก่อนหน้า
        curr_rating = curr_item.get("rating", curr_item.get("daily_rating", "")).lower()
        prev_rating = curr_item.get("prev", curr_item.get("prev_rating", "")).lower()
        
        # ดึง change_pct
        change_pct = curr_item.get("change_pct", 0)
        
        # ข้ามถ้าไม่มี rating ปัจจุบันหรือ prev rating
        if not curr_rating or not prev_rating or change_pct is None:
            continue
        
        # ถ้ามี filter_rating ให้กรองเฉพาะ current rating ที่ตรงกับ filter_rating
        if filter_rating and curr_rating != filter_rating.lower():
            continue
        
        # ดึง rating scores
        curr_score = get_rating_score(curr_rating)
        prev_score = get_rating_score(prev_rating)
        rating_direction = curr_score - prev_score
        
        # กำหนด sentiment ของ rating (positive or negative)
        is_curr_positive = curr_score >= 4  # Buy, Strong Buy
        
        # ตรวจสอบว่าทำนายถูกหรือไม่
        is_correct = False
        
        if rating_direction == 0:
            # Rating ไม่เปลี่ยน (Buy→Buy, Sell→Sell)
            if is_curr_positive:
                # Buy/Strong Buy rating: ราคาควรขึ้น
                is_correct = change_pct > 0
            else:
                # Sell/Strong Sell rating: ราคาควรลง
                is_correct = change_pct < 0
        else:
            # Rating เปลี่ยน
            if rating_direction > 0 and change_pct > 0:
                # Rating ↑ และ ราคา ↑
                is_correct = True
            elif rating_direction < 0 and change_pct < 0:
                # Rating ↓ และ ราคา ↓
                is_correct = True
        
        # บันทึกการเปรียบเทียบเพื่อ debug
        comparisons.append({
            "prev_rating": prev_rating,
            "curr_rating": curr_rating,
            "rating_change": "→" if rating_direction == 0 else ("↑" if rating_direction > 0 else "↓"),
            "price_change": change_pct,
            "price_direction": "↑" if change_pct > 0 else "↓" if change_pct < 0 else "→",
            "result": "✓" if is_correct else "✗",
            "filter": filter_rating or "All"
        })
        
        if is_correct:
            correct += 1
        else:
            incorrect += 1
    
    total = correct + incorrect
    accuracy = (correct / total * 100) if total > 0 else 0.0
    
    print(f"[Accuracy Debug] Filter: {filter_rating or 'All'}, Comparisons: {len(comparisons)}, Details: {comparisons}")
    print(f"[Accuracy] Filter: {filter_rating or 'All'}, Correct: {correct}, Incorrect: {incorrect}, Total: {total}, Accuracy: {accuracy:.2f}%")
    
    return {
        "accuracy": round(accuracy, 2),
        "correct": correct,
        "incorrect": incorrect,
        "total": total
    }

def calculate_accuracy_from_mock_old(history):
    """
    คำนวณ accuracy โดยเปรียบเทียบการเปลี่ยนแปลงของ rating กับการเปลี่ยนแปลงของราคา
    
    วิธี:
    1. เอาวันที่ N (index i) เทียบกับวันที่ N+1 (index i+1)
    2. ดู rating ของวันที่ N และวันที่ N+1 -> ดูว่าเพิ่มขึ้น (+) หรือลดลง (-)
    3. ดู change_pct ของวันที่ N+1 -> ดูว่าราคาเพิ่มขึ้น (+) หรือลดลง (-)
    4. ถ้าทั้งสองเปลี่ยนไปในทางเดียวกัน = Correct, ถ้าไม่ = Incorrect
    """
    if not history or len(history) < 2:
        return {
            "accuracy": 0.0,
            "correct": 0,
            "incorrect": 0,
            "total": 0
        }
    
    correct = 0
    incorrect = 0
    comparisons = []
    
    sorted_history = list(reversed(history))
    
    # เทียบแต่ละวันกับวันถัดไป
    for i in range(len(sorted_history) - 1):
        curr_day = sorted_history[i]
        next_day = sorted_history[i + 1]

        curr_rating = curr_day.get("daily_rating", "")
        next_rating = next_day.get("daily_rating", "")

        next_change_pct = next_day.get("change_pct", 0)

        curr_price = curr_day.get("price", 0)
        next_price = next_day.get("price", 0)     

        if not curr_rating or not next_rating:
            continue
        
        # คำนวณการเปลี่ยนแปลงของ rating
        curr_score = get_rating_score(curr_rating)
        next_score = get_rating_score(next_rating)
        rating_direction = next_score - curr_score  # + = ขึ้น, - = ลง, 0 = ไม่เปลี่ยน
        
        # ข้ามถ้า rating ไม่เปลี่ยน
        if rating_direction == 0:
            continue
        
        # ตรวจสอบว่า rating และราคาเปลี่ยนไปในทางเดียวกันไหม
        # rating ขึ้น (+) และราคาขึ้น (+) = Correct
        # rating ลง (-) และราคาลง (-) = Correct
        # อื่นๆ = Incorrect
        
        is_correct = False
        if rating_direction > 0 and next_change_pct > 0:
            # Rating ขึ้น และราคาขึ้น
            is_correct = True
        elif rating_direction < 0 and next_change_pct < 0:
            # Rating ลง และราคาลง
            is_correct = True
        
        # บันทึกการเปรียบเทียบเพื่อ debug
        comparisons.append({
            "day1_rating": curr_rating,
            "day2_rating": next_rating,
            "rating_change": "↑" if rating_direction > 0 else "↓",
            "price_change": next_change_pct,
            "price_direction": "↑" if next_change_pct > 0 else "↓" if next_change_pct < 0 else "→",
            "result": "✓" if is_correct else "✗"
        })
        
        if is_correct:
            correct += 1
        else:
            incorrect += 1
    
    total = correct + incorrect
    accuracy = (correct / total * 100) if total > 0 else 0.0
    
    print(f"[Accuracy Debug] Comparisons: {comparisons}")
    print(f"[Accuracy] Correct: {correct}, Incorrect: {incorrect}, Total: {total}, Accuracy: {accuracy:.2f}%")
    
    return {
        "accuracy": round(accuracy, 2),
        "correct": correct,
        "incorrect": incorrect,
        "total": total
    }

def get_mock_aapl_history_formatted(timeframe="1D", filter_rating=None):
    """
    Helper function to format mock AAPL data for /ratings/history-with-accuracy endpoint
    
    Args:
        timeframe: "1D" or "1W"
        filter_rating: Optional rating filter ("Strong Buy", "Buy", "Sell", "Strong Sell")
    
    Note: วันแรก (29 DEC) ไม่มี prev rating เพราะเป็นข้อมูลแรกสุด 
    ดังนั้นจึงเริ่มแสดงจากวันที่ 2 (30 DEC) เป็นต้นไป
    """
    try:
        mock_file = os.path.join(os.path.dirname(__file__), "mock_rating_history_aapl.json")
        if not os.path.exists(mock_file):
            return {"error": "Mock file not found"}
        
        with open(mock_file, "r", encoding="utf-8") as f:
            mock_data = json.load(f)
        
        history = mock_data.get("history", [])
        
        if not history:
            return {
                "ticker": "AAPL",
                "currency": "USD",
                "price": 0,
                "changePercent": 0,
                "change": 0,
                "high": 0,
                "low": 0,
                "current_rating": "Unknown",
                "prev_rating": "Unknown",
                "history": [],
                "accuracy": {"accuracy": 0.0, "correct": 0, "incorrect": 0, "total": 0}
            }
        
        latest = history[0]
        
        # Determine rating key based on timeframe
        if timeframe == "1W":
            rating_key = "weekly_rating"
            prev_key = "weekly_prev"
            changed_at_key = "weekly_changed_at"
            val_key = "weekly_val"
        else:  # default to 1D
            rating_key = "daily_rating"
            prev_key = "daily_prev"
            changed_at_key = "daily_changed_at"
            val_key = "daily_val"

        history_items = []
        for idx in range(len(history) - 1):  # ข้ามวันสุดท้าย (เก่าสุด)
            h = history[idx]
            
            if h.get(rating_key) and h.get(changed_at_key):
                rating = h.get(rating_key)
                prev = h.get(prev_key)
                
                if not prev or prev.upper() == "NULL":
                    continue
                
                if rating and rating.lower() not in ["neutral", "unknown"]:
                    # Get previous price if available
                    prev_price = history[idx + 1].get("price", 0) if idx + 1 < len(history) else 0
                    
                    history_items.append({
                        "rating": rating,
                        "prev": prev or "Unknown",
                        "timestamp": h.get(changed_at_key),
                        "date": h.get(changed_at_key),
                        "prev_close": prev_price,
                        "result_price": h.get("price", 0),
                        "change_pct": h.get("change_pct", 0),
                        "change_abs": h.get("change_abs", 0)
                    })

        accuracy_result = calculate_accuracy_from_frontend_logic(history, filter_rating)
        
        return {
            "ticker": "AAPL",
            "currency": mock_data.get("currency", "USD"),
            "price": latest.get("price", 0),
            "changePercent": latest.get("change_pct", 0),
            "change": latest.get("change_abs", 0),
            "high": latest.get("high", 0),
            "low": latest.get("low", 0),
            "current_rating": latest.get(rating_key, "Unknown"),
            "prev_rating": latest.get(prev_key, "Unknown"),
            "history": history_items,
            "accuracy": accuracy_result
        }
    except Exception as e:
        print(f"❌ Mock History Format Error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

def recalc_and_save_accuracy_for_ticker(ticker, timeframe="1D", window_days=90):
    """
    Recalculate and save accuracy for a specific ticker.
    This function can be called periodically to update accuracy metrics.
    
    Args:
        ticker: Stock ticker
        timeframe: "1D" or "1W"
        window_days: Number of days to look back (default 90)
    """
    try:
        con = sqlite3.connect(DB_FILE)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        
        # Enable WAL mode for better concurrency
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")
        
        rating_key = "daily_rating" if timeframe == "1D" else "weekly_rating"
        prev_key = "daily_prev" if timeframe == "1D" else "weekly_prev"
        changed_at_key = "daily_changed_at" if timeframe == "1D" else "weekly_changed_at"
        
        # Get history for the specified window
        cur.execute(f"""
            SELECT 
                daily_rating, daily_prev, daily_changed_at, change_pct,
                weekly_rating, weekly_prev, weekly_changed_at
            FROM rating_history
            WHERE ticker=? AND timestamp >= datetime('now', '-{window_days} days')
            ORDER BY timestamp DESC
        """, (ticker.upper(),))
        
        history_rows = cur.fetchall()
        
        if not history_rows:
            con.close()
            return
        
        # Build history items (same logic as in endpoint)
        history_items = []
        for h in history_rows:
            if rating_key not in h.keys() or changed_at_key not in h.keys() or "change_pct" not in h.keys():
                continue
                
            rating = h[rating_key]
            prev_rating = h[prev_key] if prev_key in h.keys() else None
            changed_at = h[changed_at_key]
            change_pct = h["change_pct"]
            
            if not rating or not changed_at or change_pct is None:
                continue
            
            rating_lower = rating.lower()
            if rating_lower == "neutral" or rating_lower == "unknown":
                continue
            
            if prev_rating and prev_rating.lower() == "unknown":
                continue
            
            history_items.append({
                "rating": rating,
                "prev": prev_rating or "Unknown",
                "change_pct": change_pct
            })
        
        # Calculate accuracy for all ratings and each filter
        rating_filters = [None, "Strong Buy", "Buy", "Sell", "Strong Sell"]
        
        for rf in rating_filters:
            accuracy_result = calculate_accuracy(history_items, rf)
            if accuracy_result["total"] > 0: 
                save_accuracy_to_db(cur, ticker, timeframe, rf, window_days, accuracy_result)
        
        con.commit()
        con.close()
        
        print(f"✅ [Accuracy] Recalculated and saved accuracy for {ticker} ({timeframe}, {window_days}d)")
        
    except Exception as e:
        print(f"❌ [Accuracy] Error recalculating accuracy for {ticker}: {e}")
        import traceback
        traceback.print_exc()
        if 'con' in locals() and con:
            con.close()

@app.get("/ratings/history-with-accuracy/{ticker}")
def get_history_with_accuracy(
    ticker: str, 
    timeframe: str = Query("1D", description="Timeframe: 1D or 1W"), 
    filter_rating: str = Query(None, description="Filter by rating: Strong Buy, Buy, Sell, Strong Sell")
):
    """
    Get rating history with accuracy calculation.
    
    Args:
        ticker: Stock ticker symbol
        timeframe: "1D" or "1W"
        filter_rating: Optional rating filter ("Strong Buy", "Buy", "Sell", "Strong Sell")
    
    Returns:
        dict with history items (including price data) and accuracy metrics
    """
    # If mock data is enabled and ticker is AAPL, return mock data
    if USE_MOCK_DATA and ticker.upper() == "AAPL":
        print(f"✅ Returning mock data for {ticker} with filter: {filter_rating}")
        return get_mock_aapl_history_formatted(timeframe, filter_rating)
    
    # Use database for all tickers (mock data disabled)
    import time
    start_time = time.time()
    try:
        connect_start = time.time()
        con = sqlite3.connect(DB_FILE, timeout=0.1)  
        connect_time = time.time() - connect_start
        
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        
        pragma_start = time.time()
        cur.execute("PRAGMA busy_timeout=100")
        pragma_time = time.time() - pragma_start

        query2_start = time.time()
        cur.execute("""
            SELECT 
                timestamp, price, price_prev, change_pct, currency, high, low, window_day,
                daily_rating, daily_prev, samplesize_daily, correct_daily, incorrect_daily, accuracy_daily,
                weekly_rating, weekly_prev, samplesize_weekly, correct_weekly, incorrect_weekly, accuracy_weekly
            FROM rating_accuracy
            WHERE ticker=?
            ORDER BY timestamp DESC
        """, (ticker.upper(),))
        
        acc_rows = cur.fetchall()
        query2_time = time.time() - query2_start

        con.close()
        
        if not acc_rows:
            return {
                "ticker": ticker.upper(),
                "currency": "",
                "price": 0,
                "changePercent": 0,
                "change": 0,
                "high": 0,
                "low": 0,
                "current_rating": "Unknown",
                "prev_rating": "Unknown",
                "history": [],
                "accuracy": {"accuracy": 0.0, "correct": 0, "incorrect": 0, "total": 0}
            }
        
        acc_row_latest = acc_rows[0]
        
        if timeframe == "1D":
            rating_key = "daily_rating"
            prev_key = "daily_prev"
        else:  # timeframe == "1W"
            rating_key = "weekly_rating"
            prev_key = "weekly_prev"
        
        history_items = []
        
        # Process rows in one pass (optimized)
        for acc_row in acc_rows:
            # Direct access (faster than .keys() check every time)
            timestamp = acc_row["timestamp"]
            rating = acc_row[rating_key]
            prev_rating = acc_row[prev_key]
            price = acc_row["price"] or 0
            price_prev = acc_row["price_prev"] or 0
            change_pct = acc_row["change_pct"] or 0
            
            # Skip if missing essential data
            if not timestamp or not rating:
                continue
            
            # Skip Neutral and Unknown ratings (case-insensitive check)
            rating_lower = rating.lower() if rating else ""
            if rating_lower in ("neutral", "unknown", ""):
                continue
            
            # Skip if prev_rating is Unknown
            if prev_rating:
                prev_rating_lower = prev_rating.lower()
                if prev_rating_lower in ("unknown", ""):
                    continue
            
            # ใช้ price_prev จากตาราง rating_accuracy โดยตรง
            prev_close = price_prev if price_prev else 0
            
            change_abs = price - prev_close if price and prev_close else 0

            history_items.append({
                "rating": rating,
                "prev": prev_rating or "Unknown",
                "timestamp": timestamp,
                "date": timestamp,  # Frontend will format
                "prev_close": prev_close,
                "result_price": price,
                "change_pct": change_pct,
                "change_abs": change_abs
            })
        
        # คำนวณ accuracy โดยรองรับ filter_rating
        accuracy_result = calculate_accuracy_from_frontend_logic(history_items, filter_rating)
        
        # Get current rating from latest accuracy record (direct access - faster)
        current_rating = acc_row_latest[rating_key] or "Unknown"
        prev_rating = acc_row_latest[prev_key] or "Unknown"
        
        # Get data from latest accuracy record
        latest_price = acc_row_latest["price"] or 0
        latest_change_pct = acc_row_latest["change_pct"] or 0
        latest_currency = acc_row_latest["currency"] or ""
        latest_high = acc_row_latest["high"] or 0
        latest_low = acc_row_latest["low"] or 0
        
        # Calculate change_abs from price and change_pct
        latest_change_abs = 0
        if latest_price and latest_change_pct:
            # Estimate change_abs from change_pct
            prev_price_est = latest_price / (1 + latest_change_pct / 100) if latest_change_pct != 0 else latest_price
            latest_change_abs = latest_price - prev_price_est
        
        # Print timing logs
        total_time = time.time() - start_time
        print(f"[TIME] [History Accuracy] {ticker.upper()}: connect={connect_time:.3f}s, pragma={pragma_time:.3f}s, query2={query2_time:.3f}s, total={total_time:.3f}s")
        
        return {
            "ticker": ticker.upper(),
            "currency": latest_currency,
            "price": latest_price,
            "changePercent": latest_change_pct,
            "change": latest_change_abs,
            "high": latest_high,
            "low": latest_low,
            "current_rating": current_rating,
            "prev_rating": prev_rating,
            "history": history_items,
            "accuracy": accuracy_result
        }
        
    except sqlite3.OperationalError as e:
        error_msg = str(e)
        if "locked" in error_msg.lower():
            print(f"[LOCKED] [History Accuracy] Database locked for {ticker.upper()}: {e}")
            if 'con' in locals() and con:
                con.close()
            return {
                "ticker": ticker.upper(),
                "error": "Database is temporarily locked. Please try again in a moment.",
                "history": [],
                "accuracy": {"accuracy": 0.0, "correct": 0, "incorrect": 0, "total": 0}
            }
        else:
            print(f"[ERROR] History with Accuracy API Error (OperationalError): {e}")
            import traceback
            traceback.print_exc()
            if 'con' in locals() and con:
                con.close()
            return {
                "ticker": ticker.upper(),
                "error": str(e),
                "history": [],
                "accuracy": {"accuracy": 0.0, "correct": 0, "incorrect": 0, "total": 0}
            }
    except Exception as e:
        print(f"[ERROR] History with Accuracy API Error: {e}")
        import traceback
        traceback.print_exc()
        if 'con' in locals() and con:
            con.close()
        return {
            "ticker": ticker.upper(),
            "error": str(e),
            "history": [],
            "accuracy": {"accuracy": 0.0, "correct": 0, "incorrect": 0, "total": 0}
        }

@app.get("/api/mock-rating-history/aapl")
def get_mock_aapl_history():
    """
    Mock API endpoint สำหรับทดสอบ winrate feature
    Return ข้อมูล rating history ของ AAPL จาก mock JSON file
    Format ตรงกับ /ratings/from-dr-api เพื่อให้ frontend ใช้ได้ทันที
    """
    return load_mock_aapl_data()

@app.post("/ratings/recalculate-accuracy/{ticker}")
def recalculate_accuracy_endpoint(
    ticker: str,
    timeframe: str = Query("1D", description="Timeframe: 1D or 1W"),
    window_days: int = Query(90, description="Number of days to look back")
):
    """
    Recalculate and save accuracy for a specific ticker.
    This endpoint can be called to update accuracy metrics manually.
    """
    try:
        recalc_and_save_accuracy_for_ticker(ticker.upper(), timeframe, window_days)
        return {
            "status": "success",
            "message": f"Accuracy recalculated for {ticker.upper()}",
            "ticker": ticker.upper(),
            "timeframe": timeframe,
            "window_days": window_days
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "ticker": ticker.upper()
        }, 500

@app.get("/ratings/from-dr-api")
def ratings_from_dr_api():
    """
    Fetches latest ratings, stats, and history from the SQLite DB 
    and reconstructs the JSON response to match the original format.
    Now reads from rating_main instead of ratings table.
    
    If USE_MOCK_DATA is True, returns mock AAPL data from mock_rating_history_aapl.json
    """
    # If mock data is enabled, return mock AAPL data
    if USE_MOCK_DATA:
        result = load_mock_aapl_data()
        print(f"[MOCK] Mock data loaded, returning: {result}")
        return result
    
    rows = []
    updated_at_str = "-"
    try:
        con = sqlite3.connect(DB_FILE)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        
        # Enable WAL mode for better concurrency
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=30000")

        if os.path.exists(DB_FILE):
            mtime = os.path.getmtime(DB_FILE)
            updated_at_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")

        # Get all unique tickers from rating_main
        cur.execute("SELECT DISTINCT ticker FROM rating_main")
        all_tickers = [row[0] for row in cur.fetchall()]

        for ticker in all_tickers:
            # Get latest record from rating_main (contains both daily and weekly)
            cur.execute("""
                SELECT * FROM rating_main 
                WHERE ticker=? 
                ORDER BY timestamp DESC 
                LIMIT 1
            """, (ticker,))
            main_row = cur.fetchone()
            
            if not main_row:
                continue 
            
            # Get filtered history
            cur.execute("""
                SELECT daily_rating, daily_changed_at, weekly_rating, weekly_changed_at, timestamp
                FROM rating_history 
                WHERE ticker=? 
                ORDER BY timestamp ASC
            """, (ticker,))
            history_rows = cur.fetchall()
            
            # Build daily history (use daily_changed_at as timestamp)
            daily_history = []
            for h in history_rows:
                if h["daily_rating"] and h["daily_changed_at"]:
                    daily_history.append({
                        "rating": h["daily_rating"],
                        "timestamp": h["daily_changed_at"]
                    })
            
            # Build weekly history (use weekly_changed_at as timestamp)
            weekly_history = []
            for h in history_rows:
                if h["weekly_rating"] and h["weekly_changed_at"]:
                    weekly_history.append({
                        "rating": h["weekly_rating"],
                        "timestamp": h["weekly_changed_at"]
                    })
            
            rows.append({
                "ticker": ticker,
                "currency": main_row["currency"] or "",
                "price": main_row["price"],
                "changePercent": main_row["change_pct"],
                "change": main_row["change_abs"], 
                "high": main_row["high"],
                "low": main_row["low"],
                "daily": {
                    "recommend_all": main_row["daily_val"],
                    "rating": main_row["daily_rating"] or "Unknown",
                    "prev": main_row["daily_prev"] or "Unknown",
                    "changed_at": main_row["daily_changed_at"],
                    "history": daily_history
                },
                "weekly": {
                    "recommend_all": main_row["weekly_val"],
                    "rating": main_row["weekly_rating"] or "Unknown",
                    "prev": main_row["weekly_prev"] or "Unknown",
                    "changed_at": main_row["weekly_changed_at"],
                    "history": weekly_history
                }
            })
        
        con.close()
        return {"updated_at": updated_at_str, "count": len(rows), "rows": rows}
    
    except Exception as e:
        print(f"[ERROR] API Error fetching from DB: {e}")
        import traceback
        traceback.print_exc()
        if 'con' in locals() and con:
            con.close()
        return {"updated_at": updated_at_str, "count": 0, "rows": []}

# --- Tracking API ---

class TrackingEvent(BaseModel):
    session_id: str
    user_id: str
    event_type: str
    event_data: dict
    page_path: str
    timestamp: str
    user_agent: str

@app.post("/api/track")
async def track_event(event: TrackingEvent, request: Request):
    max_retries = 3
    retry_delay = 0.1  # Start with 100ms
    
    for attempt in range(max_retries):
        con = None
        try:
            # Use timeout and WAL mode for better concurrency
            con = sqlite3.connect(DB_FILE, timeout=10.0)
            cur = con.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=10000")  # 10 seconds
            cur.execute("PRAGMA synchronous=NORMAL")  # Faster writes
            
            # Use client IP as the primary identifier
            client_ip = request.client.host if request.client else "unknown"

            # 1. Insert into user_behavior (detailed event log)
            cur.execute("""
                INSERT INTO user_behavior (ip_address, session_id, event_type, event_data, page_path, timestamp, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                client_ip,
                event.session_id,
                event.event_type,
                json.dumps(event.event_data),  # Store event_data as JSON string
                event.page_path,
                event.timestamp,
                event.user_agent
            ))

            # 2. Update visitor_stats (Upsert by IP address)
            cur.execute("""
                INSERT INTO visitor_stats (ip_address, visit_count, last_visit)
                VALUES (?, 1, ?)
                ON CONFLICT(ip_address) DO UPDATE SET
                visit_count = visit_count + 1,
                last_visit = excluded.last_visit
            """, (client_ip, event.timestamp))

            # 3. If page_view, update user_page_analytics (IP, total_pages, pages_visited with counts)
            if event.event_type == 'page_view':
                # Upsert: insert new row or increment view_count
                cur.execute("""
                    INSERT INTO user_page_analytics (ip_address, page_path, view_count)
                    VALUES (?, ?, 1)
                    ON CONFLICT(ip_address, page_path) DO UPDATE SET
                    view_count = view_count + 1
                """, (client_ip, event.page_path))

            con.commit()
            con.close()
            
            print(f"[TRACK] {event.event_type} from {client_ip} at {event.page_path}")
            return {"status": "success"}
            
        except sqlite3.OperationalError as e:
            if con:
                con.close()
            if "locked" in str(e).lower() and attempt < max_retries - 1:
                # Retry with exponential backoff
                import asyncio
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Double the delay each retry
                print(f"[TRACK] Database locked, retrying... (attempt {attempt + 2}/{max_retries})")
                continue
            else:
                print(f"[ERROR] Track event failed after {attempt + 1} attempts: {e}")
                return {"status": "error", "message": str(e)}
                
        except Exception as e:
            if con:
                con.close()
            print(f"[ERROR] Track event failed: {e}")
            import traceback
            traceback.print_exc()
            return {"status": "error", "message": str(e)}
    
    return {"status": "error", "message": "Max retries exceeded"}

@app.get("/api/analytics/summary")
def get_analytics_summary():
    try:
        con = sqlite3.connect(DB_FILE)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        
        # Count total events from user_behavior
        cur.execute("SELECT COUNT(*) FROM user_behavior")
        total_events = cur.fetchone()[0]
        
        # Count unique visitors (from visitor_stats)
        cur.execute("SELECT COUNT(*) FROM visitor_stats")
        total_visitors = cur.fetchone()[0]
        
        # Top pages (from user_page_analytics aggregation)
        cur.execute("""
            SELECT page_path, SUM(view_count) as total_views 
            FROM user_page_analytics
            GROUP BY page_path 
            ORDER BY total_views DESC 
            LIMIT 5
        """)
        top_pages = [dict(row) for row in cur.fetchall()]
        
        # Event type breakdown
        cur.execute("""
            SELECT event_type, COUNT(*) as count 
            FROM user_behavior 
            GROUP BY event_type 
            ORDER BY count DESC
        """)
        event_types = [dict(row) for row in cur.fetchall()]
        
        con.close()
        return {
            "total_events": total_events,
            "unique_visitors": total_visitors,
            "top_pages": top_pages,
            "event_types": event_types
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/analytics/events")
def get_analytics_events(limit: int = 100, event_type: str = None):
    """Get recent tracking events from user_behavior table"""
    try:
        con = sqlite3.connect(DB_FILE)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        
        if event_type:
            cur.execute("""
                SELECT id, session_id, user_id, event_type, event_data, page_path, timestamp, client_ip
                FROM user_behavior 
                WHERE event_type = ?
                ORDER BY timestamp DESC 
                LIMIT ?
            """, (event_type, limit))
        else:
            cur.execute("""
                SELECT id, session_id, user_id, event_type, event_data, page_path, timestamp, client_ip
                FROM user_behavior 
                ORDER BY timestamp DESC 
                LIMIT ?
            """, (limit,))
        
        events = []
        for row in cur.fetchall():
            event = dict(row)
            # Parse event_data back from JSON
            if event.get("event_data"):
                try:
                    event["event_data"] = json.loads(event["event_data"])
                except:
                    pass
            events.append(event)
        
        con.close()
        return {"count": len(events), "events": events}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/analytics/event-stats")
def get_event_stats():
    """Get statistics breakdown by event type"""
    try:
        con = sqlite3.connect(DB_FILE)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        
        # Event counts by type
        cur.execute("""
            SELECT event_type, COUNT(*) as count 
            FROM user_behavior 
            GROUP BY event_type 
            ORDER BY count DESC
        """)
        event_types = [dict(row) for row in cur.fetchall()]
        
        # Top stock views
        cur.execute("""
            SELECT event_data, COUNT(*) as count 
            FROM user_behavior 
            WHERE event_type = 'stock_view'
            GROUP BY event_data 
            ORDER BY count DESC 
            LIMIT 10
        """)
        top_stocks_raw = cur.fetchall()
        top_stocks = []
        for row in top_stocks_raw:
            try:
                data = json.loads(row["event_data"])
                top_stocks.append({
                    "ticker": data.get("ticker", "Unknown"),
                    "stock_name": data.get("stock_name", ""),
                    "count": row["count"]
                })
            except:
                pass
        
        # Top searches
        cur.execute("""
            SELECT event_data, COUNT(*) as count 
            FROM user_behavior 
            WHERE event_type = 'search'
            GROUP BY event_data 
            ORDER BY count DESC 
            LIMIT 10
        """)
        top_searches_raw = cur.fetchall()
        top_searches = []
        for row in top_searches_raw:
            try:
                data = json.loads(row["event_data"])
                top_searches.append({
                    "query": data.get("query", "Unknown"),
                    "count": row["count"]
                })
            except:
                pass
        
        con.close()
        return {
            "event_types": event_types,
            "top_stocks": top_stocks,
            "top_searches": top_searches
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8335)

