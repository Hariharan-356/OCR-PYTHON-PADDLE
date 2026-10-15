@echo off
cd /d "%~dp0"

echo Starting ClaimsDigi frontend and backend...

start "ClaimsDigi Frontend" cmd /k "npm run dev"
start "ClaimsDigi API" cmd /k "npm run server"
start "ClaimsDigi OCR" cmd /k "npm run ocr:service"

echo.
echo All processes started in separate terminals.
echo Frontend: http://localhost:3000
echo NestJS API: http://localhost:3001/api
echo OCR service: http://127.0.0.1:8001
pause
