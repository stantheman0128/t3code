param(
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][string]$NodeExe,
  [switch]$Start
)

$ErrorActionPreference = "Stop"

$taskName = "T3CodeLocalDesktopPack"
$wrapper = Join-Path $PSScriptRoot "run-local-desktop-pack-watch.ps1"
if (!(Test-Path -LiteralPath $wrapper)) {
  throw "Missing watcher wrapper: $wrapper"
}
if (!(Test-Path -LiteralPath $NodeExe)) {
  throw "Missing node.exe: $NodeExe"
}

$argument = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$wrapper`" -RepoRoot `"$RepoRoot`" -NodeExe `"$NodeExe`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

if ($Start) {
  Start-ScheduledTask -TaskName $taskName
}

Write-Output "Registered scheduled task '$taskName' for $RepoRoot."
