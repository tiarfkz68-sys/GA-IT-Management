# Capability Map: GA & IT Operations Management (V1)

**Status:** Proposed  
**Based on:** docs/intent/ga-it-core.md  

---

## Module Breakdown

| Module ID | Responsibility | Depends on |
|---|---|---|
| `assets-core` | Inventaris Aset Utama (IT & GA): tag penomoran unik, form spesifikasi adaptif (PC/Laptop, HP, AC, Kendaraan), status pemegang, & riwayat maintenance/servis. | — |
| `accessories` | Aksesoris & Peripherals (Mouse, Keyboard, Adaptor, dll) dengan kemampuan *linking* langsung ke `assets-core` atau ke user. | `assets-core` |
| `consumables` | Barang habis pakai (ATK, Toner, Baterai): manajemen master barang, kuantitas stok, minimum alert, dan log pengeluaran ke karyawan. | — |
| `logbook` | Pencatatan cepat keluhan & pekerjaan harian ad-hoc (WA/lisan), relasi opsional ke aset/karyawan, dan rekap summary untuk atasan. | `assets-core` |

---

## Build Order

1. **`assets-core`**: Fondasi database untuk master aset, struktur spesifikasi JSONB, dan tag generator.
2. **`accessories`**: Relasi FK ke `assets-core` dan user untuk bundle perlengkapan (misal: mouse di unit laptop X).
3. **`consumables`**: Modul stok terpisah dengan pengurangan kuantitas saat checkout.
4. **`logbook`**: Task tracker terintegrasi yang bisa mereferensikan aset atau karyawan terkait.
