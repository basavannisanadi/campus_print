@echo off
title Campus Print Hub - Main Server Startup
echo ===================================================
     echo   Starting Backend Server and Frontend Web App...
echo ===================================================
start cmd /k "npm run server"
start cmd /k "npm run dev"
echo.
echo Server started! 
echo.
echo 1. Open http://localhost:3000 to visit the website locally.
echo 2. Open a separate terminal and run:
echo    "cloudflared tunnel --url http://localhost:3000" to get your phone link.
echo.
pause
