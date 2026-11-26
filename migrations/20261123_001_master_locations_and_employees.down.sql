-- Migration 001 (DOWN): Rollback Master Lokasi & Master PIC / Karyawan
DROP INDEX IF EXISTS idx_employees_department;
DROP INDEX IF EXISTS idx_assets_assigned_emp;
DROP INDEX IF EXISTS idx_assets_location_id;

ALTER TABLE asset_user_history
    DROP COLUMN IF EXISTS bast_template,
    DROP COLUMN IF EXISTS known_by_2,
    DROP COLUMN IF EXISTS known_by_1,
    DROP COLUMN IF EXISTS to_employee_id,
    DROP COLUMN IF EXISTS from_employee_id;

ALTER TABLE assets
    DROP COLUMN IF EXISTS assigned_to_employee_id,
    DROP COLUMN IF EXISTS location_id;

DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS locations;
