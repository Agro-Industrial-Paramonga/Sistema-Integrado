@echo off
setlocal
title Construir APK - Seguridad y salud en el trabajo
set "_JAVA_OPTIONS="
set "ROOT=%~dp0"
set "APP=%ROOT%app"
set "ANDROID=%APP%\android"
set "APK=%ANDROID%\app\build\outputs\apk\debug\app-debug.apk"
set "DESTINO=%USERPROFILE%\Desktop\Seguridad y Salud en el Trabajo.apk"

echo ============================================
echo   CONSTRUIR APK - SEGURIDAD Y SALUD EN EL TRABAJO
echo ============================================
echo.

echo [1/4] Refrescando la web...
if exist "%APP%\www" rmdir /s /q "%APP%\www"
mkdir "%APP%\www"
copy /y "%ROOT%index.html" "%APP%\www\" >nul
xcopy /e /i /y /q "%ROOT%plan-contingencia" "%APP%\www\plan-contingencia" >nul
xcopy /e /i /y /q "%ROOT%hallazgos" "%APP%\www\hallazgos" >nul
if not exist "%APP%\www\index.html" goto :error

echo [2/4] Sincronizando con el proyecto Android...
pushd "%APP%"
call npx cap sync android
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" goto :error

echo [3/4] Compilando (esto tarda unos segundos)...
pushd "%ANDROID%"
call gradlew.bat :app:assembleDebug --console=plain
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" goto :error

echo [4/4] Copiando el APK al Escritorio...
if not exist "%APK%" goto :error
copy /y "%APK%" "%DESTINO%" >nul

echo.
echo ============================================
echo   LISTO
echo   %DESTINO%
echo ============================================
echo.
pause
exit /b 0

:error
echo.
echo ============================================
echo   ERROR: no se pudo generar el APK
echo   Revisa los mensajes de arriba.
echo ============================================
echo.
pause
exit /b 1
