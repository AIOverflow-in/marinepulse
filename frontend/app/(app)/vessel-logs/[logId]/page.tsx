"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import type { VesselWeeklyLog } from "@/types";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Loader2,
  FileText,
  Wrench,
  Camera,
  Shield,
  Gauge,
  ChevronRight,
  Send,
  Bot,
} from "lucide-react";

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-bold text-slate-900 mt-5 mb-2 pb-1.5 border-b border-slate-100">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-bold text-slate-800 mt-5 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-blue-500 rounded-full inline-block flex-shrink-0" />
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mt-3 mb-1">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-slate-700 leading-relaxed my-1.5">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="my-1.5 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1.5 space-y-0.5 list-decimal list-inside">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm text-slate-600 flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
            <span>{children}</span>
          </li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-slate-800">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-slate-600">{children}</em>
        ),
        hr: () => <hr className="my-4 border-slate-100" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-blue-200 pl-3 my-2 text-slate-500 italic text-sm">{children}</blockquote>
        ),
        code: ({ children }) => (
          <code className="text-xs font-mono bg-slate-100 text-slate-700 px-1 py-0.5 rounded">{children}</code>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// ─── Template completion row ──────────────────────────────────────────────────

function TemplateRow({
  label,
  icon: Icon,
  done,
  count,
  href,
}: {
  label: string;
  icon: React.ElementType;
  done: boolean;
  count?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors group"
    >
      <div className="flex items-center gap-3">
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        ) : (
          <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />
        )}
        <Icon className={`w-4 h-4 flex-shrink-0 ${done ? "text-emerald-500" : "text-slate-400"}`} />
        <span className={`text-sm font-medium ${done ? "text-slate-800" : "text-slate-500"}`}>
          {label}
        </span>
        {count && (
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
    </Link>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WeeklyLogDetailPage() {
  const { logId } = useParams<{ logId: string }>();
  const router = useRouter();

  const [log, setLog] = useState<VesselWeeklyLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchLog();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [logId]);

  async function fetchLog() {
    try {
      const data = await api.get<VesselWeeklyLog>(`/api/vessel-logs/${logId}`);
      setLog(data);

      // If submitted but no report yet, poll every 3s
      if (data.status === "submitted" && !data.ai_report) {
        setReportLoading(true);
        if (!pollingRef.current) {
          pollingRef.current = setInterval(async () => {
            try {
              const updated = await api.get<VesselWeeklyLog>(`/api/vessel-logs/${logId}`);
              setLog(updated);
              if (updated.ai_report) {
                setReportLoading(false);
                clearInterval(pollingRef.current!);
                pollingRef.current = null;
              }
            } catch { /* ignore */ }
          }, 3000);
        }
      }
    } catch {
      router.push("/vessel-logs");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!log) return;
    setSubmitting(true);
    try {
      await api.post(`/api/vessel-logs/${logId}/submit`, {});
      setReportLoading(true);
      await fetchLog();
    } catch (err: unknown) {
      alert((err as Error).message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!log) return null;

  const completionCount = [
    log.has_safety_checks,
    log.has_maintenance_log,
    (log.photo_count || 0) > 0,
    (log.drill_count || 0) > 0,
    log.has_me_performance,
  ].filter(Boolean).length;

  const allDone = completionCount === 5;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm text-slate-500">
        <Link href="/vessel-logs" className="hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Vessel Logs
        </Link>
        <span>/</span>
        <span className="text-slate-800 font-medium">
          {log.vessel_name} — Week {log.week_number}, {log.year}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{log.vessel_name}</h1>
          <p className="text-slate-500 mt-0.5">
            Week {String(log.week_number).padStart(2, "0")}, {log.year}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-sm ${i < completionCount ? "bg-emerald-500" : "bg-slate-200"}`}
                />
              ))}
            </div>
            <span className="text-slate-500 font-medium">{completionCount}/5</span>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
            log.status === "submitted"
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : log.status === "reviewed"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}>
            {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
          </span>
        </div>
      </div>

      {/* Anomaly alerts */}
      {log.anomalies && log.anomalies.length > 0 && (
        <div className="mb-5 space-y-2">
          {log.anomalies.map((a, i) => (
            <div key={i} className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {/* 5 Templates */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">Weekly Templates</h2>
        </div>
        <div className="divide-y divide-slate-100">
          <TemplateRow
            label="Safety System Checks"
            icon={Shield}
            done={!!log.has_safety_checks}
            href={`/vessel-logs/${logId}/safety-checks`}
          />
          <TemplateRow
            label="Maintenance Log"
            icon={Wrench}
            done={!!log.has_maintenance_log}
            href={`/vessel-logs/${logId}/maintenance-log`}
          />
          <TemplateRow
            label="Photo Report"
            icon={Camera}
            done={(log.photo_count || 0) > 0}
            count={(log.photo_count || 0) > 0 ? `${log.photo_count} photos` : undefined}
            href={`/vessel-logs/${logId}/photos`}
          />
          <TemplateRow
            label="Drills & Training"
            icon={FileText}
            done={(log.drill_count || 0) > 0}
            count={(log.drill_count || 0) > 0 ? `${log.drill_count} drills` : undefined}
            href={`/vessel-logs/${logId}/drills`}
          />
          <TemplateRow
            label="Engine Performance"
            icon={Gauge}
            done={!!log.has_me_performance}
            href={`/vessel-logs/${logId}/me-performance`}
          />
        </div>
      </div>

      {/* Submit button */}
      {log.status === "draft" && (
        <div className="mb-6">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              allDone
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit &amp; Generate AI Report
                {!allDone && <span className="ml-1 text-xs font-normal opacity-70">({completionCount}/5 complete)</span>}
              </>
            )}
          </button>
          {!allDone && (
            <p className="text-xs text-slate-400 text-center mt-1.5">
              You can submit now or complete all 5 templates first for a full AI report.
            </p>
          )}
        </div>
      )}

      {/* AI Report */}
      {(log.status === "submitted" || log.status === "reviewed") && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-500" />
              <h2 className="font-semibold text-slate-800">AI Weekly Report</h2>
            </div>
            {log.ai_report && (
              <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                GPT-5.4
              </span>
            )}
          </div>
          <div className="px-6 py-5">
            {reportLoading ? (
              <div className="flex items-center gap-3 py-8 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Generating superintendent report…</p>
                  <p className="text-xs text-slate-400 mt-0.5">Analysing all 5 templates with GPT-4o</p>
                </div>
              </div>
            ) : log.ai_report ? (
              <MarkdownBlock text={log.ai_report} />
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">Report not yet generated.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

