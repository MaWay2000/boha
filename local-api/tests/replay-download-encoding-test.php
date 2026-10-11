<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/hosted-wzstats/src/ReplayQueue.php';

$reflection = new ReflectionClass(ReplayQueue::class);
$queue = $reflection->newInstanceWithoutConstructor();
$reflection->getProperty('timeoutSeconds')->setValue($queue, 10);
$download = $reflection->getMethod('download');
if (isset($argv[1])) {
    // Optional read-only check of a real replay; do not save or enqueue it.
    $result = $download->invoke($queue, $argv[1]);
    if ($result['status'] !== 200 || !str_starts_with($result['body'], 'WZrp')) throw new RuntimeException('Live download is not a decoded WZrp replay.');
    echo 'PASS: live replay decoded, ' . strlen($result['body']) . " bytes, valid WZrp header.\n";
    exit;
}

$socket = stream_socket_server('tcp://127.0.0.1:0', $errorNumber, $errorMessage);
if ($socket === false) throw new RuntimeException($errorMessage);
$address = stream_socket_get_name($socket, false);
fclose($socket);
$server = proc_open([PHP_BINARY, '-S', $address, __DIR__ . '/fixtures/replay-encoding-router.php'],
    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
if (!is_resource($server)) throw new RuntimeException('Unable to start local test server.');
try {
    fclose($pipes[0]);
    $ready = false;
    for ($attempt = 0; $attempt < 50; $attempt++) {
        $probe = @stream_socket_client('tcp://' . $address, $errorNumber, $errorMessage, .1);
        if ($probe !== false) { fclose($probe); $ready = true; break; }
        usleep(20000);
    }
    if (!$ready) throw new RuntimeException('Local test server did not start.');
    $paths = ['plain', 'gzip', 'deflate'];
    $brotli = (curl_version()['features'] & CURL_VERSION_BROTLI) !== 0;
    if ($brotli) $paths = array_merge($paths, ['br', 'redirect', 'plain-as-br']);
    foreach ($paths as $path) {
        $result = $download->invoke($queue, 'http://' . $address . '/' . $path);
        if ($result !== ['status' => 200, 'body' => 'WZrp replay transport fixture', 'filename' => 'fixture.wzrp']) {
            throw new RuntimeException('Download did not preserve decoded bytes/filename: ' . $path);
        }
    }
    if ($brotli) {
        $rejected = false;
        try { $download->invoke($queue, 'http://' . $address . '/bad-br'); }
        catch (RuntimeException) { $rejected = true; }
        if (!$rejected) throw new RuntimeException('Invalid Brotli response was not rejected.');
    }
    echo 'PASS: ' . implode(', ', $paths) . ($brotli ? ', corrupt Brotli rejection' : '; Brotli unavailable in this build') . ".\n";
} finally {
    proc_terminate($server);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($server);
}
