"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { 
  LogOut, Search, Calendar, Download, RefreshCw, MapPin, 
  Image as ImageIcon, Eye, X, CalendarDays, CheckCircle2, UserCheck, ShieldAlert,
  UserPlus, Users, Plus, AlertCircle, Check, User, Key, Edit, Trash2, Lock
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

interface AttendanceLog {
  id: string;
  created_at: string;
  nama: string;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  photo_url: string;
  tipe?: string;
  status_waktu?: string;
}

interface Officer {
  id: string;
  nama: string;
  jabatan: string;
  username: string;
  password?: string;
}

const defaultOfficers: Officer[] = [
  { id: "1", nama: "Sutrisno", jabatan: "Kepala Desa", username: "sutrisno", password: "sutrisno123" },
  { id: "2", nama: "Budi Santoso", jabatan: "Sekretaris Desa", username: "budi", password: "budi123" },
  { id: "3", nama: "Siti Aminah", jabatan: "Kaur Keuangan", username: "siti", password: "siti123" },
  { id: "4", nama: "Joko Susilo", jabatan: "Kaur Umum & Perencanaan", username: "joko", password: "joko123" },
  { id: "5", nama: "Rudi Hermawan", jabatan: "Kasi Pemerintahan", username: "rudi", password: "rudi123" },
  { id: "6", nama: "Sri Wahyuni", jabatan: "Kasi Kesejahteraan & Pelayanan", username: "sri", password: "sri123" },
  { id: "7", nama: "Ahmad Fauzi", jabatan: "Kadus 1", username: "ahmad", password: "ahmad123" },
  { id: "8", nama: "Dewi Lestari", jabatan: "Kadus 2", username: "dewi", password: "dewi123" },
];

export default function DashboardPage() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [officers, setOfficers] = useState<Officer[]>(defaultOfficers);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  
  // Modal Preview Image State
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedPhotoName, setSelectedPhotoName] = useState("");

  // Modal Add Officer State
  const [showAddOfficerModal, setShowAddOfficerModal] = useState(false);
  const [newNama, setNewNama] = useState("");
  const [newJabatan, setNewJabatan] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmittingOfficer, setIsSubmittingOfficer] = useState(false);
  const [officerMsg, setOfficerMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Modal Edit / Reset Password State
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null);
  const [editNama, setEditNama] = useState("");
  const [editJabatan, setEditJabatan] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editMsg, setEditMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  const router = useRouter();

  const fetchOfficers = useCallback(async () => {
    try {
      const storedLocal = localStorage.getItem("presensi_officers");
      const currentLocal: Officer[] = storedLocal ? JSON.parse(storedLocal) : defaultOfficers;

      const { data, error } = await supabase.from("officers").select("*");
      if (!error && data && data.length > 0) {
        const merged: Officer[] = data.map((d: { id: string; nama: string; jabatan: string; username?: string; email?: string; password?: string }) => {
          const uName = d.username || d.email?.split("@")[0] || d.nama.toLowerCase().replace(/\s+/g, "");
          return {
            id: d.id,
            nama: d.nama,
            jabatan: d.jabatan,
            username: uName,
            password: d.password || `${uName}123`,
          };
        });
        
        currentLocal.forEach(loc => {
          if (!merged.some(m => m.username.toLowerCase() === loc.username.toLowerCase())) {
            merged.push(loc);
          }
        });
        setOfficers(merged);
        localStorage.setItem("presensi_officers", JSON.stringify(merged));
      } else {
        setOfficers(currentLocal);
      }
    } catch (err: unknown) {
      console.error("Error fetching officers:", err);
    }
  }, []);

// Dynamic status_waktu calculator (Masuk target: 08:00 WIB, Pulang target: 16:00 WIB)
function computeStatusWaktu(logTimestamp: string, logTipe = "MASUK", dbStatusWaktu?: string): string {
  if (dbStatusWaktu && dbStatusWaktu !== "Tepat Waktu") {
    return dbStatusWaktu;
  }

  const date = new Date(logTimestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMins = hours * 60 + minutes;

  if (logTipe === "MASUK") {
    const targetMins = 8 * 60; // 08:00 WIB
    if (totalMins > targetMins) {
      const lateMins = totalMins - targetMins;
      return `Terlambat ${lateMins} Min`;
    }
    return "Tepat Waktu";
  } else {
    const targetMins = 16 * 60; // 16:00 WIB
    if (totalMins < targetMins) {
      return "Pulang Cepat";
    }
    return "Selesai Tugas";
  }
}

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    let combinedLogs: AttendanceLog[] = [];

    try {
      const { data, error } = await supabase
        .from("presensi")
        .select("*")
        .order("timestamp", { ascending: false });

      if (!error && data) {
        combinedLogs = data.map((d: { id: string; created_at: string; nama: string; timestamp: string; latitude: number | null; longitude: number | null; photo_url: string; tipe?: string; status_waktu?: string }) => {
          const tipe = d.tipe || "MASUK";
          const status = computeStatusWaktu(d.timestamp, tipe, d.status_waktu);
          return {
            ...d,
            tipe,
            status_waktu: status,
          };
        });
      }
    } catch (error: unknown) {
      console.error("Error fetching logs from Supabase:", error);
    }

    // Merge local storage fallback logs
    try {
      const localLogsStr = localStorage.getItem("presensi_logs_local");
      if (localLogsStr) {
        const localLogs: AttendanceLog[] = JSON.parse(localLogsStr);
        localLogs.forEach((localItem) => {
          if (!combinedLogs.some((c) => c.id === localItem.id || c.timestamp === localItem.timestamp)) {
            const tipe = localItem.tipe || "MASUK";
            const status = computeStatusWaktu(localItem.timestamp, tipe, localItem.status_waktu);
            combinedLogs.push({
              ...localItem,
              tipe,
              status_waktu: status,
            });
          }
        });
      }
    } catch (e) {
      console.error("Error reading local logs:", e);
    }

    combinedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setLogs(combinedLogs);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const isLocalAdmin = typeof window !== "undefined" && (
        localStorage.getItem("presensi_admin_logged_in") === "true" ||
        localStorage.getItem("presensi_admin_remember") === "true"
      );

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session || isLocalAdmin) {
          fetchLogs();
          fetchOfficers();
          return;
        }
      } catch (e) {
        console.warn("Auth check warning:", e);
        if (isLocalAdmin) {
          fetchLogs();
          fetchOfficers();
          return;
        }
      }

      router.replace("/admin/login");
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const isLocalAdmin = typeof window !== "undefined" && (
        localStorage.getItem("presensi_admin_logged_in") === "true" ||
        localStorage.getItem("presensi_admin_remember") === "true"
      );
      if (event === "SIGNED_OUT" && !isLocalAdmin && !session) {
        router.replace("/admin/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, fetchLogs, fetchOfficers]);

  useEffect(() => {
    const channel = supabase
      .channel("presensi-realtime-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "presensi" },
        (payload) => {
          const newRecord = payload.new as AttendanceLog;
          setLogs((prev) => [newRecord, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("presensi_admin_logged_in");
    }
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("SignOut warning:", e);
    }
    router.replace("/admin/login");
  };

  const handleAddOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    setOfficerMsg(null);

    const cleanUsername = newUsername.trim().toLowerCase().replace(/\s+/g, "_");

    if (!newNama || !newJabatan || !cleanUsername || !newPassword) {
      setOfficerMsg({ text: "Harap isi semua data perangkat desa.", type: "error" });
      return;
    }

    setIsSubmittingOfficer(true);

    try {
      const formattedEmail = `${cleanUsername}@kalipelus.desa.id`;

      const newOfficerRecord: Officer = {
        id: Date.now().toString(),
        nama: newNama,
        jabatan: newJabatan,
        username: cleanUsername,
        password: newPassword,
      };

      try {
        await supabase.auth.signUp({
          email: formattedEmail,
          password: newPassword,
          options: {
            data: {
              nama: newNama,
              jabatan: newJabatan,
              username: cleanUsername,
            },
          },
        });
      } catch (authErr) {
        console.warn("Supabase auth signup skipped or failed:", authErr);
      }

      try {
        await supabase.from("officers").insert([
          {
            nama: newNama,
            jabatan: newJabatan,
            username: cleanUsername,
            email: formattedEmail,
            role: "officer",
          },
        ]);
      } catch (dbErr) {
        console.warn("Supabase db officers insert skipped:", dbErr);
      }

      const updatedOfficers = [newOfficerRecord, ...officers];
      setOfficers(updatedOfficers);
      localStorage.setItem("presensi_officers", JSON.stringify(updatedOfficers));

      setOfficerMsg({ text: `Akun username '${cleanUsername}' untuk ${newNama} berhasil dibuat!`, type: "success" });
      
      setNewNama("");
      setNewJabatan("");
      setNewUsername("");
      setNewPassword("");

      setTimeout(() => {
        setShowAddOfficerModal(false);
        setOfficerMsg(null);
      }, 2000);

    } catch (err: unknown) {
      console.error("Error creating officer:", err);
      const eObj = err as { message?: string };
      setOfficerMsg({ text: eObj.message || "Gagal membuat akun perangkat desa.", type: "error" });
    } finally {
      setIsSubmittingOfficer(false);
    }
  };

  const handleOpenEditOfficer = (off: Officer) => {
    setEditingOfficer(off);
    setEditNama(off.nama);
    setEditJabatan(off.jabatan);
    setEditPassword(off.password || `${off.username}123`);
    setEditMsg(null);
  };

  const handleSaveEditOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOfficer) return;

    if (!editNama || !editJabatan || !editPassword) {
      setEditMsg({ text: "Harap isi semua bidang.", type: "error" });
      return;
    }

    try {
      const updatedList = officers.map((o) => {
        if (o.id === editingOfficer.id || o.username.toLowerCase() === editingOfficer.username.toLowerCase()) {
          return {
            ...o,
            nama: editNama,
            jabatan: editJabatan,
            password: editPassword,
          };
        }
        return o;
      });

      setOfficers(updatedList);
      localStorage.setItem("presensi_officers", JSON.stringify(updatedList));

      try {
        await supabase.from("officers").update({
          nama: editNama,
          jabatan: editJabatan,
        }).eq("id", editingOfficer.id);
      } catch {
        // offline fallback
      }

      setEditMsg({ text: `Akun & Password ${editNama} berhasil diperbarui!`, type: "success" });
      setTimeout(() => {
        setEditingOfficer(null);
        setEditMsg(null);
      }, 1200);

    } catch (err: unknown) {
      console.error("Error updating officer:", err);
      setEditMsg({ text: "Gagal memperbarui akun.", type: "error" });
    }
  };

  const handleDeleteOfficer = async (off: Officer) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus akun perangkat desa ${off.nama} (@${off.username})?`)) return;

    try {
      await supabase.from("officers").delete().eq("id", off.id);
    } catch {
      // offline fallback
    }

    const updatedList = officers.filter((o) => o.id !== off.id && o.username.toLowerCase() !== off.username.toLowerCase());
    setOfficers(updatedList);
    localStorage.setItem("presensi_officers", JSON.stringify(updatedList));
    alert(`Akun ${off.nama} berhasil dihapus.`);
  };

  const toggleShowPassword = (id: string) => {
    setShowPasswordMap(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.nama.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesDate = true;
    const logDate = new Date(log.timestamp);

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && logDate >= start;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && logDate <= end;
    }

    const logTipe = log.tipe || "MASUK";
    let matchesType = true;
    if (typeFilter === "MASUK") matchesType = logTipe === "MASUK";
    if (typeFilter === "PULANG") matchesType = logTipe === "PULANG";

    return matchesSearch && matchesDate && matchesType;
  });

  const today = new Date().toISOString().split("T")[0];
  const logsToday = logs.filter(log => log.timestamp.startsWith(today));
  const uniqueStaffToday = new Set(logsToday.map(log => log.nama.split(" - ")[0])).size;

  const handleExportExcel = () => {
    if (filteredLogs.length === 0) {
      alert("Tidak ada data untuk diekspor!");
      return;
    }

    const excelData = filteredLogs.map((log, index) => ({
      "No": index + 1,
      "Tanggal & Waktu": new Date(log.timestamp).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "medium",
      }),
      "Nama Petugas": log.nama.split(" - ")[0],
      "Jabatan": log.nama.split(" - ")[1] || "-",
      "Tipe Presensi": log.tipe || "MASUK",
      "Status Waktu": log.status_waktu || "Tepat Waktu",
      "Latitude": log.latitude || "-",
      "Longitude": log.longitude || "-",
      "Google Maps Link": log.latitude && log.longitude 
        ? `https://www.google.com/maps?q=${log.latitude},${log.longitude}` 
        : "-",
      "Link Foto": log.photo_url,
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    const wscols = [
      { wch: 6 },   // No
      { wch: 25 },  // Tanggal & Waktu
      { wch: 25 },  // Nama Petugas
      { wch: 25 },  // Jabatan
      { wch: 15 },  // Tipe Presensi
      { wch: 20 },  // Status Waktu
      { wch: 15 },  // Latitude
      { wch: 15 },  // Longitude
      { wch: 45 },  // Google Maps Link
      { wch: 65 },  // Link Foto
    ];
    worksheet["!cols"] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Kehadiran");

    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(workbook, `Laporan_Presensi_Desa_Kalipelus_${dateStr}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col font-sans text-zinc-800 dark:text-zinc-100 border-t-4 border-blue-600">
      {/* Top Navbar */}
      <nav className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 py-4 px-6 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-xl">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Admin Portal</h1>
              <p className="text-xs text-zinc-500 font-medium">Dashboard Presensi Desa Kalipelus</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddOfficerModal(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-blue-950/20 transition-all select-none cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>+ Tambah Akun Perangkat</span>
            </button>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-850 hover:text-rose-600 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all select-none cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Space */}
      <main className="grow max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        
        {/* Statistics Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Kehadiran</p>
              <h3 className="text-3xl font-extrabold">{logs.length}</h3>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/40 text-blue-500 p-3.5 rounded-2xl">
              <CalendarDays className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Absen Hari Ini</p>
              <h3 className="text-3xl font-extrabold">{logsToday.length}</h3>
            </div>
            <div className="bg-sky-50 dark:bg-sky-950/40 text-sky-500 p-3.5 rounded-2xl">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Petugas Hadir</p>
              <h3 className="text-3xl font-extrabold">{uniqueStaffToday}</h3>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 p-3.5 rounded-2xl">
              <UserCheck className="h-6 w-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Perangkat</p>
              <h3 className="text-3xl font-extrabold">{officers.length}</h3>
            </div>
            <div className="bg-cyan-50 dark:bg-cyan-950/40 text-cyan-500 p-3.5 rounded-2xl">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </section>

        {/* Filter Controls Panel */}
        <section className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-base font-bold">Filter Kehadiran</h2>
            
            <div className="flex items-center gap-2 self-start md:self-auto bg-blue-500/10 border border-blue-500/25 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
              <span className="w-2 h-2 bg-blue-500 rounded-full absolute" />
              <span className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">Sinkronisasi Real-Time Aktif</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3.5">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400 pointer-events-none">
                <Search className="h-4.5 w-4.5" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama petugas..."
                className="w-full bg-zinc-50 dark:bg-zinc-950 text-sm border border-zinc-200 dark:border-zinc-850 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 text-sm border border-zinc-200 dark:border-zinc-850 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-zinc-700 dark:text-zinc-200 font-semibold"
              >
                <option value="ALL">Semua Tipe (Masuk & Pulang)</option>
                <option value="MASUK">Presensi Masuk (08:00)</option>
                <option value="PULANG">Presensi Pulang (16:00)</option>
              </select>
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400 pointer-events-none">
                <Calendar className="h-4.5 w-4.5" />
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                title="Tanggal Mulai"
                className="w-full bg-zinc-50 dark:bg-zinc-950 text-sm border border-zinc-200 dark:border-zinc-850 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400 pointer-events-none">
                <Calendar className="h-4.5 w-4.5" />
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                title="Tanggal Akhir"
                className="w-full bg-zinc-50 dark:bg-zinc-950 text-sm border border-zinc-200 dark:border-zinc-850 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleExportExcel}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl py-3 px-4 shadow transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer select-none"
              >
                <Download className="h-4.5 w-4.5" />
                <span>Ekspor Excel</span>
              </button>
              
              <button
                onClick={fetchLogs}
                disabled={isLoading}
                title="Refresh Data"
                className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 transition-all active:scale-95 flex items-center justify-center cursor-pointer select-none disabled:opacity-50"
              >
                <RefreshCw className={`h-4.5 w-4.5 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Logs Table Area */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">Riwayat Kehadiran Perangkat Desa</h2>
            <span className="text-xs text-zinc-500">{filteredLogs.length} Catatan</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-850 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider text-[11px] font-bold">
                <tr>
                  <th scope="col" className="px-6 py-4">Tanggal & Waktu</th>
                  <th scope="col" className="px-6 py-4">Tipe</th>
                  <th scope="col" className="px-6 py-4">Status Waktu</th>
                  <th scope="col" className="px-6 py-4">Nama Petugas</th>
                  <th scope="col" className="px-6 py-4">Jabatan</th>
                  <th scope="col" className="px-6 py-4">Lokasi GPS</th>
                  <th scope="col" className="px-6 py-4 text-center">Foto Selfie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="px-6 py-5.5"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-28"></div></td>
                      <td className="px-6 py-5.5"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-16"></div></td>
                      <td className="px-6 py-5.5"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-20"></div></td>
                      <td className="px-6 py-5.5"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-36"></div></td>
                      <td className="px-6 py-5.5"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-24"></div></td>
                      <td className="px-6 py-5.5"><div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-44"></div></td>
                      <td className="px-6 py-5.5"><div className="h-10 w-10 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto"></div></td>
                    </tr>
                  ))
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="max-w-xs mx-auto space-y-2 text-zinc-400">
                        <ShieldAlert className="h-10 w-10 mx-auto text-zinc-300" />
                        <p className="font-semibold text-zinc-600 dark:text-zinc-400">Data Tidak Ditemukan</p>
                        <p className="text-xs">
                          Belum ada catatan presensi yang cocok dengan filter saat ini.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const [namaPetugas, jabatan] = log.nama.split(" - ");
                    const hasCoordinates = log.latitude !== null && log.longitude !== null;
                    const logTipe = log.tipe || "MASUK";
                    const logStatusWaktu = log.status_waktu || "Tepat Waktu";

                    return (
                      <tr 
                        key={log.id} 
                        className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/30 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium whitespace-nowrap text-zinc-900 dark:text-zinc-100">
                          {new Date(log.timestamp).toLocaleString("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short"
                          })}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 text-[10px] font-extrabold rounded-full border ${
                            logTipe === "PULANG"
                              ? "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30"
                              : "bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/30"
                          }`}>
                            {logTipe}
                          </span>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border ${
                            logStatusWaktu.includes("Terlambat")
                              ? "bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/30"
                              : logStatusWaktu === "Pulang Cepat"
                              ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          }`}>
                            {logStatusWaktu}
                          </span>
                        </td>

                        <td className="px-6 py-4 font-semibold text-zinc-950 dark:text-white">
                          {namaPetugas}
                        </td>

                        <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">
                          {jabatan || "-"}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-xs">
                          {hasCoordinates ? (
                            <a
                              href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-blue-500 hover:text-blue-400 dark:text-blue-400 hover:underline font-semibold bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg border border-blue-500/20 transition-all"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              <span>{log.latitude?.toFixed(5)}, {log.longitude?.toFixed(5)}</span>
                            </a>
                          ) : (
                            <span className="text-zinc-400 italic">GPS Tidak Aktif</span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => {
                              setSelectedPhoto(log.photo_url);
                              setSelectedPhotoName(namaPetugas);
                            }}
                            className="inline-flex items-center justify-center p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 transition-all select-none cursor-pointer group"
                            title="Lihat Foto"
                          >
                            <span className="relative w-9 h-9 rounded-full overflow-hidden block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={log.photo_url}
                                alt={`Selfie ${namaPetugas}`}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 text-white transition-opacity">
                                <Eye className="h-3.5 w-3.5" />
                              </span>
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Kelola Akun Perangkat Desa Card */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-4">
            <div className="flex items-center gap-2.5">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <h2 className="text-base font-bold">Kelola Akun Perangkat Desa</h2>
                <p className="text-xs text-zinc-500">Kelola akun, ubah password, dan tambah perangkat desa baru</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full">
                {officers.length} Akun Terdaftar
              </span>
              <button
                onClick={() => setShowAddOfficerModal(true)}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>+ Tambah Akun</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {officers.map((off) => {
              const currentPassword = off.password || `${off.username}123`;
              const isPasswordVisible = !!showPasswordMap[off.id];

              return (
                <div 
                  key={off.id}
                  className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-200/60 dark:border-zinc-850 flex flex-col justify-between space-y-3 hover:border-blue-500/30 transition-all group"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 line-clamp-1">{off.nama}</h3>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenEditOfficer(off)}
                          className="p-1 rounded-lg hover:bg-blue-500/10 text-blue-500 dark:text-blue-400 transition-colors"
                          title="Edit Akun / Reset Password"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteOfficer(off)}
                          className="p-1 rounded-lg hover:bg-rose-500/10 text-rose-500 dark:text-rose-400 transition-colors"
                          title="Hapus Akun"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-blue-500 dark:text-blue-400 font-semibold">{off.jabatan}</p>

                    <div className="space-y-1 pt-1">
                      <p className="text-[11px] text-zinc-400 font-mono flex items-center gap-1.5">
                        <User className="h-3 w-3 text-zinc-500 shrink-0" />
                        <span className="truncate">@{off.username}</span>
                      </p>
                      <div className="text-[11px] text-zinc-400 font-mono flex items-center justify-between gap-1 bg-white dark:bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-200/60 dark:border-zinc-800">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <Lock className="h-3 w-3 text-amber-500 shrink-0" />
                          <span className="truncate font-semibold text-zinc-700 dark:text-zinc-300">
                            {isPasswordVisible ? currentPassword : "••••••••"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleShowPassword(off.id)}
                          className="text-[10px] text-blue-500 hover:underline shrink-0 font-sans"
                        >
                          {isPasswordVisible ? "Sembunyi" : "Intip"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-200/40 dark:border-zinc-850/60 flex items-center justify-between text-[11px]">
                    <button
                      onClick={() => handleOpenEditOfficer(off)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-500 hover:text-blue-400 hover:underline"
                    >
                      <Key className="h-3 w-3" />
                      <span>Ubah Password</span>
                    </button>
                    <span className="text-[10px] text-emerald-500 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                      Aktif
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Add Officer Modal */}
      {showAddOfficerModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 max-w-md w-full rounded-3xl p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800/60 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">Tambah Perangkat Desa Baru</h3>
              </div>
              <button
                onClick={() => setShowAddOfficerModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {officerMsg && (
              <div className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 ${
                officerMsg.type === "success" 
                  ? "bg-blue-950/40 border border-blue-700 text-blue-300"
                  : "bg-rose-950/40 border border-rose-800 text-rose-300"
              }`}>
                {officerMsg.type === "success" ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                <span>{officerMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleAddOfficer} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nama Lengkap</label>
                <input
                  type="text"
                  value={newNama}
                  onChange={(e) => setNewNama(e.target.value)}
                  placeholder="Contoh: Tri Haryanto"
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Jabatan / Role</label>
                <input
                  type="text"
                  value={newJabatan}
                  onChange={(e) => setNewJabatan(e.target.value)}
                  placeholder="Contoh: Kasi Pelayanan"
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Username Login</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-500">
                    <User className="h-4 w-4 text-zinc-500" />
                  </span>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="triharyanto"
                    required
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 pl-10 pr-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <p className="text-[10px] text-zinc-500">Username yang dipakai perangkat desa untuk login presensi.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Password Default</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingOfficer}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm mt-4 select-none cursor-pointer disabled:opacity-50"
              >
                {isSubmittingOfficer ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Mendaftarkan Akun...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Buat Akun Perangkat</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Officer / Reset Password Modal */}
      {editingOfficer && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 max-w-md w-full rounded-3xl p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800/60 pb-3">
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-500" />
                <div>
                  <h3 className="font-bold text-base text-zinc-900 dark:text-white">Edit Akun & Reset Password</h3>
                  <p className="text-[11px] text-zinc-500">@{editingOfficer.username}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingOfficer(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editMsg && (
              <div className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 ${
                editMsg.type === "success" 
                  ? "bg-blue-950/40 border border-blue-700 text-blue-300"
                  : "bg-rose-950/40 border border-rose-800 text-rose-300"
              }`}>
                {editMsg.type === "success" ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                <span>{editMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditOfficer} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Nama Perangkat Desa</label>
                <input
                  type="text"
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Jabatan / Role</label>
                <input
                  type="text"
                  value={editJabatan}
                  onChange={(e) => setEditJabatan(e.target.value)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  <span>Password Baru / Reset Password</span>
                </label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Masukkan password baru"
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-amber-500/40 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-amber-500 font-bold"
                />
                <p className="text-[10px] text-zinc-500">Password ini yang digunakan perangkat untuk login presensi.</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingOfficer(null)}
                  className="w-1/2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold py-2.5 rounded-xl text-xs transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl shadow-lg transition-all text-xs flex items-center justify-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Photo Modal Viewer */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 relative">
            <div className="p-4 flex items-center justify-between border-b border-zinc-200/50 dark:border-zinc-800/50">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4.5 w-4.5 text-blue-500" />
                <span className="font-bold text-sm text-zinc-900 dark:text-white">Foto: {selectedPhotoName}</span>
              </div>
              <button
                onClick={() => {
                  setSelectedPhoto(null);
                  setSelectedPhotoName("");
                }}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all select-none cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="aspect-square w-full bg-zinc-950 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPhoto}
                alt={`Foto Selfie ${selectedPhotoName}`}
                className="max-w-full max-h-full object-contain"
              />
            </div>
            
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/20 text-center">
              <a
                href={selectedPhoto}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs font-bold text-blue-500 hover:text-blue-400 dark:text-blue-400 tracking-wider uppercase hover:underline"
              >
                Unduh / Buka Gambar di Tab Baru
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Page footer */}
      <footer className="py-6 text-center text-xs text-zinc-400 dark:text-zinc-600 border-t border-zinc-200/40 dark:border-zinc-800/40">
        &copy; {new Date().getFullYear()} Kantor Desa Kalipelus. Portal Monitoring Kehadiran.
      </footer>
    </div>
  );
}
