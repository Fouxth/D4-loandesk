@echo off
title Caddy HTTPS Server
cd /d C:\caddy
echo Checking Caddyfile...
if not exist Caddyfile (
    echo [ERROR] Caddyfile not found! Please make sure it exists without .txt extension.
    pause
    exit
)
echo Starting Caddy for https://api.dexterball.com...
caddy.exe run
pause
