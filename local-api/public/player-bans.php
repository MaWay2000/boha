<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/hosted-wzstats/src/bootstrap.php';

const PLAYER_BANS_PATH = __DIR__ . '/../private/player-bans.json';
const PLAYER_BANS_AUDIT_PATH = __DIR__ . '/../private/player-ban-audit.jsonl';
const PLAYER_BANS_BOARD_PATH = __DIR__ . '/../hosted-wzstats/data/leaderboards.json';

function banEscape(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function validPlayerKey(string $key): bool
{
    return strlen($key) === 44 && strlen((string) base64_decode($key, true)) === 32;
}

function readBans(): array
{
    if (!is_file(PLAYER_BANS_PATH)) return ['version' => 1, 'bans' => []];
    $data = json_decode((string) file_get_contents(PLAYER_BANS_PATH), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($data) || !is_array($data['bans'] ?? null)) {
        throw new RuntimeException('Private ban list is invalid. No changes were made.');
    }
    return $data;
}

function readGlobalPlayers(): array
{
    $data = json_decode((string) file_get_contents(PLAYER_BANS_BOARD_PATH), true, 512, JSON_THROW_ON_ERROR);
    return is_array($data['leaderboards']['Global']['players'] ?? null)
        ? $data['leaderboards']['Global']['players'] : [];
}

function writeJsonAtomically(string $path, array $data): void
{
    $temporary = $path . '.tmp-' . bin2hex(random_bytes(6));
    try {
        $json = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
        if (file_put_contents($temporary, $json, LOCK_EX) === false || !rename($temporary, $path)) {
            throw new RuntimeException('Could not save ' . basename($path) . '.');
        }
    } finally {
        if (is_file($temporary)) unlink($temporary);
    }
}

function publishBans(): void
{
    $pdo = Database::connect(wzstats_config()['db']);
    $locks = [];
    try {
        foreach (['maway2000-bohan-sync', 'maway2000-leaderboard'] as $name) {
            $statement = $pdo->prepare('SELECT GET_LOCK(?, 10)');
            $statement->execute([$name]);
            if ((int) $statement->fetchColumn() !== 1) {
                throw new RuntimeException('A stats publication is already running. The ban was saved; publish again shortly.');
            }
            $locks[] = $name;
        }
        $dataDirectory = dirname(PLAYER_BANS_BOARD_PATH);
        (new LeaderboardCalculator($pdo))->publish(PLAYER_BANS_BOARD_PATH);
        $manifestPath = $dataDirectory . '/manifest.json';
        $manifest = json_decode((string) file_get_contents($manifestPath), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($manifest) || !is_array($manifest['files'] ?? null)) {
            throw new RuntimeException('Published stats manifest is invalid.');
        }
        $manifest['publishedAt'] = gmdate('c');
        $manifest['files']['leaderboards.json'] = [
            'sha256' => hash_file('sha256', PLAYER_BANS_BOARD_PATH),
            'bytes' => filesize(PLAYER_BANS_BOARD_PATH),
        ];
        writeJsonAtomically($manifestPath, $manifest);
        // The local Vite preview reads this mirror. The hosted site updates after the generated files are pushed.
        $mirror = dirname(__DIR__, 2) . '/stats/published';
        foreach (['leaderboards.json', 'manifest.json'] as $name) {
            $source = $dataDirectory . '/' . $name;
            $temporary = $mirror . '/' . $name . '.tmp-' . bin2hex(random_bytes(6));
            try {
                if (!copy($source, $temporary) || !rename($temporary, $mirror . '/' . $name)) {
                    throw new RuntimeException('The ban was saved, but the local website mirror could not be updated.');
                }
            } finally {
                if (is_file($temporary)) unlink($temporary);
            }
        }
    } finally {
        foreach (array_reverse($locks) as $name) {
            $statement = $pdo->prepare('SELECT RELEASE_LOCK(?)');
            $statement->execute([$name]);
        }
    }
}

function publishBansOnline(): string
{
    $powershell = (string) getenv('SystemRoot') . '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    $script = dirname(__DIR__) . '/scripts/Publish-PlayerBanStats.ps1';
    if (!is_file($powershell) || !is_file($script)) {
        throw new RuntimeException('Online publisher is not installed on this PC. Local stats are still saved.');
    }
    $process = proc_open(
        [$powershell, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $script],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        dirname(__DIR__, 2)
    );
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start the online publisher. Local stats are still saved.');
    }
    fclose($pipes[0]);
    $output = trim(stream_get_contents($pipes[1]) . "\n" . stream_get_contents($pipes[2]));
    fclose($pipes[1]);
    fclose($pipes[2]);
    if (proc_close($process) !== 0) {
        throw new RuntimeException('GitHub publication failed; local stats are still saved. ' . mb_substr($output, 0, 1500));
    }
    return $output;
}

$remoteAddress = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$localHost = preg_match('/^(?:127\.0\.0\.1|localhost|\[::1\]):8787$/', $host) === 1;
if (!in_array($remoteAddress, ['127.0.0.1', '::1'], true) || !$localHost
    || isset($_SERVER['HTTP_X_FORWARDED_FOR']) || isset($_SERVER['HTTP_FORWARDED'])) {
    http_response_code(403);
    echo 'Player-ban administration is available only at http://127.0.0.1:8787/wzstats/player-bans on the server PC.';
    exit;
}

header('Cache-Control: no-store, max-age=0');
header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
session_name('boha_player_bans');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict']);
session_start();
$_SESSION['ban_csrf'] ??= bin2hex(random_bytes(24));
$authFile = dirname(__DIR__) . '/private/player-ban-auth.php';
$authHash = is_file($authFile) ? require $authFile : '';
if (!is_string($authHash) || !preg_match('/^\$2[aby]\$/', $authHash)) {
    http_response_code(503);
    echo 'Player-ban administration password is not configured.';
    exit;
}
$loginError = '';
$loginAction = (string) ($_POST['action'] ?? '');
if ($loginAction === 'logout') {
    if (hash_equals((string) $_SESSION['ban_csrf'], (string) ($_POST['csrf'] ?? ''))) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    header('Location: /wzstats/player-bans', true, 303);
    exit;
}
if ($loginAction === 'login' && empty($_SESSION['ban_admin'])) {
    if (!hash_equals((string) $_SESSION['ban_csrf'], (string) ($_POST['csrf'] ?? ''))) {
        $loginError = 'Session expired. Reload and try again.';
    } elseif (time() < (int) ($_SESSION['ban_login_blocked_until'] ?? 0)) {
        $loginError = 'Too many attempts. Try again shortly.';
    } elseif (password_verify((string) ($_POST['password'] ?? ''), $authHash)) {
        session_regenerate_id(true);
        $_SESSION['ban_admin'] = true;
        $_SESSION['ban_csrf'] = bin2hex(random_bytes(24));
        unset($_SESSION['ban_login_attempts'], $_SESSION['ban_login_blocked_until']);
        header('Location: /wzstats/player-bans', true, 303);
        exit;
    } else {
        $attempts = (int) ($_SESSION['ban_login_attempts'] ?? 0) + 1;
        $_SESSION['ban_login_attempts'] = $attempts;
        if ($attempts >= 5) {
            $_SESSION['ban_login_blocked_until'] = time() + 60;
            $_SESSION['ban_login_attempts'] = 0;
        }
        usleep(500000);
        $loginError = 'Incorrect password.';
    }
}
if (empty($_SESSION['ban_admin'])) {
    ?>
    <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Player bans · Sign in</title><style>
      :root{color-scheme:dark;font-family:"Segoe UI",system-ui,sans-serif}*{box-sizing:border-box}
      body{min-height:100vh;margin:0;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 15% 0%,#174357,transparent 38%),#06111b;color:#e9f7ff}
      form{width:min(440px,100%);padding:32px;border:1px solid #346b80;border-radius:18px;background:linear-gradient(145deg,#0d2b3b,#061925);box-shadow:0 24px 70px #0007}
      .eyebrow{color:#78e6fa;font-size:.72rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}h1{margin:9px 0;font-size:2rem}p{color:#a2c0ce;line-height:1.5}
      label{display:block;margin:24px 0 7px;font-size:.8rem;font-weight:750}input,button{width:100%;min-height:46px;padding:9px 12px;border-radius:9px;font:inherit}
      input{border:1px solid #39718a;background:#051723;color:white}button{margin-top:15px;border:1px solid #78e6fa;background:linear-gradient(#1a829f,#10526b);color:white;font-weight:800;cursor:pointer}
      .error{color:#ffb0a0}
    </style></head><body><form method="post" autocomplete="off">
      <div class="eyebrow">BOHA / Security administration</div><h1>Player bans</h1>
      <p>Sign in to manage account bans. This page is available only on the server PC.</p>
      <?php if ($loginError !== ''): ?><p class="error"><?= banEscape($loginError) ?></p><?php endif; ?>
      <input type="hidden" name="csrf" value="<?= banEscape($_SESSION['ban_csrf']) ?>">
      <label for="ban-password">Admin password</label><input id="ban-password" name="password" type="password" required autofocus>
      <button name="action" value="login">Open admin panel</button>
    </form></body></html>
    <?php
    exit;
}
$error = '';
$notice = '';
$query = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 100);

try {
    $data = readBans();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals((string) $_SESSION['ban_csrf'], (string) ($_POST['csrf'] ?? ''))) {
            throw new RuntimeException('Security token expired. Reload the page and try again.');
        }
        $action = (string) ($_POST['action'] ?? '');
        $key = trim((string) ($_POST['public_key'] ?? ''));
        if (!in_array($action, ['ban', 'unban', 'publish', 'publish-online'], true)) {
            throw new RuntimeException('Unknown action.');
        }
        if ($action !== 'publish' && $action !== 'publish-online') {
            if (!validPlayerKey($key)) throw new RuntimeException('Choose an account with a valid public key.');
            if ($action === 'ban') {
                $selected = null;
                foreach (readGlobalPlayers() as $player) {
                    if ($key === ($player['mainPublicKey'] ?? null)
                        || in_array($key, $player['publicKeys'] ?? [], true)) {
                        $selected = $player;
                        break;
                    }
                }
                if ($selected === null || !validPlayerKey((string) ($selected['mainPublicKey'] ?? ''))) {
                    throw new RuntimeException('This key does not identify a keyed player in the published stats.');
                }
                $key = (string) $selected['mainPublicKey'];
                $existingIndex = null;
                foreach ($data['bans'] as $index => $ban) {
                    if (($ban['publicKey'] ?? null) === $key) $existingIndex = $index;
                }
                $reason = substr(trim((string) ($_POST['reason'] ?? '')), 0, 500);
                if ($reason === '') throw new RuntimeException('Enter a reason before banning this account.');
                $record = [
                    'publicKey' => $key,
                    'name' => (string) ($selected['name'] ?? ''),
                    'reason' => $reason,
                    'active' => true,
                    'eloOverride' => -2000,
                    'updatedAt' => gmdate('c'),
                ];
                if ($existingIndex === null) $data['bans'][] = $record;
                else $data['bans'][$existingIndex] = $record;
            } else {
                $existingIndex = null;
                foreach ($data['bans'] as $index => $ban) {
                    if (($ban['publicKey'] ?? null) === $key) $existingIndex = $index;
                }
                if ($existingIndex === null || empty($data['bans'][$existingIndex]['active'])) {
                    throw new RuntimeException('That account is not currently banned.');
                }
                $data['bans'][$existingIndex]['active'] = false;
                $data['bans'][$existingIndex]['updatedAt'] = gmdate('c');
            }
            writeJsonAtomically(PLAYER_BANS_PATH, $data);
            $auditEntry = json_encode([
                'at' => gmdate('c'), 'action' => $action, 'publicKey' => $key,
                'reason' => $action === 'ban' ? $reason : null,
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) . "\n";
            if (file_put_contents(PLAYER_BANS_AUDIT_PATH, $auditEntry, FILE_APPEND | LOCK_EX) === false) {
                throw new RuntimeException('The ban was saved, but the audit log could not be written.');
            }
        }
        publishBans();
        $notice = $action === 'publish-online'
            ? publishBansOnline()
            : ($action === 'publish' ? 'Stats republished locally.' : ucfirst($action) . ' saved; local stats republished.');
        $data = readBans();
    }
} catch (Throwable $exception) {
    $error = $exception->getMessage();
    $data = isset($data) && is_array($data) ? $data : ['bans' => []];
}

$results = [];
if (mb_strlen($query) >= 2 && mb_strlen($query) <= 100) {
    try {
        foreach (readGlobalPlayers() as $player) {
            if (empty($player['mainPublicKey']) || !validPlayerKey((string) $player['mainPublicKey'])) continue;
            $haystack = mb_strtolower((string) ($player['name'] ?? '') . ' ' . (string) ($player['mainPublicKey'] ?? '')
                . ' ' . implode(' ', array_keys((array) ($player['names'] ?? []))));
            if (str_contains($haystack, mb_strtolower($query))) $results[] = $player;
            if (count($results) >= 30) break;
        }
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}
$activeBans = array_values(array_filter($data['bans'] ?? [], static fn(array $ban): bool => !empty($ban['active'])));
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Player bans · BOHA admin</title>
  <style>
    :root { color-scheme: dark; font-family: "Segoe UI", system-ui, sans-serif; --text: #e9f7ff; --muted: #9ab8ca; --cyan: #78e6fa; --line: rgba(120,230,250,.19); }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: var(--text); background: radial-gradient(circle at 10% 0%, #173b4a 0, transparent 34%), radial-gradient(circle at 92% 10%, #352629 0, transparent 30%), #06111b; }
    main { max-width: 1180px; margin: 0 auto; padding: 44px 22px 80px; }
    .eyebrow { color: var(--cyan); font-size: .72rem; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    h1 { margin: 9px 0 10px; font-size: clamp(2rem, 4vw, 3.1rem); letter-spacing: -.045em; }
    h2 { margin: 0; font-size: 1.35rem; letter-spacing: -.025em; }
    h3 { margin: 2px 0 0; font-size: clamp(1.35rem, 2.5vw, 1.75rem); letter-spacing: -.03em; }
    p { color: var(--muted); line-height: 1.55; }
    .intro { max-width: 810px; margin: 0; }
    .panel { padding: clamp(20px, 3vw, 30px); margin-top: 24px; border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(145deg, rgba(11,36,50,.95), rgba(5,20,32,.97)); box-shadow: 0 18px 50px rgba(0,0,0,.17); }
    .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
    .count-pill, .status-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px; border: 1px solid var(--line); border-radius: 999px; color: #a9eaf5; background: #0a2c3b; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .status-pill::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #8be9a3; box-shadow: 0 0 10px #8be9a3; }
    .status-pill.is-banned { color: #ffb6a0; border-color: rgba(255,151,116,.32); background: #392320; }
    .status-pill.is-banned::before { background: #ff9874; box-shadow: 0 0 10px #ff9874; }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    input { min-height: 46px; padding: 10px 14px; border: 1px solid #39718a; border-radius: 9px; background: #051723; color: white; font: inherit; outline: none; }
    input:focus { border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(120,230,250,.13); }
    input[type=search] { flex: 1; min-width: min(280px,100%); }
    input[name=reason] { flex: 1; min-width: min(280px,100%); }
    button { min-height: 46px; padding: 10px 18px; border: 1px solid #67d9ee; border-radius: 9px; background: linear-gradient(180deg,#1a829f,#10526b); color: white; cursor: pointer; font: inherit; font-weight: 750; }
    button:hover { filter: brightness(1.13); } button:focus-visible { outline: 3px solid #9cf1ff; outline-offset: 3px; }
    button.danger { border-color: #f5a47e; background: linear-gradient(180deg,#a64c31,#713123); white-space: nowrap; }
    button.subtle { min-height: 38px; padding: 7px 13px; font-size: .85rem; }
    .search-form { display: flex; gap: 10px; max-width: 720px; }
    .search-note { margin: 12px 0 24px; font-size: .88rem; }
    .results-label { margin: 0 0 14px; color: #c9eaf5; font-size: .85rem; font-weight: 750; letter-spacing: .04em; }
    .player-card { position: relative; overflow: hidden; margin-top: 14px; border: 1px solid rgba(105,208,232,.27); border-radius: 16px; background: linear-gradient(110deg,rgba(10,43,58,.97),rgba(7,27,42,.98) 55%,rgba(8,25,37,.98)); box-shadow: inset 0 1px rgba(192,242,255,.07), 0 13px 28px rgba(0,0,0,.18); }
    .player-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: linear-gradient(var(--cyan),#21769b); }
    .player-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 23px 26px 20px; }
    .identity { display: flex; align-items: center; gap: 17px; min-width: 0; }
    .avatar { flex: 0 0 58px; display: grid; place-items: center; width: 58px; height: 58px; border: 1px solid #65c9e2; border-radius: 14px; color: #e2fbff; background: linear-gradient(145deg,#206f87,#0b334a); font-size: 1.05rem; font-weight: 900; letter-spacing: .02em; box-shadow: 0 7px 20px rgba(44,169,207,.16); }
    .identity-text { min-width: 0; } .alias-line { margin-top: 5px; color: var(--muted); font-size: .85rem; }
    .metric-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; padding: 0 26px 20px; }
    .metric { min-height: 77px; padding: 13px 16px; border: 1px solid rgba(103,196,219,.12); border-radius: 10px; background: rgba(1,15,26,.43); }
    .metric-label { display: block; color: #85a9bb; font-size: .67rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .metric-value { display: block; margin-top: 5px; color: #eaf9ff; font-size: 1.42rem; font-weight: 780; font-variant-numeric: tabular-nums; }
    .metric-value.cyan { color: var(--cyan); }
    .record { margin: 0 26px 20px; color: #9fc0ce; font-size: .86rem; }
    .record strong { color: #e5f8ff; font-variant-numeric: tabular-nums; }
    .key-block { display: grid; grid-template-columns: 105px minmax(0,1fr); align-items: start; gap: 12px; padding: 17px 26px; border-top: 1px solid rgba(103,196,219,.15); border-bottom: 1px solid rgba(103,196,219,.15); background: rgba(0,10,19,.26); }
    .key-label { color: #80a5b8; font-size: .7rem; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
    code { overflow-wrap: anywhere; color: #9beaff; font: .81rem Consolas,monospace; }
    .decision { padding: 19px 26px 23px; }
    .decision-label { display: block; margin-bottom: 9px; color: #a8cbda; font-size: .76rem; font-weight: 750; }
    .decision .row { align-items: stretch; } .decision input { width: auto; }
    .decision-note { margin: 9px 0 0; color: #86a8b9; font-size: .76rem; }
    .entry { padding: 16px 0; border-top: 1px solid var(--line); }
    .entry:first-of-type { border-top: 0; } .entry strong { font-size: 1.05rem; }
    .entry form { margin: 8px 0 0; } .entry code { display: inline-block; margin: 7px 0; }
    .alert { padding: 13px 16px; border: 1px solid transparent; border-radius: 10px; }
    .error { color: #ffe6df; border-color: #994e4b; background: #47252b; }
    .notice { color: #d7ffe8; border-color: #398f72; background: #163f37; }
    .empty { padding: 23px; border: 1px dashed #28556b; border-radius: 11px; color: #9ebdca; background: rgba(0,15,26,.28); }
    small { color: #99b9ca; } form { margin: 0; }
    @media (max-width: 750px) { .metric-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } .player-card-top { padding: 19px; } .metric-grid { padding: 0 19px 17px; } .record { margin: 0 19px 18px; } .key-block,.decision { padding: 17px 19px; } .key-block { grid-template-columns: 1fr; gap: 5px; } }
    @media (max-width: 500px) { main { padding: 26px 13px 56px; } .panel { padding: 18px; } .player-card-top { flex-direction: column; } .search-form { flex-wrap: wrap; } .search-form button,.decision button { width: 100%; } .avatar { flex-basis: 48px; width: 48px; height: 48px; } }
  </style>
</head>
<body><main>
  <form method="post" style="float:right"><input type="hidden" name="csrf" value="<?= banEscape($_SESSION['ban_csrf']) ?>"><button class="subtle" name="action" value="logout">Sign out</button></form>
  <div class="eyebrow">BOHA / Security administration</div>
  <h1>Player bans</h1>
  <p class="intro">Review the account behind a nickname before making a decision. Bans target an exact public key, set its effective ELO to −2000, and remove it from player rankings and search. Historical matches remain intact.</p>
  <?php if ($error !== ''): ?><p class="alert error"><?= banEscape($error) ?></p><?php endif; ?>
  <?php if ($notice !== ''): ?><p class="alert notice"><?= banEscape($notice) ?></p><?php endif; ?>
  <section class="panel">
    <div class="panel-head"><h2>Active bans</h2><span class="count-pill"><?= count($activeBans) ?> accounts</span></div>
    <?php if ($activeBans === []): ?><p class="empty">No players are banned yet. Search for a keyed account below to get started.</p><?php endif; ?>
    <?php foreach ($activeBans as $ban): ?>
      <div class="entry"><strong><?= banEscape($ban['name'] ?? '') ?></strong> · ELO −2000<br>
        <code><?= banEscape($ban['publicKey'] ?? '') ?></code><br>
        <small><?= banEscape($ban['reason'] ?? '') ?> · <?= banEscape($ban['updatedAt'] ?? '') ?></small>
        <form method="post"><input type="hidden" name="csrf" value="<?= banEscape($_SESSION['ban_csrf']) ?>"><input type="hidden" name="public_key" value="<?= banEscape($ban['publicKey'] ?? '') ?>"><button class="subtle" name="action" value="unban">Unban account</button></form>
      </div>
    <?php endforeach; ?>
    <form method="post"><input type="hidden" name="csrf" value="<?= banEscape($_SESSION['ban_csrf']) ?>"><button class="subtle" name="action" value="publish">Republish stats</button></form>
    <form method="post" style="margin-top:10px"><input type="hidden" name="csrf" value="<?= banEscape($_SESSION['ban_csrf']) ?>"><button name="action" value="publish-online">Publish online to GitHub</button></form>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Find a player</h2><span class="count-pill">Keyed accounts only</span></div>
    <form method="get" class="search-form"><input type="search" name="q" value="<?= banEscape($query) ?>" placeholder="Search nickname or public key" minlength="2" required aria-label="Search nickname or public key"><button type="submit">Search accounts</button></form>
    <p class="search-note">Names help you find a player. The action below applies only to the verified public key shown on that card.</p>
    <?php if ($query !== ''): ?><div class="results-label"><?= count($results) ?> account<?= count($results) === 1 ? '' : 's' ?> found for “<?= banEscape($query) ?>”<?= count($results) === 30 ? ' · showing first 30' : '' ?></div><?php endif; ?>
    <?php foreach ($results as $player): ?>
      <?php
        $wins = (int) ($player['wins'] ?? 0);
        $losses = (int) ($player['losses'] ?? 0);
        $draws = (int) ($player['draws'] ?? 0);
        $games = (int) ($player['games'] ?? 0);
        $decided = $wins + $losses + $draws;
        $winRate = $decided > 0 ? (int) round(100 * $wins / $decided) : 0;
        $playerName = trim((string) ($player['name'] ?? 'Player'));
        $initials = mb_strtoupper(mb_substr($playerName, 0, 2));
        $otherNames = array_values(array_filter(array_keys((array) ($player['names'] ?? [])),
            static fn(string $name): bool => $name !== $playerName));
        $aliasPreview = array_slice($otherNames, 0, 3);
      ?>
      <article class="player-card">
        <div class="player-card-top">
          <div class="identity"><div class="avatar" aria-hidden="true"><?= banEscape($initials) ?></div><div class="identity-text">
            <div class="eyebrow">Player account · <?= count((array) ($player['publicKeys'] ?? [])) ?> tracked key<?= count((array) ($player['publicKeys'] ?? [])) === 1 ? '' : 's' ?></div>
            <h3><?= banEscape($playerName) ?></h3>
            <div class="alias-line"><?= $aliasPreview === [] ? 'No other recorded nicknames' : 'Also played as ' . banEscape(implode(' · ', $aliasPreview)) . (count($otherNames) > 3 ? ' +' . (count($otherNames) - 3) . ' more' : '') ?></div>
          </div></div>
          <span class="status-pill<?= !empty($player['banned']) ? ' is-banned' : '' ?>"><?= !empty($player['banned']) ? 'Banned' : 'Active' ?></span>
        </div>
        <div class="metric-grid">
          <div class="metric"><span class="metric-label">Global ELO</span><span class="metric-value cyan"><?= !empty($player['discounted']) && empty($player['banned']) ? '—' : banEscape(number_format((float) ($player['elo'] ?? 1500), 2)) ?></span></div>
          <div class="metric"><span class="metric-label">Games</span><span class="metric-value"><?= number_format($games) ?></span></div>
          <div class="metric"><span class="metric-label">Wins</span><span class="metric-value"><?= number_format($wins) ?></span></div>
          <div class="metric"><span class="metric-label">Win rate</span><span class="metric-value"><?= $winRate ?>%</span></div>
        </div>
        <div class="record">Record <strong><?= number_format($wins) ?> W</strong> · <strong><?= number_format($losses) ?> L</strong> · <strong><?= number_format($draws) ?> D</strong></div>
        <div class="key-block"><span class="key-label">Public key</span><code><?= banEscape($player['mainPublicKey'] ?? '') ?></code></div>
        <?php if (!empty($player['banned'])): ?>
          <div class="decision"><p class="decision-note">This account is already on the active ban list. Use “Unban account” above to reverse it.</p></div>
        <?php else: ?>
          <form method="post" action="/wzstats/player-bans?q=<?= rawurlencode($query) ?>" class="decision">
            <input type="hidden" name="csrf" value="<?= banEscape($_SESSION['ban_csrf']) ?>"><input type="hidden" name="public_key" value="<?= banEscape($player['mainPublicKey'] ?? '') ?>">
            <label class="decision-label" for="reason-<?= banEscape(md5((string) ($player['mainPublicKey'] ?? ''))) ?>">Reason or replay evidence</label>
            <div class="row"><input id="reason-<?= banEscape(md5((string) ($player['mainPublicKey'] ?? ''))) ?>" name="reason" maxlength="500" required placeholder="Example: confirmed account abuse, replay ID…"><button class="danger" name="action" value="ban">Ban this account</button></div>
            <p class="decision-note">This changes stats visibility and ELO only. It does not ban the player from game servers.</p>
          </form>
        <?php endif; ?>
      </article>
    <?php endforeach; ?>
    <?php if ($query !== '' && $results === []): ?><p class="empty">No keyed accounts matched that search.</p><?php endif; ?>
  </section>
</main></body></html>
