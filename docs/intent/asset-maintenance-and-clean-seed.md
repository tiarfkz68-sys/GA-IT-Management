# Intent: Fitur Maintenance Aset & Clean Seed Data

**Status:** Disetujui (`yes`) pada 2026-11-26  
**Jalur Eksekusi:** 1 (Save Intent) $\rightarrow$ 2 (Spec-Driven Development) $\rightarrow$ 3 (Incremental Implementation)

## Statement of Intent
- **Outcome:**
  1. Menu terpusat **Maintenance Aset** di sidebar untuk penjadwalan otomatis perawatan berkala (**Cuci AC, Cleaning Printer, Cleaning PC, Cleaning Laptop**, dll.), pemantauan status jatuh tempo, eksekusi 1-klik *"Tandai Selesai"*, dan laporan/export riwayat serta biaya maintenance.
  2. **Clean Slate Inventory:** Mengosongkan *seed data* demo pada tabel Aset, Aksesoris, Consumables/ATK, Riwayat Servis, Mutasi, Logbook Tiket, dan Log Aktivitas di `init.sql` (serta menyediakan skrip bersih untuk database produksi yang sudah berjalan), dengan tetap mempertahankan master Kategori, Lokasi, Settings, dan User Admin.
- **User:** Tim **GA & IT** (serta Admin/HRD backup) untuk perawatan internal maupun vendor luar.
- **Why now:** Agar jadwal cleaning rutin aset terpantau terpusat dan sistem produksi di VPS dimulai dengan data inventaris & ATK yang benar-benar bersih (*clean slate*).
- **Success:**
  - Jadwal berulang otomatis bertambah tanggal berikutnya setelah cleaning selesai ditandai.
  - Tersedia filter jatuh tempo (*Terlambat*, *Bulan Ini / Segera*, *Terjadwal*), pelacakan pelaksana internal (Rp 0) maupun vendor (berbiaya), serta export Excel/CSV/Cetak.
  - Database bersih dari dummy aset/consumables, dan seluruh *integration test* tetap berjalan mandiri tanpa bergantung pada data dummy.
- **Constraint:**
  - Cleaning rutin **tidak** mengubah status aktif aset menjadi *maintenance/rusak*, kecuali dicentang eksplisit sebagai *Perbaikan / Rusak*.
  - Tetap mempertahankan tema Linen 60% / Navy 30% / Amber 10% dan kepatuhan aksesibilitas WCAG 2.2 AA.
- **Out of scope:**
  - Manajemen PO/faktur vendor eksternal.
  - Notifikasi WhatsApp/Email otomatis di background.
  - Penghapusan master Kategori, Lokasi, PIC, Settings, atau User Admin.
