CREATE TABLE IF NOT EXISTS replay_worker_state (
    match_id BIGINT UNSIGNED NOT NULL,
    analysis_status VARCHAR(32) NULL,
    analyzer_version VARCHAR(32) NULL,
    failure_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    terminal_failure TINYINT(1) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (match_id),
    KEY ix_replay_worker_state_status (analysis_status),
    KEY ix_replay_worker_state_version (analyzer_version),
    KEY ix_replay_worker_state_retry (analysis_status, terminal_failure, failure_attempts),
    CONSTRAINT fk_replay_worker_state_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
