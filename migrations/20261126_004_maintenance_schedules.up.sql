-- Migration 004 (UP): Asset Preventive Maintenance Schedules & Expanded History
CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id SERIAL PRIMARY KEY,
    asset_id INT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    interval_months INT NOT NULL DEFAULT 3 CHECK (interval_months >= 1 AND interval_months <= 60),
    last_done_date DATE,
    next_due_date DATE NOT NULL,
    executor_type VARCHAR(20) NOT NULL DEFAULT 'internal' CHECK (executor_type IN ('internal', 'vendor')),
    default_vendor VARCHAR(100),
    estimated_cost NUMERIC(12, 2) DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_maint_schedules_due ON maintenance_schedules(next_due_date ASC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_maint_schedules_asset ON maintenance_schedules(asset_id);

ALTER TABLE asset_maintenances
    ADD COLUMN IF NOT EXISTS schedule_id INT REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS executor_type VARCHAR(20) DEFAULT 'internal',
    ADD COLUMN IF NOT EXISTS performed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS status_impact VARCHAR(30) DEFAULT 'none';
