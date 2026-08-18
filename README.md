# 🇮🇩 Sistem Presensi Kehadiran Digital Desa Kalipelus

Aplikasi Web & PWA **Presensi Digital Kehadiran Perangkat Desa Kalipelus** (Program Kerja Individu KKN GIAT 16).

Sistem ini dirancang khusus untuk mempermudah Perangkat Desa dalam melakukan presensi kehadiran harian menggunakan **Verifikasi Wajah (Face Detection)** dan **Lokasi GPS**, serta menyediakan **Portal Admin** untuk memantau rekap absensi dan mengelola akun perangkat desa.

---

## ✨ Fitur Utama

1. **Kehadiran Berbasis Akun Perangkat Desa**
   - Setiap perangkat desa memiliki akun login sendiri (username & password).
   - Memiliki fitur **"Ingat Saya"** sehingga perangkat desa hanya perlu login **1 kali saja** di HP masing-masing.

2. **Verifikasi Wajah Real-Time (Face Detection)**
   - Menggunakan deteksi wajah berbasis AI (TinyFaceDetector) langsung di kamera HP.
   - Dilengkapi kotak panduan dan indikator hijau saat wajah terdeteksi.

3. **Lokasi GPS Akurat**
   - Mendeteksi koordinat latitude & longitude lokasi fisik perangkat desa saat melakukan presensi.

4. **Kompresi Foto Otomatis (<100 KB)**
   - Mengompresi foto selfie secara otomatis di perangkat HP agar presensi tetap cepat walaupun menggunakan jaringan internet desa 3G/terbatas.

5. **Portal Admin & Rekap Laporan Kehadiran**
   - **Real-Time Database**: Data presensi masuk secara otomatis tanpa perlu refresh.
   - **Filter Data**: Filter berdasarkan nama perangkat desa dan rentang tanggal.
   - **Ekspor Excel**: Unduh laporan rekap kehadiran ke format file `.xlsx` dengan 1 kali klik.
   - **Kelola Akun Perangkat**: Admin dapat menambah akun perangkat desa baru langsung dari Dashboard.

6. **Dukungan Aplikasi HP (PWA)**
   - Dapat di-install langsung ke Layar Utama (Home Screen) HP Android & iPhone seperti aplikasi native.

---

## 🚀 Cara Menjalankan Aplikasi di Komputer Lokal

1. **Buka Terminal / Command Prompt** di folder proyek:
   ```bash
   npm run dev
   ```

2. **Buka Browser**:
   Akses [http://localhost:3000](http://localhost:3000) pada browser Anda.

---

## 🛠️ Panduan Langkah Demi Langkah Pengaturan Supabase Database

Jika Anda siap menghubungkan aplikasi ke database Supabase secara online, ikuti langkah-langkah mudah berikut:

### Langkah 1: Buat Proyek Baru di Supabase
1. Buka browser dan kunjungi [https://supabase.com](https://supabase.com).
2. Klik tombol **Sign In** atau **Sign Up** untuk membuat akun gratis.
3. Klik tombol **"New Project"**.
4. Isi data proyek:
   - **Name**: `presensi-kalipelus` (atau nama pilihan Anda).
   - **Database Password**: Buat kata sandi yang kuat (catat kata sandi ini).
   - **Region**: Pilih **Singapore** (wilayah terdekat dengan Indonesia agar akses cepat).
5. Klik **"Create new project"** dan tunggu sekitar 1 menit hingga database siap.

### Langkah 2: Salin Kunci API Supabase
1. Di halaman Dashboard Supabase Anda, klik menu **Project Settings ⚙️** (ikon roda gigi di kiri bawah).
2. Pilih menu **API**.
3. Salin 2 data berikut:
   - **Project URL** (contoh: `https://xyzabc123.supabase.co`)
   - **`anon` `public` API Key** (kunci publik)

### Langkah 3: Buat File `.env.local`
1. Di folder proyek komputer Anda, buat file baru bernama `.env.local`.
2. Isi file `.env.local` dengan format berikut:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xyzabc123.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=masukkan_anon_key_anda_di_sini
   ```
3. Simpan file tersebut.

### Langkah 4: Jalankan Skrip Database SQL
1. Di Dashboard Supabase, klik menu **SQL Editor 🗄️** di bilah kiri.
2. Klik tombol **"New query"**.
3. Buka file [`supabase_setup.sql`](file:///c:/Users/Asus/OneDrive/Documents/KKN%20GIAT%2016/Proker%20Individu/presensi-desa/supabase_setup.sql) yang ada di folder proyek ini.
4. Salin seluruh isi skrip SQL tersebut dan tempelkan (paste) ke SQL Editor di Supabase.
5. Klik tombol **"Run"** (tombol hijau di pojok kanan bawah).
   - *Skrip ini akan otomatis membuat tabel `presensi`, tabel `officers`, folder penyimpanan foto `attendance-photos`, dan kebijakan keamanan (RLS).*

### Langkah 5: Buat Akun Admin Pertama
1. Di Dashboard Supabase, klik menu **Authentication 👤** > **Users**.
2. Klik **"Add User"** > **"Create User"**.
3. Masukkan Email (contoh: `admin@kalipelus.desa.id`) dan Password.
4. Klik **"Create User"**.
5. Akun Admin Anda siap digunakan untuk login di halaman `/admin/login`!

---

## 📁 Struktur Folder Proyek

```
presensi-desa/
├── app/
│   ├── page.tsx               # Halaman Presensi Perangkat Desa (Kamera, GPS & Verification)
│   ├── layout.tsx             # Layout Utama & PWA Meta Config
│   ├── manifest.ts            # PWA Manifest (Nama, Ikon, Warna Tema)
│   └── admin/
│       ├── login/page.tsx     # Halaman Login Admin Portal
│       └── dashboard/page.tsx # Dashboard Admin (Rekap Log, Filter, Ekspor Excel & Tambah Perangkat)
├── lib/
│   └── supabase.ts            # Inisialisasi Koneksi Supabase Client
├── public/                    # Aset Gambar, Ikon PWA & Logo
├── supabase_setup.sql         # Skrip Setup Database SQL Supabase
├── .env.local.example         # Contoh Konfigurasi Environment Variables
└── README.md                  # Dokumentasi Lengkap Aplikasi (Bahasa Indonesia)
```

---

&copy; 2026 Government of Kalipelus Village. Program Kerja Individu KKN GIAT 16.
