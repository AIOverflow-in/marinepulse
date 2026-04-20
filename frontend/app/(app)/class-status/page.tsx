"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Upload,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
  Ship,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ClassStatusReport } from "@/types";

function StatusBadge({ status }: { status: ClassStatusReport["status"] }) {
  if (status === "processing") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
      <Loader2 className="w-3 h-3 animate-spin" /> Analyzing…
    </span>
  );
  if (status === "complete") return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
      <CheckCircle2 className="w-3 h-3" /> Complete
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
}

export default function ClassStatusPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reports, setReports] = useState<ClassStatusReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      const data = await api.get<{ items: ClassStatusReport[]; total: number }>(
        "/api/class-status-reports?limit=50"
      );
      setReports(data.items);
      setTotal(data.total);
      return data.items;
    } catch { return null; }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  useEffect(() => {
    const hasProcessing = reports.some((r) => r.status === "processing");
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const updated = await fetchReports();
        if (updated && !updated.some((r) => r.status === "processing")) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
        }
      }, 4000);
    } else if (!hasProcessing && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [reports, fetchReports]);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) { setError("Only PDF files are accepted."); return; }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.upload<{ id: string }>("/api/class-status-reports/analyze", fd);
      await fetchReports();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; };

  const handleDelete = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    try {
      await api.delete(`/api/class-status-reports/${reportId}`);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      setTotal((prev) => prev - 1);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Delete failed"); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-5 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Class Status Reports
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload a Ship State Survey Status PDF — AI extracts overdue surveys, findings, and action tasks.
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Upload PDF
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Drop zone */}
      {!loading && reports.length === 0 && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-16 flex flex-col items-center gap-4 text-center hover:border-blue-400 hover:bg-blue-50/40 transition-all cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
            <FileText className="w-7 h-7 text-slate-400" />
          </div>
          <div>
            <p className="text-slate-700 font-semibold">Drop a Class Status PDF here</p>
            <p className="text-slate-400 text-sm mt-1">
              or click to browse — IRS, DNV, Lloyd&apos;s, BV reports supported
            </p>
          </div>
          <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">PDF · max 30 MB</span>
        </div>
      )}

      {/* Reports list */}
      {reports.length > 0 && (
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              onClick={() => r.status === "complete" && router.push(`/class-status/${r.id}`)}
              className={`bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm transition-all ${
                r.status === "complete" ? "cursor-pointer hover:shadow-md hover:border-slate-300" : ""
              }`}
            >
              {/* Icon */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                r.status === "failed" ? "bg-red-50" : r.status === "processing" ? "bg-blue-50" : "bg-blue-50"
              }`}>
                <Ship className={`w-5 h-5 ${
                  r.status === "failed" ? "text-red-500" : "text-blue-600"
                }`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 truncate">
                    {r.vessel_name || r.filename}
                  </span>
                  {r.imo_number && <span className="text-xs text-slate-400">IMO {r.imo_number}</span>}
                  {r.ir_number && <span className="text-xs text-slate-400">IR# {r.ir_number}</span>}
                  {r.flag && <span className="text-xs text-slate-400">{r.flag}</span>}
                </div>

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <StatusBadge status={r.status} />

                  {r.status === "complete" && (
                    <>
                      {r.overdue_count > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                          <AlertTriangle className="w-3 h-3" /> {r.overdue_count} overdue
                        </span>
                      )}
                      {r.upcoming_count > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" /> {r.upcoming_count} upcoming
                        </span>
                      )}
                      {r.findings_count > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                          {r.findings_count} findings
                        </span>
                      )}
                      {r.overdue_count === 0 && r.findings_count === 0 && (
                        <span className="text-xs text-emerald-600 font-medium">All clear</span>
                      )}
                    </>
                  )}

                  {r.status === "failed" && r.error_message && (
                    <span className="text-xs text-red-500 truncate max-w-xs">{r.error_message}</span>
                  )}

                  <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto">
                    <Clock className="w-3 h-3" />
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {r.status === "complete" && <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}

              <button
                onClick={(e) => handleDelete(e, r.id)}
                className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                title="Delete report"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      )}

      {!loading && reports.length > 0 && (
        <p className="text-xs text-slate-400 text-center">{total} report{total !== 1 ? "s" : ""} total</p>
      )}
    </div>
  );
}
