@echo off
setlocal
cd /d "%~dp0"
node --test tests\*.test.mjs
if errorlevel 1 exit /b 1
endlocal
