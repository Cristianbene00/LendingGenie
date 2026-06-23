# Cashera KB — one-command startup.
# Usage: right-click → "Run with PowerShell", or in a terminal:  .\start.ps1
# Starts Postgres+Redis (Docker), then the API, worker, and web UI each in
# their own window, and opens the browser.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

Write-Host "[1/4] Checking Docker..." -ForegroundColor Cyan
try { docker info *> $null } catch {
  Write-Host "Docker isn't running. Start Docker Desktop, then re-run this script." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}

Write-Host "[2/4] Starting Postgres + Redis..." -ForegroundColor Cyan
docker compose up -d | Out-Null

Write-Host "      Waiting for Postgres to be ready..." -ForegroundColor DarkGray
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try { docker exec cashera_code-postgres-1 pg_isready -U kb *> $null; if ($LASTEXITCODE -eq 0) { $ready = $true; break } } catch {}
  Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Host "Postgres didn't become ready in time." -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }

Write-Host "[3/4] Launching API, worker, and web UI (3 windows)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root'; Write-Host 'API SERVER (:3001)' -ForegroundColor Green; npm run dev:api"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root'; Write-Host 'WORKER' -ForegroundColor Green; npm run dev:worker"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root'; Write-Host 'WEB UI (:3000)' -ForegroundColor Green; npm run dev:web"

Write-Host "[4/4] Opening http://localhost:3000 ..." -ForegroundColor Cyan
Start-Sleep -Seconds 8
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "Cashera KB is starting. Three windows opened (API / Worker / Web)." -ForegroundColor Green
Write-Host "To stop everything later, run:  .\stop.ps1" -ForegroundColor Yellow
