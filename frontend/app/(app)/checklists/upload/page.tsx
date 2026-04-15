"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FileText, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface ParsedItem {
  category: string;
  item_code: string;
  item_name: string;
  weight: number;
}

export default function UploadChecklistPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("v1.0");
  const [preview, setPreview] = useState<ParsedItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      const items: ParsedItem[] = result.data.map((row, i) => ({
        category: row.Category || row.category || "",
        item_code: row.ItemCode || row.item_code || `ITEM-${i + 1}`,
        item_name: row.ItemName || row.item_name || row["Inspection Item"] || "",
        weight: Math.min(3, Math.max(1, parseInt(row.Weight || row.weight || "1", 10) || 1)),
      })).filter((r) => r.category && r.item_name);
      setPreview(items);
    };
    reader.readAsText(f);
  };

  const handleUpload = async () => {
    if (!file || !name.trim()) {
      setError("Please provide a name and select a CSV file.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("version", version);
      await api.upload("/api/checklists/upload", formData);
      setSuccess(true);
      setTimeout(() => router.push("/checklists"), 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const categories = Array.from(new Set(preview.map((i) => i.category)));

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/checklists" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">Import Checklist CSV</h1>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Template Name</Label>
            <Input placeholder="e.g. Standard Tanker Inspection 2025" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Version</Label>
            <Input placeholder="v1.0" value={version} onChange={(e) => setVersion(e.target.value)} className="w-32" />
          </div>
          <div className="space-y-1.5">
            <Label>CSV File</Label>
            <p className="text-xs text-slate-400">Expected columns: Category, ItemCode, ItemName, Weight (1-3)</p>
            <div
              className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-300 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                {file ? file.name : "Click to select CSV file"}
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>}
          {success && (
            <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Uploaded successfully! Redirecting...
            </p>
          )}

          <Button onClick={handleUpload} disabled={!file || !name || uploading} className="bg-blue-600 hover:bg-blue-700 w-full">
            <Upload className="w-4 h-4 mr-1" />
            {uploading ? "Uploading..." : `Upload ${preview.length > 0 ? `(${preview.length} items)` : ""}`}
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      {preview.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Preview — {preview.length} items across {categories.length} categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {categories.map((cat) => (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-600">{cat}</span>
                    <Badge variant="outline" className="text-xs">{preview.filter((i) => i.category === cat).length}</Badge>
                  </div>
                  {preview.filter((i) => i.category === cat).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1 text-sm border-b last:border-0">
                      <span className="text-slate-600 flex-1 truncate">{item.item_name}</span>
                      <span className={`text-xs ml-3 font-medium ${item.weight === 3 ? "text-red-500" : item.weight === 2 ? "text-amber-500" : "text-slate-400"}`}>W{item.weight}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
