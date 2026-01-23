"""
Cal-DR Project - Unified API Server

รวม APIs ทั้งหมดเข้าด้วยกันเพื่อให้รันในครั้งเดียว:
- Ratings API (port 8335 -> /ratings/*)
- Earnings API (port 3001 -> /earnings/*)
- News API (port 8003 -> /news/*)

Usage:
    python main.py
    
    หรือ
    
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

# Import apps from each API module
import ratings_api_dynamic
import earnings_api
import news_api


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Combined lifespan handler for all sub-applications"""
    print("=" * 60)
    print("[STARTUP] Starting Cal-DR Unified API Server...")
    print("=" * 60)
    
    # ========== Initialize Ratings API ==========
    print("[INIT] Initializing Ratings API...")
    ratings_api_dynamic.init_database()
    ratings_api_dynamic.migrate_from_json_if_needed()
    asyncio.create_task(ratings_api_dynamic.background_updater())
    print("[OK] Ratings API: Ready")
    
    # ========== Initialize Earnings API ==========
    print("[INIT] Initializing Earnings API...")
    earnings_api.load_db_from_disk()
    asyncio.create_task(earnings_api.background_updater())
    print("[OK] Earnings API: Ready")
    
    # ========== Initialize News API ==========
    print("[INIT] Initializing News API...")
    # News API uses httpx client initialized on-demand, no explicit init needed
    print("[OK] News API: Ready")
    
    print("=" * 60)
    print("[INFO] Server is running on http://localhost:8000")
    print("")
    print("Available endpoints:")
    print("  - Ratings: http://localhost:8000/ratings/...")
    print("  - Earnings: http://localhost:8000/earnings/...")
    print("  - News: http://localhost:8000/news/...")
    print("  - API Docs: http://localhost:8000/docs")
    print("=" * 60)
    
    yield
    
    print("[SHUTDOWN] Shutting down Cal-DR Unified API Server...")


# Create main app
app = FastAPI(
    title="Cal-DR Unified API",
    description="Combined API server for Cal-DR Project - Ratings, Earnings, and News",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Mount sub-applications
# All routes from each app will be prefixed with their path
app.mount("/ratings", ratings_api_dynamic.app)
app.mount("/earnings", earnings_api.app)
app.mount("/news", news_api.app)


# Root endpoint for health check
@app.get("/")
async def root():
    return {
        "status": "running",
        "service": "Cal-DR Unified API",
        "version": "1.0.0",
        "endpoints": {
            "ratings": "/ratings",
            "earnings": "/earnings",
            "news": "/news",
            "docs": "/docs"
        }
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "services": {
            "ratings": "ok",
            "earnings": "ok",
            "news": "ok"
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    print("")
    print("[STARTUP] Starting Cal-DR Unified API Server...")
    print("   Port: 8000")
    print("   Docs: http://localhost:8000/docs")
    print("")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
