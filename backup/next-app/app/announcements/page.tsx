"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

const CATEGORY_STYLES: Record<string, string> = {
  general: "bg-blue-50 text-blue-700 border-blue-200",
  policy: "bg-purple-50 text-purple-700 border-purple-200",
  event: "bg-green-50 text-green-700 border-green-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
};

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "policy", label: "Policy" },
  { value: "event", label: "Event" },
  { value: "urgent", label: "Urgent" },
];

function AnnouncementDialog({ ann, open, onClose }: { ann?: any; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!ann;
  const [form, setForm] = useState({
    title: ann?.title ?? "",
    content: ann?.content ?? "",
    category: ann?.category ?? "general",
    isPinned: ann?.isPinned ?? false,
    isActive: ann?.isActive ?? true,
    expiryDate: ann?.expiryDate ?? "",
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => {
      const body = { ...form, expiryDate: form.expiryDate || null };
      return isEdit
        ? fetchApi(`/announcements/${ann.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : fetchApi("/announcements", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements"] }); onClose(); toast.success(isEdit ? "Updated" : "Posted"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "New"} Announcement</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Title *</Label><Input value={form.title} onChange={e => set("title", e.target.value)} className="mt-1" /></div>
          <div><Label>Content *</Label><Textarea value={form.content} onChange={e => set("content", e.target.value)} className="mt-1" rows={5} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set("category", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Expiry Date (optional)</Label><Input type="date" value={form.expiryDate} onChange={e => set("expiryDate", e.target.value)} className="mt-1" /></div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2"><Switch checked={form.isPinned} onCheckedChange={v => set("isPinned", v)} /><Label>Pin to top</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} /><Label>Active</Label></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.title || !form.content || mutation.isPending}>{isEdit ? "Save" : "Post"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Announcements() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ ann?: any } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => fetchApi<any[]>("/announcements/all"),
  });

  const filtered = (announcements ?? []).filter((a: any) => categoryFilter === "all" || a.category === categoryFilter);
  const pinned = filtered.filter((a: any) => a.isPinned);
  const rest = filtered.filter((a: any) => !a.isPinned);
  const ordered = [...pinned, ...rest];

  const deleteAnn = useMutation({
    mutationFn: (id: string) => fetchApi(`/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePin = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      fetchApi(`/announcements/${id}`, { method: "PATCH", body: JSON.stringify({ isPinned }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const today = new Date().toISOString().split("T")[0];

  return (
    <PageContainer>
      <PageHeader title="Announcements" breadcrumbs={[{ label: "Announcements" }]} subtitle="Company-wide notices, policy updates and event announcements" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {["all", ...CATEGORIES.map(c => c.value)].map(cat => (
            <Button key={cat} size="sm" variant={categoryFilter === cat ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setCategoryFilter(cat)}>{cat}</Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setDialog({})}><Plus className="w-4 h-4 mr-1" /> Post Announcement</Button>
      </div>

      {isLoading ? (
        <p className="text-center py-10 text-muted-foreground">Loading...</p>
      ) : ordered.length === 0 ? (
        <div className="bg-white border border-border rounded-lg p-12 text-center text-muted-foreground shadow-sm">
          <p className="text-lg font-medium">No announcements yet</p>
          <p className="text-sm mt-1">Post your first announcement to keep the team informed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((a: any) => {
            const isExpired = a.expiryDate && a.expiryDate < today;
            return (
              <div key={a.id} className={`bg-white border rounded-lg shadow-sm p-5 ${a.isPinned ? "border-amber-300 bg-amber-50/30" : "border-border"} ${!a.isActive || isExpired ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {a.isPinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <Badge variant="outline" className={`text-xs ${CATEGORY_STYLES[a.category] ?? ""}`}>{a.category}</Badge>
                      {!a.isActive && <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500">Inactive</Badge>}
                      {isExpired && <Badge variant="outline" className="text-xs bg-red-50 text-red-500">Expired</Badge>}
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.content}</p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span>Posted by {a.postedByName || "HR"}</span>
                      <span>·</span>
                      <span>{formatDate(a.createdAt)}</span>
                      {a.expiryDate && <><span>·</span><span>Expires {formatDate(a.expiryDate)}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => togglePin.mutate({ id: a.id, isPinned: !a.isPinned })} title={a.isPinned ? "Unpin" : "Pin"}>
                      {a.isPinned ? <PinOff className="w-3.5 h-3.5 text-amber-500" /> : <Pin className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDialog({ ann: a })}><Edit className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this announcement?")) deleteAnn.mutate(a.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog !== null && <AnnouncementDialog ann={dialog.ann} open={true} onClose={() => setDialog(null)} />}
    </PageContainer>
  );
}
