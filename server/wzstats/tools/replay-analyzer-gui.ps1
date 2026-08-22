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
$script:appVersion = '3.4.9'
$script:versionChangeLog = @"
Version 3.4.9
- Prioritizes untouched replays ahead of failed analysis retries.
- Delays unknown and error retries for six hours.
- Restricts worker log rotation to worker 1.

Version 3.4.8
- Cleans obsolete progress and lock files for inactive workers.
- Writes timestamps to software update history entries.
- Rotates the worker activity log at 5 MB and keeps one backup.

Version 3.4.7
- Moves queue status and retry state out of large telemetry records.
- Prevents claims from succeeding before a failed queue-status response.
- Preserves worker progress details when a server request fails.
- Adds exponential retry backoff and contextual API error logging.

Version 3.4.6
- Removes blocking server polling from the interface timer.
- Prevents repeated failed status requests from locking the controls.
- Shows cached queue totals even while automatic mode is disabled.

Version 3.4.5
- Restores pending, completed, unknown and failed queue totals.
- Uses the latest queue snapshot available from any active worker.

Version 3.4.4
- Moved replay claims from large telemetry records to an indexed claim table.
- Releases claims immediately when worker results are accepted.
- Reduces database load during concurrent queue requests.

Version 3.4.3
- Replaced database row locking with a lightweight queue claim lock.
- Prevents shared-hosting MySQL disconnects during concurrent job requests.

Version 3.4.2
- Keeps the interface responsive while workers are active.
- Fixes expiring server claims that allowed duplicate replay assignments.
- Cleans up orphaned headless Warzone replay processes at startup.

Version 3.4.1
- Worker rows show match ID, map, processing phase and replay time.
- Worker rows show real runtime and estimated time remaining.

Version 3.4.0
- Configurable 1-4 concurrent replay workers.
- Two workers enabled by default.
- Separate worker progress, locks and pending-result storage.
- Atomic server-side replay claims prevent duplicate processing.

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
$script:versionStatePath = Join-Path $script:dataDirectory 'software-version.json'
$script:updateLogPath = Join-Path $script:dataDirectory 'software-update.log'
$script:trackedSoftwareFiles = @(
    @{ name = 'analyzer-core'; path = $script:analyzerPath },
    @{ name = 'worker-core'; path = $script:workerPath },
    @{ name = 'gui'; path = $script:MyInvocation.MyCommand.Path }
)
$script:defaultPollSeconds = 300
$script:defaultRetrySeconds = 30
$script:defaultMaxPendingAttempts = 5
$script:defaultWorkerCount = 2
$script:settingsPath = Join-Path $script:dataDirectory 'interface-settings.json'
$script:workerProcesses = @{}
$script:lastLogWriteUtc = [DateTime]::MinValue
$script:lastQueueCheckUtc = [DateTime]::MinValue
$script:lastAutomaticCheckUtc = [DateTime]::MinValue
$script:automaticEnabled = $false
$script:queueStatus = $null

function Remove-ObsoleteWorkerState {
    $configuredWorkerCount = $script:defaultWorkerCount
    if (Test-Path -LiteralPath $script:settingsPath) {
        try {
            $savedSettings = Get-Content -LiteralPath $script:settingsPath -Raw | ConvertFrom-Json
            $savedWorkerCount = [int] $savedSettings.workerCount
            if ($savedWorkerCount -ge 1 -and $savedWorkerCount -le 4) {
                $configuredWorkerCount = $savedWorkerCount
            }
        } catch {
            $configuredWorkerCount = $script:defaultWorkerCount
        }
    }

    $inactiveWorkerIds = @(($configuredWorkerCount + 1)..4 | Where-Object { $_ -gt $configuredWorkerCount -and $_ -le 4 })
    foreach ($workerId in $inactiveWorkerIds) {
        $lockPath = Join-Path $script:dataDirectory ("worker-{0}.lock" -f $workerId)
        $progressPath = Join-Path $script:dataDirectory ("progress-{0}.json" -f $workerId)
        $ownerIsRunning = $false
        if (Test-Path -LiteralPath $lockPath) {
            try {
                $ownerPid = [int] ((Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json).pid)
                $ownerIsRunning = $null -ne (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)
            } catch {
                $ownerIsRunning = $false
            }
        }
        if (-not $ownerIsRunning) {
            Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $progressPath -Force -ErrorAction SilentlyContinue
        }
    }

    $legacyLockPath = Join-Path $script:dataDirectory 'worker.lock'
    $legacyProgressPath = Join-Path $script:dataDirectory 'progress.json'
    $legacyOwnerIsRunning = $false
    if (Test-Path -LiteralPath $legacyLockPath) {
        try {
            $legacyOwnerPid = [int] ((Get-Content -LiteralPath $legacyLockPath -Raw | ConvertFrom-Json).pid)
            $legacyOwnerIsRunning = $null -ne (Get-Process -Id $legacyOwnerPid -ErrorAction SilentlyContinue)
        } catch {
            $legacyOwnerIsRunning = $false
        }
    }
    if (-not $legacyOwnerIsRunning) {
        Remove-Item -LiteralPath $legacyLockPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $legacyProgressPath -Force -ErrorAction SilentlyContinue
    }
}

Remove-ObsoleteWorkerState

$script:priorityProfiles = @{
    'Low' = @{ TaskPriority = 10; ProcessPriority = 'Idle'; Description = 'Minimum CPU impact. Analysis takes longer.' }
    'Below normal' = @{ TaskPriority = 8; ProcessPriority = 'BelowNormal'; Description = 'Recommended. Keeps the computer responsive while analyzing.' }
    'Normal' = @{ TaskPriority = 5; ProcessPriority = 'Normal'; Description = 'Faster analysis, but it can make other applications less responsive.' }
    'High' = @{ TaskPriority = 1; ProcessPriority = 'High'; Description = 'Maximum analyzer performance. The computer may become difficult to use while processing.' }
}

function Get-AnalyzerTask {
    Get-ScheduledTask -TaskName $script:taskName -ErrorAction SilentlyContinue
}

function Get-WorkerRunning([int] $WorkerId) {
    if ($script:workerProcesses.ContainsKey($WorkerId)) {
        $workerProcess = $script:workerProcesses[$WorkerId]
        try {
            if (-not $workerProcess.HasExited) {
                return $true
            }
        } catch {
        }
        $script:workerProcesses.Remove($WorkerId)
    }
    return $false
}

function Get-RunningWorkerCount {
    $count = 0
    foreach ($workerId in 1..4) {
        if (Get-WorkerRunning $workerId) { $count++ }
    }
    return $count
}

function Start-AutomaticWorkerIfNeeded {
    if (-not $script:automaticEnabled) {
        return
    }
    $workerSettings = Get-WorkerSettings
    foreach ($workerId in 1..$workerSettings.workerCount) {
        if (-not (Get-WorkerRunning $workerId)) {
            Start-AppWorker -WorkerId $workerId
        }
    }
    foreach ($workerId in @($script:workerProcesses.Keys)) {
        if ([int] $workerId -gt $workerSettings.workerCount) {
            Stop-AppWorker -WorkerId ([int] $workerId)
        }
    }
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

function Get-WorkerSettingInt {
    param(
        [object] $Settings,
        [string] $Name,
        [int] $Minimum,
        [int] $Maximum,
        [int] $Fallback
    )
    if ($null -eq $Settings -or -not (Get-Member -InputObject $Settings -Name $Name -MemberType Properties)) {
        return $Fallback
    }
    try {
        $value = [int] $Settings.$Name
    } catch {
        return $Fallback
    }
    if ($value -lt $Minimum -or $value -gt $Maximum) {
        return $Fallback
    }
    return $value
}

function Clamp-WorkerSettingInt {
    param(
        [object] $Value,
        [int] $Minimum,
        [int] $Maximum,
        [int] $Fallback
    )
    try {
        $parsed = [int] $Value
    } catch {
        return $Fallback
    }
    if ($parsed -lt $Minimum -or $parsed -gt $Maximum) {
        return $Fallback
    }
    return $parsed
}

function Get-WorkerSettings {
    $settings = Get-InterfaceSettings
    return @{
        pollSeconds = Get-WorkerSettingInt -Settings $settings -Name 'pollSeconds' -Minimum 15 -Maximum 3600 -Fallback $script:defaultPollSeconds
        retrySeconds = Get-WorkerSettingInt -Settings $settings -Name 'retrySeconds' -Minimum 5 -Maximum 600 -Fallback $script:defaultRetrySeconds
        maxPendingAttempts = Get-WorkerSettingInt -Settings $settings -Name 'maxPendingAttempts' -Minimum 1 -Maximum 20 -Fallback $script:defaultMaxPendingAttempts
        workerCount = Get-WorkerSettingInt -Settings $settings -Name 'workerCount' -Minimum 1 -Maximum 4 -Fallback $script:defaultWorkerCount
    }
}

function Save-InterfaceSettings {
    param(
        [object] $Priority = $null,
        [object] $PollSeconds = $null,
        [object] $RetrySeconds = $null,
        [object] $MaxPendingAttempts = $null,
        [object] $WorkerCount = $null
    )
    if (-not (Test-Path -LiteralPath $script:dataDirectory)) {
        New-Item -ItemType Directory -Path $script:dataDirectory -Force | Out-Null
    }
    $selectedPriority = Get-SelectedPriority
    if ($null -ne $Priority -and $script:priorityProfiles.ContainsKey([string] $Priority)) {
        $selectedPriority = [string] $Priority
    }
    $existingSettings = Get-InterfaceSettings
    $storedPollSeconds = Get-WorkerSettingInt -Settings $existingSettings -Name 'pollSeconds' -Minimum 15 -Maximum 3600 -Fallback $script:defaultPollSeconds
    $storedRetrySeconds = Get-WorkerSettingInt -Settings $existingSettings -Name 'retrySeconds' -Minimum 5 -Maximum 600 -Fallback $script:defaultRetrySeconds
    $storedMaxPendingAttempts = Get-WorkerSettingInt -Settings $existingSettings -Name 'maxPendingAttempts' -Minimum 1 -Maximum 20 -Fallback $script:defaultMaxPendingAttempts
    $storedWorkerCount = Get-WorkerSettingInt -Settings $existingSettings -Name 'workerCount' -Minimum 1 -Maximum 4 -Fallback $script:defaultWorkerCount
    $pollSecondsValue = if ($null -eq $PollSeconds) { $storedPollSeconds } else { Clamp-WorkerSettingInt -Value $PollSeconds -Minimum 15 -Maximum 3600 -Fallback $storedPollSeconds }
    $retrySecondsValue = if ($null -eq $RetrySeconds) { $storedRetrySeconds } else { Clamp-WorkerSettingInt -Value $RetrySeconds -Minimum 5 -Maximum 600 -Fallback $storedRetrySeconds }
    $maxPendingAttemptsValue = if ($null -eq $MaxPendingAttempts) { $storedMaxPendingAttempts } else { Clamp-WorkerSettingInt -Value $MaxPendingAttempts -Minimum 1 -Maximum 20 -Fallback $storedMaxPendingAttempts }
    $workerCountValue = if ($null -eq $WorkerCount) { $storedWorkerCount } else { Clamp-WorkerSettingInt -Value $WorkerCount -Minimum 1 -Maximum 4 -Fallback $storedWorkerCount }
    @{
        priority = $selectedPriority
        automaticEnabled = $script:automaticEnabled
        pollSeconds = $pollSecondsValue
        retrySeconds = $retrySecondsValue
        maxPendingAttempts = $maxPendingAttemptsValue
        workerCount = $workerCountValue
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
    $currentWorkerSettings = Get-WorkerSettings
    Save-InterfaceSettings -Priority $priorityName -PollSeconds $currentWorkerSettings.pollSeconds -RetrySeconds $currentWorkerSettings.retrySeconds -MaxPendingAttempts $currentWorkerSettings.maxPendingAttempts

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
    foreach ($workerProcess in @($script:workerProcesses.Values)) {
        try { $workerProcess.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::$($profile.ProcessPriority) } catch {}
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

function Get-SoftwareFileFingerprint {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    $item = Get-Item -LiteralPath $Path
    return @{
        path = $Path
        bytes = [long] $item.Length
        lastWriteUtc = $item.LastWriteTimeUtc.ToString('o')
        sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    }
}

function Read-SoftwareUpdateState {
    if (-not (Test-Path -LiteralPath $script:versionStatePath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $script:versionStatePath -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Write-SoftwareUpdateState {
    param([pscustomobject] $State)
    if (-not (Test-Path -LiteralPath $script:dataDirectory)) {
        New-Item -ItemType Directory -Path $script:dataDirectory -Force | Out-Null
    }
    $State | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $script:versionStatePath -Encoding UTF8
}

function Append-SoftwareUpdateLog {
    param([string] $Message, [object] $Details = $null)
    if (-not (Test-Path -LiteralPath $script:dataDirectory)) {
        New-Item -ItemType Directory -Path $script:dataDirectory -Force | Out-Null
    }
    $line = "[${([DateTime]::UtcNow.ToString('o'))}] ${Message}"
    if ($null -ne $Details) {
        $line = "${line} $((ConvertTo-Json $Details -Compress))"
    }
    Add-Content -LiteralPath $script:updateLogPath -Value $line -Encoding UTF8
}

function Register-SoftwareUpdateState {
    try {
        $previousState = Read-SoftwareUpdateState
        $currentFiles = @{}
        foreach ($file in $script:trackedSoftwareFiles) {
            $fingerprint = Get-SoftwareFileFingerprint -Path $file.path
            if ($null -ne $fingerprint) {
                $currentFiles[$file.name] = $fingerprint
            }
        }
        if ($null -ne $previousState -and $null -ne $previousState.version) {
            $previousVersion = [string] $previousState.version
        } else {
            $previousVersion = ''
        }
        $changedVersion = ($previousVersion -ne $script:appVersion)
        $changedFiles = @()

        if ($null -ne $previousState -and $null -ne $previousState.files) {
            foreach ($entry in $currentFiles.GetEnumerator()) {
                $previousFile = $null
                try {
                    $previousFile = $previousState.files.($entry.Key)
                } catch {
                    $previousFile = $null
                }
                if ($null -eq $previousFile -or $previousFile.sha256 -ne $entry.Value.sha256) {
                    $changedFiles += $entry.Key
                }
            }
            $trackedCurrent = @($currentFiles.Keys)
            foreach ($name in @($previousState.files.PSObject.Properties.Name)) {
                if (-not $currentFiles.ContainsKey($name)) {
                    $changedFiles += $name
                }
            }
        }

        function Append-SoftwareUpdateLog {
            param(
                [Parameter(Mandatory = $true)][string] $Message,
                [Parameter(Mandatory = $true)][hashtable] $Details
            )
            $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
            $detailsJson = $Details | ConvertTo-Json -Compress -Depth 5
            Add-Content -LiteralPath $script:updateLogPath -Value ("[{0}] {1} {2}" -f $timestamp, $Message, $detailsJson) -Encoding UTF8
        }

        $needsLog = ($null -eq $previousState) -or $changedVersion -or $changedFiles.Count -gt 0
        $changedFiles = @($changedFiles | Sort-Object -Unique)
        if ($needsLog) {
            $event = if ($null -eq $previousState) { 'software installed' } else { 'software updated' }
            $message = if ($null -eq $previousState) {
                "Software installed: v$($script:appVersion)"
            } elseif ($changedVersion) {
                "Software version updated: v${previousVersion} -> v$($script:appVersion)"
            } else {
                'Software files changed'
            }
            if ($previousVersion -eq '') {
                $previousVersion = $script:appVersion
            }
            Append-SoftwareUpdateLog -Message $message -Details @{
                event = $event
                previousVersion = $previousVersion
                currentVersion = $script:appVersion
                changedFiles = $changedFiles
            }
        }

        Write-SoftwareUpdateState -State ([pscustomobject]@{
            version = $script:appVersion
            files = $currentFiles
            updatedAt = [DateTime]::UtcNow.ToString('o')
            event = if ($null -eq $previousState) { 'install' } else { 'update' }
        })
    } catch {
        Append-SoftwareUpdateLog -Message 'Software update tracker encountered an error.' -Details @{
            error = $_.Exception.Message
        }
    }
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

function Read-AnalyzerProgress([int] $WorkerId) {
    $progressPath = Join-Path $script:dataDirectory ("progress-{0}.json" -f $WorkerId)
    if (-not (Test-Path -LiteralPath $progressPath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $progressPath -Raw | ConvertFrom-Json
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
    } catch {
    } finally {
        $script:lastQueueCheckUtc = [DateTime]::UtcNow
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

function Get-AnalysisElapsedMilliseconds([long] $matchId, [int] $workerId = 0) {
    if ($matchId -le 0 -or -not (Test-Path -LiteralPath $script:logPath)) {
        return $null
    }

    $lines = @(Get-Content -LiteralPath $script:logPath -Tail 120 -ErrorAction SilentlyContinue)
    [array]::Reverse($lines)
    foreach ($line in $lines) {
        if ($line -match '^\[(?<Timestamp>\d{4}-\d{2}-\d{2}T[^\]]+Z)\] Analyzing replay\.') {
            $timestamp = $Matches.Timestamp
            $workerMatches = $workerId -le 0 -or $line -match ('"workerId":"' + $workerId + '"')
            if ($workerMatches -and $line -match ('"matchId":' + $matchId + '(?:,|})')) {
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

function Stop-AppWorker([int] $WorkerId) {
    if (-not $script:workerProcesses.ContainsKey($WorkerId)) {
        return
    }
    $workerProcess = $script:workerProcesses[$WorkerId]
    try {
        if (-not $workerProcess.HasExited) {
            Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\taskkill.exe') `
                -ArgumentList @('/PID', $workerProcess.Id, '/T', '/F') `
                -WindowStyle Hidden -Wait | Out-Null
        }
    } catch {
    }
    $script:workerProcesses.Remove($WorkerId)
}

function Stop-ManualWorker {
    foreach ($workerId in @($script:workerProcesses.Keys)) {
        Stop-AppWorker -WorkerId ([int] $workerId)
    }
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

    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -eq 'warzone2100.exe' -and $_.CommandLine -like '*--loadreplay=probe*'
    } | ForEach-Object {
        try {
            Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\taskkill.exe') `
                -ArgumentList @('/PID', $_.ProcessId, '/T', '/F') `
                -WindowStyle Hidden -Wait | Out-Null
        } catch {
        }
    }
}

function Start-AppWorker([int] $WorkerId = 1, [switch] $Once) {
    if (Get-WorkerRunning $WorkerId) {
        return
    }
    $workerSettings = Get-WorkerSettings
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $script:nodePath
    $startInfo.Arguments = '"' + $script:workerPath + '" --worker-id=' + $WorkerId + $(if ($Once) { ' --once' } else { '' })
    $startInfo.WorkingDirectory = $PSScriptRoot
    $startInfo.EnvironmentVariables['WZ_POLL_SECONDS'] = [string] $workerSettings.pollSeconds
    $startInfo.EnvironmentVariables['WZ_RETRY_SECONDS'] = [string] $workerSettings.retrySeconds
    $startInfo.EnvironmentVariables['WZ_MAX_PENDING_RESULT_ATTEMPTS'] = [string] $workerSettings.maxPendingAttempts
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $script:workerProcesses[$WorkerId] = [System.Diagnostics.Process]::Start($startInfo)
    try {
        $profile = $script:priorityProfiles[(Get-SelectedPriority)]
        $script:workerProcesses[$WorkerId].PriorityClass = [System.Diagnostics.ProcessPriorityClass]::$($profile.ProcessPriority)
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
Register-SoftwareUpdateState

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
$form.Size = New-Object System.Drawing.Size(930, 800)
$form.MinimumSize = New-Object System.Drawing.Size(930, 700)
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
$versionLabel.Text = 'v' + $script:appVersion
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

$progressBars = @{}
$progressLabels = @{}
foreach ($workerId in 1..4) {
    $progressLabel = New-Object System.Windows.Forms.Label
    $progressLabel.Text = "Worker ${workerId}: waiting for replay"
    $progressLabel.ForeColor = $muted
    $progressLabel.AutoSize = $false
    $progressLabel.AutoEllipsis = $true
    $progressLabel.Size = New-Object System.Drawing.Size(865, 21)
    $progressLabel.Anchor = 'Top, Left, Right'
    $progressLabel.Location = New-Object System.Drawing.Point(24, (211 + (($workerId - 1) * 34)))
    $form.Controls.Add($progressLabel)
    $progressLabels[$workerId] = $progressLabel

    $progressBar = New-Object System.Windows.Forms.ProgressBar
    $progressBar.Location = New-Object System.Drawing.Point(24, (235 + (($workerId - 1) * 34)))
    $progressBar.Size = New-Object System.Drawing.Size(865, 10)
    $progressBar.Anchor = 'Top, Left, Right'
    $progressBar.Style = 'Continuous'
    $progressBar.Maximum = 1000
    $form.Controls.Add($progressBar)
    $progressBars[$workerId] = $progressBar
}

function New-DashboardButton([string] $text, [int] $left, [int] $width, [System.Drawing.Color] $buttonColor) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $text
    $button.Location = New-Object System.Drawing.Point($left, 354)
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
$logCaption.Location = New-Object System.Drawing.Point(24, 417)
$form.Controls.Add($logCaption)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(24, 442)
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
$footerLabel.Location = New-Object System.Drawing.Point(24, 700)
$footerLabel.Anchor = 'Bottom, Left'
$form.Controls.Add($footerLabel)

function Update-Dashboard([switch] $ForceLog) {
    if (([DateTime]::UtcNow - $script:lastAutomaticCheckUtc).TotalSeconds -ge 10) {
        Start-AutomaticWorkerIfNeeded
        $script:lastAutomaticCheckUtc = [DateTime]::UtcNow
    }
    $runningWorkerCount = Get-RunningWorkerCount
    $isRunning = $runningWorkerCount -gt 0
    $isEnabled = $script:automaticEnabled
    $workerSettings = Get-WorkerSettings
    $progress = Read-AnalyzerProgress 1
    foreach ($workerId in 1..$workerSettings.workerCount) {
        $queueProgress = Read-AnalyzerProgress $workerId
        if ($null -ne $queueProgress -and $null -ne $queueProgress.queue) {
            $script:queueStatus = $queueProgress.queue
            break
        }
    }
    $selectedPriority = Get-SelectedPriority
    $queue = $script:queueStatus
    if ($null -ne $queue) {
        $safetyLabel.Text = 'Queue ' + $queue.pending + ' pending / ' + $queue.failed + ' failed'
    } else {
        $safetyLabel.Text = 'Queue / ' + $selectedPriority.ToLowerInvariant() + ' priority'
    }

    if ($isRunning) {
        $stateLabel.Text = "Analyzing ${runningWorkerCount} replay" + $(if ($runningWorkerCount -eq 1) { '' } else { 's' })
        $stateLabel.ForeColor = $primary
    } else {
        $stateLabel.Text = 'Idle'
        $stateLabel.ForeColor = $success
    }
    foreach ($workerId in 1..4) {
        $workerVisible = $workerId -le $workerSettings.workerCount
        $progressLabels[$workerId].Visible = $workerVisible
        $progressBars[$workerId].Visible = $workerVisible
        if (-not $workerVisible) { continue }
        $workerRunning = Get-WorkerRunning $workerId
        $workerProgress = Read-AnalyzerProgress $workerId
        $elapsedMilliseconds = if ($null -ne $workerProgress) { [double] ($workerProgress.elapsedMilliseconds) } else { 0 }
        $totalMilliseconds = if ($null -ne $workerProgress) { [double] ($workerProgress.totalMilliseconds) } else { 0 }
        $processingElapsedMilliseconds = if ($workerRunning -and $null -ne $workerProgress) { Get-AnalysisElapsedMilliseconds ([long] $workerProgress.matchId) $workerId } else { $null }
        $phaseLabels = @{ downloading = 'Downloading'; replay = 'Analyzing'; finalizing = 'Uploading'; complete = 'Complete' }
        $phaseKey = if ($null -ne $workerProgress) { [string] $workerProgress.phase } else { '' }
        $phaseText = if ($phaseLabels.ContainsKey($phaseKey)) { $phaseLabels[$phaseKey] } else { 'Preparing' }
        $workerDetails = "Worker ${workerId}"
        if ($null -ne $workerProgress -and [long] $workerProgress.matchId -gt 0) {
            $workerDetails += ' | Match #' + [long] $workerProgress.matchId
        }
        if ($null -ne $workerProgress -and -not [string]::IsNullOrWhiteSpace([string] $workerProgress.map)) {
            $workerDetails += ' | ' + [string] $workerProgress.map
        }
        $workerDetails += ' | ' + $phaseText
        if ($null -ne $processingElapsedMilliseconds) {
            $workerDetails += ' | Runtime ' + (Format-GameTime $processingElapsedMilliseconds)
        }
        if ($workerRunning -and $totalMilliseconds -gt 0) {
            $progressBars[$workerId].MarqueeAnimationSpeed = 0
            $progressBars[$workerId].Style = 'Continuous'
            $progressBars[$workerId].Value = [math]::Max(0, [math]::Min(1000, [math]::Round(($elapsedMilliseconds / $totalMilliseconds) * 1000)))
            $workerDetails += ' | Replay ' + (Format-GameTime $elapsedMilliseconds) + ' / ' + (Format-GameTime $totalMilliseconds)
            if ($null -ne $processingElapsedMilliseconds -and $elapsedMilliseconds -gt 0 -and $totalMilliseconds -gt $elapsedMilliseconds) {
                $estimatedRemainingMilliseconds = $processingElapsedMilliseconds * (($totalMilliseconds - $elapsedMilliseconds) / $elapsedMilliseconds)
                $workerDetails += ' | ETA ~' + (Format-GameTime $estimatedRemainingMilliseconds)
            }
            $progressLabels[$workerId].Text = $workerDetails
        } elseif ($workerRunning) {
            $progressBars[$workerId].Style = 'Marquee'
            $progressBars[$workerId].MarqueeAnimationSpeed = 24
            $progressLabels[$workerId].Text = $workerDetails
        } else {
            $progressBars[$workerId].MarqueeAnimationSpeed = 0
            $progressBars[$workerId].Style = 'Continuous'
            $progressBars[$workerId].Value = 0
            $progressLabels[$workerId].Text = "Worker ${workerId}: waiting for replay"
        }
    }

    if ($isEnabled) {
        $automaticLabel.Text = 'Enabled'
        $automaticLabel.ForeColor = $success
        $automaticButton.Text = 'Disable automatic'
        $automaticButton.Enabled = $true
        $footerLabel.Text = "Automatic mode enabled. $($workerSettings.workerCount) workers run continuously."
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
        Start-AppWorker -WorkerId 1 -Once
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
    $settingsForm.FormBorderStyle = 'FixedDialog'
    $settingsForm.MaximizeBox = $false
    $settingsForm.MinimizeBox = $false
    $settingsForm.StartPosition = 'CenterParent'
    $settingsForm.BackColor = $background
    $settingsForm.ForeColor = $textColor
    $settingsForm.Font = New-Object System.Drawing.Font('Segoe UI', 10)
    $settingsForm.Size = New-Object System.Drawing.Size(470, 450)

    $workerSettings = Get-WorkerSettings

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
    $priorityDescription.Size = New-Object System.Drawing.Size(405, 32)
    $priorityDescription.AutoSize = $false
    $priorityDescription.Text = $script:priorityProfiles[[string] $priorityBox.SelectedItem].Description
    $settingsForm.Controls.Add($priorityDescription)

    $priorityBox.Add_SelectedIndexChanged({
        $priorityDescription.Text = $script:priorityProfiles[[string] $priorityBox.SelectedItem].Description
    })

    $retryFailedButton = New-Object System.Windows.Forms.Button
    $retryFailedButton.Text = 'Retry failed jobs'
    $retryFailedButton.Location = New-Object System.Drawing.Point(27, 370)
    $retryFailedButton.Size = New-Object System.Drawing.Size(180, 36)
    $retryFailedButton.FlatStyle = 'Flat'
    $retryFailedButton.FlatAppearance.BorderColor = $warning
    $retryFailedButton.BackColor = $panelColor
    $retryFailedButton.ForeColor = $warning
    $settingsForm.Controls.Add($retryFailedButton)

    $pollLabel = New-Object System.Windows.Forms.Label
    $pollLabel.Text = 'Worker poll interval (sec):'
    $pollLabel.ForeColor = $muted
    $pollLabel.Location = New-Object System.Drawing.Point(24, 178)
    $pollLabel.Size = New-Object System.Drawing.Size(220, 22)
    $settingsForm.Controls.Add($pollLabel)

    $pollInput = New-Object System.Windows.Forms.TextBox
    $pollInput.Location = New-Object System.Drawing.Point(250, 174)
    $pollInput.Size = New-Object System.Drawing.Size(177, 28)
    $pollInput.Text = [string] $workerSettings.pollSeconds
    $settingsForm.Controls.Add($pollInput)

    $retryLabel = New-Object System.Windows.Forms.Label
    $retryLabel.Text = 'Worker retry delay (sec):'
    $retryLabel.ForeColor = $muted
    $retryLabel.Location = New-Object System.Drawing.Point(24, 210)
    $retryLabel.Size = New-Object System.Drawing.Size(220, 22)
    $settingsForm.Controls.Add($retryLabel)

    $retryInput = New-Object System.Windows.Forms.TextBox
    $retryInput.Location = New-Object System.Drawing.Point(250, 206)
    $retryInput.Size = New-Object System.Drawing.Size(177, 28)
    $retryInput.Text = [string] $workerSettings.retrySeconds
    $settingsForm.Controls.Add($retryInput)

    $attemptsLabel = New-Object System.Windows.Forms.Label
    $attemptsLabel.Text = 'Result submit attempts:'
    $attemptsLabel.ForeColor = $muted
    $attemptsLabel.Location = New-Object System.Drawing.Point(24, 242)
    $attemptsLabel.Size = New-Object System.Drawing.Size(220, 22)
    $settingsForm.Controls.Add($attemptsLabel)

    $attemptsInput = New-Object System.Windows.Forms.TextBox
    $attemptsInput.Location = New-Object System.Drawing.Point(250, 238)
    $attemptsInput.Size = New-Object System.Drawing.Size(177, 28)
    $attemptsInput.Text = [string] $workerSettings.maxPendingAttempts
    $settingsForm.Controls.Add($attemptsInput)

    $workersLabel = New-Object System.Windows.Forms.Label
    $workersLabel.Text = 'Concurrent workers:'
    $workersLabel.ForeColor = $muted
    $workersLabel.Location = New-Object System.Drawing.Point(24, 274)
    $workersLabel.Size = New-Object System.Drawing.Size(220, 22)
    $settingsForm.Controls.Add($workersLabel)

    $workersInput = New-Object System.Windows.Forms.ComboBox
    $workersInput.DropDownStyle = 'DropDownList'
    $workersInput.Location = New-Object System.Drawing.Point(250, 270)
    $workersInput.Size = New-Object System.Drawing.Size(177, 28)
    foreach ($workerCount in 1..4) { [void] $workersInput.Items.Add([string] $workerCount) }
    $workersInput.SelectedItem = [string] $workerSettings.workerCount
    $settingsForm.Controls.Add($workersInput)

    $saveSettingsButton = New-Object System.Windows.Forms.Button
    $saveSettingsButton.Text = 'Apply'
    $saveSettingsButton.Location = New-Object System.Drawing.Point(237, 320)
    $saveSettingsButton.Size = New-Object System.Drawing.Size(90, 36)
    $saveSettingsButton.FlatStyle = 'Flat'
    $saveSettingsButton.FlatAppearance.BorderSize = 0
    $saveSettingsButton.BackColor = $success
    $saveSettingsButton.ForeColor = [System.Drawing.Color]::FromArgb(7, 17, 23)
    $settingsForm.Controls.Add($saveSettingsButton)

    $cancelSettingsButton = New-Object System.Windows.Forms.Button
    $cancelSettingsButton.Text = 'Cancel'
    $cancelSettingsButton.Location = New-Object System.Drawing.Point(337, 320)
    $cancelSettingsButton.Size = New-Object System.Drawing.Size(90, 36)
    $cancelSettingsButton.FlatStyle = 'Flat'
    $cancelSettingsButton.FlatAppearance.BorderColor = $panelBorder
    $cancelSettingsButton.BackColor = $panelColor
    $cancelSettingsButton.ForeColor = $textColor
    $settingsForm.Controls.Add($cancelSettingsButton)

    $saveSettingsButton.Add_Click({
        try {
            Set-AnalyzerPriority ([string] $priorityBox.SelectedItem)
            $pollValue = $null
            $retryValue = $null
            $attemptsValue = $null
            if (-not [int]::TryParse($pollInput.Text, [ref] $pollValue) -or $pollValue -lt 15 -or $pollValue -gt 3600) {
                [System.Windows.Forms.MessageBox]::Show($settingsForm, 'Worker poll interval must be 15-3600 seconds.', 'Invalid setting', 'OK', 'Warning') | Out-Null
                return
            }
            if (-not [int]::TryParse($retryInput.Text, [ref] $retryValue) -or $retryValue -lt 5 -or $retryValue -gt 600) {
                [System.Windows.Forms.MessageBox]::Show($settingsForm, 'Worker retry delay must be 5-600 seconds.', 'Invalid setting', 'OK', 'Warning') | Out-Null
                return
            }
            if (-not [int]::TryParse($attemptsInput.Text, [ref] $attemptsValue) -or $attemptsValue -lt 1 -or $attemptsValue -gt 20) {
                [System.Windows.Forms.MessageBox]::Show($settingsForm, 'Result submit attempts must be 1-20.', 'Invalid setting', 'OK', 'Warning') | Out-Null
                return
            }
            $workerCountValue = [int] $workersInput.SelectedItem
            Save-InterfaceSettings -PollSeconds $pollValue -RetrySeconds $retryValue -MaxPendingAttempts $attemptsValue -WorkerCount $workerCountValue
            Start-AutomaticWorkerIfNeeded
            $settingsForm.DialogResult = 'OK'
            $settingsForm.Close()
        } catch {
            [System.Windows.Forms.MessageBox]::Show($settingsForm, $_.Exception.Message, 'Could not change priority', 'OK', 'Error') | Out-Null
        }
    })
    $retryFailedButton.Add_Click({
        $workerSettings = Get-WorkerSettings
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $script:nodePath
        $startInfo.Arguments = '"' + $script:workerPath + '" --retry-failed'
        $startInfo.WorkingDirectory = $PSScriptRoot
        $startInfo.UseShellExecute = $false
        $startInfo.EnvironmentVariables['WZ_POLL_SECONDS'] = [string] $workerSettings.pollSeconds
        $startInfo.EnvironmentVariables['WZ_RETRY_SECONDS'] = [string] $workerSettings.retrySeconds
        $startInfo.EnvironmentVariables['WZ_MAX_PENDING_RESULT_ATTEMPTS'] = [string] $workerSettings.maxPendingAttempts
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
