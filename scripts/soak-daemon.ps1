# Starts a long-running afh daemon soak (default: dry-run, 1h ticks, 24h ~= 24 ticks if machine stays awake).
# Requires ~/.afh/config.json - run afh init first
# Stop: npx agents-for-humanity daemon stop   OR  taskkill /PID <pid>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Cli = Join-Path $Root "packages\agents-for-humanity\dist\cli.js"
$AfhDir = Join-Path $env:USERPROFILE ".afh"
$Config = Join-Path $AfhDir "config.json"
$OutLog = Join-Path $AfhDir "soak-stdout.log"

if (-not (Test-Path $Cli)) {
    Write-Host "CLI not built. Run from app folder: npm run cli:build"
    exit 1
}
if (-not (Test-Path $Config)) {
    Write-Host "Missing $Config - run afh init first."
    exit 1
}

$interval = if ($env:AFH_SOAK_INTERVAL) { $env:AFH_SOAK_INTERVAL } else { "1h" }
$budget = if ($env:AFH_SOAK_BUDGET) { $env:AFH_SOAK_BUDGET } else { "999" }
$live = if ($env:AFH_SOAK_LIVE -eq "1") { "--live" } else { $null }

Write-Host "Starting soak daemon (dry-run unless AFH_SOAK_LIVE=1)..."
Write-Host "  interval=$interval budget=$budget"
Write-Host "  cli: $Cli"
Write-Host "  stdout/stderr -> $OutLog"

$argsList = @(
    $Cli,
    "daemon",
    "--interval", $interval,
    "--budget", $budget
)
if ($live) {
    $argsList += "--live"
    if ($env:AFH_AGENT_CMD) {
        $argsList += "--agent-cmd"
        $argsList += $env:AFH_AGENT_CMD
    } else {
        Write-Warning "--live set but AFH_AGENT_CMD not set; daemon may fail on ticks."
    }
}

$p = Start-Process -FilePath "node" -ArgumentList $argsList `
    -WorkingDirectory $Root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $OutLog -RedirectStandardError $OutLog

Write-Host ""
Write-Host "Soak PID: $($p.Id)"
Write-Host "Tail logs: afh daemon logs --lines 100"
Write-Host "Or: Get-Content $env:USERPROFILE\.afh\daemon.log -Tail 30"
Write-Host "Stop:    afh daemon stop   (same machine)"
Write-Host 'Soak checklist: capture start time; review .afh/daemon.log and .afh/spend.json if live; clean stop.'
