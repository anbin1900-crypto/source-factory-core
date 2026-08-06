@echo off
setlocal
cd /d "%~dp0"
node tests\run-demo.mjs
if errorlevel 1 exit /b 1
endlocal
