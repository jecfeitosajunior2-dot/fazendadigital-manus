$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\nodejs;C:\Users\Pedro Neto\AppData\Roaming\npm;" + $env:Path
$env:NODE_ENV = "development"
Set-Location $PSScriptRoot\..

Write-Host "Iniciando Fazenda Digital em http://localhost:3000" -ForegroundColor Cyan
& "C:\Users\Pedro Neto\AppData\Roaming\npm\pnpm.cmd" dev
