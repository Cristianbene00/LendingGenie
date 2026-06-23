# Cashera KB — stop everything.
# Stops the Node services and the Docker containers. Your data is preserved
# (Postgres volume + .msal_cache.json survive).

$root = $PSScriptRoot
Set-Location $root

Write-Host "Stopping Node services (API / worker / web)..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Stopping Postgres + Redis containers..." -ForegroundColor Cyan
docker compose stop | Out-Null

Write-Host "Stopped. Data is preserved — run .\start.ps1 to bring it back up." -ForegroundColor Green
