# Statement of Intent: Master Lokasi, Master PIC / Karyawan, dan BAST Berbasis Klausul Legal

- **Date:** 2026-11-23
- **Author:** GA & IT Operations Management Team
- **Status:** Confirmed by User

---

## 1. Outcome
Menambahkan modul **Master Lokasi** dan **Master PIC / Karyawan** di tab *Pengaturan & Master*, serta memadukan format cetak **BAST Fasilitas Handphone & Aset Umum** sesuai dokumen foto fisik (memuat 4 butir aturan tanggung jawab inventaris, spesifikasi nomor HP & paket provider untuk gadget, klausul sadar tanpa paksaan, dan 3 kolom tanda tangan).

## 2. User
- Tim General Affairs (GA) & IT Administrator yang mengelola data master aset, penempatan, dan alur mutasi.
- Seluruh staf dan karyawan pemegang inventaris fasilitas operasional kantor.

## 3. Why Now
- Menggantikan input data penempatan lokasi dan nama pemegang aset yang sebelumnya berbasis teks bebas (*free-text*) agar terdata secara terpusat, konsisten, dan memiliki integritas relasional.
- Menerapkan klausul pertanggungjawaban legal resmi pada serah terima inventaris kantor (pencegahan pembawaan pulang tanpa izin, pembebanan 50% biaya kerusakan, dan 100% ganti rugi jika hilang) baik untuk perangkat gadget maupun non-gadget.

## 4. Success Criteria
1. **Database & API**: Tabel PostgreSQL dan REST API CRUD lengkap untuk `locations` (Master Lokasi) dan `employees` (Master PIC/Karyawan).
2. **UI Management**: Antarmuka manajemen data master lokasi dan PIC tersedia di tab *Pengaturan & Master* lengkap dengan formulir tambah, edit, dan hapus.
3. **Form Integration**: Dropdown dinamis lokasi dan PIC terintegrasi pada:
   - Formulir registrasi aset baru (`#form-add-asset`)
   - Formulir modal mutasi serah terima (`#form-handover` & `#form-batch-handover`)
   - Filter toolbar daftar aset
4. **Photo-Matched BAST (Berlaku untuk Gadget & Non-Gadget)**:
   - Memadukan 4 klausul aturan inventaris resmi perusahaan dari foto fisik:
     1. Inventaris harus ditanggungjawabkan oleh nama yang tertera di form.
     2. Dilarang membawa pulang inventaris kecuali telah diizinkan oleh Pimpinan/Manager/Supervisor bagian.
     3. Pemegang inventaris bertanggung jawab terhadap kondisi unit; jika ada kerusakan maka dibebankan biaya perbaikan kepada pemegang sebesar 50%.
     4. Jika inventaris hilang maka penggantian unit ditanggung oleh pemegang 100%.
   - Menyertakan 3 kolom tanda tangan legal: Penerima, Diketahui Oleh 1 (Atasan/Supervisor), Diketahui Oleh 2 (Pimpinan/GA-IT).
   - Menyertakan kotak klausul pernyataan sadar tanpa paksaan dari pihak manapun.
   - Khusus aset kategori Smartphone/Handphone/Tablet: Dilengkapi detail spesifikasi khusus (Nomor SIM/HP, Paket Provider data misal *Biz Starter*, Harga Unit).

## 5. Constraint
- Mempertahankan tema warna Linen 60%, Navy 30%, Amber 10%.
- Mempertahankan kepatuhan aksesibilitas WCAG 2.2 AA (0 violations).
- Seluruh pengujian endpoint otomatis (`npm test`) harus tetap 100% lulus.

## 6. Out of Scope
- Tidak mengubah tabel akun login `users`; Master PIC/Karyawan tidak diwajibkan memiliki akun login, email, atau kata sandi aplikasi.
