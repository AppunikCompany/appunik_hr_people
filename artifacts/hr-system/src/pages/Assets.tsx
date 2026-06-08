import { useState, useEffect } from "react";
import { useAssets, useAssetCategories, useEmployees, useCurrentUser, useEmployeeEquipment, fetchApi, type EmployeeEquipmentItem } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Search, UserCheck, RotateCcw, Pencil, Trash2, Monitor, Package } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Equipment type helpers ────────────────────────────────────────────────

const EQUIPMENT_TYPES = [
  { value: "laptop",   label: "Laptop" },
  { value: "desktop",  label: "Desktop PC" },
  { value: "cpu",      label: "CPU / Tower" },
  { value: "monitor",  label: "Monitor" },
  { value: "mouse",    label: "Mouse" },
  { value: "keyboard", label: "Keyboard" },
  { value: "headset",  label: "Headset" },
  { value: "webcam",   label: "Webcam" },
  { value: "printer",  label: "Printer" },
  { value: "tablet",   label: "Tablet" },
  { value: "phone",    label: "Phone" },
  { value: "other",    label: "Other" },
];

function equipmentLabel(type: string, custom?: string | null) {
  if (type === "other") return custom || "Other";
  return EQUIPMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

// ─── HR-side dialogs ───────────────────────────────────────────────────────

function AddCategoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/assets/categories", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset-categories"] }); setName(""); onClose(); toast.success("Category added"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setName(""); onClose(); } }}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Add Asset Category</DialogTitle></DialogHeader>
        <div className="py-2">
          <Label>Category Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="e.g. Laptop, Furniture..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setName(""); onClose(); }}>Cancel</Button>
          <Button onClick={() => { if (!name.trim()) { toast.error("Category name is required"); return; } mutation.mutate({ name }); }} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding..." : "Add Category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddAssetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", categoryId: "", serialNumber: "", purchaseDate: "", purchaseCost: "", condition: "good" });
  const [addCatOpen, setAddCatOpen] = useState(false);
  const { data: cats } = useAssetCategories();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/assets", { method: "POST", body: JSON.stringify({ ...d, purchaseCost: d.purchaseCost ? parseFloat(d.purchaseCost) : null }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); onClose(); toast.success("Asset added"); },
    onError: (e: any) => toast.error(e.message),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Add Asset</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div><Label>Asset Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Category *</Label>
              <button onClick={() => setAddCatOpen(true)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">+ New Category</button>
            </div>
            <Select value={form.categoryId} onValueChange={v => set("categoryId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select category..." /></SelectTrigger>
              <SelectContent>
                {cats && (cats as any[]).length > 0
                  ? (cats as any[]).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                  : <SelectItem value="_none" disabled>No categories yet — add one above</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Serial Number</Label><Input value={form.serialNumber} onChange={e => set("serialNumber", e.target.value)} className="mt-1" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Purchase Date</Label><Input type="date" max="9999-12-31" value={form.purchaseDate} onChange={e => set("purchaseDate", e.target.value)} className="mt-1" /></div>
            <div><Label>Purchase Cost (₹)</Label><Input type="number" value={form.purchaseCost} onChange={e => set("purchaseCost", e.target.value)} className="mt-1" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const errors: string[] = [];
              if (!form.name.trim()) errors.push("Asset name is required");
              if (!form.categoryId) errors.push("Category is required");
              if (errors.length > 0) { errors.forEach(e => toast.error(e)); return; }
              mutation.mutate(form);
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Adding..." : "Add Asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AddCategoryDialog open={addCatOpen} onClose={() => setAddCatOpen(false)} />
    </>
  );
}

function AssignAssetDialog({ assetId, open, onClose }: { assetId: string; open: boolean; onClose: () => void }) {
  const [empId, setEmpId] = useState("");
  const { data: employees } = useEmployees({ status: "active" });
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => fetchApi(`/assets/${assetId}/assign`, { method: "POST", body: JSON.stringify({ employeeId: empId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); onClose(); toast.success("Asset assigned"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
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

// ─── Employee equipment dialog (add / edit) ────────────────────────────────

interface EquipmentFormState {
  equipmentType: string;
  customDescription: string;
  notes: string;
}

const EMPTY_EQUIP_FORM: EquipmentFormState = { equipmentType: "", customDescription: "", notes: "" };

function EquipmentDialog({
  open,
  onClose,
  employeeId,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  editing: EmployeeEquipmentItem | null;
}) {
  const [form, setForm] = useState<EquipmentFormState>(EMPTY_EQUIP_FORM);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? { equipmentType: editing.equipmentType, customDescription: editing.customDescription ?? "", notes: editing.notes ?? "" }
          : EMPTY_EQUIP_FORM
      );
    }
  }, [open, editing]);

  const set = (k: keyof EquipmentFormState, v: string) => setForm(f => ({ ...f, [k]: v }));

  const addMutation = useMutation({
    mutationFn: (d: any) => fetchApi(`/employees/${employeeId}/equipment`, { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-equipment", employeeId] }); onClose(); toast.success("Equipment added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: (d: any) => fetchApi(`/employees/${employeeId}/equipment/${editing!.id}`, { method: "PATCH", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-equipment", employeeId] }); onClose(); toast.success("Equipment updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!form.equipmentType) { toast.error("Please select an equipment type"); return; }
    if (form.equipmentType === "other" && !form.customDescription.trim()) { toast.error("Please describe the equipment"); return; }
    const payload = {
      equipmentType: form.equipmentType,
      customDescription: form.customDescription.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (editing) editMutation.mutate(payload);
    else addMutation.mutate(payload);
  };

  const isPending = addMutation.isPending || editMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Equipment Type *</Label>
            <Select value={form.equipmentType} onValueChange={v => set("equipmentType", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
              <SelectContent>
                {EQUIPMENT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.equipmentType === "other" && (
            <div>
              <Label>Description *</Label>
              <Input
                value={form.customDescription}
                onChange={e => set("customDescription", e.target.value)}
                className="mt-1"
                placeholder="e.g. USB hub, external SSD..."
              />
            </div>
          )}
          <div>
            <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              className="mt-1 resize-none"
              rows={2}
              placeholder="e.g. Model number, condition, any details..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : editing ? "Save Changes" : "Add Equipment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Employee "My Equipment" view ──────────────────────────────────────────

function MyEquipmentView({ employeeId }: { employeeId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeEquipmentItem | null>(null);
  const { data: items = [], isLoading } = useEmployeeEquipment(employeeId);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => fetchApi(`/employees/${employeeId}/equipment/${itemId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-equipment", employeeId] }); toast.success("Equipment removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (item: EmployeeEquipmentItem) => { setEditing(item); setDialogOpen(true); };

  return (
    <PageContainer>
      <PageHeader
        title="My Equipment"
        breadcrumbs={[{ label: "Assets" }]}
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" /> Add Equipment
          </Button>
        }
      />

      <div className="max-w-2xl">
        <p className="text-sm text-muted-foreground mb-4">
          Declare the devices and equipment you use for work. Keep this updated so IT has an accurate picture.
        </p>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading…</div>
        ) : (items as EmployeeEquipmentItem[]).length === 0 ? (
          <div className="bg-white border border-border rounded-xl flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground shadow-sm">
            <Monitor className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm">No equipment declared yet.</p>
            <Button size="sm" variant="outline" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> Add your first item</Button>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden divide-y divide-border">
            {(items as EmployeeEquipmentItem[]).map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-5 py-4">
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {equipmentLabel(item.equipmentType, item.customDescription)}
                  </p>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.notes}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    Added {new Date(item.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(item)}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm("Remove this equipment?")) deleteMutation.mutate(item.id);
                    }}
                    title="Remove"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EquipmentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        employeeId={employeeId}
        editing={editing}
      />
    </PageContainer>
  );
}

// ─── HR "All Assets" view ──────────────────────────────────────────────────

function HrAssetsView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [assignId, setAssignId] = useState<string | null>(null);
  const { data: assets, isLoading, isError } = useAssets(statusFilter ? { status: statusFilter } : undefined);
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
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setAddCatOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Category</Button>
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Asset</Button>
          </div>
        }
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
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading assets...</td></tr>
              ) : isError ? (
                <tr><td colSpan={7} className="text-center py-10 text-red-500">Failed to load assets. Please refresh.</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No assets found</td></tr>
              ) : filtered.map((asset: any, i: number) => (
                <tr key={asset.id} className={cn(i % 2 === 0 ? "bg-white" : "bg-background")}>
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
      <AddCategoryDialog open={addCatOpen} onClose={() => setAddCatOpen(false)} />
      {assignId && (
        <AssignAssetDialog assetId={assignId} open={!!assignId} onClose={() => setAssignId(null)} />
      )}
    </PageContainer>
  );
}

// ─── Root component ────────────────────────────────────────────────────────

export default function Assets() {
  const { data: user } = useCurrentUser();

  // Employees see their own equipment management
  if (user?.role === "employee") {
    const employeeId = user.employeeId;
    if (!employeeId) {
      return (
        <PageContainer>
          <div className="text-center py-20 text-muted-foreground text-sm">
            No employee record found. Please contact HR.
          </div>
        </PageContainer>
      );
    }
    return <MyEquipmentView employeeId={employeeId} />;
  }

  // HR admins / super admins see the full company asset inventory
  return <HrAssetsView />;
}
