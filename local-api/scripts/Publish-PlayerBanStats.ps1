[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dataRoot = Join-Path $repoRoot 'local-api\hosted-wzstats\data'
$publishedRoot = Join-Path $repoRoot 'stats\published'
$files = @('leaderboards.json', 'matches.json', 'manifest.json')
$gitCommand = Get-Command git -ErrorAction SilentlyContinue
$gitCandidates = @(
    'C:\Program Files\Git\cmd\git.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'),
    'C:\Users\Admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe'
)
$git = if ($gitCommand) { $gitCommand.Source } else {
    $gitCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (-not $git) { throw 'Git is not installed or available to the local API service.' }
$gitExecPath = (& $git --exec-path).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not locate Git helpers.' }
$gitBin = Join-Path (Split-Path -Parent (Split-Path -Parent $gitExecPath)) 'bin'
if (Test-Path -LiteralPath (Join-Path $gitBin 'git-remote-https.exe') -PathType Leaf) {
    $env:GIT_EXEC_PATH = $gitBin
}
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'

function Invoke-Git([string[]] $Arguments) {
    $previousErrorAction = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 wraps Git's normal stderr progress as an error record.
        $ErrorActionPreference = 'Continue'
        $output = (& $git @Arguments 2>&1 | Out-String).Trim()
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: $output"
    }
    return $output
}

$manifest = Get-Content -LiteralPath (Join-Path $dataRoot 'manifest.json') -Raw | ConvertFrom-Json
foreach ($name in @('leaderboards.json', 'matches.json')) {
    $source = Join-Path $dataRoot $name
    $entry = $manifest.files.$name
    if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or $null -eq $entry) {
        throw "Generated $name is missing; nothing was sent to GitHub."
    }
    $actualHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    $actualBytes = (Get-Item -LiteralPath $source).Length
    if ($actualHash -ne $entry.sha256 -or $actualBytes -ne $entry.bytes) {
        throw "Generated $name does not match the publication manifest; nothing was sent to GitHub."
    }
}

foreach ($name in $files) {
    Copy-Item -LiteralPath (Join-Path $dataRoot $name) -Destination (Join-Path $publishedRoot $name) -Force
}

$temporaryParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
for ($attempt = 1; $attempt -le 3; $attempt++) {
    $temporary = Join-Path $temporaryParent ('boha-ban-publish-' + [Guid]::NewGuid().ToString('N'))
    $resolvedTemporary = [IO.Path]::GetFullPath($temporary)
    if (-not $resolvedTemporary.StartsWith($temporaryParent, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Invalid temporary worktree path.'
    }
    $worktreeCreated = $false
    try {
        Invoke-Git -Arguments @('-C', $repoRoot, 'fetch', '--no-tags', 'origin', 'main') | Out-Null
        Invoke-Git -Arguments @('-C', $repoRoot, 'worktree', 'add', '--detach', $resolvedTemporary, 'origin/main') | Out-Null
        $worktreeCreated = $true

        $remoteManifest = Get-Content -LiteralPath (Join-Path $resolvedTemporary 'stats\published\manifest.json') -Raw | ConvertFrom-Json
        $remoteMatches = $remoteManifest.files.'matches.json'
        $localMatches = $manifest.files.'matches.json'
        if ($remoteMatches.sha256 -ne $localMatches.sha256 -and
            [DateTimeOffset]::Parse($remoteManifest.publishedAt) -gt [DateTimeOffset]::Parse($manifest.publishedAt)) {
            throw 'GitHub has a newer match snapshot. Click Publish online again to regenerate current local stats before pushing.'
        }

        foreach ($name in $files) {
            Copy-Item -LiteralPath (Join-Path $publishedRoot $name) -Destination (Join-Path $resolvedTemporary ('stats\published\' + $name)) -Force
        }
        Invoke-Git -Arguments (@('-C', $resolvedTemporary, 'add', '--') + ($files | ForEach-Object { 'stats/published/' + $_ })) | Out-Null
        & $git -C $resolvedTemporary diff --cached --quiet -- stats/published/leaderboards.json stats/published/matches.json stats/published/manifest.json
        if ($LASTEXITCODE -eq 0) {
            Write-Output 'Stats are already online; no new commit was needed.'
            return
        }
        if ($LASTEXITCODE -ne 1) { throw 'Could not inspect the prepared stats commit.' }
        Invoke-Git -Arguments @('-C', $resolvedTemporary, 'commit', '-m', 'Publish player ban stats') | Out-Null
        try {
            Invoke-Git -Arguments @('-C', $resolvedTemporary, 'push', 'origin', 'HEAD:main') | Out-Null
            Write-Output 'Published to GitHub. The public site may take a few minutes to update.'
            return
        }
        catch {
            if ($attempt -eq 3 -or $_.Exception.Message -notmatch 'fetch first|non-fast-forward') { throw }
        }
    }
    finally {
        if ($worktreeCreated) {
            Invoke-Git -Arguments @('-C', $repoRoot, 'worktree', 'remove', '--force', '--', $resolvedTemporary) | Out-Null
        }
    }
}
