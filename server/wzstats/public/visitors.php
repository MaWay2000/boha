<?php

declare(strict_types=1);

ini_set('display_errors', '0');

require_once dirname(__DIR__) . '/src/bootstrap.php';

header('Cache-Control: no-store, max-age=0');
header('Pragma: no-cache');
header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

session_set_cookie_params([
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

function escapeHtml(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function normalizeIpAddress(string $value): ?string
{
    $packed = @inet_pton(trim($value));
    return $packed === false ? null : (string) inet_ntop($packed);
}

function redirectToDashboard(): never
{
    header('Location: /wzstats/visitors', true, 303);
    exit;
}

$authFile = dirname(__DIR__) . '/storage/visitor-admin-auth.php';
$adminHash = is_file($authFile) ? require $authFile : '';
if (!is_string($adminHash) || $adminHash === '') {
    http_response_code(503);
    echo 'Visitor administration is not configured.';
    exit;
}

$action = (string) ($_POST['action'] ?? '');
if ($action === 'login') {
    $submittedHash = hash('sha256', (string) ($_POST['password'] ?? ''));
    if (hash_equals($adminHash, $submittedHash)) {
        session_regenerate_id(true);
        $_SESSION['visitor_admin'] = true;
        $_SESSION['visitor_csrf'] = bin2hex(random_bytes(24));
        redirectToDashboard();
    }
    usleep(750000);
    $loginError = 'Incorrect password.';
}

if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    redirectToDashboard();
}

$authenticated = ($_SESSION['visitor_admin'] ?? false) === true;
if (!$authenticated) {
    ?>
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Visitor access</title>
      <style>
        :root { color-scheme: dark; font-family: "Trebuchet MS", sans-serif; }
        * { box-sizing: border-box; }
        body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; color: #e9f7ff; background: radial-gradient(circle at 50% 20%, #18334a, #07111c 52%); }
        form { width: min(420px, 100%); padding: 30px; border: 1px solid #29536b; border-radius: 18px; background: rgba(5, 14, 24, 0.92); box-shadow: 0 24px 70px rgba(0,0,0,.45); }
        h1 { margin: 0 0 8px; letter-spacing: .08em; }
        p { color: #9ab5c7; }
        label { display: block; margin: 24px 0 8px; color: #8fdff0; letter-spacing: .08em; text-transform: uppercase; font-size: .78rem; }
        input, button { width: 100%; min-height: 46px; border-radius: 10px; font: inherit; }
        input { padding: 0 12px; border: 1px solid #26475c; color: #fff; background: #07121e; }
        button { margin-top: 14px; border: 1px solid #57d9ef; color: #031019; background: #6ce5f6; font-weight: 700; cursor: pointer; }
        .error { color: #ff9d9d; }
      </style>
    </head>
    <body>
      <form method="post" autocomplete="off">
        <input type="hidden" name="action" value="login">
        <h1>Visitor access</h1>
        <p>Sign in to review visitor logs and manage IP bans.</p>
        <?php if (isset($loginError)): ?><p class="error"><?= escapeHtml($loginError) ?></p><?php endif; ?>
        <label for="password">Admin password</label>
        <input id="password" name="password" type="password" required autofocus>
        <button type="submit">Open dashboard</button>
      </form>
    </body>
    </html>
    <?php
    exit;
}

$csrf = (string) ($_SESSION['visitor_csrf'] ?? '');
if ($csrf === '') {
    $csrf = bin2hex(random_bytes(24));
    $_SESSION['visitor_csrf'] = $csrf;
}

$config = wzstats_config();
$pdo = Database::connect($config['db']);

if (in_array($action, ['ban', 'unban'], true)) {
    $submittedCsrf = (string) ($_POST['csrf'] ?? '');
    if (!hash_equals($csrf, $submittedCsrf)) {
        http_response_code(403);
        exit('Invalid request.');
    }

    $ipAddress = normalizeIpAddress((string) ($_POST['ip_address'] ?? ''));
    if ($ipAddress === null) {
        $_SESSION['visitor_flash'] = 'The IP address is invalid.';
        redirectToDashboard();
    }

    if ($action === 'unban') {
        $statement = $pdo->prepare('UPDATE visitor_bans SET active = 0 WHERE ip_address = ?');
        $statement->execute([$ipAddress]);
        $_SESSION['visitor_flash'] = 'Unbanned ' . $ipAddress . '.';
        redirectToDashboard();
    }

    $reason = mb_substr(trim((string) ($_POST['reason'] ?? 'Manual dashboard ban')), 0, 255);
    $expiresInput = trim((string) ($_POST['expires_at'] ?? ''));
    $expiresAt = null;
    if ($expiresInput !== '') {
        try {
            $expiresAt = (new DateTimeImmutable($expiresInput, new DateTimeZone('UTC')))->format('Y-m-d H:i:s');
        } catch (Throwable) {
            $_SESSION['visitor_flash'] = 'The expiration time is invalid.';
            redirectToDashboard();
        }
    }
    $statement = $pdo->prepare(
        'INSERT INTO visitor_bans (ip_address, reason, active, expires_at)
         VALUES (:ip_address, :reason, 1, :expires_at)
         ON DUPLICATE KEY UPDATE reason = VALUES(reason), active = 1,
             expires_at = VALUES(expires_at), updated_at = CURRENT_TIMESTAMP'
    );
    $statement->execute([
        'ip_address' => $ipAddress,
        'reason' => $reason !== '' ? $reason : null,
        'expires_at' => $expiresAt,
    ]);
    $_SESSION['visitor_flash'] = 'Banned ' . $ipAddress . '.';
    redirectToDashboard();
}

$summary = $pdo->query(
    'SELECT COUNT(*) AS visits,
            COUNT(DISTINCT ip_address) AS unique_visitors,
            SUM(is_blocked = 1) AS blocked_visits
     FROM visitor_access_logs
     WHERE visited_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)'
)->fetch() ?: [];

$logs = $pdo->query(
    'SELECT l.*,
            EXISTS(
                SELECT 1 FROM visitor_bans b
                WHERE b.ip_address = l.ip_address AND b.active = 1
                  AND (b.expires_at IS NULL OR b.expires_at > UTC_TIMESTAMP())
            ) AS currently_banned
     FROM visitor_access_logs l
     ORDER BY l.id DESC
     LIMIT 500'
)->fetchAll();

$bans = $pdo->query(
    'SELECT * FROM visitor_bans
     WHERE active = 1 AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
     ORDER BY updated_at DESC'
)->fetchAll();

$flash = (string) ($_SESSION['visitor_flash'] ?? '');
unset($_SESSION['visitor_flash']);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Visitor dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: "Trebuchet MS", sans-serif; --cyan:#6ce5f6; --line:#203a4b; --panel:#091521; --muted:#8fa9bb; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #eaf7ff; background: radial-gradient(circle at 14% 0, #142d42, transparent 30%), #050d16; }
    main { width: min(1500px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 50px; }
    header, .toolbar, .cards, .panel-head { display: flex; align-items: center; gap: 12px; }
    header { justify-content: space-between; margin-bottom: 20px; }
    h1, h2 { margin: 0; letter-spacing: .06em; }
    h1 { font-size: clamp(1.5rem, 3vw, 2.5rem); }
    h2 { font-size: 1rem; color: var(--cyan); text-transform: uppercase; }
    button, input { min-height: 38px; border-radius: 9px; font: inherit; }
    button { padding: 0 14px; border: 1px solid #31566d; color: #dff8ff; background: #0a1b29; cursor: pointer; }
    button:hover { border-color: var(--cyan); }
    input { padding: 0 10px; border: 1px solid var(--line); color: #fff; background: #06111b; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 18px; }
    .card, .panel { border: 1px solid var(--line); border-radius: 14px; background: rgba(7, 18, 29, .94); }
    .card { padding: 18px; }
    .card span { display: block; color: var(--muted); font-size: .78rem; text-transform: uppercase; }
    .card strong { display: block; margin-top: 6px; font-size: 1.8rem; }
    .panel { margin-top: 18px; overflow: hidden; }
    .panel-head { justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--line); }
    .ban-form { display: flex; flex-wrap: wrap; gap: 8px; }
    .table-wrap { overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .86rem; }
    th, td { padding: 11px 12px; border-bottom: 1px solid #152936; text-align: left; vertical-align: top; white-space: nowrap; }
    th { position: sticky; top: 0; color: #8fdff0; background: #07131f; text-transform: uppercase; font-size: .72rem; letter-spacing: .07em; }
    td.path, td.agent { max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
    .muted { color: var(--muted); }
    .blocked { color: #ff9d9d; }
    .allowed { color: #9be0b3; }
    .flash { padding: 12px 14px; border: 1px solid #4d788e; border-radius: 10px; background: #0d2635; }
    .empty { padding: 24px; color: var(--muted); }
    form { margin: 0; }
    @media (max-width: 760px) { .cards { grid-template-columns: 1fr; } .panel-head { align-items: stretch; flex-direction: column; } .ban-form > * { width: 100%; } }
  </style>
</head>
<body>
<main>
  <header>
    <div><h1>Visitor dashboard</h1><div class="muted">Times are shown in UTC. Latest 500 records.</div></div>
    <form method="post"><input type="hidden" name="action" value="logout"><button type="submit">Sign out</button></form>
  </header>

  <?php if ($flash !== ''): ?><p class="flash"><?= escapeHtml($flash) ?></p><?php endif; ?>

  <section class="cards" aria-label="Last 24 hours">
    <div class="card"><span>Visits, 24 hours</span><strong><?= (int) ($summary['visits'] ?? 0) ?></strong></div>
    <div class="card"><span>Unique IPs, 24 hours</span><strong><?= (int) ($summary['unique_visitors'] ?? 0) ?></strong></div>
    <div class="card"><span>Blocked visits, 24 hours</span><strong><?= (int) ($summary['blocked_visits'] ?? 0) ?></strong></div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h2>Add or update ban</h2>
      <form class="ban-form" method="post">
        <input type="hidden" name="action" value="ban">
        <input type="hidden" name="csrf" value="<?= escapeHtml($csrf) ?>">
        <input name="ip_address" placeholder="IP address" required>
        <input name="reason" placeholder="Reason">
        <input name="expires_at" type="datetime-local" title="Expiration time in UTC">
        <button type="submit">Ban IP</button>
      </form>
    </div>
    <?php if ($bans === []): ?><div class="empty">No active IP bans.</div><?php else: ?>
    <div class="table-wrap"><table><thead><tr><th>IP</th><th>Reason</th><th>Expires</th><th>Updated</th><th></th></tr></thead><tbody>
      <?php foreach ($bans as $ban): ?><tr>
        <td><?= escapeHtml($ban['ip_address']) ?></td><td><?= escapeHtml($ban['reason'] ?? '') ?></td>
        <td><?= escapeHtml($ban['expires_at'] ?? 'Never') ?></td><td><?= escapeHtml($ban['updated_at']) ?></td>
        <td><form method="post"><input type="hidden" name="action" value="unban"><input type="hidden" name="csrf" value="<?= escapeHtml($csrf) ?>"><input type="hidden" name="ip_address" value="<?= escapeHtml($ban['ip_address']) ?>"><button type="submit">Unban</button></form></td>
      </tr><?php endforeach; ?>
    </tbody></table></div><?php endif; ?>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Recent visitors</h2></div>
    <?php if ($logs === []): ?><div class="empty">No visitor records yet.</div><?php else: ?>
    <div class="table-wrap"><table><thead><tr><th>UTC time</th><th>IP address</th><th>Path</th><th>Referrer</th><th>Browser</th><th>Status</th><th></th></tr></thead><tbody>
      <?php foreach ($logs as $log): ?><tr>
        <td><?= escapeHtml($log['visited_at']) ?></td>
        <td><?= escapeHtml($log['ip_address']) ?></td>
        <td class="path" title="<?= escapeHtml($log['request_path']) ?>"><?= escapeHtml($log['request_path']) ?></td>
        <td class="path" title="<?= escapeHtml($log['referrer'] ?? '') ?>"><?= escapeHtml($log['referrer'] ?? '') ?></td>
        <td class="agent" title="<?= escapeHtml($log['user_agent'] ?? '') ?>"><?= escapeHtml($log['user_agent'] ?? '') ?></td>
        <td class="<?= (int) $log['is_blocked'] === 1 ? 'blocked' : 'allowed' ?>"><?= (int) $log['is_blocked'] === 1 ? 'Blocked' : 'Allowed' ?></td>
        <td><?php if (!(bool) $log['currently_banned']): ?><form method="post"><input type="hidden" name="action" value="ban"><input type="hidden" name="csrf" value="<?= escapeHtml($csrf) ?>"><input type="hidden" name="ip_address" value="<?= escapeHtml($log['ip_address']) ?>"><input type="hidden" name="reason" value="Visitor dashboard ban"><button type="submit">Ban</button></form><?php else: ?><span class="blocked">Banned</span><?php endif; ?></td>
      </tr><?php endforeach; ?>
    </tbody></table></div><?php endif; ?>
  </section>
</main>
</body>
</html>
