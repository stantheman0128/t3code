# Install the locally built T3 Code (Grok features on 0.0.33) over the existing app.
$ErrorActionPreference = 'Stop'

$Installer = Join-Path $PSScriptRoot 'release\T3-Code-0.0.32-x64.exe'
$AppExe = Join-Path $env:LOCALAPPDATA 'Programs\t3code\T3 Code (Alpha).exe'

Write-Host "=== T3 Grok-features local install ==="
if (-not (Test-Path -LiteralPath $Installer)) {
  throw "Installer not found: $Installer"
}
$item = Get-Item -LiteralPath $Installer
Write-Host ("Installer: {0} ({1:N1} MB)" -f $item.FullName, ($item.Length / 1MB))

Write-Host 'Stopping running T3 Code processes...'
Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like '*\t3code\*' } |
  ForEach-Object {
    Write-Host ("  kill PID {0} ({1})" -f $_.ProcessId, $_.Name)
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
Start-Sleep -Seconds 2

Write-Host 'Running silent NSIS install (/S)...'
$proc = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru
Write-Host ("Install exit code: {0}" -f $proc.ExitCode)
if ($proc.ExitCode -ne 0 -and $null -ne $proc.ExitCode) {
  throw "Installer failed with exit code $($proc.ExitCode)"
}

Start-Sleep -Seconds 2
if (-not (Test-Path -LiteralPath $AppExe)) {
  throw "App exe missing after install: $AppExe"
}

$vi = (Get-Item -LiteralPath $AppExe).VersionInfo
Write-Host ("Installed: ProductVersion={0} FileVersion={1} LastWrite={2}" -f `
  $vi.ProductVersion, $vi.FileVersion, (Get-Item -LiteralPath $AppExe).LastWriteTime)

Write-Host 'Launching T3 Code...'
Start-Process -FilePath 'explorer.exe' -ArgumentList $AppExe
Start-Sleep -Seconds 5

$running = Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like '*\t3code\T3 Code*' }
if ($running) {
  Write-Host 'T3 Code is running:'
  $running | ForEach-Object { Write-Host ("  PID {0}" -f $_.ProcessId) }
} else {
  Write-Host 'WARNING: T3 Code process not detected after launch (SmartScreen may have blocked it).'
  Write-Host "Try opening manually: $AppExe"
}

Write-Host '=== DONE ==='
