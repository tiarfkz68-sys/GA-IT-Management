-- GA & IT Operations Management Database Schema (V2 - Complete Enterprise)
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS asset_user_history CASCADE;
DROP TABLE IF EXISTS consumable_checkouts CASCADE;
DROP TABLE IF EXISTS consumables CASCADE;
DROP TABLE IF EXISTS accessories CASCADE;
DROP TABLE IF EXISTS asset_maintenances CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. App Settings Table (Logo, Header, Label Designer Template)
CREATE TABLE app_settings (
    key VARCHAR(50) PRIMARY KEY,
    value JSONB NOT NULL
);

-- 2. Users Table with Authentication & Roles
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'it', 'ga', 'hrd', 'finance', 'employee')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Dynamic Categories Table
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(10) NOT NULL CHECK (domain IN ('IT', 'GA')),
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g. 'laptop', 'ac'
    name VARCHAR(100) NOT NULL,
    tag_prefix VARCHAR(10) NOT NULL, -- e.g. 'IT-LPT', 'GA-AC'
    icon VARCHAR(50) DEFAULT 'fa-box',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Assets Table
CREATE TABLE assets (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL, -- Asset Tag (e.g. IT-LPT-001)
    name VARCHAR(150) NOT NULL,
    category VARCHAR(10) NOT NULL CHECK (category IN ('IT', 'GA')),
    subcategory VARCHAR(50) NOT NULL, -- references categories(code)
    serial_number VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'maintenance', 'retired')),
    location VARCHAR(100) NOT NULL DEFAULT 'Head Office',
    specs JSONB NOT NULL DEFAULT '{}'::jsonb,
    assigned_to_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Asset User History (Histori Perpindahan / Serah Terima User)
CREATE TABLE asset_user_history (
    id SERIAL PRIMARY KEY,
    asset_id INT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    from_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    to_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('checkout', 'checkin', 'transfer')),
    condition VARCHAR(50) NOT NULL DEFAULT 'Baik (Normal)',
    bast_number VARCHAR(50), -- Nomor Berita Acara
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Asset Maintenances (Riwayat Servis & Cuci AC)
CREATE TABLE asset_maintenances (
    id SERIAL PRIMARY KEY,
    asset_id INT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    type VARCHAR(50) NOT NULL, -- 'service_berkala', 'perbaikan', 'upgrade_ram_ssd', 'cuci_ac', 'ganti_oli'
    cost NUMERIC(12, 2) DEFAULT 0,
    vendor VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Accessories Table
CREATE TABLE accessories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'mouse', 'keyboard', 'charger', 'headset', 'dongle', 'other'
    serial_number VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'broken')),
    linked_asset_id INT REFERENCES assets(id) ON DELETE SET NULL,
    assigned_to_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Consumables Table & Checkouts
CREATE TABLE consumables (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    current_stock INT NOT NULL DEFAULT 0,
    min_stock_alert INT NOT NULL DEFAULT 5,
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE consumable_checkouts (
    id SERIAL PRIMARY KEY,
    consumable_id INT NOT NULL REFERENCES consumables(id) ON DELETE CASCADE,
    recipient_name VARCHAR(100) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    notes TEXT,
    checkout_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Tickets Table (Logbook)
CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    ticket_no VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(30) NOT NULL CHECK (category IN ('IT_SUPPORT', 'GA_FACILITY', 'ASSET_REQUEST', 'MAINTENANCE')),
    priority VARCHAR(15) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    requester_id INT REFERENCES users(id) ON DELETE SET NULL,
    related_asset_id INT REFERENCES assets(id) ON DELETE SET NULL,
    resolution_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 10. Audit Trail / Activity Logs (Semua Perubahan Data)
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'CREATE_ASSET', 'HANDOVER_ASSET', 'UPDATE_ASSET', 'MAINTENANCE_LOG', 'STOCK_OUT', etc.
    target_type VARCHAR(50) NOT NULL, -- 'ASSET', 'ACCESSORY', 'CONSUMABLE', 'TICKET', 'SETTINGS'
    target_id INT,
    details TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SEED DATA
-- ============================================================

-- App Settings (Branding & Label Template)
-- SHA-256 of 'admin123' is: 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
INSERT INTO app_settings (key, value) VALUES
('general', '{
  "company_name": "PT NUSA PERSADA UTAMA",
  "app_title": "GA & IT Operations Portal",
  "logo_url": ""
}'::jsonb),
('label_template', '{
  "preset": "niimbot_b1",
  "width_mm": 50,
  "height_mm": 30,
  "elements": {
    "company": {"enabled": true, "x": 5, "y": 2, "fontSize": 10, "text": "PT NUSA PERSADA UTAMA"},
    "code": {"enabled": true, "x": 5, "y": 7, "fontSize": 14, "bold": true},
    "qrcode": {"enabled": true, "x": 32, "y": 7, "size": 16},
    "name": {"enabled": true, "x": 5, "y": 17, "fontSize": 9},
    "specs": {"enabled": true, "x": 5, "y": 21, "fontSize": 8},
    "serial": {"enabled": true, "x": 5, "y": 25, "fontSize": 8}
  }
}'::jsonb);

-- Users (Password default untuk semua akun demo: 'admin123')
INSERT INTO users (name, email, password_hash, role) VALUES
('Rian Pratama (Anda)', 'admin@company.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin'),
('Dimas Wahyu (IT Specialist)', 'dimas.it@company.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'it'),
('Siti Sarah (GA Specialist)', 'siti.ga@company.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'ga'),
('Ratna Dewi (HRD Backup)', 'hrd@company.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'hrd'),
('Farhan Siregar (Finance Auditor)', 'finance@company.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'finance'),
('Budi Santoso (Staff)', 'budi.staff@company.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'employee');

-- Dynamic Categories
INSERT INTO categories (domain, code, name, tag_prefix, icon) VALUES
('IT', 'laptop', 'Laptop / Notebook', 'IT-LPT', 'fa-laptop'),
('IT', 'desktop', 'Desktop PC / AIO', 'IT-PC', 'fa-desktop'),
('IT', 'smartphone', 'Smartphone / Tablet', 'IT-PHN', 'fa-mobile-screen'),
('IT', 'monitor', 'Monitor Eksternal', 'IT-MON', 'fa-tv'),
('IT', 'printer', 'Printer & Scanner', 'IT-PRN', 'fa-print'),
('IT', 'network', 'Router & Switch Jaringan', 'IT-NET', 'fa-network-wired'),
('GA', 'ac', 'AC (Air Conditioner)', 'GA-AC', 'fa-fan'),
('GA', 'vehicle', 'Kendaraan Operasional', 'GA-VEH', 'fa-car'),
('GA', 'furniture', 'Meja, Kursi & Perabot', 'GA-FUR', 'fa-couch'),
('GA', 'facility_other', 'Fasilitas & Gedung', 'GA-FCL', 'fa-building');

-- Primary Assets
INSERT INTO assets (code, name, category, subcategory, serial_number, status, location, specs, assigned_to_user_id) VALUES
('IT-LPT-001', 'MacBook Pro M3 Pro 14"', 'IT', 'laptop', 'C02G90XXMD6M', 'assigned', 'Jakarta HQ - Lt 3', 
 '{"processor": "Apple M3 Pro", "ram": "18GB", "storage": "512GB SSD", "os": "macOS Sonoma"}'::jsonb, 6),

('IT-LPT-002', 'ThinkPad T14s Gen 4', 'IT', 'laptop', 'PF-4M198X', 'available', 'IT Storage', 
 '{"processor": "AMD Ryzen 7 PRO 7840U", "ram": "32GB", "storage": "1TB SSD", "os": "Windows 11 Pro"}'::jsonb, NULL),

('IT-PHN-001', 'Samsung Galaxy A55 5G (Testing)', 'IT', 'smartphone', '358941293847120', 'assigned', 'Engineering Bay', 
 '{"ram": "8GB", "storage": "256GB", "imei": "358941293847120", "os": "Android 14"}'::jsonb, 2),

('IT-MON-001', 'Dell UltraSharp 27" 4K (U2723QE)', 'IT', 'monitor', 'CN-098KLA-7442', 'assigned', 'Ruang IT Lantai 3', 
 '{"panel": "IPS Black 4K", "ports": "USB-C Hub, HDMI, DP"}'::jsonb, 2),

('GA-AC-001', 'AC Daikin Inverter 2 PK Ruang Rapat', 'GA', 'ac', 'DK-2023-AC09', 'available', 'Lantai 2 - Ruang Rapat Bromo', 
 '{"capacity_pk": "2.0 PK", "refrigerant": "R32", "voltage": "220V"}'::jsonb, NULL),

('GA-VEH-001', 'Toyota Avanza Veloz (B 1234 CD)', 'GA', 'vehicle', 'MHKM1BA3J890123', 'available', 'Basement Parking', 
 '{"transmission": "CVT Automatic", "fuel": "Bensin", "tahun": "2024"}'::jsonb, NULL);

-- Asset Handover History
INSERT INTO asset_user_history (asset_id, from_user_id, to_user_id, action_type, condition, bast_number, notes) VALUES
(1, NULL, 6, 'checkout', 'Baik (Baru)', 'BAST/2026/01/001', 'Penyerahan unit laptop baru untuk karyawan onboarding.');

-- Asset Maintenances
INSERT INTO asset_maintenances (asset_id, maintenance_date, type, cost, vendor, notes) VALUES
(5, '2026-10-15', 'cuci_ac', 150000, 'CV Sejuk Mandiri', 'Cuci filter dan cek tekanan freon R32 normal.'),
(1, '2026-09-01', 'perbaikan', 0, 'Apple Authorized Service', 'Pembersihan port USB-C dan diagnostik baterai.');

-- Accessories
INSERT INTO accessories (name, category, serial_number, status, linked_asset_id, assigned_to_user_id) VALUES
('Logitech MX Master 3S', 'mouse', 'SN-LOG-98213', 'assigned', 1, 6),
('Keychron K2 Wireless Keyboard', 'keyboard', 'SN-K2-88741', 'assigned', 1, 6),
('Apple 96W USB-C Power Adapter', 'charger', 'SN-APL-CHG01', 'assigned', 1, 6),
('Dell Premier Wireless Mouse', 'mouse', 'SN-DLL-44312', 'available', NULL, NULL);

-- Consumables
INSERT INTO consumables (name, category, current_stock, min_stock_alert, unit) VALUES
('Kertas A4 PaperOne 80gr', 'atk', 45, 10, 'rim'),
('Toner HP LaserJet 85A (CE285A)', 'printer_supplies', 3, 5, 'pcs'),
('Baterai Alkaline AA (Isi 2)', 'other', 24, 8, 'pack'),
('Kabel Patch LAN Cat6 3 Meter', 'cables', 15, 5, 'pcs');

INSERT INTO consumable_checkouts (consumable_id, recipient_name, quantity, notes) VALUES
(1, 'Budi Santoso (Finance)', 2, 'Untuk cetak laporan akhir bulan'),
(2, 'Siti Sarah (GA)', 1, 'Penggantian toner printer kantor lt 2');

-- Tickets
INSERT INTO tickets (ticket_no, title, description, category, priority, status, requester_id, related_asset_id, resolution_note) VALUES
('LOG-2026-001', 'AC Ruang Bromo Bunyi Berderit', 'Suara blower AC agak berisik saat kipas kecepatan tinggi.', 'MAINTENANCE', 'medium', 'open', 6, 5, NULL),
('LOG-2026-002', 'Permintaan Mouse Ergonomis Tambahan', 'Karyawan butuh mouse nirkabel untuk kerja harian.', 'ASSET_REQUEST', 'low', 'resolved', 6, NULL, 'Diberikan Dell Premier Wireless Mouse.'),
('LOG-2026-003', 'Upgrade MacOS dan Pembersihan Cache Laptop Budi', 'Maintenance OS rutin pada unit MacBook Pro.', 'IT_SUPPORT', 'medium', 'resolved', 6, 1, 'Selesai di-update ke Sonoma 14.5');

-- Activity Logs
INSERT INTO activity_logs (user_name, action, target_type, target_id, details) VALUES
('System', 'INITIALIZE', 'SETTINGS', 1, 'Inisialisasi sistem GA & IT Workbench v2'),
('Rian Pratama', 'CREATE_ASSET', 'ASSET', 1, 'Mendaftarkan unit MacBook Pro M3 Pro 14" (IT-LPT-001)'),
('Rian Pratama', 'HANDOVER_ASSET', 'ASSET', 1, 'Menyerahkan IT-LPT-001 ke Budi Santoso (BAST/2026/01/001)');


-- ============================================================
-- Indexes for High Performance & Query Optimization
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_accessories_linked_asset ON accessories(linked_asset_id) WHERE linked_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asset_maint_asset_id ON asset_maintenances(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_history_asset_id ON asset_user_history(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON assets(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_assets_status_cat ON assets(status, category);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_related_asset ON tickets(related_asset_id) WHERE related_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumable_checkouts_csm ON consumable_checkouts(consumable_id, checkout_date DESC);


-- ============================================================
-- V1.2.0: Master Lokasi & Master PIC / Karyawan
-- ============================================================
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

INSERT INTO locations (name, building_floor, description) VALUES
('Head Office - Lt 1 Operasional', 'Gedung Utama Lantai 1', 'Lobby, Meja Resepsionis, dan Ruang Tamu'),
('Head Office - Lt 2 Ruang Rapat Bromo', 'Gedung Utama Lantai 2', 'Ruang Rapat Utama & Fasilitas Proyektor'),
('Head Office - Lt 3 Ruang IT & Server', 'Gedung Utama Lantai 3', 'Ruang Kerja IT Support, Server Rack, dan Workstation'),
('Gudang Logistik & Workshop', 'Basement 1', 'Penyimpanan cadangan perangkat keras dan ATK')
ON CONFLICT (name) DO NOTHING;

INSERT INTO employees (nik, name, department, position, phone_number) VALUES
('EMP-001', 'Eva Cecil', 'Support Indent', 'Staff Administrasi Indent', '081703803761'),
('EMP-002', 'Budi Santoso', 'Financial / Tagihan', 'Staff Finance & Billing', '081234567890'),
('EMP-003', 'Siti Sarah', 'Purchasing', 'Purchasing Officer', '081398765432'),
('EMP-004', 'Denny Kurniawan', 'Delivery Order', 'Koordinator Tim Pengiriman', '085711223344'),
('EMP-005', 'Hendra Wijaya', 'Marketing', 'Account Executive', '081822334455')
ON CONFLICT (nik) DO NOTHING;
