"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { UserProfile, Paginated } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Search, Plus, Pencil, UserX, Loader2 } from "lucide-react";

const ROLES = ["shipping_company", "consultancy_admin", "surveyor", "viewer"];

const ROLE_COLORS: Record<string, string> = {
  consultancy_admin: "bg-purple-50 text-purple-700 ring-purple-200",
  surveyor: "bg-blue-50 text-blue-700 ring-blue-200",
  shipping_company: "bg-teal-50 text-teal-700 ring-teal-200",
  viewer: "bg-slate-100 text-slate-600 ring-slate-200",
};

const ROLE_AVATAR_COLORS: Record<string, string> = {
  consultancy_admin: "bg-purple-100 text-purple-700",
  surveyor: "bg-blue-100 text-blue-700",
  shipping_company: "bg-teal-100 text-teal-700",
  viewer: "bg-slate-100 text-slate-600",
};

type EditForm = { name: string; role: string; is_active: boolean; company_id: string };
type CreateForm = { name: string; email: string; password: string; role: string; company_id: string };

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

const FILTER_CLASS = "border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors";
const LABEL_CLASS = "text-[10px] font-semibold text-slate-500 uppercase tracking-wide";

export default function UsersPage() {
  const [result, setResult] = useState<Paginated<UserProfile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [skip, setSkip] = useState(0);
  const LIMIT = 20;

  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", role: "viewer", is_active: true, company_id: "" });
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({ name: "", email: "", password: "", role: "surveyor", company_id: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [deleteUser, setDeleteUser] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ skip: String(skip), limit: String(LIMIT) });
    if (search) params.set("search", search);
    if (roleFilter) params.set("role", roleFilter);
    api.get<Paginated<UserProfile>>(`/api/users?${params}`)
      .then(setResult)
      .finally(() => setLoading(false));
  }, [skip, search, roleFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSkip(0); }, [search, roleFilter]);

  const openEdit = (u: UserProfile) => {
    setEditUser(u);
    setEditForm({ name: u.name, role: u.role, is_active: u.is_active, company_id: u.company_id || "" });
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await api.put(`/api/users/${editUser.id}`, { name: editForm.name, role: editForm.role, is_active: editForm.is_active, company_id: editForm.company_id || undefined });
      setEditUser(null);
      load();
    } finally { setSaving(false); }
  };

  const handleCreate = async () => {
    if (!createForm.name || !createForm.email || !createForm.password) {
      setCreateError("Name, email, and password are required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await api.post("/api/users", { ...createForm, company_id: createForm.company_id || undefined });
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", role: "surveyor", company_id: "" });
      load();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create user");
    } finally { setCreating(false); }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      await api.delete(`/api/users/${deleteUser.id}`);
      setDeleteUser(null);
      load();
    } finally { setDeleting(false); }
  };

  // Role summary counts
  const roleCounts = result?.items.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {}) ?? {};

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Users"
        subtitle="Manage user accounts and access roles"
        actions={
          <Button onClick={() => setCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700 h-8 text-sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add User
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm w-56 border-slate-200" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={FILTER_CLASS}>
          <option value="">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
        </select>
        {/* Role summary pills */}
        {!loading && result && Object.keys(roleCounts).length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            {Object.entries(roleCounts).map(([role, count]) => (
              <span key={role} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${ROLE_COLORS[role] || "bg-slate-100 ring-slate-200 text-slate-500"}`}>
                {count} {role.split("_")[0]}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><Skeleton className="w-7 h-7 rounded-full" /><Skeleton className="h-4 w-28" /></div></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-7 w-20 ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">User</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {result?.items.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm">No users found</td></tr>
                  ) : (
                    result?.items.map((u) => (
                      <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-blue-50/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${ROLE_AVATAR_COLORS[u.role] || "bg-slate-100 text-slate-600"}`}>
                              {getInitials(u.name)}
                            </div>
                            <span className="font-medium text-slate-800">{u.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 capitalize ${ROLE_COLORS[u.role] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                            {u.role.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Inactive</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(u)}>
                              <Pencil className="w-3 h-3 mr-1" /> Edit
                            </Button>
                            {u.is_active && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteUser(u)}>
                                <UserX className="w-3 h-3 mr-1" /> Deactivate
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Pagination total={result?.total ?? 0} skip={skip} limit={LIMIT} onChange={setSkip} />
        </>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className={LABEL_CLASS}>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className={LABEL_CLASS}>Role</Label>
              <select value={editForm.role} onChange={(e) => setEditForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="is_active" checked={editForm.is_active} onChange={(e) => setEditForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-slate-300" />
              <Label htmlFor="is_active" className="text-sm font-normal text-slate-700">Active account</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} className="h-8 text-sm">Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} className="h-8 text-sm bg-blue-600 hover:bg-blue-700">
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Saving…</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); setCreateError(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { key: "name", label: "Full Name", type: "text", placeholder: "Jane Smith" },
              { key: "email", label: "Email Address", type: "email", placeholder: "jane@company.com" },
              { key: "password", label: "Password", type: "password", placeholder: "Min 6 characters" },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label className={LABEL_CLASS}>{label} <span className="text-red-500">*</span></Label>
                <Input
                  type={type}
                  value={(createForm as any)[key]}
                  onChange={(e) => setCreateForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="h-9 text-sm"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label className={LABEL_CLASS}>Role</Label>
              <select value={createForm.role} onChange={(e) => setCreateForm(f => ({ ...f, role: e.target.value }))}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            {createError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{createError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="h-8 text-sm">Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="h-8 text-sm bg-blue-600 hover:bg-blue-700">
              {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Creating…</> : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirmation */}
      <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deactivate User</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            Deactivate <strong className="text-slate-800">{deleteUser?.name}</strong>? They will no longer be able to log in.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)} className="h-8 text-sm">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="h-8 text-sm">
              {deleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />Deactivating…</> : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
