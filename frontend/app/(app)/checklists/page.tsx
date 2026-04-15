"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser } from "@/lib/api";
import { ChecklistTemplate, Paginated } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Upload, Search, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function ChecklistsPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const user = getStoredUser();
    setIsAdmin(user?.role === "consultancy_admin");
  }, []);

  const [result, setResult] = useState<Paginated<ChecklistTemplate> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChecklistTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const LIMIT = 12;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ skip: String(skip), limit: String(LIMIT) });
    if (search) params.set("search", search);
    api.get<Paginated<ChecklistTemplate>>(`/api/checklists?${params}`)
      .then(setResult)
      .finally(() => setLoading(false));
  }, [skip, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSkip(0); }, [search]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/api/checklists/${deleteId}`);
      setDeleteId(null);
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Checklists"
        subtitle="Inspection checklist templates"
        actions={
          isAdmin ? (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 text-sm" onClick={() => router.push("/checklists/upload")}>
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Import CSV
            </Button>
          ) : undefined
        }
      />

      {/* Search + count */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-60 border-slate-200"
          />
        </div>
        {!loading && result && (
          <span className="ml-auto text-xs text-slate-400 tabular-nums">{result.total} templates</span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : result?.items.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600">{search ? "No templates match your search" : "No checklist templates yet"}</p>
          <p className="text-xs text-slate-400 mt-1">
            {search ? "Try adjusting your search" : "Import a CSV to create your first template"}
          </p>
          {!search && isAdmin && (
            <Button className="mt-3 h-8 text-xs" size="sm" variant="outline" onClick={() => router.push("/checklists/upload")}>
              <Upload className="w-3.5 h-3.5 mr-1" /> Import CSV
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {result?.items.map((t) => (
              <Card key={t.id} className="hover:shadow-sm transition-shadow border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-violet-50 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ring-violet-100">
                      <FileText className="w-4 h-4 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800 text-sm truncate">{t.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400 tabular-nums">{t.total_items} items</span>
                        <span className="text-slate-200">·</span>
                        <span className="text-xs text-slate-400">{t.version}</span>
                        <span className="text-slate-200">·</span>
                        <span className="text-xs text-slate-400">{format(new Date(t.created_at), "d MMM yyyy")}</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => { setDeleteId(t.id); setDeleteTarget(t); }}
                        className="text-slate-300 hover:text-red-400 transition-colors ml-1 mt-0.5"
                        title="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination total={result?.total ?? 0} skip={skip} limit={LIMIT} onChange={setSkip} />
        </>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) { setDeleteId(null); setDeleteTarget(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            Delete <span className="font-semibold text-slate-800">{deleteTarget?.name}</span>? Existing inspections using it will not be affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteId(null); setDeleteTarget(null); }} className="h-8 text-sm">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="h-8 text-sm">
              {deleting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Deleting…</> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
