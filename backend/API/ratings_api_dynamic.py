from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx
import uvicorn
import asyncio
import json
import os
import re
import random
import sqlite3
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

# ---------- CONFIG ----------
DR_LIST_URL = "http://172.17.1.85:8333/dr"
TRADINGVIEW_BASE = "https://scanner.tradingview.com/symbol"
TV_FIELDS = "Recommend.All,Recommend.All|1W,close,change,change_abs,high,low,volume,currency"

MAX_CONCURRENCY = 4       
REQUEST_TIMEOUT = 15      
UPDATE_INTERVAL_SECONDS = 180 
BATCH_SLEEP_SECONDS = 1.0     

# --- History-specific Config ---
# ไม่ใช้ interval แล้ว แต่ใช้ scheduled time แบบฟิกตามเวลาปิดตลาดของแต่ละ market

# เวลาปิดตลาดตามเวลาไทย (รองรับทั้งหน้าหนาวและหน้าร้อน)
# หน้าหนาว = Winter (EST/CET), หน้าร้อน = Summer (EDT/CEST)
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
            return False  # Table doesn't exist
        
        # Check if table has the new schema (has daily_rating column, no timeframe column)
        cur.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cur.fetchall()]
        
        # New schema should have daily_rating and weekly_rating, but NOT timeframe
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
        
        # Check if tables exist with old schema
        needs_recreate = False
        if os.path.exists(DB_FILE):
            if not check_table_schema(cur, "rating_stats") or \
               not check_table_schema(cur, "rating_main") or \
               not check_table_schema(cur, "rating_history"):
                needs_recreate = True
                print("⚠️ Old database schema detected. Recreating tables with new schema...")
        
        if needs_recreate:
            # Drop old tables
            cur.execute("DROP TABLE IF EXISTS rating_stats")
            cur.execute("DROP TABLE IF EXISTS rating_main")
            cur.execute("DROP TABLE IF EXISTS rating_history")
            print("   -> Dropped old tables")
        
        # Table for raw, unfiltered rating change statistics (7 days retention)
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

        # Table for filtered ratings (current and prev) with market data
        # Filters out Neutral and duplicate values separately for daily and weekly
        # Stores 7 days of history
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

        # Table for the filtered, "noise-free" history (uses TradingView / rating_main as source)
        # NOTE: rating_history now also stores market data snapshot at end of day + market info
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
            print(f"⚠️ Failed to ensure rating_history market-data columns: {e}")

        con.commit()
        con.close()
        if needs_recreate:
            print("✅ SQLite database recreated with new schema successfully.")
        else:
            print("✅ SQLite database and tables initialized successfully.")
    except Exception as e:
        print(f"⚠️ Database initialization failed: {e}")
        import traceback
        traceback.print_exc()

def migrate_from_json_if_needed():
    """Reads data from old JSON files and loads it into the SQLite database."""
    if not os.path.exists(DB_FILE):
        print("🤔 New database, migration not possible.")
        return

    try:
        con = sqlite3.connect(DB_FILE)
        cur = con.cursor()

        # Check if rating_stats table has data
        cur.execute("SELECT COUNT(*) FROM rating_stats")
        if cur.fetchone()[0] > 0:
            print("✅ Database already contains data. Skipping migration.")
            con.close()
            return
        
        print("🚚 Starting data migration from JSON to SQLite...")

        # 1. Migrate ratings_stats.json
        # Note: Old format has separate entries for daily and weekly, need to combine them
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

        # 2. Migrate ratings_history.json
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
        
        # Note: rating_main will be populated automatically by the background updater
        # based on rating_stats data, so we don't need to migrate it here
        
        con.commit()
        print("🎉 Migration completed successfully!")

    except Exception as e:
        print(f"❌ Migration Error: {e}")
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
    
    # Vietnam - ตรวจสอบแบบเต็มตาม frontend
    if "hochiminh" in ex_lower or "hanoi" in ex_lower or "hnx" in ex_lower:
        return "VN"
    
    # China - ตรวจสอบแบบเต็มตาม frontend
    if "shenzhen" in ex_lower or "shanghai" in ex_lower:
        return "CN"
    
    # Singapore - ตรวจสอบแบบเต็มตาม frontend
    if "singapore exchange" in ex_lower or "sgx" in ex_lower:
        return "SG"
    
    # Taiwan - ตรวจสอบแบบเต็มตาม frontend
    if "taiwan stock exchange" in ex_lower:
        return "TW"
    
    # Hong Kong - ตรวจสอบแบบเต็มตาม frontend
    if "stock exchange of hong kong" in ex_lower or "hkex" in ex_lower:
        return "HK"
    
    # Japan - ตรวจสอบแบบเต็มตาม frontend
    if "tokyo stock exchange" in ex_lower:
        return "JP"
    
    # US - ตรวจสอบแบบเต็มตาม frontend (ต้องตรวจสอบก่อน fallback)
    if ("nasdaq global select market" in ex_lower or 
        "nasdaq stock market" in ex_lower or 
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
    print(f"      - Constructed TradingView symbol for {ticker}: {tv_symbol} (exchange: {exchange})")
    
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
    """
    Lightweight fetcher for history/backtest:
    - Uses TradingView symbol constructed from underlying info
    - Returns raw daily/weekly values + mapped ratings using custom thresholds
    - Also returns market data (price, change_pct, change_abs, high, low), currency, exchange/market
    """
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
    """
    Stores raw rating data from TradingView into rating_stats.
    Only stores when rating changes (daily or weekly).
    Stores both daily and weekly in the same row.
    """
    # Get latest rating from rating_stats for this ticker
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
    """
    Updates rating_main with filtered ratings (excludes Neutral and duplicates).
    Filters Neutral separately for daily and weekly.
    Only updates when new rating is different from current and not Neutral.
    
    Args:
        cur: Database cursor
        ticker: Ticker symbol
        timestamp_str: Timestamp string
        daily_val: Daily recommendation value
        daily_rating: Daily rating
        weekly_val: Weekly recommendation value
        weekly_rating: Weekly rating
        market_data: Dict with currency, price, change_pct, change_abs, high, low
    """
    # Get latest record from rating_main (get all fields to preserve unchanged values)
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
    
    # Daily: update logic
    # 1. First record: always store (even if Neutral)
    # 2. Subsequent records: only store if NOT Neutral AND different from current
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
    
    # Weekly: update logic
    # 1. First record: always store (even if Neutral)
    # 2. Subsequent records: only store if NOT Neutral AND different from current
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
    """
    Updates rating_history using data from rating_main.

    New behaviour:
    - Forแต่ละวันของ ticker นั้น จะเก็บแค่ snapshot สุดท้ายของวันเดียวเท่านั้น
      (ใช้แถวที่ timestamp มากที่สุดของวันนั้นจาก rating_main)
    - ใช้เวลา timestamp จากเซิร์ฟเวอร์ (รูปแบบ ISO) ในการตัดวันด้วย strftime('%Y-%m-%d', timestamp)
    - เก็บ snapshot พร้อมฟิลด์ราคา: price, change_pct, change_abs, high, low, currency

    หมายเหตุ:
    - ไม่ใช้ A-B-A filter อีกต่อไป เพราะต้องการเพียง snapshot สุดท้ายก่อนตลาดปิดของแต่ละวัน
    """
    # Deprecated: history is now built by a dedicated history updater from TradingView directly.
    # This function is kept for backward compatibility but does nothing.
    return

def cleanup_old_records_by_date(cur):
    """
    Deletes records from a specific date (7 days ago) instead of all records older than 7 days.
    For example, if today is Dec 8, it will delete all records from Dec 1.
    """
    try:
        # Calculate the date to delete (today - 7 days) using Thai time
        bkk_tz = ZoneInfo("Asia/Bangkok")
        now_thai = datetime.now(bkk_tz)
        target_date = (now_thai.date() - timedelta(days=7))
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
        
        # Do not delete from rating_history here; keep full history for backtesting
        
        if stats_deleted > 0 or main_deleted > 0:
            print(f"   -> Cleaned up {stats_deleted} stats and {main_deleted} main records from {target_date_str}.")
        
        return stats_deleted, main_deleted, 0
    except Exception as e:
        print(f"   -> ❌ Error during cleanup by date: {e}")
        import traceback
        traceback.print_exc()
        return 0, 0, 0

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
                    print(f"    Starting batch {batch_num}/{total_batches} with {len(batch_data)} items...")
                    
                    results = await asyncio.gather(*[fetch_single_ticker(client, item) for item in batch_data])
                    
                    successful_updates_in_batch = 0
                    con = None # Ensure 'con' is defined before try block
                    try:
                        con = sqlite3.connect(DB_FILE, timeout=10)
                        con.row_factory = sqlite3.Row
                        cur = con.cursor()
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
                        print(f"    ✅ Batch {batch_num}/{total_batches} processed. Committed {successful_updates_in_batch} updates to the database.")

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
    """
    Insert or update a single end-of-day snapshot into rating_history for a given ticker + date.
    - snapshot_ts_thai คือเวลาที่ดึงข้อมูลจริง (เวลาไทย) ซึ่งควรอยู่ใกล้เวลาปิดตลาดมากที่สุด
    - Ensures only one record per day (per ticker) using date filter on timestamp.
    - Sets daily_prev / weekly_prev from previous history record (before this day).
    """
    # ใช้เวลาไทยโดยตรง ไม่ต้องแปลง
    # ตรวจสอบว่า snapshot_ts_thai มี timezone หรือไม่
    if snapshot_ts_thai.tzinfo is None:
        # ถ้าไม่มี timezone ให้ถือว่าเป็นเวลาไทย
        bkk_tz = ZoneInfo("Asia/Bangkok")
        snapshot_ts_thai = snapshot_ts_thai.replace(tzinfo=bkk_tz)
    
    ts_str = snapshot_ts_thai.replace(tzinfo=None).isoformat()
    date_str = snapshot_ts_thai.date().isoformat()
    
    # Debug: แสดงเวลาที่เก็บ
    print(f"  [History Snapshot] {ticker}: Thai={ts_str}")

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
        
        # Filter tickers for this market
        market_tickers = []
        all_exchanges = set()  # Debug: เก็บ exchange names ทั้งหมด
        
        for item in rows:
            u_code = item.get("underlying") or (item.get("symbol") or "").replace("80", "").replace("19", "")
            if u_code:
                u_code = u_code.strip().upper()
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
        
        if not market_tickers:
            print(f"[History] [{market_code}] No tickers found for this market")
            # Debug: แสดง exchange names ที่มี (เฉพาะที่อาจเกี่ยวข้อง)
            if market_code in ["NL", "IT"]:
                relevant_exchanges = [ex for ex in all_exchanges if any(k in ex.upper() for k in ("AMSTERDAM", "NETHERLANDS", "MILAN", "ITALY", "EURONEXT"))]
                if relevant_exchanges:
                    print(f"[History] [{market_code}] Debug: Found related exchanges: {', '.join(sorted(relevant_exchanges))}")
            return
        
        print(f"[History] [{market_code}] Found {len(market_tickers)} tickers")
        
        con = None
        try:
            con = sqlite3.connect(DB_FILE, timeout=10)
            con.row_factory = sqlite3.Row
            cur = con.cursor()
            
            fetched_count = 0
            skipped_count = 0
            
            for item in market_tickers:
                ticker = item.get("u_code")
                exchange = item.get("u_exch") or ""
                close_thai = get_market_close_thai(market_code, now_thai)
                
                # ตรวจสอบว่ายังไม่มี snapshot สำหรับวันนี้
                date_str = close_thai.date().isoformat()
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
                    continue
                
                data = res["data"]
                daily_val = data.get("daily_val")
                weekly_val = data.get("weekly_val")
                daily_rating = data.get("daily_rating")
                weekly_rating = data.get("weekly_rating")
                
                # Skip if both daily and weekly are Unknown
                if (not daily_rating or daily_rating == "Unknown") and (
                    not weekly_rating or weekly_rating == "Unknown"
                ):
                    continue
                
                market_data = {
                    "currency": data.get("currency", ""),
                    "price": data.get("market_data", {}).get("price"),
                    "change_pct": data.get("market_data", {}).get("change_pct"),
                    "change_abs": data.get("market_data", {}).get("change_abs"),
                    "high": data.get("market_data", {}).get("high"),
                    "low": data.get("market_data", {}).get("low"),
                }
                
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
                fetched_count += 1
                
                # Small delay between requests
                await asyncio.sleep(0.1)
            
            con.commit()
            print(f"[History] [{market_code}] Completed: {fetched_count} fetched, {skipped_count} skipped (already exist)")
            
        except Exception as e:
            print(f"[History] [{market_code}] Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if con:
                con.close()


async def market_scheduler(market_code: str):
    """
    Scheduler สำหรับแต่ละ market
    จะ sleep จนถึงเวลาปิดตลาดของ market นั้น แล้วดึงข้อมูลทันที
    """
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
            
            # เมื่อถึงเวลา → ดึงข้อมูลทันที
            await fetch_market_history(market_code)
            
        except Exception as e:
            print(f"[Scheduler] [{market_code}] Error: {e}")
            import traceback
            traceback.print_exc()
            # ถ้าเกิด error ให้รอ 1 นาทีแล้วลองใหม่
            await asyncio.sleep(60)


async def history_updater():
    """
    เริ่ม scheduler สำหรับทุก market
    แต่ละ market จะมี scheduler ของตัวเองที่รันแยกกัน
    """
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
    asyncio.create_task(background_updater())
    asyncio.create_task(history_updater())
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/ratings/from-dr-api")
def ratings_from_dr_api():
    """
    Fetches latest ratings, stats, and history from the SQLite DB 
    and reconstructs the JSON response to match the original format.
    Now reads from rating_main instead of ratings table.
    """
    rows = []
    updated_at_str = "-"
    try:
        con = sqlite3.connect(DB_FILE)
        con.row_factory = sqlite3.Row
        cur = con.cursor()

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
                continue  # Skip if no data
            
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
        print(f"❌ API Error fetching from DB: {e}")
        import traceback
        traceback.print_exc()
        if 'con' in locals() and con:
            con.close()
        return {"updated_at": updated_at_str, "count": 0, "rows": []}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8335)
