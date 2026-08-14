CREATE TABLE IF NOT EXISTS match_outcome_facts (
    source_id INT UNSIGNED NOT NULL,
    source_match_id VARCHAR(128) NOT NULL,
    result_source VARCHAR(32) NOT NULL,
    game_json JSON NOT NULL,
    players_json JSON NOT NULL,
    imported_at DATETIME NOT NULL,
    PRIMARY KEY (source_id, source_match_id),
    CONSTRAINT fk_match_outcome_source FOREIGN KEY (source_id) REFERENCES sources(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
