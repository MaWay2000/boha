<?php

declare(strict_types=1);

final class Wz2100UkClient
{
    private string $baseUrl;
    private int $timeoutSeconds;
    private string $userAgent;

    public function __construct(array $config)
    {
        $this->baseUrl = rtrim((string) $config['base_url'], '/');
        $this->timeoutSeconds = (int) ($config['timeout_seconds'] ?? 30);
        $this->userAgent = (string) ($config['user_agent'] ?? 'MaWay2000-wzstats/1.0');
    }

    public function recentMatches(int $limit): array
    {
        $html = $this->requestText('/1v1/matches');
        $document = $this->loadHtml($html);
        $xpath = new DOMXPath($document);
        $matches = [];

        foreach ($xpath->query("//a[contains(concat(' ', normalize-space(@class), ' '), ' archive-record ')]") ?: [] as $card) {
            $href = (string) $card->attributes?->getNamedItem('href')?->nodeValue;
            if (!preg_match('~^/1v1/match/(\d+)$~', $href, $idMatch)) {
                continue;
            }

            $winnerNode = $xpath->query(".//*[contains(concat(' ', normalize-space(@class), ' '), ' ag-duel-fighters ')]/strong", $card)?->item(0);
            $opponentNode = $xpath->query(".//*[contains(concat(' ', normalize-space(@class), ' '), ' ag-duel-fighters ')]/b", $card)?->item(0);
            $metaNodes = $xpath->query(".//*[contains(concat(' ', normalize-space(@class), ' '), ' ag-duel-meta ')]/span/b", $card);
            $gradeNode = $xpath->query(".//*[contains(concat(' ', normalize-space(@class), ' '), ' onevone-grade-chip ')]", $card)?->item(0);

            $matches[] = [
                'sourceMatchId' => $idMatch[1],
                'matchPath' => $href,
                'winner' => $this->cleanFighterName($winnerNode?->textContent ?? ''),
                'opponent' => $this->cleanFighterName($opponentNode?->textContent ?? ''),
                'durationLabel' => trim($metaNodes?->item(0)?->textContent ?? ''),
                'playedLabel' => trim($metaNodes?->item(1)?->textContent ?? ''),
                'gradeLabel' => trim($gradeNode?->textContent ?? ''),
            ];

            if (count($matches) >= $limit) {
                break;
            }
        }

        return $matches;
    }

    public function matchDetail(string $matchId): array
    {
        $path = '/1v1/match/' . rawurlencode($matchId);
        $html = $this->requestText($path);
        $document = $this->loadHtml($html);
        $xpath = new DOMXPath($document);
        $payloadNode = $xpath->query("//script[@id='tacticalPayload' and @type='application/json']")?->item(0);
        if (!$payloadNode) {
            throw new RuntimeException('Match ' . $matchId . ' has no tacticalPayload JSON.');
        }

        $telemetry = json_decode($payloadNode->textContent, true, 512, JSON_THROW_ON_ERROR);
        $players = [];
        $rows = $xpath->query("//section[h2[normalize-space(.)='Player totals']]//tbody/tr");
        foreach ($rows ?: [] as $position => $row) {
            $cells = $xpath->query('./td', $row);
            if (!$cells || $cells->length < 10) {
                continue;
            }
            $value = static fn (int $index): string => trim($cells->item($index)?->textContent ?? '');
            $number = static fn (string $input): ?int => is_numeric(str_replace(',', '', $input))
                ? (int) str_replace(',', '', $input)
                : null;

            $players[] = [
                'position' => $position,
                'name' => $value(0),
                'result' => $value(1),
                'droidsBuilt' => $number($value(2)),
                'droidsLost' => $number($value(3)),
                'kills' => $number($value(4)),
                'structuresDestroyed' => $number($value(5)),
                'researchComplete' => $number($value(6)),
                'oilRigs' => $number($value(7)),
                'power' => $number($value(8)),
                'score' => $number($value(9)),
            ];
        }

        return [
            'source' => 'wz2100.uk',
            'sourceMatchId' => $matchId,
            'matchReportUrl' => $this->baseUrl . $path,
            'replaySourceUrl' => $this->baseUrl . '/1v1/replay/' . rawurlencode($matchId),
            'map' => $telemetry['layout']['map'] ?? null,
            'durationMs' => isset($telemetry['duration']) ? (int) $telemetry['duration'] : null,
            'players' => $players,
            'telemetry' => $telemetry,
            'rawMetadata' => [
                'positionUrl' => $telemetry['positionUrl'] ?? null,
                'positionFrameCount' => $telemetry['positionFrameCount'] ?? null,
                'positionIntervalMs' => $telemetry['positionIntervalMs'] ?? null,
                'replayArchived' => $telemetry['replayArchived'] ?? null,
                'replayEventCount' => $telemetry['replayEventCount'] ?? null,
            ],
        ];
    }

    public function replay(string $matchId): array
    {
        $headers = [];
        $body = $this->request('/1v1/replay/' . rawurlencode($matchId), static function (string $line) use (&$headers): void {
            $parts = explode(':', $line, 2);
            if (count($parts) === 2) {
                $headers[strtolower(trim($parts[0]))] = trim($parts[1]);
            }
        });

        $filename = 'wz2100uk-' . $matchId . '.wzrp';
        if (isset($headers['content-disposition'])
            && preg_match('/filename="?([^";]+)"?/i', $headers['content-disposition'], $match)) {
            $filename = basename($match[1]);
        }

        return [
            'bytes' => $body,
            'filename' => $filename,
            'sourceUrl' => $this->baseUrl . '/1v1/replay/' . rawurlencode($matchId),
            'sha256' => hash('sha256', $body),
            'sizeBytes' => strlen($body),
        ];
    }

    private function requestText(string $path): string
    {
        return $this->request($path);
    }

    private function request(string $path, ?callable $headerReceiver = null): string
    {
        $handle = curl_init($this->baseUrl . $path);
        if ($handle === false) {
            throw new RuntimeException('Unable to initialize cURL.');
        }

        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $this->timeoutSeconds,
            CURLOPT_USERAGENT => $this->userAgent,
            CURLOPT_FAILONERROR => false,
        ]);
        if ($headerReceiver !== null) {
            curl_setopt($handle, CURLOPT_HEADERFUNCTION, static function ($curl, string $line) use ($headerReceiver): int {
                $headerReceiver($line);
                return strlen($line);
            });
        }

        $body = curl_exec($handle);
        $error = curl_error($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);

        if (!is_string($body) || $status < 200 || $status >= 300) {
            throw new RuntimeException('wz2100.uk request failed with HTTP ' . $status . ($error !== '' ? ': ' . $error : '.'));
        }

        return $body;
    }

    private function loadHtml(string $html): DOMDocument
    {
        $document = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $document->loadHTML($html, LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        return $document;
    }

    private function cleanFighterName(string $value): string
    {
        return trim(preg_replace('/^(?:WINNER|OPPONENT)\s*/u', '', trim($value)) ?? trim($value));
    }
}
