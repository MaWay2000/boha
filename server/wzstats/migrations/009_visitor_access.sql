CREATE TABLE IF NOT EXISTS visitor_bans (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip_address VARCHAR(45) NOT NULL,
    reason VARCHAR(255) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    expires_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_visitor_bans_ip (ip_address),
    KEY idx_visitor_bans_active_expires (active, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visitor_access_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip_address VARCHAR(45) NOT NULL,
    visited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    request_path VARCHAR(255) NOT NULL,
    referrer VARCHAR(500) NULL,
    origin VARCHAR(255) NULL,
    user_agent VARCHAR(500) NULL,
    is_blocked TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_visitor_access_ip_time (ip_address, visited_at),
    KEY idx_visitor_access_time (visited_at),
    KEY idx_visitor_access_blocked_time (is_blocked, visited_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
