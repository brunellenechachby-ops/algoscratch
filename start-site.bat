@echo off
cd /d "%~dp0"

set "NODE_EXE=%~dp0.tools\node-v20.20.2-win-x64\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

echo Lancement du site AlgoScratch sur http://localhost:3000/
"%NODE_EXE%" server.js
pause
