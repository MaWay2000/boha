param([switch] $SmokeTest)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:taskName = 'MaWay2000 Replay Analyzer'
$script:workerPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'replay-worker.mjs')).Path
$script:analyzerPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'analyze-replay-outcome.mjs')).Path
$script:analyzerVersion = ([regex]::Match(
    (Get-Content -LiteralPath $script:analyzerPath -Raw),
    "ANALYZER_VERSION\s*=\s*'([^']+)'"
)).Groups[1].Value
$script:versionChangeLog = @"
Version 3.3.0
- Exact droid and structure destruction events.
- Destroyed objects disappear at their real replay timestamp.
- Older tactical replay results remain compatible.

Version 3.2.0
- Droid components, weapons and structure definitions.
- Object direction data for real-model battlefield rendering.

Version 3.1.0
- Tactical unit and structure positions with health snapshots.
- 3-second 1v1 and 10-second multiplayer samples.

Version 3.0.0
- Initial replay-only outcomes and extended player statistics.
"@
$script:nodePath = (Get-Command node -ErrorAction Stop).Source
$script:dataDirectory = Join-Path $env:LOCALAPPDATA 'MaWay2000Wzstats'
$script:logPath = Join-Path $script:dataDirectory 'worker.log'
$script:progressPath = Join-Path $script:dataDirectory 'progress.json'
$script:settingsPath = Join-Path $script:dataDirectory 'interface-settings.json'
$script:workerProcess = $null
$script:lastLogWriteUtc = [DateTime]::MinValue
$script:lastQueueCheckUtc = [DateTime]::MinValue
$script:lastAutomaticCheckUtc = [DateTime]::MinValue
$script:automaticEnabled = $false
$script:queueStatus = $null

$script:priorityProfiles = @{
    'Low' = @{ TaskPriority = 10; ProcessPriority = 'Idle'; Description = 'Minimum CPU impact. Analysis takes longer.' }
    'Below normal' = @{ TaskPriority = 8; ProcessPriority = 'BelowNormal'; Description = 'Recommended. Keeps the computer responsive while analyzing.' }
    'Normal' = @{ TaskPriority = 5; ProcessPriority = 'Normal'; Description = 'Faster analysis, but it can make other applications less responsive.' }
    'High' = @{ TaskPriority = 1; ProcessPriority = 'High'; Description = 'Maximum analyzer performance. The computer may become difficult to use while processing.' }
}

function Get-AnalyzerTask {
    Get-ScheduledTask -TaskName $script:taskName -ErrorAction SilentlyContinue
}

function Get-WorkerRunning {
    if ($null -ne $script:workerProcess) {
        try {
            if (-not $script:workerProcess.HasExited) {
                return $true
            }
        } catch {
        }
        $script:workerProcess = $null
    }

    return $false
}

function Start-AutomaticWorkerIfNeeded {
    if (-not $script:automaticEnabled -or (Get-WorkerRunning)) {
        return
    }
    Start-AppWorker
}

function Get-InterfaceSettings {
    if (Test-Path -LiteralPath $script:settingsPath) {
        try {
            return Get-Content -LiteralPath $script:settingsPath -Raw | ConvertFrom-Json
        } catch {
        }
    }
    return $null
}

function Save-InterfaceSettings {
    if (-not (Test-Path -LiteralPath $script:dataDirectory)) {
        New-Item -ItemType Directory -Path $script:dataDirectory -Force | Out-Null
    }
    @{
        priority = Get-SelectedPriority
        automaticEnabled = $script:automaticEnabled
    } | ConvertTo-Json | Set-Content -LiteralPath $script:settingsPath -Encoding UTF8
}

function Get-SelectedPriority {
    $savedSettings = Get-InterfaceSettings
    if ($null -ne $savedSettings) {
        if ($script:priorityProfiles.ContainsKey([string] $savedSettings.priority)) {
            return [string] $savedSettings.priority
        }
    }

    $analyzerTask = Get-AnalyzerTask
    if ($null -ne $analyzerTask) {
        $taskPriority = [int] $analyzerTask.Settings.Priority
        if ($taskPriority -ge 10) { return 'Low' }
        if ($taskPriority -le 2) { return 'High' }
        if ($taskPriority -le 5) { return 'Normal' }
    }
    return 'Below normal'
}

function Set-AnalyzerPriority([string] $priorityName) {
    if (-not $script:priorityProfiles.ContainsKey($priorityName)) {
        throw "Unknown priority: $priorityName"
    }

    if (-not (Test-Path -LiteralPath $script:dataDirectory)) {
        New-Item -ItemType Directory -Path $script:dataDirectory -Force | Out-Null
    }
    @{
        priority = $priorityName
        automaticEnabled = $script:automaticEnabled
    } | ConvertTo-Json | Set-Content -LiteralPath $script:settingsPath -Encoding UTF8

    $profile = $script:priorityProfiles[$priorityName]
    $targetProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.Name -eq 'node.exe' -and ($_.CommandLine -like '*replay-worker.mjs*' -or $_.CommandLine -like '*analyze-replay-outcome.mjs*')) -or
        ($_.Name -eq 'warzone2100.exe' -and $_.CommandLine -like '*--loadreplay=probe*')
    }
    foreach ($targetProcess in $targetProcesses) {
        try {
            (Get-Process -Id $targetProcess.ProcessId -ErrorAction Stop).PriorityClass = [System.Diagnostics.ProcessPriorityClass]::$($profile.ProcessPriority)
        } catch {
        }
    }
    if ($null -ne $script:workerProcess) {
        try {
            if (-not $script:workerProcess.HasExited) {
                $script:workerProcess.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::$($profile.ProcessPriority)
            }
        } catch {
        }
    }
}

function Convert-LogLineToLocalTime {
    param([string]$Line)

    if ($Line -match '^\[(?<Timestamp>\d{4}-\d{2}-\d{2}T[^\]]+Z)\](?<Message>.*)$') {
        try {
            $localTime = [DateTimeOffset]::Parse($Matches.Timestamp).ToLocalTime()
            return '[' + $localTime.ToString('MM-dd HH:mm:ss') + ']' + $Matches.Message
        } catch {
        }
    }
    return $Line
}

function Read-RecentLog {
    if (-not (Test-Path -LiteralPath $script:logPath)) {
        return 'The analyzer has not written a log yet.'
    }

    return ((Get-Content -LiteralPath $script:logPath -Tail 120 -ErrorAction SilentlyContinue | ForEach-Object {
        Convert-LogLineToLocalTime $_
    }) -join [Environment]::NewLine)
}

function Get-LastActivityText {
    if (-not (Test-Path -LiteralPath $script:logPath)) {
        return 'No activity recorded yet'
    }

    $lastLine = Get-Content -LiteralPath $script:logPath -Tail 1 -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($lastLine)) {
        return 'No activity recorded yet'
    }

    $lastLine = Convert-LogLineToLocalTime $lastLine
    if ($lastLine.Length -gt 115) {
        return $lastLine.Substring(0, 112) + '...'
    }
    return $lastLine
}

function Read-AnalyzerProgress {
    if (-not (Test-Path -LiteralPath $script:progressPath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $script:progressPath -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Update-QueueStatus {
    $configPath = Join-Path $script:dataDirectory 'worker.json'
    if (-not (Test-Path -LiteralPath $configPath)) {
        return
    }
    try {
        $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
        $headers = @{ Authorization = 'Bearer ' + [string] $config.token }
        $response = Invoke-RestMethod -Uri (([string] $config.baseUrl).TrimEnd('/') + '/status') -Headers $headers -TimeoutSec 5
        $script:queueStatus = $response.queue
        $script:lastQueueCheckUtc = [DateTime]::UtcNow
    } catch {
    }
}

function Format-GameTime([double] $milliseconds) {
    if ($milliseconds -lt 0) {
        $milliseconds = 0
    }
    $time = [TimeSpan]::FromMilliseconds($milliseconds)
    if ($time.TotalHours -ge 1) {
        return '{0}:{1:00}:{2:00}' -f [math]::Floor($time.TotalHours), $time.Minutes, $time.Seconds
    }
    return '{0}:{1:00}' -f [math]::Floor($time.TotalMinutes), $time.Seconds
}

function Get-AnalysisElapsedMilliseconds([long] $matchId) {
    if ($matchId -le 0 -or -not (Test-Path -LiteralPath $script:logPath)) {
        return $null
    }

    $lines = @(Get-Content -LiteralPath $script:logPath -Tail 120 -ErrorAction SilentlyContinue)
    [array]::Reverse($lines)
    foreach ($line in $lines) {
        if ($line -match '^\[(?<Timestamp>\d{4}-\d{2}-\d{2}T[^\]]+Z)\] Analyzing replay\.') {
            $timestamp = $Matches.Timestamp
            if ($line -match ('"matchId":' + $matchId + '(?:,|})')) {
                try {
                    $startedAt = [DateTimeOffset]::Parse($timestamp)
                    return [math]::Max(0, ([DateTimeOffset]::UtcNow - $startedAt.ToUniversalTime()).TotalMilliseconds)
                } catch {
                    return $null
                }
            }
        }
    }
    return $null
}

function Stop-ManualWorker {
    if ($null -eq $script:workerProcess) {
        return
    }

    try {
        if (-not $script:workerProcess.HasExited) {
            Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\taskkill.exe') `
                -ArgumentList @('/PID', $script:workerProcess.Id, '/T', '/F') `
                -WindowStyle Hidden -Wait | Out-Null
        }
    } catch {
    }
    $script:workerProcess = $null
}

function Stop-OrphanWorkers {
    $analyzerTask = Get-AnalyzerTask
    if ($null -ne $analyzerTask) {
        if ($analyzerTask.State -eq 'Running') {
            Stop-ScheduledTask -TaskName $script:taskName -ErrorAction SilentlyContinue
        }
        if ($analyzerTask.State -ne 'Disabled') {
            Disable-ScheduledTask -TaskName $script:taskName -ErrorAction SilentlyContinue | Out-Null
        }
    }

    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -like '*replay-worker.mjs*'
    } | ForEach-Object {
        try {
            Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\taskkill.exe') `
                -ArgumentList @('/PID', $_.ProcessId, '/T', '/F') `
                -WindowStyle Hidden -Wait | Out-Null
        } catch {
        }
    }
}

function Start-AppWorker([switch] $Once) {
    if (Get-WorkerRunning) {
        return
    }
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $script:nodePath
    $startInfo.Arguments = '"' + $script:workerPath + '"' + $(if ($Once) { ' --once' } else { '' })
    $startInfo.WorkingDirectory = $PSScriptRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $script:workerProcess = [System.Diagnostics.Process]::Start($startInfo)
    try {
        $profile = $script:priorityProfiles[(Get-SelectedPriority)]
        $script:workerProcess.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::$($profile.ProcessPriority)
    } catch {
    }
}

$savedInterfaceSettings = Get-InterfaceSettings
$installedTask = Get-AnalyzerTask
$script:automaticEnabled = if ($null -ne $savedInterfaceSettings -and $null -ne $savedInterfaceSettings.automaticEnabled) {
    [bool] $savedInterfaceSettings.automaticEnabled
} else {
    $null -ne $installedTask -and $installedTask.State -ne 'Disabled'
}
Stop-OrphanWorkers
Save-InterfaceSettings

if ($SmokeTest) {
    $smokeTask = Get-AnalyzerTask
    Update-QueueStatus
    [pscustomobject]@{
        Interface = 'ready'
        TaskInstalled = ($null -ne $smokeTask)
        TaskState = if ($null -ne $smokeTask) { [string] $smokeTask.State } else { 'Missing' }
        WorkerScript = Test-Path -LiteralPath $script:workerPath
        LogAvailable = Test-Path -LiteralPath $script:logPath
        Priority = Get-SelectedPriority
        Queue = $script:queueStatus
    } | ConvertTo-Json
    exit 0
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$background = [System.Drawing.Color]::FromArgb(12, 18, 27)
$panelColor = [System.Drawing.Color]::FromArgb(20, 30, 43)
$panelBorder = [System.Drawing.Color]::FromArgb(42, 69, 91)
$primary = [System.Drawing.Color]::FromArgb(92, 218, 244)
$success = [System.Drawing.Color]::FromArgb(126, 224, 135)
$warning = [System.Drawing.Color]::FromArgb(255, 190, 80)
$textColor = [System.Drawing.Color]::FromArgb(227, 237, 247)
$muted = [System.Drawing.Color]::FromArgb(147, 168, 191)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'MaWay2000 Replay Analyzer'
$form.Size = New-Object System.Drawing.Size(930, 700)
$form.MinimumSize = New-Object System.Drawing.Size(930, 580)
$form.AutoScaleMode = 'None'
$form.StartPosition = 'CenterScreen'
$form.BackColor = $background
$form.ForeColor = $textColor
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = 'MaWay2000 Replay Analyzer'
$titleLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 22)
$titleLabel.ForeColor = $textColor
$titleLabel.AutoSize = $true
$titleLabel.Location = New-Object System.Drawing.Point(24, 19)
$form.Controls.Add($titleLabel)

$versionLabel = New-Object System.Windows.Forms.Label
$versionLabel.Text = 'v' + $script:analyzerVersion
$versionLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 8)
$versionLabel.ForeColor = $primary
$versionLabel.BackColor = $panelColor
$versionLabel.BorderStyle = 'FixedSingle'
$versionLabel.TextAlign = 'MiddleCenter'
$versionLabel.Size = New-Object System.Drawing.Size(58, 23)
$versionLabel.Location = New-Object System.Drawing.Point(($titleLabel.Left + $titleLabel.PreferredSize.Width + 12), 28)
$versionLabel.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($versionLabel)

$versionToolTip = New-Object System.Windows.Forms.ToolTip
$versionToolTip.SetToolTip($versionLabel, 'Click to view analyzer version history')
$versionLabel.Add_Click({
    [System.Windows.Forms.MessageBox]::Show(
        $form,
        $script:versionChangeLog.Trim(),
        'Analyzer version history',
        'OK',
        'Information'
    ) | Out-Null
})

$subtitleLabel = New-Object System.Windows.Forms.Label
$subtitleLabel.Text = 'Processes the Warzone replay queue and publishes confirmed statistics.'
$subtitleLabel.ForeColor = $muted
$subtitleLabel.AutoSize = $true
$subtitleLabel.Location = New-Object System.Drawing.Point(27, 62)
$form.Controls.Add($subtitleLabel)

$settingsButton = New-Object System.Windows.Forms.Button
$settingsButton.Text = 'Settings'
$settingsButton.Location = New-Object System.Drawing.Point(784, 24)
$settingsButton.Size = New-Object System.Drawing.Size(105, 36)
$settingsButton.Anchor = 'Top, Right'
$settingsButton.FlatStyle = 'Flat'
$settingsButton.FlatAppearance.BorderColor = $panelBorder
$settingsButton.BackColor = $panelColor
$settingsButton.ForeColor = $textColor
$settingsButton.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9)
$settingsButton.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($settingsButton)

$statusPanel = New-Object System.Windows.Forms.Panel
$statusPanel.Location = New-Object System.Drawing.Point(24, 95)
$statusPanel.Size = New-Object System.Drawing.Size(865, 112)
$statusPanel.Anchor = 'Top, Left, Right'
$statusPanel.BackColor = $panelColor
$statusPanel.BorderStyle = 'FixedSingle'
$form.Controls.Add($statusPanel)

$stateCaption = New-Object System.Windows.Forms.Label
$stateCaption.Text = 'ANALYZER STATUS'
$stateCaption.ForeColor = $muted
$stateCaption.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 8)
$stateCaption.AutoSize = $true
$stateCaption.Location = New-Object System.Drawing.Point(18, 15)
$statusPanel.Controls.Add($stateCaption)

$stateLabel = New-Object System.Windows.Forms.Label
$stateLabel.Text = 'Idle'
$stateLabel.ForeColor = $success
$stateLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 17)
$stateLabel.AutoSize = $true
$stateLabel.Location = New-Object System.Drawing.Point(17, 36)
$statusPanel.Controls.Add($stateLabel)

$automaticCaption = New-Object System.Windows.Forms.Label
$automaticCaption.Text = 'AUTOMATIC MODE'
$automaticCaption.ForeColor = $muted
$automaticCaption.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 8)
$automaticCaption.AutoSize = $true
$automaticCaption.Location = New-Object System.Drawing.Point(250, 15)
$statusPanel.Controls.Add($automaticCaption)

$automaticLabel = New-Object System.Windows.Forms.Label
$automaticLabel.Text = 'Disabled'
$automaticLabel.ForeColor = $warning
$automaticLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 17)
$automaticLabel.AutoSize = $true
$automaticLabel.Location = New-Object System.Drawing.Point(249, 36)
$statusPanel.Controls.Add($automaticLabel)

$safetyCaption = New-Object System.Windows.Forms.Label
$safetyCaption.Text = 'SAFE PROCESSING'
$safetyCaption.ForeColor = $muted
$safetyCaption.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 8)
$safetyCaption.AutoSize = $true
$safetyCaption.Location = New-Object System.Drawing.Point(500, 15)
$statusPanel.Controls.Add($safetyCaption)

$safetyLabel = New-Object System.Windows.Forms.Label
$safetyLabel.Text = 'Queue / low priority'
$safetyLabel.ForeColor = $primary
$safetyLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 15)
$safetyLabel.AutoSize = $true
$safetyLabel.Location = New-Object System.Drawing.Point(499, 38)
$statusPanel.Controls.Add($safetyLabel)

$lastActivityLabel = New-Object System.Windows.Forms.Label
$lastActivityLabel.Text = 'Last activity: loading...'
$lastActivityLabel.ForeColor = $muted
$lastActivityLabel.AutoEllipsis = $true
$lastActivityLabel.Location = New-Object System.Drawing.Point(19, 82)
$lastActivityLabel.Size = New-Object System.Drawing.Size(820, 21)
$lastActivityLabel.Anchor = 'Left, Top, Right'
$statusPanel.Controls.Add($lastActivityLabel)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(24, 243)
$progressBar.Size = New-Object System.Drawing.Size(865, 12)
$progressBar.Anchor = 'Top, Left, Right'
$progressBar.Style = 'Continuous'
$progressBar.Maximum = 1000
$form.Controls.Add($progressBar)

$progressLabel = New-Object System.Windows.Forms.Label
$progressLabel.Text = 'Game time: waiting'
$progressLabel.ForeColor = $muted
$progressLabel.AutoSize = $true
$progressLabel.Location = New-Object System.Drawing.Point(24, 217)
$form.Controls.Add($progressLabel)

function New-DashboardButton([string] $text, [int] $left, [int] $width, [System.Drawing.Color] $buttonColor) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $text
    $button.Location = New-Object System.Drawing.Point($left, 274)
    $button.Size = New-Object System.Drawing.Size($width, 42)
    $button.FlatStyle = 'Flat'
    $button.FlatAppearance.BorderSize = 0
    $button.BackColor = $buttonColor
    $button.ForeColor = [System.Drawing.Color]::FromArgb(7, 17, 23)
    $button.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10)
    $button.Cursor = [System.Windows.Forms.Cursors]::Hand
    $form.Controls.Add($button)
    return $button
}

$analyzeButton = New-DashboardButton 'Analyze next replay' 24 178 $primary
$stopButton = New-DashboardButton 'Stop' 212 90 $warning
$automaticButton = New-DashboardButton 'Enable automatic' 312 170 $success
$websiteButton = New-DashboardButton 'Open website' 492 125 ([System.Drawing.Color]::FromArgb(105, 143, 184))
$folderButton = New-DashboardButton 'Open logs' 627 115 ([System.Drawing.Color]::FromArgb(105, 143, 184))
$refreshButton = New-DashboardButton 'Refresh' 752 137 ([System.Drawing.Color]::FromArgb(105, 143, 184))
$refreshButton.Anchor = 'Top, Right'

$logCaption = New-Object System.Windows.Forms.Label
$logCaption.Text = 'RECENT ACTIVITY'
$logCaption.ForeColor = $muted
$logCaption.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9)
$logCaption.AutoSize = $true
$logCaption.Location = New-Object System.Drawing.Point(24, 337)
$form.Controls.Add($logCaption)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(24, 362)
$logBox.Size = New-Object System.Drawing.Size(865, 243)
$logBox.Anchor = 'Top, Bottom, Left, Right'
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = 'Vertical'
$logBox.BackColor = [System.Drawing.Color]::FromArgb(8, 14, 22)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(190, 210, 226)
$logBox.BorderStyle = 'FixedSingle'
$logBox.Font = New-Object System.Drawing.Font('Consolas', 9)
$form.Controls.Add($logBox)

$footerLabel = New-Object System.Windows.Forms.Label
$footerLabel.Text = 'Automatic mode is off by default. Enable it here when you are ready.'
$footerLabel.ForeColor = $muted
$footerLabel.AutoSize = $true
$footerLabel.Location = New-Object System.Drawing.Point(24, 620)
$footerLabel.Anchor = 'Bottom, Left'
$form.Controls.Add($footerLabel)

function Update-Dashboard([switch] $ForceLog) {
    if (([DateTime]::UtcNow - $script:lastAutomaticCheckUtc).TotalSeconds -ge 10) {
        Start-AutomaticWorkerIfNeeded
        $script:lastAutomaticCheckUtc = [DateTime]::UtcNow
    }
    $isRunning = Get-WorkerRunning
    $isEnabled = $script:automaticEnabled

    $progress = Read-AnalyzerProgress
    if ($ForceLog -or ([DateTime]::UtcNow - $script:lastQueueCheckUtc).TotalSeconds -ge 30) {
        Update-QueueStatus
    }
    $elapsedMilliseconds = if ($null -ne $progress) { [double] ($progress.elapsedMilliseconds) } else { 0 }
    $totalMilliseconds = if ($null -ne $progress) { [double] ($progress.totalMilliseconds) } else { 0 }
    $processingElapsedMilliseconds = if ($null -ne $progress) { Get-AnalysisElapsedMilliseconds ([long] $progress.matchId) } else { $null }
    $processingElapsedText = if ($null -ne $processingElapsedMilliseconds) { ' | Elapsed: ' + (Format-GameTime $processingElapsedMilliseconds) } else { '' }
    $hasGameProgress = $isRunning -and $totalMilliseconds -gt 0
    $selectedPriority = Get-SelectedPriority
    $queue = if ($isRunning -and $null -ne $progress -and $null -ne $progress.queue) {
        $progress.queue
    } else {
        $script:queueStatus
    }
    if ($null -ne $queue) {
        $safetyLabel.Text = 'Queue ' + $queue.pending + ' pending / ' + $queue.failed + ' failed'
    } else {
        $safetyLabel.Text = 'Queue / ' + $selectedPriority.ToLowerInvariant() + ' priority'
    }

    if ($isRunning) {
        if ($null -ne $progress -and $progress.phase -eq 'downloading') {
            $stateLabel.Text = 'Downloading replay'
        } elseif ($null -ne $progress -and $progress.phase -eq 'finalizing') {
            $stateLabel.Text = 'Saving statistics'
        } else {
            $stateLabel.Text = 'Analyzing replay'
        }
        $stateLabel.ForeColor = $primary
        if ($hasGameProgress) {
            $progressBar.MarqueeAnimationSpeed = 0
            $progressBar.Style = 'Continuous'
            $progressBar.Value = [math]::Max(0, [math]::Min(1000, [math]::Round(($elapsedMilliseconds / $totalMilliseconds) * 1000)))
            $progressLabel.Text = 'Game time: ' + (Format-GameTime $elapsedMilliseconds) + ' / ' + (Format-GameTime $totalMilliseconds) + $processingElapsedText
        } else {
            $progressBar.Style = 'Marquee'
            $progressBar.MarqueeAnimationSpeed = 24
            $progressLabel.Text = 'Game time: preparing replay' + $processingElapsedText
        }
    } else {
        $stateLabel.Text = 'Idle'
        $stateLabel.ForeColor = $success
        $progressBar.MarqueeAnimationSpeed = 0
        $progressBar.Style = 'Continuous'
        $progressBar.Value = 0
        $progressLabel.Text = 'Game time: waiting for replay'
    }

    if ($isEnabled) {
        $automaticLabel.Text = 'Enabled'
        $automaticLabel.ForeColor = $success
        $automaticButton.Text = 'Disable automatic'
        $automaticButton.Enabled = $true
        $footerLabel.Text = 'Automatic mode enabled. Queued replays run continuously.'
    } else {
        $automaticLabel.Text = 'Disabled'
        $automaticLabel.ForeColor = $warning
        $automaticButton.Text = 'Enable automatic'
        $automaticButton.Enabled = $true
        $footerLabel.Text = 'Automatic mode disabled. You can still analyze one replay manually.'
    }
    if ($null -ne $queue) {
        $footerLabel.Text += ' Pending: ' + $queue.pending + '; completed: ' + $queue.completed + '; unknown: ' + $queue.unknown + '; failed: ' + $queue.failed + '.'
    }

    $analyzeButton.Enabled = -not $isRunning
    $stopButton.Enabled = $isRunning
    $lastActivityLabel.Text = 'Last activity: ' + (Get-LastActivityText)

    if (Test-Path -LiteralPath $script:logPath) {
        $currentWriteUtc = (Get-Item -LiteralPath $script:logPath).LastWriteTimeUtc
        if ($ForceLog -or $currentWriteUtc -ne $script:lastLogWriteUtc) {
            $logBox.Text = Read-RecentLog
            $logBox.SelectionStart = $logBox.TextLength
            $logBox.ScrollToCaret()
            $script:lastLogWriteUtc = $currentWriteUtc
        }
    } elseif ($ForceLog) {
        $logBox.Text = Read-RecentLog
    }
}

$analyzeButton.Add_Click({
    try {
        Start-AppWorker -Once
        Update-Dashboard -ForceLog
    } catch {
        [System.Windows.Forms.MessageBox]::Show($form, $_.Exception.Message, 'Could not start analyzer', 'OK', 'Error') | Out-Null
    }
})

$stopButton.Add_Click({
    Stop-ManualWorker
    Update-Dashboard -ForceLog
})

$automaticButton.Add_Click({
    try {
        if (-not $script:automaticEnabled) {
            $script:automaticEnabled = $true
            Save-InterfaceSettings
            Start-AutomaticWorkerIfNeeded
            $footerLabel.Text = 'Automatic mode enabled. Queued replays will run continuously.'
        } else {
            $script:automaticEnabled = $false
            Save-InterfaceSettings
            Stop-ManualWorker
            $footerLabel.Text = 'Automatic mode disabled.'
        }
        Update-Dashboard -ForceLog
    } catch {
        [System.Windows.Forms.MessageBox]::Show($form, $_.Exception.Message, 'Automatic mode', 'OK', 'Error') | Out-Null
    }
})

$websiteButton.Add_Click({
    Start-Process 'https://maway2000.github.io/boha/?tab=recent-matches'
})

$folderButton.Add_Click({
    if (-not (Test-Path -LiteralPath $script:dataDirectory)) {
        New-Item -ItemType Directory -Path $script:dataDirectory -Force | Out-Null
    }
    Start-Process explorer.exe -ArgumentList ('"' + $script:dataDirectory + '"')
})

$refreshButton.Add_Click({ Update-Dashboard -ForceLog })

$settingsButton.Add_Click({
    $settingsForm = New-Object System.Windows.Forms.Form
    $settingsForm.Text = 'Analyzer settings'
    $settingsForm.Size = New-Object System.Drawing.Size(470, 285)
    $settingsForm.FormBorderStyle = 'FixedDialog'
    $settingsForm.MaximizeBox = $false
    $settingsForm.MinimizeBox = $false
    $settingsForm.StartPosition = 'CenterParent'
    $settingsForm.BackColor = $background
    $settingsForm.ForeColor = $textColor
    $settingsForm.Font = New-Object System.Drawing.Font('Segoe UI', 10)

    $settingsTitle = New-Object System.Windows.Forms.Label
    $settingsTitle.Text = 'Processing priority'
    $settingsTitle.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 16)
    $settingsTitle.AutoSize = $true
    $settingsTitle.Location = New-Object System.Drawing.Point(22, 20)
    $settingsForm.Controls.Add($settingsTitle)

    $settingsHelp = New-Object System.Windows.Forms.Label
    $settingsHelp.Text = 'Choose how much CPU time the replay analyzer may receive.'
    $settingsHelp.ForeColor = $muted
    $settingsHelp.AutoSize = $true
    $settingsHelp.Location = New-Object System.Drawing.Point(24, 58)
    $settingsForm.Controls.Add($settingsHelp)

    $priorityBox = New-Object System.Windows.Forms.ComboBox
    $priorityBox.DropDownStyle = 'DropDownList'
    $priorityBox.Location = New-Object System.Drawing.Point(27, 92)
    $priorityBox.Size = New-Object System.Drawing.Size(400, 30)
    [void] $priorityBox.Items.Add('Low')
    [void] $priorityBox.Items.Add('Below normal')
    [void] $priorityBox.Items.Add('Normal')
    [void] $priorityBox.Items.Add('High')
    $priorityBox.SelectedItem = Get-SelectedPriority
    $settingsForm.Controls.Add($priorityBox)

    $priorityDescription = New-Object System.Windows.Forms.Label
    $priorityDescription.ForeColor = $primary
    $priorityDescription.Location = New-Object System.Drawing.Point(24, 135)
    $priorityDescription.Size = New-Object System.Drawing.Size(405, 42)
    $priorityDescription.Text = $script:priorityProfiles[[string] $priorityBox.SelectedItem].Description
    $settingsForm.Controls.Add($priorityDescription)

    $priorityBox.Add_SelectedIndexChanged({
        $priorityDescription.Text = $script:priorityProfiles[[string] $priorityBox.SelectedItem].Description
    })

    $retryFailedButton = New-Object System.Windows.Forms.Button
    $retryFailedButton.Text = 'Retry failed jobs'
    $retryFailedButton.Location = New-Object System.Drawing.Point(27, 191)
    $retryFailedButton.Size = New-Object System.Drawing.Size(180, 36)
    $retryFailedButton.FlatStyle = 'Flat'
    $retryFailedButton.FlatAppearance.BorderColor = $warning
    $retryFailedButton.BackColor = $panelColor
    $retryFailedButton.ForeColor = $warning
    $settingsForm.Controls.Add($retryFailedButton)

    $saveSettingsButton = New-Object System.Windows.Forms.Button
    $saveSettingsButton.Text = 'Apply'
    $saveSettingsButton.Location = New-Object System.Drawing.Point(237, 191)
    $saveSettingsButton.Size = New-Object System.Drawing.Size(90, 36)
    $saveSettingsButton.FlatStyle = 'Flat'
    $saveSettingsButton.FlatAppearance.BorderSize = 0
    $saveSettingsButton.BackColor = $success
    $saveSettingsButton.ForeColor = [System.Drawing.Color]::FromArgb(7, 17, 23)
    $settingsForm.Controls.Add($saveSettingsButton)

    $cancelSettingsButton = New-Object System.Windows.Forms.Button
    $cancelSettingsButton.Text = 'Cancel'
    $cancelSettingsButton.Location = New-Object System.Drawing.Point(337, 191)
    $cancelSettingsButton.Size = New-Object System.Drawing.Size(90, 36)
    $cancelSettingsButton.FlatStyle = 'Flat'
    $cancelSettingsButton.FlatAppearance.BorderColor = $panelBorder
    $cancelSettingsButton.BackColor = $panelColor
    $cancelSettingsButton.ForeColor = $textColor
    $settingsForm.Controls.Add($cancelSettingsButton)

    $saveSettingsButton.Add_Click({
        try {
            Set-AnalyzerPriority ([string] $priorityBox.SelectedItem)
            $settingsForm.DialogResult = 'OK'
            $settingsForm.Close()
        } catch {
            [System.Windows.Forms.MessageBox]::Show($settingsForm, $_.Exception.Message, 'Could not change priority', 'OK', 'Error') | Out-Null
        }
    })
    $retryFailedButton.Add_Click({
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $script:nodePath
        $startInfo.Arguments = '"' + $script:workerPath + '" --retry-failed'
        $startInfo.WorkingDirectory = $PSScriptRoot
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        [void] [System.Diagnostics.Process]::Start($startInfo)
        $settingsForm.Close()
    })
    $cancelSettingsButton.Add_Click({ $settingsForm.Close() })

    [void] $settingsForm.ShowDialog($form)
    Update-Dashboard -ForceLog
})

$refreshTimer = New-Object System.Windows.Forms.Timer
$refreshTimer.Interval = 2500
$refreshTimer.Add_Tick({ Update-Dashboard })
$refreshTimer.Start()

$form.Add_FormClosing({
    Stop-ManualWorker
})

Update-Dashboard -ForceLog
[void] $form.ShowDialog()
