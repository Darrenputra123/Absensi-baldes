-- ====================================================================
-- SKRIP SETUP DATABASE DAN STORAGE SUPABASE
-- Sistem Presensi Digital Kehadiran Perangkat Desa Kalipelus
-- Jalankan skrip ini di Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ====================================================================

-- 1. Membuat Tabel 'presensi' (Menyimpan Catatan Absensi Masuk & Pulang)
CREATE TABLE IF NOT EXISTS public.presensi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    nama TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    latitude NUMERIC,
    longitude NUMERIC,
    photo_url TEXT NOT NULL,
    tipe TEXT DEFAULT 'MASUK',
    status_waktu TEXT DEFAULT 'Tepat Waktu'
);

-- Jalankan skrip ini jika tabel sudah ada sebelumnya:
ALTER TABLE public.presensi ADD COLUMN IF NOT EXISTS tipe TEXT DEFAULT 'MASUK';
ALTER TABLE public.presensi ADD COLUMN IF NOT EXISTS status_waktu TEXT DEFAULT 'Tepat Waktu';

-- 2. Membuat Tabel 'officers' (Menyimpan Data Akun Username Perangkat Desa)
CREATE TABLE IF NOT EXISTS public.officers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    nama TEXT NOT NULL,
    jabatan TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'officer'
);

-- 3. Mengaktifkan Row Level Security (RLS) pada Tabel
ALTER TABLE public.presensi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officers ENABLE ROW LEVEL SECURITY;

-- 4. Membuat Kebijakan Keamanan (Policies) untuk Tabel 'presensi'
CREATE POLICY "Izinkan Tambah Presensi Publik" 
ON public.presensi
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Izinkan Baca Data Presensi" 
ON public.presensi
FOR SELECT 
USING (true);

-- 5. Membuat Kebijakan Keamanan (Policies) untuk Tabel 'officers'
CREATE POLICY "Izinkan Baca Data Perangkat Desa"
ON public.officers
FOR SELECT
USING (true);

CREATE POLICY "Izinkan Tambah Data Perangkat Desa"
ON public.officers
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Izinkan Hapus Data Perangkat Desa"
ON public.officers
FOR DELETE
USING (true);

-- 6. Membuat Storage Bucket 'attendance-photos' (Penyimpanan Foto Selfie)
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-photos', 'attendance-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Membuat Kebijakan Keamanan Storage Bucket 'attendance-photos'
CREATE POLICY "Izinkan Unggah Foto Presensi"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'attendance-photos');

CREATE POLICY "Izinkan Lihat Foto Presensi"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'attendance-photos');
