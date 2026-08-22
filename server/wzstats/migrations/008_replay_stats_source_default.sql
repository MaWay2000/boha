ALTER TABLE match_players
    MODIFY stats_source VARCHAR(32) NOT NULL DEFAULT 'replay';
