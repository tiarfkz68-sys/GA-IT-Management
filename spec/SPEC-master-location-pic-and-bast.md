# Spec Delta: Master Lokasi, Master PIC / Karyawan, dan BAST Berbasis Klausul Legal

**Status:** approved  
**Initiative:** Enterprise Inventory Governance & Legal BAST  
**Version:** V1.2.0-delta  
**Parent Spec:** `spec/SPEC-core-v1.md`  

---

## 1. Objective

Meningkatkan tata kelola inventaris kantor dengan:
1. Menghadirkan modul **Master Lokasi** terpusat agar penempatan fisik aset tidak lagi diketik secara manual (*free-text*).
2. Menghadirkan modul **Master PIC / Karyawan** independen agar karyawan penerima aset/fasilitas dapat didata lengkap (Nama, NIK, Bagian/Departemen, No. Kontak) tanpa mewajibkan akun login aplikasi.
3. Memadukan dokumen cetak **Berita Acara Serah Terima (BAST)** untuk seluruh aset (baik Gadget maupun Non-Gadget) agar mengadopsi struktur dokumen fisik resmi perusahaan:
   - 4 butir klausul aturan tanggung jawab inventaris resmi (larangan bawa pulang tanpa izin, biaya kerusakan 50%, ganti hilang 100%).
   - Tiga kolom tanda tangan legal: Penerima, Diketahui Oleh 1 (Atasan/Supervisor), Diketahui Oleh 2 (Pimpinan / GA-IT).
   - Klausul pernyataan kesadaran tanpa paksaan.
   - Tambahan field spesifik untuk kategori Smartphone/Gadget: Nomor HP, Paket Provider/Data, Harga Unit.

---

## 2. Current Behavior vs. New Behavior

### Current Behavior (V1.1.0)
- Lokasi aset disimpan sebagai string bebas (`location VARCHAR(100)`), sering terjadi inkonsistensi penulisan (e.g. "Head Office", "HO", "Lt 2").
- Pemegang aset mengambil referensi dari tabel `users` (`assigned_to_user_id`), sehingga karyawan lapangan (kurir, security, driver) yang tidak memiliki email/login sistem harus dibuatkan akun palsu atau tidak dapat dipilih.
- BAST berformat tunggal sederhana dengan 2 kolom tanda tangan (Pemberi dan Penerima), tanpa 4 butir klausul tanggung jawab inventaris dan tanpa field penandatangan pejabat pengawas.

### New Behavior (V1.2.0)
- Lokasi aset dikelola terpusat di tabel `locations` dan dipilih via dropdown pada registrasi aset, filter, dan mutasi.
- Pemegang aset dikelola terpusat di tabel `employees` (Master PIC) mencakup Nama, NIK, Bagian, Jabatan, dan Telepon.
- Form registrasi smartphone memiliki field spesifik: Nomor SIM/HP, Provider/Paket, dan Estimasi Harga Unit.
- Seluruh dokumen BAST (baik gadget maupun non-gadget) memuat:
  1. Kop resmi perusahaan (`TGC OF [COMPANY_NAME]`).
  2. Judul BAST resmi: `FASILITAS HANDPHONE DARI PERUSAHAAN` (untuk HP/Gadget) atau `BERITA ACARA SERAH TERIMA ASET KANTOR` (untuk Non-Gadget).
  3. **4 Klausul Tanggung Jawab Mutlak**:
     - *1. Inventaris harus ditanggungjawabkan oleh nama yang tertera di form ini.*
     - *2. Dilarang membawa pulang inventaris, kecuali sudah diijinkan oleh Pimpinan / Manager / Supervisor masing-masing bagian.*
     - *3. Pemegang inventaris bertanggung jawab terhadap kondisi unit, jika ada kerusakan maka akan dibebankan biaya perbaikan kepada pemegang sebesar 50%.*
     - *4. Jika inventaris hilang maka penggantian unit ditanggung oleh pemegang 100%.*
  4. Data pemegang, bagian, tanggal, dan kondisi fisik awal (e.g. "Baru, include Charger").
  5. 3 Kolom tanda tangan: Penerima, Diketahui Oleh 1 (Atasan/Supervisor), Diketahui Oleh 2 (Pimpinan / GA-IT).
  6. Klausul sadar tanpa paksaan dari pihak manapun.

---

## 3. Tech Stack & Commands

- **Backend:** Node.js (v20+), Express.js, PostgreSQL 16 (alpine).
- **Frontend:** Vanilla HTML5, Tailwind CSS, FontAwesome 6, QRCode.js.
- **Commands:**
  - Syntax Check: `npm run check`
  - Integration Test: `npm test`
  - Performance Benchmark: `npm run perf:check`
  - Local Dev Server: `npm run dev`

---

## 4. Technical Architecture & Database Design

### 4.1 Schema Definitions (`init.sql`)

```sql
-- 1. Master Lokasi
CREATE TABLE IF NOT EXISTS locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    building_floor VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Master PIC / Karyawan
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

-- 3. Relasi Aset ke Master Lokasi & Master PIC
ALTER TABLE assets 
    ADD COLUMN IF NOT EXISTS location_id INT REFERENCES locations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_to_employee_id INT REFERENCES employees(id) ON DELETE SET NULL;

-- 4. Relasi Riwayat Mutasi ke Master PIC & Pejabat Mengetahui
ALTER TABLE asset_user_history
    ADD COLUMN IF NOT EXISTS to_employee_id INT REFERENCES employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS known_by_1 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS known_by_2 VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bast_template VARCHAR(30) DEFAULT 'standard';

-- Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_assets_location_id ON assets(location_id);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_emp ON assets(assigned_to_employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
```

### 4.2 Seed Data
- **Lokasi Default:**
  1. Head Office - Lantai 1 (Lobby & Operasional)
  2. Head Office - Lantai 2 (Ruang Rapat Bromo)
  3. Head Office - Lantai 3 (Ruang IT & Server)
  4. Gudang & Workshop Logistik (Basement)
- **PIC Default:**
  1. Eva Cecil (NIK: EMP-001, Bagian: Support Indent, Telp: 081703803761)
  2. Budi Santoso (NIK: EMP-002, Bagian: Financial / Tagihan, Telp: 081234567890)
  3. Siti Sarah (NIK: EMP-003, Bagian: Purchasing, Telp: 081398765432)
  4. Denny Kurniawan (NIK: EMP-004, Bagian: Delivery Order, Telp: 085711223344)

---

## 5. API Contracts

### 5.1 Master Lokasi API (`src/routes/locations.js`)
- `GET /api/locations` -> `200 OK` (Array daftar lokasi, in-memory TTL caching)
- `POST /api/locations` -> `201 Created` `{ name, building_floor, description }`
- `PUT /api/locations/:id` -> `200 OK`
- `DELETE /api/locations/:id` -> `200 OK`

### 5.2 Master PIC / Karyawan API (`src/routes/employees.js`)
- `GET /api/employees` -> `200 OK` (Array daftar karyawan aktif, in-memory TTL caching)
- `POST /api/employees` -> `201 Created` `{ nik, name, department, position, phone_number }`
- `PUT /api/employees/:id` -> `200 OK`
- `DELETE /api/employees/:id` -> `200 OK`

### 5.3 Mutasi Serah Terima (`POST /api/assets/:id/handover`)
- **Payload:**
  ```json
  {
    "to_employee_id": 1,
    "action_type": "checkout",
    "condition": "Baru, include Charger",
    "notes": "Penyerahan fasilitas inventaris",
    "known_by_1": "Supervisor Bagian Indent",
    "known_by_2": "Manager GA & IT",
    "bast_template": "facility_handphone"
  }
  ```

---

## 6. Layout Dokumen BAST Legal (Gadget & Non-Gadget)

1. **Header / Kop:**
   - `TGC OF [COMPANY NAME]` (Double border bottom)
2. **Judul BAST:**
   - Untuk Gadget/HP: `FASILITAS HANDPHONE DARI PERUSAHAAN`
   - Untuk Non-Gadget: `BERITA ACARA SERAH TERIMA ASET KANTOR`
3. **Detail Spesifikasi Unit:**
   - Nama & Tipe Barang, Kode Aset, Serial Number, Lokasi.
   - Khusus HP/Gadget: Nomor HP/SIM, Provider & Paket (e.g. *Biz Starter*), Harga Unit.
4. **4 Klausul Aturan Tanggung Jawab Mutlak (Hadir di Seluruh Dokumen BAST):**
   1. *Inventaris harus ditanggungjawabkan oleh nama yang tertera di form ini.*
   2. *Dilarang membawa pulang inventaris, kecuali sudah diijinkan oleh Pimpinan / Manager / Supervisor masing-masing bagian.*
   3. *Pemegang inventaris bertanggung jawab terhadap kondisi barang, jika ada kerusakan maka akan dibebankan biaya perbaikan kepada pemegang inventaris sebesar 50%.*
   4. *Jika barang inventaris hilang maka penggantian unit inventaris ditanggung oleh pemegang 100%.*
5. **Data Penerima & Kondisi Awal:**
   - Nama Pemegang, Bagian/Departemen, Tanggal Penyerahan, Kondisi Fisik saat Diberikan.
6. **3 Kolom Tanda Tangan:**
   - Kolom 1 (Kiri): **SAYA YANG BERTANDA TANGAN DI BAWAH INI** (Penerima: Nama, Bagian, TTD)
   - Kolom 2 (Kanan Atas): **DIKETAHUI OLEH 1** (Atasan / Supervisor Bagian)
   - Kolom 3 (Kanan Bawah): **DIKETAHUI OLEH 2** (Pimpinan / GA-IT Management)
7. **Klausul Pernyataan:**
   - `TELAH MEMBACA DAN MEMAHAMI FASILITAS PERUSAHAAN YANG DIBERIKAN TANGGUNG JAWAB KEPADA SAYA, DENGAN KONDISI SADAR TANPA ADA PAKSAAN DARI PIHAK MANAPUN.`
8. **Kaki Dokumen:**
   - `Prepared by [User Actor] [Tanggal/Tahun]`

---

## 7. Success Criteria & Verification

- [ ] Tabel database `locations` dan `employees` terbuat dengan relasi dan indeks PostgreSQL yang tepat.
- [ ] Endpoint `/api/locations` dan `/api/employees` berfungsi penuh (CRUD) dan terdaftar di server Express.
- [ ] Tab *Pengaturan & Master* memiliki UI card untuk mengelola Master Lokasi dan Master PIC/Karyawan.
- [ ] Dropdown Lokasi dan PIC otomatis tampil di Form Tambah Aset, Modal Mutasi, dan Toolbar Filter.
- [ ] Cetak BAST untuk seluruh aset memuat 4 klausul aturan tanggung jawab resmi dan 3 kolom tanda tangan.
- [ ] Suite pengujian `npm test` dan `npm run check` lulus 100% tanpa regresi.
- [ ] Aksesibilitas WCAG 2.2 AA tetap 0 pelanggaran.

---

## 8. Boundaries

- **Always:** Gunakan parameterized query SQL, validasi input di sisi server, sertakan label aksesibel pada form baru.
- **Ask First:** Mengubah data tabel `users` atau menghapus lokasi/karyawan yang sedang memiliki aset tertaut.
- **Never:** Menyimpan kredensial atau rahasia di file git, merusak layout cetak BAST saat menggunakan print CSS.
