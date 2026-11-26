-- Migration 001 (UP): Master Lokasi & Master PIC / Karyawan (Expand Phase)
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    building_floor VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    nik VARCHAR(50) UNIQUE,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    position VARCHAR(100),
    phone_number VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS location_id INT REFERENCES locations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_to_employee_id INT REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE asset_user_history
    ADD COLUMN IF NOT EXISTS from_employee_id INT REFERENCES employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS to_employee_id INT REFERENCES employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS known_by_1 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS known_by_2 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bast_template VARCHAR(30) DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS idx_assets_location_id ON assets(location_id);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_emp ON assets(assigned_to_employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
