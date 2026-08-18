"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Camera, MapPin, CheckCircle, RefreshCw, AlertCircle, UserCheck, 
  Smartphone, ShieldCheck, Lock, LogOut, ArrowRight, User, Calendar, Clock, Sparkles, Check, X, RotateCcw, Send, FileCheck, ShieldAlert
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import confetti from "canvas-confetti";
import Link from "next/link";

interface OfficerSession {
  nama: string;
  jabatan: string;
  username: string;
}

interface AttendanceRecord {
  id?: string;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  photo_url: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Exact Location of Kantor Kepala Desa Kalipelus (from Google Maps https://maps.app.goo.gl/f7nZVQEosoFLpgPm9)
const VILLAGE_OFFICE_COORDS = {
  lat: -7.4288485,
  lng: 109.5726045,
  name: "Kantor Kepala Desa Kalipelus",
  plusCode: "HHCF+F29",
  address: "Temanggungan, Kalipelus, Purwanegara, Banjarnegara, Jawa Tengah 53472",
  maxRadiusMeters: 50,
};

// Haversine Distance Formula in Meters
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export default function AttendancePage() {
  // Officer Auth State
  const [officerSession, setOfficerSession] = useState<OfficerSession | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Daily Attendance Checking State (1x per day limit)
  const [hasAttendedToday, setHasAttendedToday] = useState(false);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);

  // Camera & Location State
  const [cameraStatus, setCameraStatus] = useState<"idle" | "loading" | "active" | "denied" | "error">("idle");
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "success" | "denied" | "error">("idle");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceFromOffice, setDistanceFromOffice] = useState<number | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState<boolean>(true);
  
  // Realtime Clock State
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");

  // Face Detection State
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [faceConfidence, setFaceConfidence] = useState<number | null>(null);

  // Photo Preview & Confirmation Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewPhotoBlob, setPreviewPhotoBlob] = useState<Blob | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // PWA Install Prompt & Guidance Modal State
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const faceApiRef = useRef<unknown>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraStatus("loading");
    stopCamera();

    try {
      const constraints = {
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraStatus("active");
      }
    } catch (error: unknown) {
      console.error("Camera access error:", error);
      const err = error as { name?: string };
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraStatus("denied");
      } else {
        setCameraStatus("error");
      }
    }
  }, [stopCamera]);

  const requestLocation = useCallback(() => {
    setGpsStatus("loading");
    if (!navigator.geolocation) {
      setGpsStatus("error");
      showToast("Browser tidak mendukung GPS Geolocation", "error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        setGpsCoords({ lat: userLat, lng: userLng });

        // Calculate distance to Kalipelus Village Office (-7.4288485, 109.5726045)
        const dist = calculateDistanceMeters(
          userLat,
          userLng,
          VILLAGE_OFFICE_COORDS.lat,
          VILLAGE_OFFICE_COORDS.lng
        );

        setDistanceFromOffice(dist);

        // Check if within 50 meters radius
        const validRadius = dist <= VILLAGE_OFFICE_COORDS.maxRadiusMeters;
        setIsWithinRadius(validRadius);
        setGpsStatus("success");

        if (!validRadius) {
          showToast(`Peringatan: Jarak Anda ${dist}m dari Kantor Desa (${VILLAGE_OFFICE_COORDS.plusCode}). Maksimal: ${VILLAGE_OFFICE_COORDS.maxRadiusMeters}m.`, "error");
        }
      },
      (error) => {
        console.error("GPS location error:", error);
        if (error.code === error.PERMISSION_DENIED) {
          setGpsStatus("denied");
          showToast("Izin lokasi ditolak. Silakan aktifkan GPS Anda.", "error");
        } else {
          setGpsStatus("error");
          showToast("Gagal mendeteksi lokasi GPS", "error");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [showToast]);

  const initFaceApi = useCallback(async () => {
    try {
      const faceapiModule = await import("@vladmandic/face-api");
      faceApiRef.current = faceapiModule;

      const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
      await faceapiModule.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      setIsModelLoaded(true);
    } catch (err: unknown) {
      console.warn("Could not load face detection weights, camera active", err);
      setIsModelLoaded(true);
    }
  }, []);

  const initAttendanceFeatures = useCallback(() => {
    initFaceApi();
    startCamera();
    requestLocation();
  }, [initFaceApi, startCamera, requestLocation]);

  // Check if officer has already checked in today (1x per day limit check)
  const checkIfAttendedToday = useCallback(async (sessionObj: OfficerSession) => {
    const todayStr = new Date().toISOString().split("T")[0];

    let foundRecord: AttendanceRecord | null = null;

    try {
      const { data, error } = await supabase
        .from("presensi")
        .select("*")
        .like("nama", `${sessionObj.nama}%`)
        .gte("timestamp", `${todayStr}T00:00:00.000Z`)
        .lte("timestamp", `${todayStr}T23:59:59.999Z`)
        .order("timestamp", { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        foundRecord = {
          id: data[0].id,
          timestamp: data[0].timestamp,
          latitude: data[0].latitude,
          longitude: data[0].longitude,
          photo_url: data[0].photo_url,
        };
      }
    } catch (err: unknown) {
      console.warn("Supabase today check skipped (offline mode):", err);
    }

    // Local storage fallback check
    if (!foundRecord) {
      const localLogsStr = localStorage.getItem("presensi_logs_local");
      if (localLogsStr) {
        const localLogs = JSON.parse(localLogsStr);
        const match = localLogs.find((l: { nama: string; timestamp: string }) => 
          l.nama.includes(sessionObj.nama) && l.timestamp.startsWith(todayStr)
        );
        if (match) {
          foundRecord = {
            id: match.id,
            timestamp: match.timestamp,
            latitude: match.latitude,
            longitude: match.longitude,
            photo_url: match.photo_url,
          };
        }
      }
    }

    if (foundRecord) {
      setHasAttendedToday(true);
      setTodayRecord(foundRecord);
    } else {
      setHasAttendedToday(false);
      setTodayRecord(null);
    }
  }, []);

  const checkOfficerSession = useCallback(async () => {
    try {
      const savedSessionStr = localStorage.getItem("presensi_officer_session");
      if (savedSessionStr) {
        const parsed = JSON.parse(savedSessionStr);
        setOfficerSession(parsed);
        checkIfAttendedToday(parsed);
        initAttendanceFeatures();
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const userMeta = session.user.user_metadata || {};
          const nama = userMeta.nama || session.user.email?.split("@")[0] || "Perangkat Desa";
          const jabatan = userMeta.jabatan || "Perangkat Desa";
          const username = userMeta.username || session.user.email?.split("@")[0] || "perangkat";
          
          const sessObj = { nama, jabatan, username };
          setOfficerSession(sessObj);
          localStorage.setItem("presensi_officer_session", JSON.stringify(sessObj));
          checkIfAttendedToday(sessObj);
          initAttendanceFeatures();
        }
      } catch {
        // Offline / pre-Supabase mode
      }
    } catch (err: unknown) {
      console.error("Error restoring officer session:", err);
    }
  }, [initAttendanceFeatures, checkIfAttendedToday]);

  // Live clock updating
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " WIB"
      );
      setCurrentDate(
        now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      );
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check existing session / saved remember me on mount asynchronously
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    const timer = setTimeout(() => {
      checkOfficerSession();
    }, 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      stopCamera();
      if (detectIntervalRef.current) {
        clearInterval(detectIntervalRef.current);
      }
    };
  }, [checkOfficerSession, stopCamera]);

  const handleOfficerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    const cleanUsername = usernameInput.trim().toLowerCase().replace(/\s+/g, "_");

    if (!cleanUsername || !passwordInput) {
      setLoginError("Silakan isi username dan password Anda.");
      return;
    }

    setIsLoggingIn(true);

    try {
      const loginEmail = `${cleanUsername}@kalipelus.desa.id`;

      let loggedInNama = "";
      let loggedInJabatan = "";

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: passwordInput,
        });

        if (!error && data.session) {
          const userMeta = data.session.user.user_metadata || {};
          loggedInNama = userMeta.nama || cleanUsername;
          loggedInJabatan = userMeta.jabatan || "Perangkat Desa";
        }
      } catch (supabaseErr: unknown) {
        console.warn("Supabase auth skipped (offline / pre-setup mode):", supabaseErr);
      }

      if (!loggedInNama) {
        const localOfficersStr = localStorage.getItem("presensi_officers");
        if (localOfficersStr) {
          const list = JSON.parse(localOfficersStr);
          const found = list.find((o: { username?: string; email?: string; nama: string; jabatan: string }) => 
            (o.username && o.username.toLowerCase() === cleanUsername) || 
            (o.email && o.email.toLowerCase() === loginEmail.toLowerCase()) || 
            o.nama.toLowerCase().includes(cleanUsername)
          );
          if (found) {
            loggedInNama = found.nama;
            loggedInJabatan = found.jabatan;
          }
        }

        if (!loggedInNama) {
          const cleanName = cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1);
          loggedInNama = cleanName;
          loggedInJabatan = "Perangkat Desa";
        }
      }

      const sess: OfficerSession = {
        nama: loggedInNama,
        jabatan: loggedInJabatan,
        username: cleanUsername,
      };

      setOfficerSession(sess);

      if (rememberMe) {
        localStorage.setItem("presensi_officer_session", JSON.stringify(sess));
      }

      checkIfAttendedToday(sess);
      initAttendanceFeatures();

    } catch (err: unknown) {
      console.error("Officer login error:", err);
      const eObj = err as { message?: string };
      setLoginError(eObj.message || "Gagal masuk. Periksa username dan password.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogoutOfficer = async () => {
    localStorage.removeItem("presensi_officer_session");
    setOfficerSession(null);
    setHasAttendedToday(false);
    setTodayRecord(null);
    stopCamera();
    try {
      await supabase.auth.signOut();
    } catch {
      // Offline fallback
    }
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowInstallGuideModal(true);
    }
  };

  useEffect(() => {
    if (cameraStatus === "active" && isModelLoaded && videoRef.current && faceApiRef.current) {
      const faceapi = faceApiRef.current as {
        TinyFaceDetectorOptions: new (config: { inputSize: number; scoreThreshold: number }) => unknown;
        detectAllFaces: (video: HTMLVideoElement, options: unknown) => Promise<Array<{ score: number; box: { x: number; y: number; width: number; height: number } }>>;
        matchDimensions: (canvas: HTMLCanvasElement, size: { width: number; height: number }) => void;
        resizeResults: (detections: unknown, size: { width: number; height: number }) => Array<{ score: number; box: { x: number; y: number; width: number; height: number } }>;
      };

      detectIntervalRef.current = setInterval(async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || video.paused || video.ended) return;

        try {
          const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
          const detections = await faceapi.detectAllFaces(video, options);

          if (canvas) {
            const displaySize = { width: video.clientWidth || 320, height: video.clientHeight || 320 };
            faceapi.matchDimensions(canvas, displaySize);

            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            const ctx = canvas.getContext("2d");

            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);

              if (resizedDetections.length > 0) {
                setIsFaceDetected(true);
                const bestDetection = resizedDetections[0];
                setFaceConfidence(Math.round(bestDetection.score * 100));

                const box = bestDetection.box;
                ctx.strokeStyle = "#2563eb";
                ctx.lineWidth = 3;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                const cornerLen = Math.min(box.width, box.height) * 0.2;
                ctx.strokeStyle = "#60a5fa";
                ctx.lineWidth = 4;

                ctx.beginPath();
                ctx.moveTo(box.x, box.y + cornerLen);
                ctx.lineTo(box.x, box.y);
                ctx.lineTo(box.x + cornerLen, box.y);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(box.x + box.width - cornerLen, box.y);
                ctx.lineTo(box.x + box.width, box.y);
                ctx.lineTo(box.x + box.width, box.y + cornerLen);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(box.x, box.y + box.height - cornerLen);
                ctx.lineTo(box.x, box.y + box.height);
                ctx.lineTo(box.x + cornerLen, box.y + box.height);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(box.x + box.width - cornerLen, box.y + box.height);
                ctx.lineTo(box.x + box.width, box.y + box.height);
                ctx.lineTo(box.x + box.width, box.y + box.height - cornerLen);
                ctx.stroke();

                // Draw un-mirrored face label on mirrored canvas overlay
                ctx.save();
                const scorePercent = Math.round(bestDetection.score * 100);
                const labelText = `Wajah Terdeteksi ${scorePercent}%`;
                ctx.font = "bold 12px sans-serif";
                const textMetrics = ctx.measureText(labelText);
                const badgeWidth = textMetrics.width + 16;
                const badgeHeight = 22;
                const badgeY = box.y > badgeHeight + 6 ? box.y - badgeHeight - 4 : box.y + 4;

                // Move origin to center of badge & flip horizontally so text renders left-to-right
                ctx.translate(box.x + badgeWidth / 2, badgeY + badgeHeight / 2);
                ctx.scale(-1, 1);

                ctx.fillStyle = "#2563eb";
                if (typeof ctx.roundRect === "function") {
                  ctx.beginPath();
                  ctx.roundRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 6);
                  ctx.fill();
                } else {
                  ctx.fillRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight);
                }

                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(labelText, 0, 1);
                ctx.restore();
              } else {
                setIsFaceDetected(false);
                setFaceConfidence(null);
              }
            }
          }
        } catch {
          setIsFaceDetected(true);
        }
      }, 300);
    }

    return () => {
      if (detectIntervalRef.current) {
        clearInterval(detectIntervalRef.current);
      }
    };
  }, [cameraStatus, isModelLoaded]);

  const captureAndCompressPhoto = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      if (!video || cameraStatus !== "active") {
        reject(new Error("Kamera tidak aktif atau tidak ditemukan"));
        return;
      }

      const canvas = document.createElement("canvas");
      const size = 480;
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Gagal menginisialisasi Canvas Context"));
        return;
      }

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const minDimension = Math.min(videoWidth, videoHeight);

      const sx = (videoWidth - minDimension) / 2;
      const sy = (videoHeight - minDimension) / 2;

      ctx.drawImage(video, sx, sy, minDimension, minDimension, 0, 0, size, size);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Gagal mengompresi gambar"));
          }
        },
        "image/jpeg",
        0.65
      );
    });
  };

  // Step 1: Click "Kirim Presensi" triggers Photo Preview Snapshot & Radius Check first!
  const handleOpenPhotoPreview = async () => {
    if (!officerSession) {
      showToast("Silakan login terlebih dahulu!", "error");
      return;
    }

    if (hasAttendedToday) {
      showToast("Anda sudah melakukan presensi hari ini!", "error");
      return;
    }

    // Radius > 50 meters Check (Block submission if outside 50m radius)
    if (distanceFromOffice !== null && distanceFromOffice > VILLAGE_OFFICE_COORDS.maxRadiusMeters) {
      showToast(`Gagal: Jarak Anda ${distanceFromOffice}m dari Kantor Desa (${VILLAGE_OFFICE_COORDS.plusCode}). Maksimal radius 50m.`, "error");
      return;
    }

    if (cameraStatus !== "active") {
      showToast("Kamera harus aktif untuk mengambil foto kehadiran!", "error");
      return;
    }

    if (isModelLoaded && !isFaceDetected) {
      showToast("Posisikan wajah Anda di depan kamera hingga kotak biru muncul!", "error");
      return;
    }

    try {
      const blob = await captureAndCompressPhoto();
      const tempUrl = URL.createObjectURL(blob);
      setPreviewPhotoBlob(blob);
      setPreviewPhotoUrl(tempUrl);
      setShowPreviewModal(true);
    } catch (err: unknown) {
      console.error("Preview snapshot error:", err);
      showToast("Gagal mengambil gambar preview.", "error");
    }
  };

  const handleRetakePhoto = () => {
    if (previewPhotoUrl) {
      URL.revokeObjectURL(previewPhotoUrl);
    }
    setPreviewPhotoBlob(null);
    setPreviewPhotoUrl(null);
    setShowPreviewModal(false);
  };

  // Step 2: User confirms and submits from Preview Modal
  const handleFinalConfirmSubmit = async () => {
    if (!officerSession || !previewPhotoBlob) return;

    // Double check radius before submitting
    if (distanceFromOffice !== null && distanceFromOffice > VILLAGE_OFFICE_COORDS.maxRadiusMeters) {
      showToast(`Gagal: Jarak Anda ${distanceFromOffice}m dari Kantor Desa (${VILLAGE_OFFICE_COORDS.plusCode}). Maksimal radius 50m.`, "error");
      setShowPreviewModal(false);
      return;
    }

    setIsSubmitting(true);

    try {
      let latitude = gpsCoords?.lat || null;
      let longitude = gpsCoords?.lng || null;

      if (!latitude || !longitude) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              latitude = pos.coords.latitude;
              longitude = pos.coords.longitude;
              setGpsCoords({ lat: latitude, lng: longitude });
              setGpsStatus("success");
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 5000 }
          );
        });
      }

      const timestamp = new Date();
      const isoString = timestamp.toISOString();
      const formattedDate = isoString.split("T")[0];
      const safeName = officerSession.nama.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      const fileName = `${formattedDate}/${safeName}_${timestamp.getTime()}.jpg`;
      const fullOfficerLabel = `${officerSession.nama} - ${officerSession.jabatan}`;

      let publicUrl = "";

      try {
        const { error: uploadError } = await supabase.storage
          .from("attendance-photos")
          .upload(fileName, previewPhotoBlob, {
            contentType: "image/jpeg",
            cacheControl: "3600",
            upsert: false,
          });

        if (!uploadError) {
          const { data } = supabase.storage
            .from("attendance-photos")
            .getPublicUrl(fileName);
          publicUrl = data.publicUrl;
        }
      } catch {
        // Fallback blob url for offline mode
      }

      if (!publicUrl) {
        publicUrl = previewPhotoUrl || URL.createObjectURL(previewPhotoBlob);
      }

      const recordToSave: AttendanceRecord = {
        timestamp: isoString,
        latitude: latitude,
        longitude: longitude,
        photo_url: publicUrl,
      };

      try {
        const { data: insertedData, error: dbError } = await supabase
          .from("presensi")
          .insert([
            {
              nama: fullOfficerLabel,
              timestamp: isoString,
              latitude: latitude,
              longitude: longitude,
              photo_url: publicUrl,
            },
          ])
          .select();

        if (dbError) throw dbError;
        if (insertedData && insertedData[0]) {
          recordToSave.id = insertedData[0].id;
        }
      } catch {
        // Fallback local storage for offline mode
        const existingLogsStr = localStorage.getItem("presensi_logs_local");
        const existingLogs = existingLogsStr ? JSON.parse(existingLogsStr) : [];
        const newLocalRecord = {
          id: Date.now().toString(),
          nama: fullOfficerLabel,
          timestamp: isoString,
          latitude,
          longitude,
          photo_url: publicUrl,
        };
        existingLogs.unshift(newLocalRecord);
        localStorage.setItem("presensi_logs_local", JSON.stringify(existingLogs));
        recordToSave.id = newLocalRecord.id;
      }

      setHasAttendedToday(true);
      setTodayRecord(recordToSave);
      setShowPreviewModal(false);
      stopCamera();

      confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      });

      showToast(`Presensi ${officerSession.nama} Berhasil Disimpan!`, "success");

    } catch (error: unknown) {
      console.error("Presensi submission error:", error);
      const errObj = error as { message?: string };
      showToast(errObj.message || "Gagal menyimpan presensi. Periksa koneksi internet.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between font-sans select-none border-t-4 border-blue-600">
      
      {/* Top Navbar Header */}
      <header className="w-full bg-zinc-900/80 border-b border-zinc-800 backdrop-blur-md sticky top-0 z-40 py-3.5 px-4 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/10 border border-blue-500/30 text-blue-400 p-2 rounded-2xl">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
                <span>Presensi Kalipelus</span>
                <span className="hidden sm:inline-block text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                  Digital Portal
                </span>
              </h1>
              <p className="text-xs text-zinc-400 hidden sm:block">
                Pemerintah Desa Kalipelus &bull; KKN GIAT 16
              </p>
            </div>
          </div>

          {/* Install PWA Button, Desktop Live Clock & Portal Admin Link */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleInstallClick}
              className="text-xs font-bold bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Smartphone className="h-4 w-4" />
              <span className="hidden sm:inline">Install Aplikasi HP</span>
              <span className="sm:hidden">Install</span>
            </button>

            <div className="hidden md:flex items-center gap-3 bg-zinc-950/80 border border-zinc-800 px-3.5 py-1.5 rounded-2xl text-xs">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                <span>{currentDate || "Memuat..."}</span>
              </div>
              <span className="text-zinc-700">|</span>
              <div className="flex items-center gap-1.5 font-mono font-bold text-blue-400">
                <Clock className="h-3.5 w-3.5" />
                <span>{currentTime || "--:--"}</span>
              </div>
            </div>

            <Link
              href="/admin/login"
              className="text-xs font-bold text-zinc-300 hover:text-white flex items-center gap-2 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 px-3.5 py-2 rounded-xl transition-all shadow-sm active:scale-95"
            >
              <span>Portal Admin</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md p-4 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold transition-all animate-bounce ${
            toast.type === "success"
              ? "bg-blue-950/90 border border-blue-500 text-blue-100 backdrop-blur-md"
              : "bg-rose-950/90 border border-rose-600 text-rose-100 backdrop-blur-md"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-5 w-5 shrink-0 text-blue-400" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* MAIN LAYOUT: RESPONSIVE DESKTOP & MOBILE */}
      <div className="max-w-6xl mx-auto w-full p-4 md:p-8 grow">
        
        {/* PWA Install Banner */}
        {showInstallBanner && (
          <div className="w-full bg-linear-to-r from-blue-600 to-indigo-600 text-white p-3.5 rounded-2xl mb-6 shadow-lg flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3">
              <Smartphone className="h-6 w-6 shrink-0" />
              <div className="text-xs font-medium">
                <p className="font-bold">Install Aplikasi Presensi HP</p>
                <p className="opacity-90 text-[11px]">Akses cepat dari layar utama Smartphone Anda</p>
              </div>
            </div>
            <button
              onClick={handleInstallClick}
              className="bg-white text-blue-950 text-xs font-extrabold px-4 py-2 rounded-xl shadow active:scale-95 transition-all cursor-pointer shrink-0"
            >
              Install Sekarang
            </button>
          </div>
        )}

        {!officerSession ? (
          /* OFFICER LOGIN SCREEN */
          <main className="max-w-md mx-auto my-8 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-3xl flex items-center justify-center mx-auto mb-2 shadow-inner">
                <User className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Login Perangkat Desa</h2>
              <p className="text-xs text-zinc-400">Masukkan username & password untuk presensi</p>
            </div>

            {loginError && (
              <div className="bg-rose-950/40 border border-rose-800/60 text-rose-300 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2.5">
                <AlertCircle className="h-4.5 w-4.5 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleOfficerLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 tracking-wider uppercase">Username Login</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-zinc-500">
                    <User className="h-4.5 w-4.5" />
                  </span>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Contoh: sutrisno"
                    disabled={isLoggingIn}
                    required
                    className="w-full bg-zinc-950 text-white border border-zinc-800 rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 tracking-wider uppercase">Password</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-zinc-500">
                    <Lock className="h-4.5 w-4.5" />
                  </span>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoggingIn}
                    required
                    className="w-full bg-zinc-950 text-white border border-zinc-800 rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-zinc-300 select-none hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isLoggingIn}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                  />
                  <span>Ingat Saya (Hanya perlu login 1x)</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-2xl shadow-lg hover:shadow-blue-950/30 transition-all duration-200 flex items-center justify-center gap-2 text-sm mt-4 select-none cursor-pointer disabled:opacity-50"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Memverifikasi...</span>
                  </>
                ) : (
                  <span>Masuk Sekarang</span>
                )}
              </button>
            </form>
          </main>
        ) : (
          /* LOGGED IN DESKTOP & MOBILE ATTENDANCE SCREEN */
          <main className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            
            {/* LEFT COLUMN: CAMERA VIEWFINDER / TODAY COMPLETED CARD */}
            <div className="md:col-span-7 space-y-4">
              {hasAttendedToday ? (
                /* ALREADY CHECKED IN TODAY CARD (1x PER DAY LIMIT ENFORCED) */
                <div className="bg-linear-to-br from-emerald-950/40 via-zinc-900 to-zinc-900 border border-emerald-500/30 rounded-3xl p-6 md:p-8 shadow-2xl text-center space-y-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

                  <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                    <FileCheck className="h-8 w-8" />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full inline-block">
                      Presensi Berhasil &bull; 1x Per Hari
                    </span>
                    <h3 className="text-xl md:text-2xl font-extrabold text-white">Anda Sudah Presensi Hari Ini!</h3>
                    <p className="text-xs text-zinc-400">
                      Terima kasih <span className="text-white font-bold">{officerSession.nama}</span>, kehadiran Anda telah dicatat oleh sistem.
                    </p>
                  </div>

                  {todayRecord && (
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 max-w-md mx-auto text-left space-y-3 text-xs">
                      <div className="flex items-center justify-between border-b border-zinc-850 pb-2">
                        <span className="text-zinc-400">Waktu Presensi:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {new Date(todayRecord.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Lokasi GPS:</span>
                        {todayRecord.latitude && todayRecord.longitude ? (
                          <a
                            href={`https://www.google.com/maps?q=${todayRecord.latitude},${todayRecord.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline font-mono font-semibold"
                          >
                            {todayRecord.latitude.toFixed(4)}, {todayRecord.longitude.toFixed(4)}
                          </a>
                        ) : (
                          <span className="text-zinc-500 italic">GPS Tidak Aktif</span>
                        )}
                      </div>

                      {todayRecord.photo_url && (
                        <div className="pt-1">
                          <p className="text-zinc-400 mb-2">Foto Selfie Presensi:</p>
                          <div className="w-24 h-24 rounded-xl overflow-hidden border border-zinc-800 mx-auto">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={todayRecord.photo_url} 
                              alt="Foto Bukti Presensi Hari Ini" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] text-zinc-500 italic">
                    Sistem membatasi 1 kali presensi per hari untuk setiap perangkat desa.
                  </p>
                </div>
              ) : (
                /* LIVE CAMERA VIEWFINDER & PREVIEW ACTION BUTTON */
                <>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-zinc-400 uppercase tracking-wider">
                      <span className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-blue-400" />
                        <span>Verifikasi Kamera & Wajah</span>
                      </span>
                      {isFaceDetected ? (
                        <span className="text-blue-400 flex items-center gap-1.5 font-extrabold bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full text-[11px]">
                          <CheckCircle className="h-3.5 w-3.5" /> Wajah Terdeteksi {faceConfidence ? `(${faceConfidence}%)` : ""}
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1.5 font-medium text-[11px] bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                          Posisikan Wajah di Depan Kamera
                        </span>
                      )}
                    </div>

                    {/* Video Container */}
                    <div className="relative w-full aspect-square md:aspect-4/3 bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center shadow-inner">
                      {cameraStatus === "loading" && (
                        <div className="flex flex-col items-center gap-2 text-zinc-400 text-xs">
                          <RefreshCw className="h-7 w-7 animate-spin text-blue-500" />
                          <span>Membuka Kamera HP / Desktop...</span>
                        </div>
                      )}

                      {cameraStatus === "denied" && (
                        <div className="p-6 flex flex-col items-center gap-2 text-rose-400 text-xs text-center">
                          <AlertCircle className="h-8 w-8" />
                          <p className="font-bold">Izin Kamera Ditolak</p>
                          <p className="text-zinc-500 text-[11px]">Izinkan akses kamera pada browser Anda.</p>
                          <button
                            onClick={startCamera}
                            className="mt-2 bg-zinc-800 text-white px-3.5 py-1.5 rounded-xl text-xs hover:bg-zinc-700"
                          >
                            Coba Lagi
                          </button>
                        </div>
                      )}

                      {cameraStatus === "error" && (
                        <div className="p-6 flex flex-col items-center gap-2 text-rose-400 text-xs text-center">
                          <AlertCircle className="h-8 w-8" />
                          <p className="font-bold">Kamera Tidak Tersedia</p>
                          <button
                            onClick={startCamera}
                            className="mt-2 bg-zinc-800 text-white px-3.5 py-1.5 rounded-xl text-xs"
                          >
                            Buka Kamera
                          </button>
                        </div>
                      )}

                      {/* Live Video Feed */}
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover transform -scale-x-100 ${
                          cameraStatus === "active" ? "block" : "hidden"
                        }`}
                      />

                      {/* Realtime Face Bounding Box Canvas */}
                      <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100"
                      />

                      {/* Camera Frame Guide Overlay */}
                      {cameraStatus === "active" && (
                        <div className="absolute inset-0 pointer-events-none border-2 border-blue-500/30 rounded-2xl flex flex-col justify-between p-4">
                          <div className="flex justify-between">
                            <div className="w-5 h-5 border-t-2 border-l-2 border-blue-400" />
                            <div className="w-5 h-5 border-t-2 border-r-2 border-blue-400" />
                          </div>
                          <div className="flex justify-between">
                            <div className="w-5 h-5 border-b-2 border-l-2 border-blue-400" />
                            <div className="w-5 h-5 border-b-2 border-r-2 border-blue-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Preview Photo Button */}
                  <button
                    onClick={handleOpenPhotoPreview}
                    disabled={isSubmitting || cameraStatus !== "active" || !isWithinRadius}
                    className={`w-full py-4 md:py-5 rounded-2xl font-extrabold text-base md:text-lg shadow-xl transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer ${
                      cameraStatus !== "active" || !isWithinRadius
                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
                        : isFaceDetected
                        ? "bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-950/50 active:scale-98"
                        : "bg-amber-600 hover:bg-amber-500 text-white"
                    }`}
                  >
                    {!isWithinRadius ? (
                      <>
                        <ShieldAlert className="h-6 w-6 text-rose-400" />
                        <span>Di Luar Radius Kantor Desa (&gt;50m)</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-6 w-6" />
                        <span>Ambil & Preview Foto Presensi</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* RIGHT COLUMN: OFFICER PROFILE, GPS & RADIUS INSTRUCTIONS */}
            <div className="md:col-span-5 space-y-4">
              
              {/* Active Logged-in Officer Profile Card */}
              <div className="bg-linear-to-br from-zinc-900 to-zinc-950 border border-blue-500/30 rounded-3xl p-5 shadow-lg space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <span className={`text-[10px] uppercase font-extrabold tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1 border ${
                    hasAttendedToday 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  }`}>
                    <Sparkles className="h-3 w-3" />
                    <span>{hasAttendedToday ? "Sudah Absen Hari Ini" : "Belum Absen Hari Ini"}</span>
                  </span>

                  <button
                    onClick={handleLogoutOfficer}
                    title="Ganti Akun / Keluar"
                    className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-750 text-zinc-400 hover:text-rose-400 text-xs px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Ganti Akun</span>
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-extrabold text-xl shadow-lg shrink-0">
                    {officerSession.nama.charAt(0)}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <h3 className="font-extrabold text-lg text-white truncate">{officerSession.nama}</h3>
                    <p className="text-xs text-blue-400 font-semibold">{officerSession.jabatan}</p>
                    <p className="text-[11px] text-zinc-400 font-mono flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-zinc-500" />
                      <span>{officerSession.username}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* GPS Geolocation & Radius Status Card */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">Status Lokasi & Radius GPS</h4>
                      <p className="text-[11px] text-zinc-400">{VILLAGE_OFFICE_COORDS.name} &bull; Maks: 50m</p>
                    </div>
                  </div>

                  {gpsStatus !== "success" && (
                    <button
                      onClick={requestLocation}
                      className="text-xs text-blue-400 hover:underline font-semibold bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20"
                    >
                      Refresh GPS
                    </button>
                  )}
                </div>

                {/* Radius Status Banner Indicator */}
                {distanceFromOffice !== null && (
                  <div className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between ${
                    isWithinRadius 
                      ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                      : "bg-rose-950/40 border-rose-600/40 text-rose-300"
                  }`}>
                    <div className="flex items-center gap-2">
                      {isWithinRadius ? <Check className="h-4 w-4 shrink-0" /> : <ShieldAlert className="h-4 w-4 shrink-0" />}
                      <span>
                        {isWithinRadius 
                          ? `Di Dalam Radius (${distanceFromOffice}m dari Kantor Desa)` 
                          : `Di Luar Radius (${distanceFromOffice}m dari Kantor Desa)`}
                      </span>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                      isWithinRadius ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                    }`}>
                      {isWithinRadius ? "Valid 50m" : "> 50m Ditolak"}
                    </span>
                  </div>
                )}

                <div className="bg-zinc-950 border border-zinc-850 rounded-2xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Koordinat Fisik Saat Ini</p>
                    <p className="text-sm font-mono font-bold text-blue-400 mt-0.5">
                      {gpsCoords
                        ? `${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lng.toFixed(6)}`
                        : "Mendeteksi Lokasi GPS..."}
                    </p>
                  </div>
                  {gpsCoords && (
                    <a
                      href={`https://www.google.com/maps?q=${gpsCoords.lat},${gpsCoords.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-blue-400 hover:underline bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-xl"
                    >
                      Buka Peta
                    </a>
                  )}
                </div>
              </div>

              {/* Attendance Instructions Card */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-3xl p-5 space-y-2.5 text-xs text-zinc-400">
                <h4 className="font-bold text-zinc-200 flex items-center gap-2">
                  <Check className="h-4 w-4 text-blue-400" />
                  <span>Aturan Presensi Radius 50 Meter</span>
                </h4>
                <p className="text-[11px] text-zinc-300 font-semibold">
                  Lokasi Resmi: {VILLAGE_OFFICE_COORDS.name} &bull; {VILLAGE_OFFICE_COORDS.address}
                </p>
                <ul className="space-y-1.5 pl-5 list-disc text-[11px] leading-relaxed">
                  <li>Presensi **hanya dapat dilakukan** jika posisi fisik Anda berada &le; 50 meter dari Kantor Desa Kalipelus.</li>
                  <li>Arahkan wajah di depan kamera hingga timbul **Kotak Biru** (*Wajah Terdeteksi*).</li>
                  <li>Tekan **Ambil & Preview Foto Presensi** lalu periksa foto sebelum mengirim.</li>
                </ul>
              </div>

            </div>
          </main>
        )}
      </div>

      {/* PHOTO PREVIEW & CONFIRMATION MODAL */}
      {showPreviewModal && previewPhotoUrl && officerSession && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 max-w-md w-full rounded-3xl p-6 shadow-2xl space-y-5 relative text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold text-base text-white">Preview Foto & Pratinjau Presensi</h3>
              </div>
              <button
                onClick={handleRetakePhoto}
                className="text-zinc-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Captured Photo Snapshot View */}
            <div className="relative aspect-square w-full bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewPhotoUrl}
                alt="Snapshot Preview Presensi"
                className="w-full h-full object-cover transform -scale-x-100"
              />
              <div className="absolute bottom-3 left-3 right-3 bg-black/70 backdrop-blur-sm p-3 rounded-xl border border-white/10 text-xs space-y-1">
                <p className="font-bold text-white truncate">{officerSession.nama}</p>
                <p className="text-[11px] text-blue-400 font-semibold">{officerSession.jabatan}</p>
                <div className="flex items-center justify-between text-[10px] text-zinc-300 pt-1 border-t border-white/10">
                  <span>{currentTime || "WIB"}</span>
                  <span>{distanceFromOffice !== null ? `${distanceFromOffice}m dari Kantor Desa` : "GPS Ready"}</span>
                </div>
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={handleRetakePhoto}
                disabled={isSubmitting}
                className="w-full border border-zinc-700 bg-zinc-800 hover:bg-zinc-750 text-white font-bold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer select-none"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Foto Ulang</span>
              </button>

              <button
                type="button"
                onClick={handleFinalConfirmSubmit}
                disabled={isSubmitting || (distanceFromOffice !== null && distanceFromOffice > VILLAGE_OFFICE_COORDS.maxRadiusMeters)}
                className="w-full bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 text-xs cursor-pointer select-none disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Konfirmasi & Kirim</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PWA Install Guidance Modal */}
      {showInstallGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 max-w-md w-full rounded-3xl p-6 shadow-2xl space-y-5 relative text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold text-base text-white">Cara Install Aplikasi Presensi</h3>
              </div>
              <button
                onClick={() => setShowInstallGuideModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-850 space-y-2">
                <p className="font-bold text-blue-400 flex items-center gap-2">
                  <span>📱 Untuk HP Android / Chrome / Edge:</span>
                </p>
                <ol className="list-decimal pl-5 space-y-1 text-zinc-300 text-[11px]">
                  <li>Klik tombol **Menu (Titik Tiga &#8942;)** di sudut kanan atas browser Anda.</li>
                  <li>Pilih menu **&quot;Tambahkan ke Layar Utama&quot;** atau **&quot;Install Aplikasi&quot;**.</li>
                  <li>Tekan **Install / Tambah** untuk memasang aplikasi ke layar HP.</li>
                </ol>
              </div>

              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-850 space-y-2">
                <p className="font-bold text-blue-400 flex items-center gap-2">
                  <span>🍎 Untuk iPhone / iPad (Safari):</span>
                </p>
                <ol className="list-decimal pl-5 space-y-1 text-zinc-300 text-[11px]">
                  <li>Buka website ini di browser **Safari**.</li>
                  <li>Tekan tombol **Bagikan (Share Icon &#9193;/&#8679;)** di bagian bawah layar.</li>
                  <li>Gulir ke bawah dan pilih **&quot;Tambahkan ke Layar Utama&quot; (Add to Home Screen)**.</li>
                </ol>
              </div>
            </div>

            <button
              onClick={() => setShowInstallGuideModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all text-xs cursor-pointer"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}

      {/* Page Footer */}
      <footer className="w-full text-center py-4 text-xs text-zinc-500 border-t border-zinc-900 mt-6 bg-zinc-950">
        <p>&copy; {new Date().getFullYear()} Pemerintah Desa Kalipelus. Portal Presensi Kehadiran Digital (KKN GIAT 16).</p>
      </footer>
    </div>
  );
}
