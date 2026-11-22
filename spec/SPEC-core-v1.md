# Spec: GA & IT Operations Management Core — V1

**Status:** Under Review  
**Capability Map:** [spec/capability-map.md](capability-map.md)  
**Reference Intent:** [docs/intent/ga-it-core.md](../docs/intent/ga-it-core.md)  

---

## 1. Objective
Membangun platform operasional terpadu untuk staf General Affair & IT Support dengan kecepatan kerja tinggi (input aset <1 menit, bebas birokrasi *custom fieldsets* Snipe-IT), menyediakan Asset Tagging fisik, form spesifikasi adaptif otomatis, aksesoris yang terhubung ke aset utama, stok barang habis pakai (consumables), serta logbook pekerjaan harian.

---

## 2. Tech Stack & Commands

- **Runtime**: Node.js v20+ / Alpine (ES Modules `import/export`)
- **Web Framework**: Express v4
- **Database**: PostgreSQL 16 (Alpine) via library `pg` (Connection Pooling)
- **Container Engine**: Docker / Kiri (`kiri compose`)
- **Frontend**: Lightweight SPA (HTML5, Tailwind CSS via CDN / CSS vanilla, native modern JS ES6+) di folder `public/` (zero build step / instantly served).

### Commands
```powershell
# Development (Host)
npm install
npm run dev

# Container Lifecycle (Kiri / Docker)
kiri compose up -d --build
kiri ps
kiri compose down

# Database Refresh (Saat skema berubah)
kiri compose down -v
kiri compose up -d --build
```

---

## 3. Project Structure

```text
GA-IT Management/
├── docker-compose.yml       → Definisi container DB (PostgreSQL) dan App (Node)
├── Dockerfile               → Image build container web app
├── init.sql                 → Skema DDL PostgreSQL + Seed data operasional
├── package.json             → Dependencies & npm scripts
├── public/
│   ├── index.html           → Dashboard UI terintegrasi (SPA tabbed interface)
│   └── app.js               → Logika client-side (SPA tab switching, modal forms, dynamic specs)
├── src/
│   ├── index.js             → Express API server & routes
│   └── db.js                → PostgreSQL client pool instance
├── spec/
│   ├── capability-map.md    → Peta kapabilitas modul & build order
│   └── SPEC-core-v1.md      → Spesifikasi teknis ini
└── docs/
    └── intent/
        └── ga-it-core.md    → Dokumen kebutuhan terkonfirmasi
```

---

## 4. UI/UX Interaction Principles & Code Style

### UI/UX Rules (Confirmed by User)
1. **List-First Pattern**: Setiap membuka menu mana pun (Aset Utama, Aksesoris, Consumables, Logbook), antarmuka **wajib menampilkan tabel/daftar data terlebih dahulu** beserta kolom pencarian dan tombol aksi di bagian atas.
2. **Pop-up Modal untuk Quick Action**:
   - Consumables: Modal *Keluar Barang (Checkout)* dan *Masuk Stok (Restock)*.
   - Aksesoris: Modal *Tambah Aksesoris* & *Pasangkan ke Laptop/User*.
   - Logbook: Modal *Catat Tiket/Tugas Cepat*.
   - Maintenance: Modal *Catat Riwayat Servis / Cuci AC*.
3. **Dedicated Screen / View untuk Detailed Input**:
   - Form input *Tambah Aset Baru* yang memerlukan spesifikasi lengkap (CPU, RAM, Storage, Serial Number, IMEI, PK AC) memiliki tampilan halaman khusus yang lega (bukan popup kecil yang terpotong), dengan tombol "Kembali ke Daftar".

### Code Style & Patterns
Gaya kode ringkas, fungsional, dan menghindari abstraksi berlebih (*Ponytail style*):

```javascript
// Contoh Endpoint Handler Ringkas (Express + pg)
app.post('/api/assets', async (req, res) => {
  const { code, name, category, subcategory, status, location, specs, serial_number, assigned_to_user_id } = req.body;
  try {
    const result = await query(
      `INSERT INTO assets (code, name, category, subcategory, status, location, specs, serial_number, assigned_to_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [code, name, category, subcategory, status || 'available', location || 'Head Office', JSON.stringify(specs || {}), serial_number || null, assigned_to_user_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- **Naming**: `snake_case` untuk nama kolom SQL, `camelCase` untuk variabel JavaScript.
- **Spec Storage**: Spesifikasi teknis disimpan di kolom `JSONB` agar form frontend dapat mengirim field spesifikasi dinamis (CPU, RAM, SSD, IMEI, PK) tanpa migrasi kolom terus-menerus.

---

## 5. Database Schema Specification

### A. Tabel `assets` (Aset Utama)
- `id`: SERIAL PRIMARY KEY
- `code`: VARCHAR(50) UNIQUE NOT NULL (Asset Tag: `IT-LPT-001`, `GA-AC-001`, dll.)
- `name`: VARCHAR(150) NOT NULL (contoh: "MacBook Pro M3 16GB", "AC Daikin 1.5 PK Lt 2")
- `category`: VARCHAR(10) NOT NULL ('IT' atau 'GA')
- `subcategory`: VARCHAR(50) NOT NULL ('laptop', 'desktop', 'smartphone', 'monitor', 'ac', 'vehicle', 'facility_other')
- `serial_number`: VARCHAR(100) (SN pabrik / IMEI untuk HP)
- `status`: VARCHAR(20) DEFAULT 'available' ('available', 'assigned', 'maintenance', 'retired')
- `location`: VARCHAR(100) DEFAULT 'Head Office'
- `specs`: JSONB DEFAULT '{}'::jsonb
  - *Laptop/Desktop*: `{ "processor": "M3", "ram": "16GB", "storage": "512GB SSD", "os": "macOS" }`
  - *Smartphone*: `{ "ram": "8GB", "storage": "256GB", "imei": "358...", "os": "Android 14" }`
  - *AC*: `{ "capacity_pk": "1.5 PK", "refrigerant": "R32" }`
- `assigned_to_user_id`: INT REFERENCES users(id) ON DELETE SET NULL
- `created_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

### B. Tabel `asset_maintenances` (Riwayat Servis)
- `id`: SERIAL PRIMARY KEY
- `asset_id`: INT NOT NULL REFERENCES assets(id) ON DELETE CASCADE
- `maintenance_date`: DATE NOT NULL DEFAULT CURRENT_DATE
- `type`: VARCHAR(50) NOT NULL ('service_berkala', 'perbaikan', 'upgrade_ram_ssd', 'cuci_ac', 'ganti_oli')
- `cost`: NUMERIC(12, 2) DEFAULT 0
- `vendor`: VARCHAR(100)
- `notes`: TEXT
- `created_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

### C. Tabel `accessories` (Aksesoris & Peripherals)
- `id`: SERIAL PRIMARY KEY
- `name`: VARCHAR(100) NOT NULL (contoh: "Logitech MX Master 3S", "Keychron K2 Keyboard")
- `category`: VARCHAR(50) NOT NULL ('mouse', 'keyboard', 'charger', 'headset', 'dongle', 'other')
- `serial_number`: VARCHAR(100)
- `status`: VARCHAR(20) DEFAULT 'available' ('available', 'assigned', 'broken')
- `linked_asset_id`: INT REFERENCES assets(id) ON DELETE SET NULL  *(Link langsung ke unit laptop/PC)*
- `assigned_to_user_id`: INT REFERENCES users(id) ON DELETE SET NULL *(Atau langsung ke user)*
- `created_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

### D. Tabel `consumables` & `consumable_checkouts` (Barang Habis Pakai)
- `consumables`:
  - `id`: SERIAL PRIMARY KEY
  - `name`: VARCHAR(150) NOT NULL (contoh: "Kertas A4 PaperOne 80gr", "Toner HP LaserJet 85A")
  - `category`: VARCHAR(50) NOT NULL ('atk', 'printer_supplies', 'pantry', 'cables', 'other')
  - `current_stock`: INT NOT NULL DEFAULT 0
  - `min_stock_alert`: INT NOT NULL DEFAULT 5
  - `unit`: VARCHAR(20) NOT NULL DEFAULT 'pcs' ('rim', 'pcs', 'box', 'roll')
- `consumable_checkouts`:
  - `id`: SERIAL PRIMARY KEY
  - `consumable_id`: INT NOT NULL REFERENCES consumables(id) ON DELETE CASCADE
  - `user_id`: INT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  - `quantity`: INT NOT NULL CHECK (quantity > 0)
  - `notes`: TEXT
  - `checkout_date`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP

### E. Tabel `tickets` (Logbook Harian)
- `id`: SERIAL PRIMARY KEY
- `ticket_no`: VARCHAR(20) UNIQUE NOT NULL (contoh: `LOG-2026-001`)
- `title`: VARCHAR(200) NOT NULL
- `description`: TEXT
- `category`: VARCHAR(30) NOT NULL ('IT_SUPPORT', 'GA_FACILITY', 'ASSET_REQUEST', 'MAINTENANCE')
- `priority`: VARCHAR(15) DEFAULT 'medium' ('low', 'medium', 'high', 'urgent')
- `status`: VARCHAR(20) DEFAULT 'open' ('open', 'in_progress', 'resolved', 'closed')
- `requester_id`: INT REFERENCES users(id) ON DELETE SET NULL
- `related_asset_id`: INT REFERENCES assets(id) ON DELETE SET NULL *(Bila keluhan terkait laptop/AC spesifik)*
- `resolution_note`: TEXT
- `created_at`: TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
- `resolved_at`: TIMESTAMP WITH TIME ZONE

---

## 6. Testing & Verification Strategy

1. **Schema Integrity Check**: Database initialization via `init.sql` harus berjalan tanpa error constraint, foreign key, atau enum syntax.
2. **Endpoint Smoke Tests**:
   - `POST /api/assets` berhasil memasukkan aset dengan `specs` JSONB (laptop & HP & AC).
   - `POST /api/accessories` berhasil membuat aksesoris dengan `linked_asset_id`.
   - `POST /api/consumables/:id/checkout` berhasil mengurangi `current_stock` dan mencatat history.
   - `POST /api/tickets` berhasil mencatat logbook baru dan mengaitkannya ke aset.
3. **UI Verification**:
   - Form penambahan aset otomatis menampilkan field spesifikasi yang relevan saat tipe aset dipilih.
   - Tabel menampilkan daftar aset beserta aksesoris yang terpasang padanya.

---

## 7. Boundaries

- **Always**:
  - Validasi keberadaan record sebelum transaksi (misal: cek sisa stok sebelum checkout consumable).
  - Gunakan parameterized query di `pg` untuk mencegah SQL Injection.
  - Sediakan fallback nilai default pada JSONB spesifikasi jika field opsional kosong.
- **Ask First**:
  - Menghapus volume database jika ada data riil yang belum di-backup.
  - Menambahkan dependensi npm eksternal baru selain yang sudah terpasang (`express`, `pg`, `cors`, `dotenv`).
- **Never**:
  - Hardcode kredensial database di luar variabel lingkungan `.env` / `docker-compose.yml`.
  - Membuat alur registrasi publik mandiri tanpa persetujuan (tetap pertahankan sistem logbook internal).

---

## 8. Success Criteria

1. **Kecepatan Input**: Pengguna dapat menambahkan unit laptop atau HP baru lengkap dengan spesifikasi teknis dan Asset Tag dalam <1 menit.
2. **Keterkaitan Aksesoris**: Mouse atau keyboard yang di-assign ke laptop `IT-LPT-001` langsung terlihat di baris/detail laptop tersebut.
3. **Kendali Stok**: Setiap pengeluaran barang habis pakai (misal 2 rim kertas) otomatis memotong jumlah stok dan memiliki riwayat penerimanya.
4. **Logbook Terhubung**: Setiap perbaikan atau servis dapat dicatat langsung dan dikaitkan ke unit aset yang bersangkutan.

---

## 9. Out of Scope (Deferred)
- **V2**: *Floor Plan & CCTV Mapping* — denah interaktif posisi PC dan titik kamera keamanan.
- **V2**: Generator QR Code visual yang dapat di-print langsung dari browser menjadi stiker label.
- **V2**: Export rekapan bulanan ke format file Excel / PDF langsung.

---

## 10. Open Questions
1. Apakah format kode Asset Tag otomatis ingin menggunakan pola sederhana (misal: `IT-LPT-001`, `IT-PHN-001`, `GA-AC-001`), atau Anda sudah punya format penomoran tag fisik tersendiri di kantor?
2. Pada form checkout Consumables (misal staf minta mousepad/buku catatan), apakah nama pengambil barang harus selalu terdaftar di tabel `users`, atau boleh bebas ketik nama penerima?
