# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-11-26

### Added
- **Maintenance Aset Terpusat (`#nav-maintenance` / `#view-maintenance`)**:
  - Skema tabel `maintenance_schedules` beserta ekstensi `asset_maintenances` (`schedule_id`, `executor_type`, `performed_by`, `status_impact`) lewat migrasi reversibel [`migrations/20261126_004_maintenance_schedules.up.sql`](file:///c:/Users/IT/Documents/GA-IT%20Management/migrations/20261126_004_maintenance_schedules.up.sql).
  - REST API terpusat `/api/maintenances` (`GET/POST/DELETE /schedules`, `POST /schedules/:id/complete`, `GET/POST /logs`) di [`src/routes/maintenances.js`](file:///c:/Users/IT/Documents/GA-IT%20Management/src/routes/maintenances.js).
  - Mendukung jenis perawatan rutin **Cuci AC**, **Cleaning Printer**, **Cleaning PC**, **Cleaning Laptop**, dan **Servis Berkala / Perbaikan**, pelaksana **Internal** (Rp 0) maupun **Vendor Eksternal** (berbiaya), aksi cepat 1-klik **Tandai Selesai** yang otomatis memajukan `next_due_date` tanpa mengubah status aset aktif (`available`/`assigned`) kecuali opsi perbaikan dicentang, serta ekspor CSV (`GET /api/reports/export?type=maintenances`), Excel, dan cetak A4.
- **Clean Slate Inventory Seed**:
  - Mengosongkan data demo dummy (`assets`, `accessories`, `consumables`, `consumable_checkouts`, `asset_maintenances`, `asset_user_history`, `tickets`) pada [`init.sql`](file:///c:/Users/IT/Documents/GA-IT%20Management/init.sql) dengan tetap mempertahankan data master (`users`, `app_settings`, `categories`, `locations`, `employees`).
  - Menambahkan skrip cleanup aman produksi [`scripts/clean-dummy-data.sql`](file:///c:/Users/IT/Documents/GA-IT%20Management/scripts/clean-dummy-data.sql).

### Verified
- **Integration & Security Tests**: 68/68 tests passing (`npm test`), mencakup test self-contained consumable dan alur penuh schedule + completion + CSV maintenance.
- **Accessibility**: 0 WCAG 2.2 AA violations via `@axe-core/cli 4.13.0`.
- **Syntax Gate**: 25/25 JavaScript files / inline scripts verified (`npm run check`).

---

## [1.3.0] - 2026-11-26

### Added
- **Pusat Import Data Master (`#nav-import` / `#view-import`)**: Menu khusus di sidebar untuk import massal file Excel (`.xlsx`, `.xls`) dan CSV bagi:
  - **Kategori Barang** (`POST /api/categories/batch-import`)
  - **Master Lokasi Kantor** (`POST /api/locations/batch-import`)
  - **Master PIC / Karyawan** (`POST /api/employees/batch-import`)
  - **Master ATK, Tinta & Ribbon** (`POST /api/consumables/batch-import`)
  - Dilengkapi fitur download template Excel otomatis per tipe data, pratinjau validasi baris, serta opsi *Overwrite* data duplikat.
- **Laporan Bulanan ATK, Tinta, Toner & Ribbon**:
  - Tabel riwayat stok masuk `consumable_restocks` untuk melacak restock bulanan secara akurat.
  - Endpoint `GET /api/reports/consumables-monthly` dan ekspor CSV `GET /api/reports/export?type=consumables-monthly`.
  - Modal interaktif laporan bulanan di tab *Consumables (ATK)* dengan pemilih periode bulan (`<input type="month">`), filter kategori (termasuk **Ribbon / Pita Printer** & **Tinta / Toner**), 4 kartu ringkasan KPI, tab rekapitulasi per barang, tab rincian transaksi keluar, ekspor Excel 2-sheet (`.xlsx`), ekspor CSV, dan cetak A4.

### Changed
- **Backend Refactoring**: Mengekstrak helper transaksi `runBatchImport()` ([`src/utils/batchImport.js`](file:///c:/Users/IT/Documents/GA-IT%20Management/src/utils/batchImport.js)) untuk seluruh endpoint batch import dan menyatukan query SQL laporan bulanan di `fetchMonthlyConsumables()` ([`src/routes/reports.js`](file:///c:/Users/IT/Documents/GA-IT%20Management/src/routes/reports.js)).

### Security
- **JWT & HTTP Hardening**: Menghapus fallback `JWT_SECRET` statis di [`src/utils/auth.js`](file:///c:/Users/IT/Documents/GA-IT%20Management/src/utils/auth.js), menonaktifkan header `X-Powered-By`, menambahkan HSTS pada koneksi HTTPS, serta menurunkan batas JSON payload ke `2mb`.
- **Input & DoS Bounds**: Membatasi maksimal 500 baris per batch import, menambahkan allowlist kategori consumables, serta validasi panjang karakter pada Master Lokasi & PIC.

### Verified
- **Integration & Security Tests**: 52/52 tests passing (`npm test`).
- **Accessibility**: 0 WCAG 2.2 AA violations via `@axe-core/cli 4.13.0`.
- **Syntax Gate**: 22/22 JavaScript files verified (`npm run check`).
- **Dependency Audit**: 0 vulnerabilities (`npm audit --omit=dev`).

---

## [1.2.0] - 2026-11-23

### Added
- **Master Lokasi Kantor**: Database table `locations`, CRUD REST API (`/api/locations`), UI management card and modal in *Pengaturan & Master*, 60s in-memory TTL caching, and seamless dropdown selection in asset registration.
- **Master PIC / Karyawan (Decoupled from Login Users)**: Independent `employees` database table, CRUD REST API (`/api/employees`), department filtering, search, and UI management table. Enables tracking physical custody of equipment for operational personnel (e.g. drivers, couriers, indent support, security) without generating login accounts.
- **Photo-Matched BAST Document (Handover)**: Re-engineered Berita Acara Serah Terima based on official company form (`media_1795424704138_ed8d3592.jpg`):
  - Official header: `TGC OF [COMPANY NAME]` with double underline border.
  - Form Title: `FASILITAS HANDPHONE DARI PERUSAHAAN` (or `BERITA ACARA SERAH TERIMA ASET KANTOR` for general assets).
  - Preamble meeting & policy decree block.
  - Dedicated Gadget specifications (Type HP/Tab, No HP/Tab, Harga Unit HP, Paket Nomor HP / Provider e.g. *Biz Starter*).
  - **4 Butir Aturan Tanggung Jawab Mutlak**: Universal 4-clause accountability rules enforced on ALL asset handovers (both gadget and non-gadget per user specification).
  - Physical condition and recipient details (`Nama Pemegang`, `Bagian / Departemen`, `Diberikan Pada Tgl`, `Kondisi Saat Diberikan`).
  - **3 Kolom Tanda Tangan**: Pihak Penerima (*Saya yang bertanda tangan*), Diketahui Oleh 1 (*Supervisor / Atasan Bagian*), and Diketahui Oleh 2 (*GA & IT Management*).
  - Declaration clause: *"Telah membaca dan memahami fasilitas perusahaan yang diberikan tanggung jawab kepada saya, dengan kondisi sadar tanpa ada paksaan dari pihak manapun."*
  - Document footer with timestamp and generator attribution.
- **Dynamic BAST Template Switcher**: In-modal toggle allowing instant switching between *Fasilitas HP / Gadget* and *Aset Kantor Umum* templates.

### Changed
- **Asset Registration**: Integrated Master Lokasi and Master PIC / Karyawan dropdowns into asset registration (`#form-add-asset`), along with dynamic fields for gadget SIM number, provider package, and unit price.
- **Single & Batch Asset Handover**: Upgraded handover modals (`#modal-handover` and `#modal-batch-handover`) to support assigning custody to Master PICs with customizable *Diketahui Oleh 1 & 2* signers.
- **Asset History & Timeline**: Enhanced timeline logs to capture `from_employee_id`, `to_employee_id`, `known_by_1`, `known_by_2`, and `bast_template`.

### Verified
- **Accessibility & Quality Gates**: 0 WCAG 2.2 AA violations detected via `@axe-core/cli 4.13.0`.
- **Integration Tests**: 35 automated API tests passing (`npm test`).
- **Syntax Verification**: 21/21 JavaScript source files validated (`npm run check`).

---

## [1.1.0] - 2026-11-23

### Added
- **CI/CD & Automation Suite**: Added GitHub Actions quality gate pipeline (`.github/workflows/ci.yml`), automated release packaging (`release.yml`), Dependabot dependency monitoring (`dependabot.yml`), environment variable template (`.env.example`), and zero-dependency syntax validator (`scripts/check-syntax.cjs`).
- **Performance Optimizations & Guard Suite**: Added Express Gzip compression (68% bundle reduction), ETag conditional caching (304 Not Modified), PostgreSQL B-tree foreign key indexes (98.3% planner cost reduction), CDN resource hints (`preconnect`, `dns-prefetch`), deferred non-critical scripts, and in-memory TTL caching for reference data recorded in `PERF.md`.
- **Multi-line ATK / Consumable Transactions**: Multi-row forms for registering new consumable master items, batch restock receiving, and batch checkout with dynamic animated counters.
- **Batch Asset Management**: Multi-select row selection, mass status changes, thermal barcode sticker batch printing, and combined Berita Acara Serah Terima (BAST) document generation.
- **Excel Asset Importer**: In-browser XLSX/CSV spreadsheet parser with validation and downloadable template generator.
- **Live Search & Filter Toolbar**: Real-time multi-criteria filtering for Assets (category, division, status), Consumables, and Tickets with instant reset.
- **Automated Accessibility Test Suite**: Integration of `@axe-core/cli` and `pa11y` (HTML_CodeSniffer) generating compliance reports in `a11y-reports/axe.json`.
- **Integration Test Suite**: Automated backend API endpoint test runner in `scratch/test_endpoints.cjs` (`npm test`).

### Changed
- **Visual Design (60-30-10 Rule)**: Re-skinned entire interface with a Linen (`#FAF8F5`) canvas, Navy (`#0C1E33`) primary accents, and warm Amber (`#F59E0B`) action highlights.
- **Backend Architecture**: Decoupled monolithic server into clean Express route modules (`auth.js`, `assets.js`, `consumables.js`, `tickets.js`, `accessories.js`, `admin.js`).
- **Responsive Layout**: Re-engineered table overflow containers and navigation drawer to ensure complete usability on mobile screens without horizontal clipping.

### Fixed
- **WCAG 2.2 AA Accessibility Compliance**: Remediated all 16 modals with accessible dialog roles, focus trapping, Escape key dismissal, explicit `<label for="...">` associations, minimum touch target dimensions ($\ge 24\text{px}$), and contrast ratios $\ge 10.5:1$.
- **Inventory Concurrency**: Prevented race conditions and negative inventory during simultaneous checkouts using PostgreSQL `SELECT FOR UPDATE` row locks.
- **Mobile Viewport Overflow**: Resolved horizontal layout truncation across cards, tables, and modal dialogs.

### Security
- **OWASP Hardening**: Implemented strict Content Security Policy (CSP), anti-clickjacking headers (`X-Frame-Options: SAMEORIGIN`), and MIME sniffing protection.
- **Brute-Force Rate Limiting**: Added in-memory rate limiting to `/api/auth/login` (5 attempts per 15-minute window).
- **SQL Injection Prevention**: Hardened all database queries with parameterized SQL inputs.
- **Authentication & RBAC**: Added Bearer token validation and role-based route guard middleware.

---

## [1.0.0] - 2026-11-22

### Added
- Initial release of Unified General Affairs & IT Management Super App Core.
- Hardware asset registration, category management, and peripheral accessory tracking.
- Stock alerts for office stationery and consumables.
- Internal IT helpdesk ticketing system.
- Docker Compose setup (`docker-compose.yml`) for containerized deployment with PostgreSQL.
