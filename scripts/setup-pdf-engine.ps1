param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Environment = Join-Path $Root '.tools/pdf-engine'
& $Python -m venv $Environment
if ($LASTEXITCODE -ne 0) { throw 'Python 3.10+ is required to create the environment.' }
$Executable = Join-Path $Environment 'Scripts/python.exe'
& $Executable -m pip install -r (Join-Path $Root 'packages/desktop/static/pdf-engine/requirements-lock.txt')
if ($LASTEXITCODE -ne 0) { throw 'PDF engine dependency installation failed.' }
Write-Output "PDF engine ready: $Executable"
Write-Output 'PyMuPDF uses AGPL-3.0/commercial licensing. Do not bundle this runtime in an MIT release without reviewing distribution obligations.'
