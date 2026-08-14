CREATE TABLE IF NOT EXISTS replay_analysis (
    replay_id BIGINT UNSIGNED NOT NULL,
    parser_version VARCHAR(32) NOT NULL,
    metadata_json JSON NOT NULL,
    message_counts_json JSON NOT NULL,
    parsed_at DATETIME NOT NULL,
    PRIMARY KEY (replay_id),
    CONSTRAINT fk_replay_analysis_replay FOREIGN KEY (replay_id) REFERENCES replays (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

