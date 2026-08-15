param([switch] $Enable)

$ErrorActionPreference = 'Stop'

$taskName = 'MaWay2000 Replay Analyzer'
$workerPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'replay-worker.mjs')).Path
$launcherPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'launch-replay-analyzer.vbs')).Path
$workerLauncherPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'launch-replay-worker.vbs')).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$configPath = Join-Path $env:LOCALAPPDATA 'MaWay2000Wzstats\worker.json'

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Worker configuration not found: $configPath"
}

$wscriptPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
$action = New-ScheduledTaskAction -Execute $wscriptPath -Argument ('"' + $workerLauncherPath + '" "' + $nodePath + '" "' + $workerPath + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -Priority 8 `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -Disable

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Continuously analyzes queued MaWay2000 Warzone replay files and submits confirmed statistics to onit.lt.' `
    -User $env:USERNAME `
    -RunLevel Limited `
    -Force | Out-Null

$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'MaWay2000 Replay Analyzer.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = (Join-Path $env:SystemRoot 'System32\wscript.exe')
$shortcut.Arguments = '"' + $launcherPath + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = 'Open the MaWay2000 Replay Analyzer dashboard.'
$shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',238'
$shortcut.Save()

if ($Enable) {
    Enable-ScheduledTask -TaskName $taskName | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Output "Installed and started low-priority scheduled task: $taskName"
} else {
    Write-Output "Installed disabled low-priority scheduled task: $taskName"
}
Write-Output "Desktop shortcut created: $shortcutPath"
