CREATE TABLE IF NOT EXISTS sources (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_key VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sources_source_key (source_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS replays (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sha256 CHAR(64) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    source_url VARCHAR(512) NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,
    downloaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_replays_sha256 (sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS matches (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source_id INT UNSIGNED NOT NULL,
    source_match_id VARCHAR(128) NOT NULL,
    replay_id BIGINT UNSIGNED NULL,
    started_at DATETIME NULL,
    ended_at DATETIME NULL,
    duration_ms BIGINT UNSIGNED NULL,
    map_name VARCHAR(255) NULL,
    game_type VARCHAR(128) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    metadata_json JSON NULL,
    telemetry_json JSON NULL,
    parser_version VARCHAR(32) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_matches_source_match (source_id, source_match_id),
    KEY ix_matches_started_at (started_at),
    KEY ix_matches_replay_id (replay_id),
    CONSTRAINT fk_matches_source FOREIGN KEY (source_id) REFERENCES sources (id),
    CONSTRAINT fk_matches_replay FOREIGN KEY (replay_id) REFERENCES replays (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_players (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    match_id BIGINT UNSIGNED NOT NULL,
    position_number INT NOT NULL,
    player_name VARCHAR(255) NOT NULL,
    team_number INT NULL,
    result VARCHAR(32) NULL,
    score BIGINT NULL,
    kills INT NULL,
    droids_built INT NULL,
    droids_lost INT NULL,
    structures_built INT NULL,
    structures_lost INT NULL,
    structures_destroyed INT NULL,
    research_complete INT NULL,
    power BIGINT NULL,
    oil_rigs INT NULL,
    remaining_droids INT NULL,
    remaining_structures INT NULL,
    stats_source VARCHAR(32) NOT NULL DEFAULT 'wz2100.uk',
    raw_json JSON NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_match_players_position (match_id, position_number),
    KEY ix_match_players_name (player_name),
    CONSTRAINT fk_match_players_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parser_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    replay_id BIGINT UNSIGNED NOT NULL,
    parser_version VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    error_message TEXT NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    PRIMARY KEY (id),
    KEY ix_parser_runs_replay (replay_id),
    CONSTRAINT fk_parser_runs_replay FOREIGN KEY (replay_id) REFERENCES replays (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_state (
    source_id INT UNSIGNED NOT NULL,
    sync_key VARCHAR(64) NOT NULL,
    cursor_value VARCHAR(255) NULL,
    last_success_at DATETIME NULL,
    last_error_at DATETIME NULL,
    last_error TEXT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (source_id, sync_key),
    CONSTRAINT fk_sync_state_source FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

