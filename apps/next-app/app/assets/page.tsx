"use client";

import { useState } from "react";
import { useAssets, useAssetCategories, useEmployees, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Plus, Search, UserCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";

function AddAssetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", categoryId: "", serialNumber: "", purchaseDate: "", purchaseCost: "", condition: "good" });
  const { data: cats } = useAssetCategories();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/assets", { method: "POST", body: JSON.stringify({ ...d, purchaseCost: d.purchaseCost ? parseFloat(d.purchaseCost) : null }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); onClose(); toast.success("Asset added"); },
    onError: (e: any) => toast.error(e.message),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Asset</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div><Label>Asset Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
          <div>
            <Label>Category *</Label>
            <Select value={form.categoryId} onValueChange={v => set("categoryId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category..." /></SelectTrigger>
              <SelectContent>
                {cats?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Serial Number</Label><Input value={form.serialNumber} onChange={e => set("serialNumber", e.target.value)} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Purchase Date</Label><Input type="date" value={form.purchaseDate} onChange={e => set("purchaseDate", e.target.value)} className="mt-1" /></div>
            <div><Label>Purchase Cost (₹)</Label><Input type="number" value={form.purchaseCost} onChange={e => set("purchaseCost", e.target.value)} className="mt-1" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>{mutation.isPending ? "Adding..." : "Add Asset"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignAssetDialog({ assetId, open, onClose }: { assetId: string; open: boolean; onClose: () => void }) {
  const [empId, setEmpId] = useState("");
  const { data: employees } = useEmployees();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => fetchApi(`/assets/${assetId}/assign`, { method: "POST", body: JSON.stringify({ employeeId: empId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); onClose(); toast.success("Asset assigned"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Assign Asset</DialogTitle></DialogHeader>
        <div className="py-2">
          <Label>Assign To *</Label>
          <Select value={empId} onValueChange={setEmpId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
            <SelectContent>
              {employees?.filter((e: any) => e.status === "active").map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!empId || mutation.isPending}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Assets() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [assignId, setAssignId] = useState<string | null>(null);
  const { data: assets, isLoading } = useAssets(statusFilter ? { status: statusFilter } : undefined);
  const { data: cats } = useAssetCategories();
  const qc = useQueryClient();

  const returnAsset = useMutation({
    mutationFn: (id: string) => fetchApi(`/assets/${id}/return`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); toast.success("Asset returned"); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = assets?.filter((a: any) =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.assetCode.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Assets"
        breadcrumbs={[{ label: "Assets" }]}
        actions={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Asset</Button>}
      />

      <div className="bg-white border border-border rounded-lg shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search assets..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-5 py-3">Asset</th>
                <th className="text-left px-5 py-3">Code</th>
                <th className="text-left px-5 py-3">Category</th>
                <th className="text-left px-5 py-3">Serial No.</th>
                <th className="text-left px-5 py-3">Assigned To</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No assets found</td></tr>
              ) : filtered.map((asset: any, i: number) => (
                <tr key={asset.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                  <td className="px-5 py-3 font-medium text-foreground">{asset.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{asset.assetCode}</td>
                  <td className="px-5 py-3 text-muted-foreground">{asset.categoryName}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{asset.serialNumber ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{asset.assignedToName ?? "—"}</td>
                  <td className="px-5 py-3"><StatusBadge status={asset.status} /></td>
                  <td className="px-5 py-3">
                    {asset.status === "available" && (
                      <Button size="sm" variant="outline" onClick={() => setAssignId(asset.id)} className="h-7 text-xs">
                        <UserCheck className="w-3.5 h-3.5 mr-1" /> Assign
                      </Button>
                    )}
                    {asset.status === "assigned" && (
                      <Button size="sm" variant="outline" onClick={() => returnAsset.mutate(asset.id)} className="h-7 text-xs text-orange-600 hover:text-orange-700">
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Return
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddAssetDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {assignId && (
        <AssignAssetDialog assetId={assignId} open={!!assignId} onClose={() => setAssignId(null)} />
      )}
    </PageContainer>
  );
}
