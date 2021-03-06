CREATE TABLE IF NOT EXISTS app_certificates (
    "app_uuid" VARCHAR(36) NOT NULL,
    "certificate" TEXT NOT NULL,
    "expiration_ts" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "created_ts" TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (app_uuid)
)
WITH ( OIDS = FALSE );

ALTER TABLE module_config
ADD COLUMN IF NOT EXISTS private_key TEXT,
ADD COLUMN IF NOT EXISTS certificate TEXT,
ADD COLUMN IF NOT EXISTS expiration_ts TIMESTAMP WITHOUT TIME ZONE;

CREATE OR REPLACE VIEW view_module_config AS
SELECT module_config.*
FROM (
SELECT status, max(id) AS id
    FROM module_config
    GROUP BY status
) AS vmc
INNER JOIN module_config ON vmc.id = module_config.id;

CREATE OR REPLACE VIEW view_module_config_staging AS
SELECT module_config.*
FROM (
    SELECT max(id) AS id
    FROM module_config
) mc
INNER JOIN module_config
ON module_config.id = mc.id;

CREATE OR REPLACE VIEW view_module_config_production AS
SELECT module_config.*
FROM (
    SELECT max(id) AS id
    FROM module_config
    WHERE status='PRODUCTION'
) mc
INNER JOIN module_config
ON module_config.id = mc.id;