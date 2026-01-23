@echo off
echo.
echo ===============================================
echo  Cal-DR Backend - Unified API Server
echo ===============================================
echo.
echo Starting unified backend server...
echo All APIs (Ratings, Earnings, News) in ONE process!
echo.

cd /D "%~dp0backend\API"

echo Starting main.py on port 8000...
echo.
echo Available endpoints:
echo   - http://localhost:8000/ratings/...
echo   - http://localhost:8000/earnings/...
echo   - http://localhost:8000/news/...
echo   - http://localhost:8000/docs (API Documentation)
echo.
echo ===============================================
echo.

python main.py

pause
