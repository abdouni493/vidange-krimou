@echo off
setlocal enabledelayedexpansion
title AutoGarage Pro
cd /d "%~dp0"

set "PORT=5180"
set "URL=http://localhost:%PORT%"

echo.
echo   ===================================
echo     AutoGarage Pro
echo   ===================================
echo.

REM ---- Node.js installe ? -------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto :nonode

REM ---- Deja demarre ? Ouvrir directement le navigateur --------------------
curl -s -o nul --max-time 2 "%URL%/api/health"
if not errorlevel 1 goto :running

REM ---- Dependances --------------------------------------------------------
if exist "node_modules\" goto :deps_ok
echo   Premiere installation des dependances, patientez...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail
echo.
:deps_ok

REM ---- Compilation --------------------------------------------------------
if exist "dist\index.html" goto :build_ok
echo   Compilation de l'application, patientez...
echo.
call npm run build
if errorlevel 1 goto :fail
echo.
:build_ok

REM ---- Demarrage du serveur ----------------------------------------------
echo   Demarrage du serveur local...
start "AutoGarage Pro - Serveur" /min cmd /c "node server\index.js || pause"

REM ---- Attente que le serveur reponde ------------------------------------
set /a tries=0
:wait
set /a tries+=1
curl -s -o nul --max-time 2 "%URL%/api/health"
if not errorlevel 1 goto :open
if !tries! GEQ 30 goto :timeout
ping -n 2 127.0.0.1 >nul
goto :wait

:running
echo   L'application tourne deja - ouverture du navigateur...

:open
echo   Ouverture de %URL%
start "" "%URL%"
exit /b 0

:nonode
echo   [X] Node.js est introuvable sur cet ordinateur.
echo       L'application en a besoin pour demarrer.
echo.
echo   La page de telechargement va s'ouvrir. Installez la version LTS,
echo   puis relancez ce raccourci.
echo.
pause
start "" https://nodejs.org/fr/download
exit /b 1

:timeout
echo.
echo   [X] Le serveur n'a pas repondu apres 30 secondes.
echo       Consultez la fenetre "AutoGarage Pro - Serveur" pour le detail.
echo.
pause
exit /b 1

:fail
echo.
echo   [X] L'installation a echoue. Verifiez votre connexion internet
echo       puis relancez ce raccourci.
echo.
pause
exit /b 1
