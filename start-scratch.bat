@echo off
set "NODE_DIR=%~dp0.tools\node-v20.20.2-win-x64"
set "SCRATCH_DIR=C:\Users\brune\scratch-lab-clean\scratch-gui-develop"

if not exist "%NODE_DIR%\npm.cmd" (
  echo Node local introuvable : %NODE_DIR%
  pause
  exit /b 1
)

if not exist "%SCRATCH_DIR%\package.json" (
  echo Dossier Scratch introuvable : %SCRATCH_DIR%
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"
cd /d "%SCRATCH_DIR%"

echo Lancement de Scratch local sur http://localhost:8601/
"%NODE_DIR%\npm.cmd" start
pause
