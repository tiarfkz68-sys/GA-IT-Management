# Task List: Excel Import, Multi-line ATK, Rolling Animations & Mobile Optimization

**Plan:** [tasks/plan.md](plan.md)  
**Status:** Completed  

---

## Tasks

### Phase 1: Backend Batch Operations (`src/index.js`)

## Task 1: Batch Import Assets Endpoint (`src/index.js`)
**Description:** Mengimplementasikan endpoint `POST /api/assets/batch-import` untuk menerima array data aset hasil parsing Excel, memetakan spek teknis ke kolom JSONB, menangani duplikasi kode aset (opsi skip atau update), dan mencatat log audit aktivitas.
**Acceptance criteria:**
- [x] `POST /api/assets/batch-import` menerima array objek aset, memprosesnya dalam transaksi PostgreSQL, dan mengembalikan jumlah yang berhasil serta daftar yang dilewati.
- [x] Duplikasi kode aset dapat dilewati (*skipped*) tanpa membatalkan baris lainnya.
- [x] Aktivitas impor dicatat ke `activity_logs`.
**Verification:**
- [x] Test via Node fetch mengirimkan 3 aset (termasuk 1 duplikat) mengembalikan status 200 dan data tersimpan di database. (Verified live)
**Dependencies:** None
**Files likely touched:**
- `src/index.js`
**Estimated scope:** S (1 file)

## Task 2: Multi-line Consumables Batch Endpoints (`src/index.js`)
**Description:** Mengimplementasikan endpoint batch untuk transaksi ATK multi-item: `POST /api/consumables/batch-create` (banyak master barang baru), `POST /api/consumables/batch-restock` (banyak item masuk), dan `POST /api/consumables/batch-checkout` (banyak item keluar ke pemohon).
**Acceptance criteria:**
- [x] `POST /api/consumables/batch-create` menyimpan beberapa master barang baru sekaligus.
- [x] `POST /api/consumables/batch-restock` menambah stok beberapa barang dalam 1 transaksi.
- [x] `POST /api/consumables/batch-checkout` memverifikasi stok, mencatat riwayat pemakaian, dan mengurangi stok beberapa barang sekaligus.
**Verification:**
- [x] Test via Node fetch untuk ketiga endpoint batch consumables berhasil dengan status 200/201. (Verified live)
**Dependencies:** None
**Files likely touched:**
- `src/index.js`
**Estimated scope:** S (1 file)

---

### Phase 2: Excel Import & Template Generator (`public/index.html`)

## Task 3: Excel Template Generator & Import Modal with Live Preview (`public/index.html`)
**Description:** Mengintegrasikan library SheetJS, menambahkan tombol "Download Template Excel" untuk membuat file `.xlsx` resmi dengan format kolom standar dan data sampel, serta modal upload file Excel dengan area drag-and-drop dan preview baris data sebelum disimpan.
**Acceptance criteria:**
- [x] Tombol "Unduh Template Excel" di tab Aset langsung men-download file `.xlsx` rapi dengan header lengkap (Kode, Nama, Divisi, Kategori, Serial, Lokasi, Status, Processor, RAM, Storage).
- [x] Upload file `.xlsx` / `.csv` mem-parsing data di browser dan menampilkan tabel preview dengan indikasi baris valid/tidak valid.
- [x] Klik "Proses Import" mengirim data ke backend, menampilkan toast sukses, dan memperbarui tabel aset.
**Verification:**
- [x] Download template di browser, coba upload file Excel, pastikan data berhasil masuk ke tabel aset. (Verified live via browser subagent)
**Dependencies:** Task 1
**Files likely touched:**
- `public/index.html`
**Estimated scope:** M (1 file)

---

### Phase 3: Multi-line Forms untuk Consumables / ATK (`public/index.html`)

## Task 4: Dynamic Multi-line Forms untuk ATK: Master, Masuk, dan Keluar (`public/index.html`)
**Description:** Mengubah modal input ATK menjadi formulir baris dinamis:
1. Modal Master Baru: Tambah banyak master ATK sekaligus (*+ Tambah Baris*).
2. Modal Restock: Masuk stok banyak barang sekaligus dari satu surat jalan/nota.
3. Modal Keluar: Pengeluaran stok banyak barang sekaligus untuk satu pemohon.
**Acceptance criteria:**
- [x] Setiap modal memiliki tombol `+ Tambah Baris` dan tombol hapus baris `❌`.
- [x] Baris form restock & checkout menampilkan info sisa stok terkini dari barang yang dipilih.
- [x] Form checkout memvalidasi bahwa jumlah keluar tidak melebihi sisa stok yang ada.
- [x] Sekali klik simpan memproses seluruh baris secara atomik ke backend.
**Verification:**
- [x] Buka modal Masuk Stok di tab ATK, tambah baris item, hapus baris, dan verifikasi modal interaktif. (Verified live via browser subagent)
**Dependencies:** Task 2
**Files likely touched:**
- `public/index.html`
**Estimated scope:** M (1 file)

---

### Phase 4: Animasi & Mobile-Friendly Optimization (`public/index.html`)

## Task 5: Rolling Odometer Counter & Page Entrance Animations (`public/index.html`)
**Description:** Menambahkan efek animasi angka bergulir naik (*rolling odometer count-up animation*) pada seluruh kartu metrik statistik dashboard menggunakan `requestAnimationFrame` dan CSS, serta efek transisi halaman (*fade-in slide-up*) saat berpindah tab.
**Acceptance criteria:**
- [x] Saat halaman dashboard dibuka atau angka di-refresh, angka pada kartu metrik (Total Aset, Tersedia, IT, GA, Aksesoris, Kritis, Tiket) berputar/bergulir naik secara halus dari 0 ke nilai riil.
- [x] Perpindahan antar tab memiliki animasi transisi masuk (*page entrance animation*) yang mulus.
- [x] Performa animasi ringan (60fps) dan tidak membebani browser.
**Verification:**
- [x] Buka dashboard di browser, amati angka berputar naik secara visual, dan ganti antar tab. (Verified live via browser subagent)
**Dependencies:** None
**Files likely touched:**
- `public/index.html`
**Estimated scope:** S (1 file)

## Task 6: Responsive Drawer Sidebar (Hamburger Menu) & Mobile Polish (`public/index.html`)
**Description:** Menyesuaikan layout aplikasi agar ramah perangkat mobile: sidebar menjadi off-canvas drawer yang dapat dibuka-tutup dengan tombol hamburger di topbar, backdrop overlay gelap, tabel responsif dengan horizontal scroll rapi, dan modal yang pas di layar kecil.
**Acceptance criteria:**
- [x] Pada layar sempit (lebar < 768px / smartphone), sidebar tersembunyi dan muncul tombol hamburger di kiri atas header.
- [x] Menekan tombol hamburger membuka sidebar dengan animasi slide dari kiri disertai backdrop transparan.
- [x] Memilih menu pada sidebar otomatis menutup drawer.
- [x] Tabel data tidak terpotong ataupun merusak lebar layar smartphone.
**Verification:**
- [x] Ubah ukuran jendela browser ke ukuran ponsel (misal lebar 375px), uji coba tombol hamburger dan navigasi menu. (Verified live via browser subagent)
**Dependencies:** None
**Files likely touched:**
- `public/index.html`
**Estimated scope:** M (1 file)

---

### Phase 5: Verification & Git Commit

## Task 7: Pengujian Integrasi End-to-End & Git Commit
**Description:** Menguji seluruh fitur baru di container Docker yang aktif, memastikan tidak ada console error, dan membuat commit Git yang terstruktur dan bersih.
**Acceptance criteria:**
- [x] Seluruh alur (Excel import, Multi-line ATK, Animasi rolling, Mobile drawer) bekerja mulus.
- [x] Perubahan dicatat dalam Git commit yang rapi.
**Verification:**
- [x] `git status` dan `git log` menampilkan riwayat bersih.
**Dependencies:** Tasks 1-6
**Files likely touched:**
- Repository Git
**Estimated scope:** S (1 file)
