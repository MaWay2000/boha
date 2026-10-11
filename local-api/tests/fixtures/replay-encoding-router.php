<?php
declare(strict_types=1);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/redirect') {
    header('Location: /br', true, 302);
    exit;
}
$body = 'WZrp replay transport fixture';
header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="fixture.wzrp"');
if ($path === '/gzip') {
    header('Content-Encoding: gzip');
    echo gzencode($body);
} elseif ($path === '/deflate') {
    header('Content-Encoding: deflate');
    echo gzcompress($body);
} elseif ($path === '/br') {
    header('Content-Encoding: br');
    echo base64_decode('Cw6AV1pycCByZXBsYXkgdHJhbnNwb3J0IGZpeHR1cmUD');
} elseif ($path === '/plain-as-br') {
    header('Content-Encoding: br');
    echo $body;
} elseif ($path === '/bad-br') {
    header('Content-Encoding: br');
    echo 'not valid brotli';
} else {
    echo $body;
}
