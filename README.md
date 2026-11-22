# GA & IT Operations Management (Kiri Ready)

Fullstack core untuk General Affairs & IT Management, dioptimalkan berjalan di atas **Kiri** (Docker-compatible engine).

## Struktur Modul
1. **IT Assets & Licenses**: Tracking laptop, monitor, license key, pemegang aset, dan spesifikasi.
2. **GA Facilities & Supplies**: Booking fasilitas (ruang meeting, kendaraan) dan stok barang kantor (ATK).
3. **Helpdesk & Approval Engine**: Alur tiket terintegrasi (open -> approve -> in progress -> closed).

## Menjalankan dengan Kiri

Buka terminal di direktori ini dan jalankan:

```powershell
# 1. Jalankan database PostgreSQL & Web App dalam container Kiri
kiri compose up -d --build

# 2. Cek status container yang berjalan
kiri ps

# 3. Buka browser di:
# http://localhost:3000
```

## Menghentikan Layanan
```powershell
kiri compose down
```
