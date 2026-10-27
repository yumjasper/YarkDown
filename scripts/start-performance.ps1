param(
  [string]$Executable = "$env:LOCALAPPDATA\Programs\YarkText\YarkText.exe",
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Files = @()
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
  throw "YarkText executable not found: $Executable. Use -Executable to specify its location."
}
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$running = @(Get-Process -Name YarkText -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
  throw 'Save your documents and exit all YarkText windows first. A running instance cannot switch accessibility modes safely.'
}
foreach ($file in $Files) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Document not found: $file"
  }
  if ($file.Contains('"')) {
    throw 'Document paths cannot contain double quotes.'
  }
}

Write-Warning 'Performance mode disables Chromium accessibility support. Screen readers, voice control and accessibility-based desktop automation may not work in the editor. This launch does not change Windows settings or future normal launches.'
$previousMode = $env:YARKTEXT_ACCESSIBILITY_MODE
try {
  $env:YARKTEXT_ACCESSIBILITY_MODE = 'performance'
  $options = @{ FilePath = $Executable; PassThru = $true }
  if ($Files.Count -gt 0) {
    $options.ArgumentList = ($Files | ForEach-Object { '"' + (Resolve-Path -LiteralPath $_).Path + '"' }) -join ' '
  }
  $process = Start-Process @options
  Write-Output "Started YarkText in performance mode (PID $($process.Id))."
}
finally {
  $env:YARKTEXT_ACCESSIBILITY_MODE = $previousMode
}
