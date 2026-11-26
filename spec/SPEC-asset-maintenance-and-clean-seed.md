# Spec: Fitur Maintenance Aset & Clean Seed Data — V1.4.0

## 1. Objective
Membangun modul terpusat **Maintenance Aset** untuk manajemen jadwal *preventive maintenance* berulang (Cuci AC, Cleaning Printer, Cleaning PC, Cleaning Laptop, Servis Berkala, Perbaikan) sekaligus membersihkan seluruh *dummy seed data* inventaris/transaksi agar siap produksi di VPS.

## 2. Database Schema Changes
### 2.1 Tabel Baru: `maintenance_schedules`
```sql
CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id SERIAL PRIMARY KEY,
    asset_id INT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL, -- 'cuci_ac', 'cleaning_printer', 'cleaning_pc', 'cleaning_laptop', 'service_berkala', 'perbaikan'
    interval_months INT NOT NULL DEFAULT 3 CHECK (interval_months >= 1),
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
```

### 2.2 Perluasan Tabel `asset_maintenances` (Expand Phase)
```sql
ALTER TABLE asset_maintenances
    ADD COLUMN IF NOT EXISTS schedule_id INT REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS executor_type VARCHAR(20) DEFAULT 'internal',
    ADD COLUMN IF NOT EXISTS performed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS status_impact VARCHAR(30) DEFAULT 'none';
```

### 2.3 Clean Seed Data (`init.sql` & `scripts/clean-dummy-data.sql`)
- `init.sql`: Menghapus baris `INSERT INTO` dummy untuk `assets`, `asset_user_history`, `asset_maintenances`, `accessories`, `consumables`, `consumable_checkouts`, `tickets`, dan log dummy. Menyisakan `app_settings`, `users`, `categories`, `locations`, `employees` (atau bisa tetap menjaga master awal).
- `scripts/clean-dummy-data.sql`: Skrip `TRUNCATE ... RESTART IDENTITY CASCADE` aman untuk membersihkan data dummy pada database produksi yang sudah terlanjur di-seed.

## 3. REST API Contract (`/api/maintenances`)
- `GET /api/maintenances/schedules?due_filter=all|overdue|due_soon&task_type=...&search=...`
  - Mengembalikan daftar jadwal aktif + informasi aset (`code`, `name`, `category`, `subcategory`, `location_name`, `employee_name`) + `due_status` (`overdue`, `due_soon` <= 14 hari, `upcoming`) + `days_remaining`.
- `POST /api/maintenances/schedules`
  - Membuat jadwal perawatan berulang baru (`asset_id`, `task_type`, `interval_months`, `next_due_date`, `executor_type`, `default_vendor`, `estimated_cost`, `notes`).
- `POST /api/maintenances/schedules/:id/complete`
  - Eksekusi 1-klik **Tandai Selesai** secara transaksional (`BEGIN`/`COMMIT`):
    1. Mencatat entri riwayat ke `asset_maintenances` (`maintenance_date`, `type`, `cost`, `executor_type`, `vendor`, `performed_by`, `notes`, `schedule_id`).
    2. Menggeser `last_done_date = maintenance_date` dan `next_due_date = maintenance_date + interval_months * INTERVAL '1 month'`.
    3. Jika `mark_asset_repair === true`, opsional mengubah `assets.status = 'maintenance'`; untuk cleaning rutin (`false`), status aset tidak berubah.
    4. Mencatat ke `activity_logs`.
- `DELETE /api/maintenances/schedules/:id` (non-aktifkan/hapus jadwal).
- `GET /api/maintenances/logs?month=YYYY-MM&task_type=...&executor_type=...`
  - Mengembalikan riwayat seluruh servis & cleaning lintas aset + ringkasan total biaya & jumlah pekerjaan.
- `POST /api/maintenances/logs`
  - Mencatat pengerjaan cleaning/perbaikan ad-hoc langsung dari menu Maintenance tanpa jadwal berulang (juga opsional membuat jadwal berikutnya).
- `GET /api/reports/export?type=maintenances&month=...`
  - Export CSV riwayat & biaya maintenance (dengan sanitasi anti CSV injection).

## 4. Frontend UI (`public/index.html`)
- **Sidebar:** Menu **Maintenance Aset** (`#nav-maintenance`) di bawah *Consumables (ATK)*.
- **View `#view-maintenance`:**
  - Strip 4 KPI: *Terlambat (Overdue)*, *Jatuh Tempo <= 14 Hari*, *Selesai Bulan Ini*, *Total Biaya Bulan Ini*.
  - 2 Sub-tab:
    1. **Jadwal Perawatan Rutin**: Filter status jatuh tempo & jenis pekerjaan (`Cuci AC`, `Cleaning Printer`, `Cleaning PC`, `Cleaning Laptop`, dll.), tombol **+ Buat Jadwal Rutin**, dan tombol 1-klik **Tandai Selesai** per baris.
    2. **Riwayat & Laporan Biaya Servis**: Filter bulan & pelaksana (Internal vs Vendor), tombol **+ Catat Cleaning/Servis**, **Export Excel (.xlsx)**, **Export CSV**, dan **Cetak (A4)**.
- **Modal:** `#modal-maint-schedule` (buat jadwal baru) & `#modal-maint-complete` (konfirmasi selesai 1-klik dengan isi pelaksana, biaya, & catatan).

## 5. Testing & Quality Gates
- `tests/api.test.cjs`: Dibuat 100% mandiri (membuat & menghapus sendiri item consumable uji tanpa berasumsi `consumables` ID 1 ada di seed), plus menambahkan uji lengkap CRUD jadwal maintenance, 1-klik selesai + pergeseran `next_due_date`, rekap log biaya, dan CSV export.
- `npm run verify`: `node scripts/check-syntax.cjs` (semua file + inline script) & `npm test` lulus 100%.
- `@axe-core/cli`: 0 WCAG 2.2 AA violations.
