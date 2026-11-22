# Statement of Intent: Excel Import, Multi-line ATK, Rolling Animations & Mobile Optimization

**Date:** 2026-11-22  
**Status:** Confirmed  

---

## 1. Outcome
1. **Import Excel Aset Utama:** Fitur unduh template resmi `.xlsx` berformat rapi dan modal upload file Excel dengan validasi & preview baris sebelum disimpan ke database PostgreSQL.
2. **Multi-line Form Consumables (ATK):** Sistem input dinamis (*+ Tambah Baris / Hapus Baris*) untuk:
   - *Master Barang Baru* (daftar banyak ATK sekaligus).
   - *Penerimaan / Restock* (input banyak item dari 1 nota pembelian).
   - *Pengeluaran / Checkout* (input banyak item dalam 1 bon permintaan karyawan/divisi).
3. **Animasi Angka Bergulir & Transisi Halaman:** Efek angka berputar naik (*rolling odometer count-up animation*) pada metrik statistik di dashboard, serta transisi halaman (*fade-in slide-up*) yang halus dan modern.
4. **Mobile-Friendly Optimization:** Tombol hamburger untuk toggle sidebar di HP, tabel responsif dengan horizontal scroll rapi, dan modal adaptif untuk layar smartphone.

---

## 2. Target Users
- **GA / IT Administrator:** Memasukkan data aset secara massal dan mengelola transaksi ATK berbasis nota/bon belanja.
- **Operator Lapangan / HRD / Finance:** Mengakses sistem secara nyaman melalui smartphone saat inspeksi fisik aset atau audit stok gudang.

---

## 3. Why Now
Menghilangkan keharusan input satu-per-satu yang memakan waktu (baik saat migrasi ratusan aset kantor maupun saat belanja ATK multi-item), sekaligus menyempurnakan estetika visual aplikasi dan fleksibilitas akses mobile.

---

## 4. Success Criteria
- File template Excel `.xlsx` dapat diunduh langsung dengan format kolom standar (Kode, Nama, Kategori, Subkategori, Serial Number, Lokasi, Status, CPU, RAM, Storage, Spek Lain).
- Upload file Excel berhasil memproses batch data aset ke PostgreSQL dengan opsi lewati duplikasi kode.
- Form ATK (Barang Baru, Masuk, Keluar) dapat menampung banyak baris dan tersimpan secara atomik dalam satu transaksi database.
- Angka metrik di dashboard berputar naik secara visual (*rolling animation*) saat aplikasi dimuat atau tab berganti.
- UI di layar smartphone responsif: menu drawer terbuka mulus saat ikon hamburger ditekan, tabel tidak pecah/offside, dan tombol aksi mudah disentuh.

---

## 5. Constraints
- Menggunakan library SheetJS (`xlsx.full.min.js`) via CDN untuk parse dan generate Excel di browser secara client-side, didukung endpoint batch insert di backend.
- Animasi CSS GPU-accelerated (*CSS transforms & requestAnimationFrame counter*) agar tetap 60fps tanpa lag di HP spek standar.
- List-First responsive layout tetap terjaga di semua resolusi.

---

## 6. Out of Scope
- Import Excel untuk modul ATK (ATK menggunakan form multi-line).
