# Implementation Plan: Excel Import, Multi-line ATK, Rolling Animations & Mobile Optimization

**Source Spec/Intent:** [docs/intent/excel-import-multiline-atk-animation.md](../docs/intent/excel-import-multiline-atk-animation.md)  
**Target:** GA & IT Operations Portal (Workbench)

---

## 1. Overview
Mengembangkan 4 rangkaian fitur baru:
1. **Import Excel Aset Utama:** Download template `.xlsx` resmi + modal upload, preview & batch insert aset.
2. **Multi-line Form Consumables (ATK):** Input multi-baris dinamis untuk Master Barang, Penerimaan (Restock), dan Pengeluaran (Checkout) dalam satu transaksi.
3. **Animasi Angka Bergulir & Page Transitions:** Animasi *rolling counter count-up* (efek odometer) pada metrik statistik dan transisi halaman yang elegan.
4. **Mobile-Friendly Layout:** Sidebar drawer dengan tombol hamburger untuk HP, tabel responsif touch-friendly, dan modal adaptif.

---

## 2. Architecture Decisions

### 2.1 Backend Batch Endpoints (`src/index.js`)
- `POST /api/assets/batch-import`: Menerima array aset hasil parsing Excel, melakukan validasi, menangani duplikasi (skip/overwrite), dan menyimpan data beserta spek JSONB dalam satu transaksi database.
- `POST /api/consumables/batch-create`: Menerima array master ATK baru dari form multi-line dan melakukan batch insert.
- `POST /api/consumables/batch-restock`: Menerima array item restock dan meng-increment stok secara atomik.
- `POST /api/consumables/batch-checkout`: Menerima pemohon, catatan, dan array item yang keluar, memeriksa kecukupan stok, mencatat log checkout, dan men-decrement stok secara atomik.

### 2.2 Client-Side Excel Processing (SheetJS)
- Menyematkan library SheetJS (`xlsx.full.min.js`) via CDN.
- Fungsi `downloadAssetExcelTemplate()`: Membuat workbook `.xlsx` dengan format kolom baku dan 2 baris contoh data.
- Modal `modal-import-assets`: File picker / drag-and-drop, parsing file `.xlsx`/`.csv` di browser, menampilkan preview tabel baris data yang terdeteksi sebelum dikirim ke backend.

### 2.3 Multi-line Form Architecture (Dynamic Row Grid)
- Menggunakan pola DOM dinamis: container tabel form memiliki tombol `+ Tambah Baris` dan tombol hapus baris `❌`.
- Helper JavaScript mengumpulkan seluruh nilai baris menjadi array JSON untuk dikirim ke endpoint batch backend.

### 2.4 Rolling Counter Animation & CSS Transitions
- Utility `animateRollingCounter(elementId, targetValue, duration)` menggunakan `requestAnimationFrame` dengan easing *easeOutExpo* dan efek visual CSS scroll/odometer.
- CSS keyframe `@keyframes pageEntrance` diaplikasikan pada setiap pergantian tab agar transisi halus (*subtle slide-up + fade-in*).

### 2.5 Mobile Optimization
- Breakpoint Tailwind `md:`:
  - Di layar desktop (`>=md`): sidebar tetap fixed di sebelah kiri.
  - Di layar mobile (`<md`): sidebar menjadi off-canvas drawer (`-translate-x-full fixed z-50`) dengan tombol toggle hamburger di topbar dan backdrop gelap.
  - Modals menyesuaikan padding dan tinggi layar (`max-h-[90vh] overflow-y-auto`).

---

## 3. Task List & Phases

### Phase 1: Backend Batch Operations (`src/index.js`)
- [ ] Task 1: Endpoint Batch Import Aset (`POST /api/assets/batch-import`)
- [ ] Task 2: Endpoint Multi-line Consumables (`POST /api/consumables/batch-create`, `batch-restock`, `batch-checkout`)

### Phase 2: Excel Import & Template Generator (`public/index.html`)
- [ ] Task 3: Generator Template Excel `.xlsx` & Modal Upload dengan Preview Data

### Phase 3: Multi-line Forms untuk Consumables / ATK (`public/index.html`)
- [ ] Task 4: UI Form Multi-line Master ATK, Penerimaan (Restock), dan Pengeluaran (Checkout)

### Phase 4: Animasi & Mobile-Friendly Optimization (`public/index.html`)
- [ ] Task 5: Animasi Angka Bergulir (*Rolling Odometer Counter*) & Transisi Halaman (*Page Entrance*)
- [ ] Task 6: Responsive Drawer Sidebar (Hamburger Toggle) & Mobile Layout Polish

### Phase 5: Verification & Git Commit
- [ ] Task 7: Pengujian End-to-End di Docker & Git Atomic Commit
