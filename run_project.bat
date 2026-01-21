@echo off
echo Starting Cal-DR Project...

:: 1. Start Ratings API (Core Backend)
start "Cal-DR Backend: Ratings API" /D "backend\API" cmd /k "python ratings_api_dynamic.py"

:: 2. Start Earnings API
start "Cal-DR Backend: Earnings API" /D "backend\API" cmd /k "python earnings_api.py"

:: 3. Start News API
start "Cal-DR Backend: News API" /D "backend\API" cmd /k "python news_api.py"

:: 4. Start Frontend
start "Cal-DR Frontend" /D "frontend" cmd /k "npm run dev"

echo All services launched in separate windows!
