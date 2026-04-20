"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { MaintenancePhoto } from "@/types";
import {
  ArrowLeft,
  Loader2,
  Upload,
  Trash2,
  ImageOff,
  Camera,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  mooring_wires: "Mooring Wires",
  ig_system: "IG System",
  deck_cleaning: "Deck Cleaning",
  engine_room: "Engine Room",
  painting: "Painting",
  structural: "Structural",
  fire_fighting: "Fire Fighting",
  electrical: "Electrical",
  lsa_equipment: "LSA Equipment",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  mooring_wires: "bg-blue-100 text-blue-700",
  ig_system: "bg-violet-100 text-violet-700",
  deck_cleaning: "bg-cyan-100 text-cyan-700",
  engine_room: "bg-orange-100 text-orange-700",
  painting: "bg-yellow-100 text-yellow-700",
  structural: "bg-stone-100 text-stone-700",
  fire_fighting: "bg-red-100 text-red-700",
  electrical: "bg-indigo-100 text-indigo-700",
  lsa_equipment: "bg-emerald-100 text-emerald-700",
  other: "bg-slate-100 text-slate-700",
};

interface PendingPhoto {
  file: File;
  preview: string;
  caption: string;
  category: string;
  location_tag: string;
  uploading: boolean;
  error?: string;
}

export default function PhotosPage() {
  const { logId } = useParams<{ logId: string }>();
  const [photos, setPhotos] = useState<MaintenancePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPhotos();
  }, [logId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lightboxIdx === null) return;
      if (e.key === "Escape") setLightboxIdx(null);
      if (e.key === "ArrowRight") setLightboxIdx((i) => i === null ? null : Math.min(i + 1, photos.length - 1));
      if (e.key === "ArrowLeft") setLightboxIdx((i) => i === null ? null : Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, photos.length]);

  async function fetchPhotos() {
    try {
      const data = await api.get<MaintenancePhoto[]>(`/api/vessel-logs/${logId}/photos`);
      setPhotos(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const newPending: PendingPhoto[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        caption: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        category: "other",
        location_tag: "",
        uploading: false,
      }));
    setPending((prev) => [...prev, ...newPending]);
  }

  function updatePending(idx: number, field: keyof PendingPhoto, value: string) {
    setPending((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function removePending(idx: number) {
    setPending((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function uploadAll() {
    const snapshot = pending.filter((p) => !p.uploading);
    if (snapshot.length === 0) return;

    setPending((prev) => prev.map((p) => (p.uploading ? p : { ...p, uploading: true, error: undefined })));

    const uploaded: MaintenancePhoto[] = [];
    const errors: { preview: string; message: string }[] = [];

    await Promise.all(
      snapshot.map(async (p) => {
        try {
          const fd = new FormData();
          fd.append("file", p.file);
          fd.append("caption", p.caption);
          fd.append("category", p.category);
          if (p.location_tag) fd.append("location_tag", p.location_tag);

          const token = typeof window !== "undefined" ? localStorage.getItem("mp_token") : null;
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || ""}/api/vessel-logs/${logId}/photos`,
            {
              method: "POST",
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: fd,
            }
          );
          if (!res.ok) throw new Error(await res.text());
          const photo: MaintenancePhoto = await res.json();
          uploaded.push(photo);
          URL.revokeObjectURL(p.preview);
        } catch (err: unknown) {
          errors.push({ preview: p.preview, message: (err as Error).message || "Upload failed" });
        }
      })
    );

    if (uploaded.length > 0) setPhotos((prev) => [...prev, ...uploaded]);

    const uploadedPreviews = new Set(
      snapshot
        .filter((p) => !errors.find((e) => e.preview === p.preview))
        .map((p) => p.preview)
    );
    setPending((prev) =>
      prev
        .filter((p) => !uploadedPreviews.has(p.preview))
        .map((p) => {
          const err = errors.find((e) => e.preview === p.preview);
          return err ? { ...p, uploading: false, error: err.message } : p;
        })
    );
  }

  async function deletePhoto(photoId: string) {
    setDeleting(photoId);
    try {
      await api.delete(`/api/vessel-logs/${logId}/photos/${photoId}`);
      setPhotos((prev) => {
        const next = prev.filter((p) => p.id !== photoId);
        // adjust lightbox index if needed
        setLightboxIdx((idx) => {
          if (idx === null) return null;
          const deletedIdx = prev.findIndex((p) => p.id === photoId);
          if (deletedIdx < 0) return idx;
          if (deletedIdx === idx) return next.length > 0 ? Math.min(idx, next.length - 1) : null;
          if (deletedIdx < idx) return idx - 1;
          return idx;
        });
        return next;
      });
    } catch {
      /* ignore */
    } finally {
      setDeleting(null);
    }
  }

  function getPhotoUrl(photo: MaintenancePhoto) {
    return `${process.env.NEXT_PUBLIC_API_URL || ""}/api/vessel-logs/${logId}/photos/${photo.id}/file`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const uploadingCount = pending.filter((p) => p.uploading).length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm text-slate-500">
        <Link href={`/vessel-logs/${logId}`} className="hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Log
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">Photo Report</span>
      </div>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Maintenance Photo Report</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Weekly work documentation — {photos.length} photo{photos.length !== 1 ? "s" : ""} uploaded
          </p>
        </div>
        {pending.length > 0 && (
          <button
            onClick={uploadAll}
            disabled={uploadingCount > 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {uploadingCount > 0 ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
            ) : (
              <><Upload className="w-3.5 h-3.5" /> Upload {pending.length} Photo{pending.length !== 1 ? "s" : ""}</>
            )}
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 mb-6 text-center transition-colors cursor-pointer ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <Camera className="w-8 h-8 mx-auto mb-3 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">Drag & drop photos here, or click to select</p>
        <p className="text-xs text-slate-400 mt-1">JPG, PNG, WebP — compressed to &lt;200KB automatically</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* Pending previews */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Pending Upload ({pending.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pending.map((p, idx) => (
              <div
                key={idx}
                className={`bg-white border rounded-xl overflow-hidden ${
                  p.error ? "border-red-300" : "border-slate-200"
                }`}
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.preview}
                    alt="preview"
                    className="w-full h-40 object-cover"
                  />
                  {p.uploading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  )}
                  <button
                    onClick={() => removePending(idx)}
                    disabled={p.uploading}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-3 space-y-2">
                  <input
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="Caption / description"
                    value={p.caption}
                    onChange={(e) => updatePending(idx, "caption", e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={p.category}
                      onChange={(e) => updatePending(idx, "category", e.target.value)}
                    >
                      {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    <input
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="Location (optional)"
                      value={p.location_tag}
                      onChange={(e) => updatePending(idx, "location_tag", e.target.value)}
                    />
                  </div>
                  {p.error && (
                    <p className="text-xs text-red-600">{p.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded photos grid */}
      {photos.length === 0 && pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <ImageOff className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">No photos uploaded yet</p>
        </div>
      ) : photos.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Uploaded Photos
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo, idx) => (
              <div
                key={photo.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden group cursor-pointer"
                onClick={() => setLightboxIdx(idx)}
              >
                <div className="relative h-36 bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getPhotoUrl(photo)}
                    alt={photo.caption}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                    disabled={deleting === photo.id}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                  >
                    {deleting === photo.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-slate-700 truncate leading-tight">{photo.caption}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[photo.category] || CATEGORY_COLORS.other}`}>
                      {CATEGORY_LABELS[photo.category] || photo.category}
                    </span>
                    <span className="text-[10px] text-slate-400">{photo.file_size_kb}KB</span>
                  </div>
                  {photo.location_tag && (
                    <p className="text-[10px] text-slate-400 mt-1 truncate">{photo.location_tag}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Lightbox */}
      {lightboxIdx !== null && photos[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          {/* Prev */}
          {lightboxIdx > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i! - 1); }}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPhotoUrl(photos[lightboxIdx])}
            alt={photos[lightboxIdx].caption}
            className="max-h-[88vh] max-w-[88vw] object-contain rounded-lg shadow-2xl cursor-zoom-out"
            onClick={() => setLightboxIdx(null)}
          />

          {/* Next */}
          {lightboxIdx < photos.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx((i) => i! + 1); }}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Close */}
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Caption + counter */}
          <div className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
            <p className="text-white/90 text-sm font-medium drop-shadow">{photos[lightboxIdx].caption}</p>
            {photos[lightboxIdx].location_tag && (
              <p className="text-white/50 text-xs mt-0.5">{photos[lightboxIdx].location_tag}</p>
            )}
            <p className="text-white/40 text-xs mt-1">{lightboxIdx + 1} / {photos.length}</p>
          </div>
        </div>
      )}
    </div>
  );
}
