# Watch for short-lived console processes that flash a black window.
# Prints one FLASH line per new pid. Stop with Ctrl+C.
$ErrorActionPreference = "SilentlyContinue"
$log = Join-Path $env:TEMP "t3-console-flash.log"
$watch = [System.Collections.Generic.HashSet[string]]::new()
foreach ($n in @("cmd.exe", "taskkill.exe")) { [void]$watch.Add($n.ToLowerInvariant()) }

function Write-Flash([string]$line) {
  $line | Add-Content -LiteralPath $log -Encoding UTF8
  Write-Output $line
}

function Get-Tree([uint32]$pid) {
  $parts = New-Object System.Collections.Generic.List[string]
  $id = $pid
  for ($i = 0; $i -lt 8 -and $id -gt 0; $i++) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id"
    if (-not $proc) { break }
    $parts.Add(("{0}:{1}" -f $proc.Name, $proc.ProcessId))
    if ($proc.Name -match "T3 Code|electron") { break }
    $id = [uint32]$proc.ParentProcessId
  }
  return ($parts -join " <- ")
}

$seen = [System.Collections.Generic.HashSet[int]]::new()
Get-CimInstance Win32_Process | ForEach-Object { [void]$seen.Add([int]$_.ProcessId) }
Write-Flash ("WATCH start {0} log={1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $log)

while ($true) {
  Get-CimInstance Win32_Process | ForEach-Object {
    if (-not $watch.Contains($_.Name.ToLowerInvariant())) { return }
    if (-not $seen.Add([int]$_.ProcessId)) { return }
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.ParentProcessId)"
    if ($parent.Name -notmatch "T3 Code") { return }
    $cmd = $_.CommandLine
    if ([string]::IsNullOrWhiteSpace($cmd)) { $cmd = "(no cmdline)" }
    if ($cmd.Length -gt 300) { $cmd = $cmd.Substring(0, 300) + "..." }
    $tree = Get-Tree ([uint32]$_.ParentProcessId)
    Write-Flash ("FLASH {0} name={1} pid={2} parent={3} tree={4} cmd={5}" -f
      (Get-Date -Format "HH:mm:ss.fff"),
      $_.Name,
      $_.ProcessId,
      $_.ParentProcessId,
      $tree,
      $cmd)
  }
  Start-Sleep -Milliseconds 120
}
