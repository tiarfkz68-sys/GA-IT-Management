# Implementation Plan: Filter, Multi-Select, Batch Operations & Git Versioning

**Source Intent:** Confirmed Statement of Intent (2026-11-22)  
**Target:** GA & IT Operations Portal (Workbench)

---

## 1. Overview
Menambahkan toolbar filter pencarian instan (real-time tanpa reload), fitur pemilihan ganda (*multi-select* baris aset) dengan floating bar aksi massal (*Batch Actions*), pencetakan stiker thermal massal berurutan untuk Niimbot B1 & XPrinter, dokumen BAST Gabungan untuk serah terima banyak perangkat ke 1 karyawan, serta inisialisasi Git version control dengan commit yang rapi.

---

## 2. Architecture & Design Decisions

### 2.1 Backend Batch API (`src/index.js`)
- `POST /api/assets/batch-handover`: Menerima array `asset_ids`, `action_type`, `to_user_id`, `condition`, `notes`. Menggunakan satu transaksi database (`BEGIN ... COMMIT`) untuk menjaga integritas data:
  - Generate 1 nomor BAST resmi gabungan: `BAST/YYYY/MM/BATCH-XXX`.
  - Insert record serah terima ke `asset_user_history` untuk masing-masing aset.
  - Update `status` dan `assigned_to_user_id` pada tabel `assets`.
  - Catat log perubahan ke `activity_logs`.
- `PATCH /api/assets/batch-status`: Mengubah status beberapa aset secara serentak (`available`, `maintenance`, `broken`, dsb.) dan mencatat log.
- `POST /api/assets/batch-delete`: Menghapus beberapa aset yang dipilih sekaligus secara aman.

### 2.2 Client-Side Instant Filtering
- Menggunakan filtering di memori JavaScript (*reactive filter*):
  - Pencarian teks multi-field: mencakup `code`, `name`, `serial_number`, `assigned_to_name`, `location`.
  - Filter dropdown: Domain (`Semua`, `IT`, `GA`), Kategori spesifik, dan Status aset.
  - Performa instan tanpa latency HTTP / reload halaman.
  - Terapkan juga instant search & category filter pada tab **Consumables (ATK)** dan **Logbook Tiket**.

### 2.3 Multi-Select Checkboxes & Floating Action Bar
- Checkbox pada header tabel (`#select-all-assets`) yang otomatis mencentang semua baris aset yang sedang lolos filter.
- Checkbox per baris aset (`.asset-checkbox`). Baris yang dicentang mendapat highlight warna latar (*soft blue*).
- Bar aksi melayang (*Floating Action Bar*) muncul di bagian bawah layar saat jumlah aset terpilih $\ge 1$:
  - Menampilkan jumlah aset terpilih: e.g. `3 aset dipilih`.
  - Tombol **Cetak Label Massal** (ikon printer).
  - Tombol **Mutasi / BAST Gabungan** (ikon file-contract).
  - Tombol **Ubah Status Massal** (ikon tag/arrows-rotate).
  - Tombol **Hapus Massal** (ikon trash).
  - Tombol **Batal Pilihan** (ikon xmark).

### 2.4 Multi-Page Thermal Sticker Printing (Niimbot B1 & XPrinter)
- Menghasilkan kontainer DOM cetak dengan CSS:
  ```css
  @media print {
    @page { size: ${w}mm ${h}mm; margin: 0; }
    .thermal-label-page {
      width: ${w}mm;
      height: ${h}mm;
      page-break-after: always;
      break-after: page;
      box-sizing: border-box;
      overflow: hidden;
    }
  }
  ```
- Generate QR Code untuk setiap aset terpilih secara beruntun.
- Roll printer thermal akan mencetak stiker satu per satu tanpa terpotong atau offside.

### 2.5 Dokumen BAST Gabungan (Multi-Asset Handover)
- Modal penyerahan massal: Pilih karyawan penerima, kondisi barang, dan catatan serah terima.
- Setelah submit, langsung menampilkan dokumen formal Berita Acara Serah Terima (BAST) dengan kop surat perusahaan, nomor surat, dan tabel rincian seluruh perangkat yang diserahkan, serta 3 kolom tanda tangan.

### 2.6 Git Version Control
- Buat `.gitignore` profesional (node_modules, env, log, ds_store).
- Inisialisasi `git init`.
- Buat commit terstruktur:
  - Commit 1: Fondasi V2 (Skema DB 11 tabel, Auth, Pengaturan 4 Submenu, Label Designer).
  - Commit 2: Fitur Filter, Multi-select, Batch Thermal Print, dan BAST Gabungan.

---

## 3. Task List & Phases

### Phase 1: Backend Batch Endpoints
- [ ] Task 1: Endpoint Batch Handover, Batch Status, dan Batch Delete (`src/index.js`)

### Phase 2: Frontend Filter & Multi-Select Core
- [ ] Task 2: Toolbar Instant Filter & Multi-Select Checkbox dengan Floating Action Bar (`public/index.html`)
- [ ] Task 3: Instant Filter untuk Tab Consumables (ATK) & Logbook Tiket (`public/index.html`)

### Phase 3: Batch Thermal Printing & Combined BAST
- [ ] Task 4: Multi-Page Thermal Sticker Printing untuk Niimbot B1 & XPrinter (`public/index.html`)
- [ ] Task 5: Modal Mutasi Massal & Dokumen BAST Gabungan (`public/index.html`)

### Phase 4: Verification & Git Commit
- [ ] Task 6: Pengujian Integrasi End-to-End di Docker & Setup Git Repository dengan Clean Commits
