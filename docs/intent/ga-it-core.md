# Confirmed Statement of Intent: GA & IT Operations Management

**Status:** Confirmed  
**Date:** 2026-11-22  
**Target User:** PIC General Affair & IT Support (Single Operator / Internal Workbench)

---

## 1. Outcome & Objective
Membangun aplikasi manajemen operasional GA & IT yang cepat dan lincah (alternatif praktis untuk Snipe-IT), menggabungkan manajemen aset fisik, aksesoris yang terhubung ke aset utama, stok barang habis pakai (consumables), serta logbook tugas kerja harian.

---

## 2. Core Modules (Fase 1)

### A. Aset Utama (Hardware & Fasilitas)
- **Asset Tagging**: Penomoran tag aset unik (contoh: `IT-LPT-001`, `IT-PHN-001`, `GA-AC-001`) yang siap dicetak untuk stiker fisik.
- **Built-in Specifications**: Form input spesifikasi langsung adaptif tanpa perlu konfigurasi *custom fields* manual:
  - *Komputer/Laptop*: Processor/CPU, RAM, Storage (SSD/HDD), OS, Serial Number.
  - *Smartphone/Tablet*: Brand, Model, RAM/Storage, Nomor IMEI, OS.
  - *Fasilitas/AC*: Merk, Kapasitas PK, Lokasi Ruangan.
  - *Kendaraan Operasional*: No. Polisi, Merk/Tipe, Tahun.
- **Status & Assignment**: Status operasional (*Available*, *Assigned*, *Maintenance*, *Disposed*) dan PIC pemegang aset saat ini.
- **Riwayat Servis / Perawatan**: Catatan log servis berkala (cuci AC, ganti sparepart laptop, ganti oli kendaraan).

### B. Aksesoris & Peripherals (Linked to Assets)
- Manajemen aksesoris pendukung: Mouse, Keyboard, Adaptor/Charger, Headset, Docking Station.
- **Asset Linking**: Aksesoris dapat ditautkan (*linked*) langsung ke Aset Utama (contoh: Mouse Logitech & Keyboard wireless dipasangkan ke Laptop `IT-LPT-001` milik Budi) atau langsung ke user.

### C. Consumables (Barang Habis Pakai)
- Manajemen stok ATK dan perlengkapan kantor: Kertas A4, Tinta/Toner Printer, Baterai, Kabel LAN, dll.
- Pelacakan kuantitas stok masuk, sisa stok saat ini, batas minimum stok, dan riwayat pengeluaran barang ke karyawan.

### D. Logbook Pekerjaan & Tiket Harian
- Antarmuka pencatatan cepat keluhan atau permintaan ad-hoc dari WhatsApp maupun lisan.
- Terhubung dengan data aset atau karyawan peminta bila relevan.
- Rekapitulasi progres kerja (Open, In Progress, Resolved) sebagai bahan laporan bulanan ke atasan.

---

## 3. Constraints & Design Principles
- **No Snipe-IT Bureaucracy**: Input aset tidak memerlukan hierarki master data bertingkat (tidak perlu buat Category -> Manufacturer -> Model -> Fieldset secara terpisah).
- **Sub-1-Minute Entry**: Penambahan aset baru beserta spesifikasinya dapat diselesaikan dalam waktu kurang dari 1 menit.
- **Zero Bloat (Ponytail)**: Solusi paling ringkas yang langsung menyelesaikan masalah tanpa kode atau fitur berlebih.

---

## 4. Scope Boundaries
- **Out of Scope (Fase 1)**:
  - Perhitungan depresiasi nilai buku aset untuk akuntansi/finance.
  - Portal self-service login untuk seluruh karyawan kantor.
  - Modul purchase order (PO) dan approval finansial bertingkat.
- **Future Backlog (Fase 2)**:
  - *Floor Plan Mapping*: Denah visual penempatan PC staf dan titik lokasi kamera CCTV kantor.
