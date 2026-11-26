# Panduan Deploy GA & IT Management ke VPS aaPanel

Panduan lengkap untuk memasang **GA & IT Management Core (v1.3.0)** di VPS menggunakan **aaPanel** (Nginx Reverse Proxy + SSL Let's Encrypt + PostgreSQL 16 + Node.js 22).

---

## 1. Pre-Launch Checklist (Sebelum Deploy)

Pastikan seluruh pemeriksaan berikut sudah terpenuhi:
- [ ] Kode sudah lulus `npm run verify` (24/24 syntax check + 52/52 integration tests).
- [ ] `npm audit --omit=dev` menunjukkan **0 vulnerabilities**.
- [ ] Password default `admin@company.com` (`admin123`) dan akun bawaan lainnya **wajib diganti** setelah login pertama di produksi.
- [ ] `JWT_SECRET` dan password PostgreSQL di produksi menggunakan nilai acak yang kuat (bukan nilai contoh di `.env.example`).
- [ ] Port `5432` (PostgreSQL) **tidak dibuka ke publik** di firewall VPS/aaPanel (hanya `80`, `443`, dan port SSH/aaPanel).

---

## 2. Persiapan VPS & aaPanel

1. Login ke dashboard **aaPanel** (`https://IP_VPS:PORT_AAPANEL`).
2. Pastikan **Nginx** sudah terinstal dari menu **App Store**.
3. Pilih salah satu metode instalasi di bawah ini:
   - **Metode A (Direkomendasikan): Docker Compose** — paling mudah, Node.js 22 + PostgreSQL 16 otomatis terisolasi.
   - **Metode B: Native aaPanel (Node Project + PostgreSQL)** — langsung di host tanpa Docker.

---

## Metode A: Deploy Menggunakan Docker Compose di aaPanel (Direkomendasikan)

### Langkah 1: Instal Docker di aaPanel
1. Buka menu **Docker** di sidebar aaPanel (atau **App Store** $\rightarrow$ cari **Docker Manager** dan klik **Install**).
2. Buka **Terminal** di aaPanel (atau SSH ke VPS).

### Langkah 2: Upload / Clone Project ke Server
```bash
mkdir -p /www/wwwroot/ga-it-management
cd /www/wwwroot/ga-it-management

# Jika menggunakan Git:
git clone <URL_REPO_ANDA> .
# Atau upload seluruh file project (kecuali node_modules) via aaPanel Files ke folder di atas
```

### Langkah 3: Buat File `.env` Produksi
Buat file `.env` di `/www/wwwroot/ga-it-management/.env`:
```bash
# Generate JWT_SECRET acak yang aman (64 karakter hex)
openssl rand -hex 32
```
Isi file `.env`:
```env
PORT=3000
NODE_ENV=production
POSTGRES_USER=gait_user
POSTGRES_PASSWORD=GANTI_PASSWORD_DB_YANG_KUAT
POSTGRES_DB=gait_db
DATABASE_URL=postgres://gait_user:GANTI_PASSWORD_DB_YANG_KUAT@db:5432/gait_db
JWT_SECRET=PASTE_HASIL_OPENSSL_RAND_HEX_32_DI_SINI
```

> **Penting:** Sesuaikan `docker-compose.yml` agar membaca `.env` (atau ubah `POSTGRES_PASSWORD`, `DATABASE_URL`, dan tambahkan `JWT_SECRET: ${JWT_SECRET}` di bagian `environment` service `app`).

### Langkah 4: Jalankan Container
```bash
cd /www/wwwroot/ga-it-management
docker compose up -d --build
```
Tunggu beberapa saat, lalu cek status dan health check:
```bash
docker compose ps
curl http://127.0.0.1:3000/api/health
```
Output yang diharapkan:
```json
{"status":"ok","service":"ga-it-management","db":"connected",...}
```

---

## Metode B: Deploy Native (Node Project + PostgreSQL aaPanel)

Jika Anda tidak ingin memakai Docker:

1. **Instal PostgreSQL & Node.js di aaPanel App Store:**
   - Instal **PostgreSQL** (disarankan versi 15/16) dari aaPanel **App Store**.
   - Instal **Node.js Version Manager** dari **App Store**, lalu instal **Node.js v20 atau v22**.
2. **Buat Database & Import Schema:**
   - Masuk ke menu **Database** $\rightarrow$ **PostgreSQL** $\rightarrow$ **Add Database**:
     - Database name: `gait_db`
     - Username: `gait_user`
     - Password: *(buat password kuat)*
   - Jalankan `init.sql` via Terminal:
     ```bash
     PGPASSWORD=PASSWORD_ANDA psql -h 127.0.0.1 -U gait_user -d gait_db -f /www/wwwroot/ga-it-management/init.sql
     ```
3. **Install Dependencies & Siapkan `.env`:**
   ```bash
   cd /www/wwwroot/ga-it-management
   npm ci --omit=dev
   cp .env.example .env
   # Edit .env dan isi DATABASE_URL + JWT_SECRET (hasil openssl rand -hex 32)
   ```
4. **Daftarkan di Node Project aaPanel:**
   - Buka menu **Website** $\rightarrow$ tab **Node project** $\rightarrow$ **Add Node project**.
   - **Path:** `/www/wwwroot/ga-it-management`
   - **Run opt:** `start` (`npm start`)
   - **Port:** `3000`
   - **Node version:** `v22.x` (atau `v20.x`)
   - Klik **Confirm** dan pastikan status proyek **Running**.

---

## 3. Setup Domain, Reverse Proxy Nginx & SSL di aaPanel

Agar aplikasi dapat diakses melalui domain HTTPS (misal `https://aset.perusahaananda.com`):

1. Arahkan **A Record** DNS domain/subdomain Anda ke **IP Public VPS**.
2. Di aaPanel, buka menu **Website** $\rightarrow$ **PHP project** $\rightarrow$ **Add site**:
   - **Domain name:** `aset.perusahaananda.com`
   - **PHP Version:** `Static` (karena kita hanya akan memakai Nginx Reverse Proxy).
3. Klik nama domain tersebut $\rightarrow$ tab **SSL** $\rightarrow$ **Let's Encrypt**:
   - Centang domain Anda dan klik **Apply**.
   - Aktifkan toggle **Force HTTPS** di kanan atas tab SSL.
4. Masih di pengaturan website tersebut, buka tab **Reverse proxy** $\rightarrow$ **Add reverse proxy**:
   - **Proxy name:** `gait_app`
   - **Target URL:** `http://127.0.0.1:3000`
   - **Sent domain:** `$host`
   - Klik **Save**.

---

## 4. Verifikasi Pasca-Deploy (Smoke Test)

Setelah domain dan SSL aktif, lakukan verifikasi:
1. Cek endpoint kesehatan sistem:
   ```bash
   curl https://aset.perusahaananda.com/api/health
   ```
   Pastikan mengembalikan `{"status":"ok","db":"connected",...}`.
2. Buka `https://aset.perusahaananda.com` di browser, login sebagai Admin, lalu **segera ubah password** atau buat akun admin baru di menu **Pengaturan $\rightarrow$ 2. Akun & Permission**.
3. Cek apakah header `Strict-Transport-Security` dan `X-Content-Type-Options: nosniff` muncul di DevTools Network.

---

## 5. Pemeliharaan: Backup Otomatis, Update & Rollback

### Backup Database Otomatis (aaPanel Cron)
Buka menu **Cron** di aaPanel $\rightarrow$ **Add Task**:
- **Task Type:** `Shell Script`
- **Execution cycle:** `Every Day` pukul `02:00`
- **Script content (untuk Metode A Docker):**
  ```bash
  mkdir -p /www/backup/gait_db
  docker exec gait_db pg_dump -U gait_user gait_db | gzip > /www/backup/gait_db/gait_db_$(date +%Y%m%d).sql.gz
  # Simpan backup 14 hari terakhir
  find /www/backup/gait_db -type f -name "*.sql.gz" -mtime +14 -delete
  ```

### Update Versi Baru
```bash
cd /www/wwwroot/ga-it-management
git pull origin master
# Jika ada file migrasi SQL baru di folder migrations/:
# cat migrations/<nama_file>.up.sql | docker exec -i gait_db psql -v ON_ERROR_STOP=1 -U gait_user -d gait_db
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

### Strategi Rollback (Jika Terjadi Masalah)
1. **Rollback Aplikasi:**
   ```bash
   cd /www/wwwroot/ga-it-management
   git checkout v1.3.0   # atau tag versi stabil sebelumnya
   docker compose up -d --build
   ```
2. **Rollback Migrasi Database (jika diperlukan):**
   Jalankan file `.down.sql` yang sesuai di folder `migrations/`, atau restore file `.sql.gz` terakhir dari `/www/backup/gait_db/`.
