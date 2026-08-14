ALTER TABLE match_outcome_facts
    ADD COLUMN IF NOT EXISTS legacy_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER result_source;
