@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" deploy
if errorlevel 1 (
    echo.
    echo 部署失败，请查看上方错误信息。
    pause
    exit /b 1
)
echo.
pause
