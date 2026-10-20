@echo off
setlocal
title Previsualizar - Seguridad y salud en el trabajo
set "_JAVA_OPTIONS="
set "ROOT=%~dp0"

echo ============================================
echo   PREVISUALIZAR EN EL NAVEGADOR
echo ============================================
echo.
echo Abriendo servidor local y el navegador...
echo.
echo   IMPORTANTE: deja esta ventana abierta.
echo   Si la cierras, la previsualizacion se detiene.
echo.

start "Servidor Seguridad y salud en el trabajo" /min cmd /c "node "%~dp0servidor-local.mjs""

timeout /t 3 >nul
start "" "http://127.0.0.1:5501/"
exit /b 0
