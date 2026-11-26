-- Migration 004 (DOWN): Rollback Maintenance Schedules & Expanded Columns
ALTER TABLE asset_maintenances
    DROP COLUMN IF EXISTS status_impact,
    DROP COLUMN IF EXISTS performed_by,
    DROP COLUMN IF EXISTS executor_type,
    DROP COLUMN IF EXISTS schedule_id;

DROP INDEX IF EXISTS idx_maint_schedules_asset;
DROP INDEX IF EXISTS idx_maint_schedules_due;
DROP TABLE IF EXISTS maintenance_schedules;
