@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "SCRIPT=%~dp0INSTALL_YOLLA_PANEL_CONNECTION_FRONTIER.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%SCRIPT%" -Launch
