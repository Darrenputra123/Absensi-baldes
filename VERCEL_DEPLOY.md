# Panduan Deployment Vercel - Presensi Perangkat Desa Kalipelus

Proyek Next.js ini siap untuk di-deploy ke **Vercel** dalam hitungan menit.

---

## 📋 Environment Variables yang Perlu Disiapkan di Vercel

Saat melakukan import proyek ke Vercel, pastikan untuk menambahkan **Environment Variables** berikut di menu **Project Settings > Environment Variables**:

| Name | Value |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pntgubhlosgtizqflzqi.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBudGd1Ymhsb3NndGl6cWZsenFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMzk3NzYsImV4cCI6MjEwMjYxNTc3Nn0.uZrBhPVmY_azQ3Bv1jZMw6LykffU79tYmreOl-Xr4JM` |

---

## 🚀 Opsi 1: Deploy Menggunakan Vercel CLI (Paling Cepat dari Terminal)

1. Jalankan perintah Vercel CLI di terminal:
   ```bash
   npx vercel
   ```
2. Ikuti petunjuk di layar:
   - *Set up and deploy?* -> ketik `y`
   - *Which scope?* -> pilih akun Vercel Anda
   - *Link to existing project?* -> ketik `N`
   - *What's your project's name?* -> `presensi-desa`
   - *In which directory is your code located?* -> press Enter (`./`)
   - *Want to modify these settings?* -> ketik `n`

3. Setelah proyek terhubung, tambahkan Environment Variables:
   ```bash
   npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
   npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   ```
   *(atau isi di Dashboard Vercel)*

4. Jalankan deploy ke Production:
   ```bash
   npx vercel --prod
   ```

---

## 🐙 Opsi 2: Deploy Menggunakan GitHub + Dashboard Vercel

1. **Push Proyek ke Repository GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Vercel deploy"
   git branch -M main
   git remote add origin https://github.com/USERNAME/presensi-desa.git
   git push -u origin main
   ```

2. **Import ke Vercel**:
   - Buka [Vercel Dashboard](https://vercel.com/new).
   - Hubungkan akun GitHub Anda lalu pilih repository `presensi-desa`.
   - Buka bagian **Environment Variables** lalu masukkan `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Klik **Deploy**.

---

## ✅ Catatan Penting
- **PWA & Kamera HTTPS**: Vercel secara otomatis menyediakan sertifikat SSL/HTTPS gratis. Fitur kamera selfie dan GPS lokasi perangkat akan berjalan 100% lancar di Vercel tanpa perlu setup ngrok lagi.
