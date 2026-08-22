CREATE TABLE IF NOT EXISTS replay_worker_claims (
    match_id BIGINT UNSIGNED NOT NULL,
    worker_id VARCHAR(40) NOT NULL,
    claimed_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    PRIMARY KEY (match_id),
    KEY ix_replay_worker_claims_expires (expires_at),
    CONSTRAINT fk_replay_worker_claims_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
