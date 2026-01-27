@echo off
echo.
echo ===============================================
echo  Cal-DR Project - Full Stack Launcher
echo ===============================================
echo.

:: 1. Start Backend (Unified - All APIs in one process)
echo [1/2] Starting Backend (Unified API)...
start "Cal-DR Backend" cmd /k "cd /D \"%~dp0backend\" && if exist venv\Scripts\activate.bat (echo Activating venv... & call venv\Scripts\activate.bat) else (echo No venv found, relying on system python...) & cd API && python main.py"

:: Wait a moment for backend to initialize
timeout /t 3 /nobreak > nul

:: 2. Start Frontend
echo [2/2] Starting Frontend...
start "Cal-DR Frontend" cmd /k "cd /D \"%~dp0frontend\" && npm run dev"

echo.
echo ===============================================
echo  All services launched!
echo ===============================================
echo.
echo Backend: http://localhost:8000
echo   - Ratings: http://localhost:8000/ratings/...
echo   - Earnings: http://localhost:8000/earnings/...
echo   - News: http://localhost:8000/news/...
echo   - API Docs: http://localhost:8000/docs
echo.
echo Frontend: http://localhost:8082/caldr/
echo.
echo ===============================================
echo.
pause
