CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    business_id VARCHAR(50) NOT NULL UNIQUE,
    registration_date DATE,
    address VARCHAR(255),
    postal_code VARCHAR(20),
    city VARCHAR(100),
    country VARCHAR(100),
    status VARCHAR(50)
);

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS status VARCHAR(50);

CREATE TABLE IF NOT EXISTS company_sync_state (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    source_version TEXT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL,
    imported_count BIGINT NOT NULL
);