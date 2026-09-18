param(
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][string]$NodeExe
)

$ErrorActionPreference = "Stop"

$machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
$user = [Environment]::GetEnvironmentVariable("Path", "User")
$gitCmd = Join-Path $env:ProgramFiles "Git\cmd"
$extra = @(
  (Join-Path $RepoRoot "node_modules\.bin"),
  (Join-Path $env:USERPROFILE ".vite-plus\bin"),
  (Join-Path $env:USERPROFILE ".cargo\bin"),
  $gitCmd
) -join ";"
$env:Path = "$extra;$user;$machine"
$env:T3CODE_SKIP_INSTALL = "1"

Set-Location -LiteralPath $RepoRoot
$script = Join-Path $RepoRoot "scripts\watch-local-desktop-pack.ts"
$process = Start-Process -FilePath $NodeExe -ArgumentList @($script) -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru
try {
  $process.PriorityClass = "BelowNormal"
} catch {
}
Wait-Process -Id $process.Id
if ($null -eq $process.ExitCode) {
  exit 1
}
exit $process.ExitCode
