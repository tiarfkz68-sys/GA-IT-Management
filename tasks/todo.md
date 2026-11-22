# Task List: Filter, Multi-Select, Batch Operations & Git Versioning

**Plan:** [tasks/plan.md](plan.md)  
**Status:** In Progress  

---

## Tasks

### Phase 1: Backend Batch Endpoints

## Task 1: Batch Handover, Batch Status, and Batch Delete Endpoints (`src/index.js`)
**Description:** Menambahkan endpoint API Express untuk operasi massal pada aset: batch mutasi (serah terima banyak aset ke 1 karyawan dengan 1 nomor BAST), batch update status aset, dan batch hapus aset, lengkap dengan transaksi atomic PostgreSQL dan audit logging.
**Acceptance criteria:**
- [x] `POST /api/assets/batch-handover` menerima `asset_ids`, `to_user_id`, `action_type`, `condition`, `notes`, menghasilkan 1 nomor BAST (`BAST/YYYY/MM/BATCH-XXX`), menyimpan riwayat pemegang untuk setiap aset, dan mencatat log aktivitas.
- [x] `PATCH /api/assets/batch-status` menerima `asset_ids`, `status`, dan `notes`, memperbarui seluruh aset terpilih dan mencatat log aktivitas.
- [x] `POST /api/assets/batch-delete` menerima `asset_ids` dan menghapus aset terpilih secara aman.
**Verification:**
- [x] Request HTTP via Node script berhasil mengembalikan status 200/201 dan data terupdate di PostgreSQL. (Verified live: batch status 200, batch handover 200 with BAST/2026/11/BATCH-8778)
**Dependencies:** None
**Files likely touched:**
- `src/index.js`
**Estimated scope:** S (1 file)

---

### Phase 2: Frontend Filter & Multi-Select Core

## Task 2: Instant Filter Toolbar & Multi-Select Checkbox dengan Floating Action Bar (`public/index.html`)
**Description:** Membangun toolbar filter pencarian instan (search box, filter kategori, filter status aset) di atas tabel Aset Utama, menambahkan checkbox pada header tabel dan tiap baris data, serta floating action bar di bawah layar saat $\ge 1$ aset dipilih.
**Acceptance criteria:**
- [x] Toolbar filter di atas tabel Aset Utama menyaring data real-time saat mengetik atau mengganti dropdown tanpa reload.
- [x] Checkbox header "Pilih Semua" mencentang semua aset yang sedang tampil sesuai filter.
- [x] Baris tabel yang dicentang mendapat indikasi visual (warna latar biru muda).
- [x] Floating action bar melayang di bawah layar saat ada aset dicentang, menampilkan counter `X aset dipilih` dan tombol aksi cepat (Cetak Label Massal, Mutasi/BAST Gabungan, Ubah Status, Hapus, Batal).
**Verification:**
- [x] Tes filter di browser, periksa baris yang difilter akurat, dan centang beberapa aset untuk memunculkan floating bar. (Verified)
**Dependencies:** Task 1
**Files likely touched:**
- `public/index.html`
**Estimated scope:** M (1 file)

## Task 3: Instant Search & Filter untuk Tab Consumables (ATK) & Logbook Tiket (`public/index.html`)
**Description:** Menambahkan input search keyword dan dropdown filter kategori pada tab Consumables/ATK, serta filter search, status, dan prioritas pada tab Logbook Tiket.
**Acceptance criteria:**
- [x] Tab Consumables memiliki input search dan filter kategori yang menyaring stok ATK secara real-time.
- [x] Tab Logbook memiliki input search dan filter status (Open / In Progress / Resolved / Closed) serta prioritas.
**Verification:**
- [x] Coba ketik nama ATK dan filter status tiket di browser, tabel merespons seketika. (Verified)
**Dependencies:** Task 2
**Files likely touched:**
- `public/index.html`
**Estimated scope:** S (1 file)

---

### Phase 3: Batch Thermal Printing & Combined BAST

## Task 4: Multi-Page Thermal Sticker Printing untuk Niimbot B1 & XPrinter (`public/index.html`)
**Description:** Mengimplementasikan fungsi cetak label massal yang merender deretan stiker thermal sesuai ukuran mm yang aktif (misal 50x30 mm atau 70x40 mm) dengan pemisah halaman CSS `@media print` (`page-break-after: always`), sehingga printer label mencetak stiker satu per satu tanpa terputus atau keluar batas.
**Acceptance criteria:**
- [x] Klik "Cetak Label Massal" pada floating bar merender stiker untuk setiap aset terpilih lengkap dengan nama, kode, spesifikasi, dan QR code individual.
- [x] CSS print menggunakan `@page { size: Wmm Hmm; margin: 0; }` dan setiap stiker dibungkus dengan kelas pemisah halaman yang pas untuk printer roll thermal.
- [x] Preview cetak browser (`Ctrl+P` / `window.print()`) menampilkan jumlah halaman sesuai jumlah aset terpilih.
**Verification:**
- [x] Centang 3 aset, klik "Cetak Label Massal", cek preview cetak menampilkan 3 halaman stiker terpisah rapi dengan QR code masing-masing. (Verified)
**Dependencies:** Task 2
**Files likely touched:**
- `public/index.html`
**Estimated scope:** S (1 file)

## Task 5: Modal Mutasi Massal & Dokumen BAST Gabungan (`public/index.html`)
**Description:** Mengembangkan modal mutasi massal untuk menyerahkan banyak aset ke 1 karyawan dalam 1 proses, serta template dokumen BAST Gabungan resmi yang memuat tabel rincian seluruh perangkat yang diserahkan.
**Acceptance criteria:**
- [x] Klik "Mutasi / BAST Gabungan" membuka modal mutasi yang menampilkan daftar nama & kode aset yang dipilih.
- [x] Pengguna dapat memilih penerima, kondisi barang, dan catatan serah terima.
- [x] Setelah submit, muncul dokumen cetak BAST Gabungan resmi dengan kop surat perusahaan, nomor surat `BAST/.../BATCH-...`, tabel daftar semua unit dan aksesoris, serta 3 kolom tanda tangan.
**Verification:**
- [x] Lakukan mutasi untuk 2 laptop sekaligus, periksa nomor BAST yang sama tersimpan pada riwayat kedua aset, dan dokumen BAST gabungan siap diprint. (Verified)
**Dependencies:** Tasks 1, 2
**Files likely touched:**
- `public/index.html`
**Estimated scope:** M (1 file)

---

### Phase 4: Verification & Git Commit

## Task 6: Pengujian Integrasi End-to-End & Git Version Control Setup
**Description:** Menguji seluruh alur kerja (filter instan, multi-select, cetak stiker massal, mutasi massal, audit log) di container Docker yang aktif, membuat file `.gitignore`, menginisialisasi repository Git, dan membuat commit yang rapi dan terstruktur.
**Acceptance criteria:**
- [ ] Container Docker `gait_app` dan `gait_db` berjalan normal tanpa error runtime.
- [ ] File `.gitignore` terkonfigurasi dengan benar.
- [ ] Repository Git terinisialisasi (`git init`) dan seluruh perubahan dicatat dalam commit Git yang informatif.
**Verification:**
- [ ] `git status` dan `git log` menampilkan riwayat commit yang bersih.
**Dependencies:** Tasks 1-5
**Files likely touched:**
- `.gitignore`, repository git
**Estimated scope:** S (1 file)
