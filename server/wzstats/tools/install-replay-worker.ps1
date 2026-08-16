param([switch] $Enable)

$ErrorActionPreference = 'Stop'

$taskName = 'MaWay2000 Replay Analyzer'
$launcherPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'launch-replay-analyzer.vbs')).Path
$configPath = Join-Path $env:LOCALAPPDATA 'MaWay2000Wzstats\worker.json'

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Worker configuration not found: $configPath"
}

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($null -ne $existingTask) {
    if ($existingTask.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

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
    Write-Output 'The -Enable option is no longer needed. Automatic analysis is controlled by the desktop app.'
}
Write-Output "Desktop shortcut created: $shortcutPath"
Write-Output 'The replay worker now runs only while the desktop app is open.'
