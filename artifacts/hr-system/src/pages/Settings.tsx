import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useDepartments, useDesignations, useCompanyProfile, useLeaveTypes,
  useNotificationSettings, useRoles, useAdminUsers, useCurrentUser, fetchApi,
  type Role,
} from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Edit, Lock, Shield } from "lucide-react";
import { toast } from "sonner";

// ─── Departments ──────────────────────────────────────────────────────────────

function DeptDialog({ dept, open, onClose }: { dept?: any; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(dept?.name ?? "");
  const qc = useQueryClient();
  const isEdit = !!dept;
  const mutation = useMutation({
    mutationFn: () => isEdit
      ? fetchApi(`/admin/departments/${dept.id}`, { method: "PATCH", body: JSON.stringify({ name }) })
      : fetchApi("/admin/departments", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); onClose(); toast.success(isEdit ? "Updated" : "Created"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Department</DialogTitle></DialogHeader>
        <div className="py-2"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Designations ─────────────────────────────────────────────────────────────

function DesigDialog({ desig, open, onClose }: { desig?: any; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(desig?.name ?? "");
  const qc = useQueryClient();
  const isEdit = !!desig;
  const mutation = useMutation({
    mutationFn: () => isEdit
      ? fetchApi(`/admin/designations/${desig.id}`, { method: "PATCH", body: JSON.stringify({ name }) })
      : fetchApi("/admin/designations", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["designations"] }); onClose(); toast.success(isEdit ? "Updated" : "Created"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Designation</DialogTitle></DialogHeader>
        <div className="py-2"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Leave Policies ───────────────────────────────────────────────────────────

function LeavePolicyDialog({ policy, open, onClose }: { policy?: any; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    name: policy?.name ?? "",
    maxDaysPerYear: String(policy?.maxDaysPerYear ?? ""),
    isPaidLeave: policy?.isPaidLeave ?? policy?.isPaid ?? true,
    isCarryForward: policy?.isCarryForward ?? false,
    description: policy?.description ?? "",
  });
  const qc = useQueryClient();
  const isEdit = !!policy;
  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        maxDaysPerYear: Number(form.maxDaysPerYear),
        isPaidLeave: form.isPaidLeave,
        isCarryForward: form.isCarryForward,
      };
      return isEdit
        ? fetchApi(`/leave/types/${policy.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : fetchApi("/leave/types", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-types"] }); onClose(); toast.success(isEdit ? "Leave type updated" : "Leave type created"); },
    onError: (e: any) => toast.error(e.message),
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Leave Type</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" placeholder="e.g. Casual Leave" /></div>
          <div><Label>Max Days Per Year *</Label><Input type="number" min="0" value={form.maxDaysPerYear} onChange={e => set("maxDaysPerYear", e.target.value)} className="mt-1" /></div>
          <div className="flex items-center justify-between"><Label>Paid Leave</Label><Switch checked={form.isPaidLeave} onCheckedChange={v => set("isPaidLeave", v)} /></div>
          <div className="flex items-center justify-between"><Label>Carry Forward</Label><Switch checked={form.isCarryForward} onCheckedChange={v => set("isCarryForward", v)} /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={e => set("description", e.target.value)} className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || !form.maxDaysPerYear || mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Roles ────────────────────────────────────────────────────────────────────

const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employees", label: "Employees" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "assets", label: "Assets" },
  { key: "performance", label: "Performance" },
  { key: "reports", label: "Reports" },
  { key: "payroll", label: "Payroll" },
  { key: "automations", label: "Automations" },
  { key: "onboarding", label: "Onboarding" },
  { key: "settings", label: "Settings" },
  { key: "roles", label: "Roles" },
];

type PermMatrix = Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>;

function initPermMatrix(existingPerms?: Role["permissions"]): PermMatrix {
  return Object.fromEntries(
    MODULES.map(m => {
      const existing = existingPerms?.find(p => p.module === m.key);
      return [m.key, {
        canView: existing?.canView ?? false,
        canCreate: existing?.canCreate ?? false,
        canEdit: existing?.canEdit ?? false,
        canDelete: existing?.canDelete ?? false,
      }];
    })
  );
}

function RoleDialog({ role, open, onClose }: { role?: Role; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<PermMatrix>(() => initPermMatrix(role?.permissions));
  const qc = useQueryClient();
  const isEdit = !!role;
  const isProtected = role?.isProtected ?? false;

  // Sync state whenever the role prop changes (e.g. switching between edit targets)
  useEffect(() => {
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPerms(initPermMatrix(role?.permissions));
  }, [role?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const permArray = MODULES.map(m => ({ module: m.key, ...perms[m.key] }));
      if (!isEdit) {
        return fetchApi<Role>("/admin/roles", {
          method: "POST",
          body: JSON.stringify({ name, description: description || null, permissions: permArray }),
        });
      }
      await fetchApi(`/admin/roles/${role.id}`, { method: "PATCH", body: JSON.stringify({ name, description: description || null }) });
      await fetchApi(`/admin/roles/${role.id}/permissions`, { method: "PUT", body: JSON.stringify(permArray) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      onClose();
      toast.success(isEdit ? "Role updated" : "Role created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePerm = (module: string, action: keyof PermMatrix[string], value: boolean) => {
    if (isProtected) return;
    setPerms(p => ({ ...p, [module]: { ...p[module], [action]: value } }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isProtected && <Lock className="w-4 h-4 text-muted-foreground" />}
            {isEdit ? "Edit Role" : "Create Role"}
          </DialogTitle>
        </DialogHeader>

        {isProtected ? (
          <div className="py-2 space-y-4">
            <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg text-sm text-muted-foreground">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>This is a protected system role and cannot be modified.</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Role Name</p>
                <p className="text-sm font-semibold capitalize">{role.name.replace(/_/g, " ")}</p>
              </div>
              {role.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{role.description}</p>
                </div>
              )}
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Module</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">View</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Create</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Edit</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((m, i) => {
                    const p = role.permissions.find(x => x.module === m.key);
                    return (
                      <tr key={m.key} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                        <td className="px-4 py-2.5 font-medium">{m.label}</td>
                        {([p?.canView, p?.canCreate, p?.canEdit, p?.canDelete] as boolean[]).map((val, j) => (
                          <td key={j} className="text-center px-3 py-2.5">
                            <span className={`text-xs font-medium ${val ? "text-foreground" : "text-muted-foreground/40"}`}>{val ? "✓" : "—"}</span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Role Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="e.g. finance_manager" />
                <p className="text-xs text-muted-foreground mt-1">Lowercase with underscores</p>
              </div>
              <div>
                <Label>Description</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} className="mt-1" placeholder="Brief description" />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Module Permissions</Label>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Module</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">View</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Create</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Edit</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((m, i) => (
                      <tr key={m.key} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                        <td className="px-4 py-2.5 font-medium">{m.label}</td>
                        {(["canView", "canCreate", "canEdit", "canDelete"] as const).map(action => (
                          <td key={action} className="text-center px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={perms[m.key]?.[action] ?? false}
                              onChange={e => togglePerm(m.key, action, e.target.checked)}
                              className="h-4 w-4 cursor-pointer accent-foreground"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isProtected ? "Close" : "Cancel"}</Button>
          {!isProtected && (
            <Button onClick={() => saveMutation.mutate()} disabled={!name || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Role"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const [location] = useLocation();
  const { data: user } = useCurrentUser();
  const isSuperAdmin = user?.role === "super_admin";

  // Departments
  const [deptOpen, setDeptOpen] = useState(false);
  const [editDept, setEditDept] = useState<any>(null);
  // Designations
  const [desigOpen, setDesigOpen] = useState(false);
  const [editDesig, setEditDesig] = useState<any>(null);
  // Leave policies
  const [leavePolicyOpen, setLeavePolicyOpen] = useState(false);
  const [editLeavePolicy, setEditLeavePolicy] = useState<any>(null);
  // Roles
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);

  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: leaveTypes } = useLeaveTypes();
  const { data: notifSettings } = useNotificationSettings();
  const { data: profile } = useCompanyProfile();
  const { data: roles } = useRoles();
  const { data: adminUsers } = useAdminUsers();

  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "", website: "", address: "" });
  const [profileDirty, setProfileDirty] = useState(false);
  const qc = useQueryClient();

  const tabFromPath: Record<string, string> = {
    "/settings": "company",
    "/settings/departments": "departments",
    "/settings/designations": "designations",
    "/settings/leave-policies": "leave-policies",
    "/settings/notifications": "notifications",
    "/settings/roles": "roles",
  };
  const activeTab = tabFromPath[location] ?? "company";

  const setProfileField = (k: string, v: string) => { setProfileForm(f => ({ ...f, [k]: v })); setProfileDirty(true); };

  const saveProfile = useMutation({
    mutationFn: () => fetchApi("/admin/company-profile", { method: "PATCH", body: JSON.stringify({ ...profileForm, name: profileForm.name || profile?.name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["company-profile"] }); setProfileDirty(false); toast.success("Profile saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDept = useMutation({
    mutationFn: (id: string) => fetchApi(`/admin/departments/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDesig = useMutation({
    mutationFn: (id: string) => fetchApi(`/admin/designations/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["designations"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteLeaveType = useMutation({
    mutationFn: (id: string) => fetchApi(`/leave/types/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-types"] }); toast.success("Leave type deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleNotif = useMutation({
    mutationFn: ({ eventType, isEnabled }: { eventType: string; isEnabled: boolean }) =>
      fetchApi(`/admin/notification-settings`, { method: "PATCH", body: JSON.stringify({ eventType, isEnabled }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notification-settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => fetchApi(`/admin/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roles"] }); toast.success("Role deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const assignUserRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      fetchApi(`/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Role assigned"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader title="Settings" breadcrumbs={[{ label: "Settings" }]} />

      <Tabs value={activeTab}>
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="company" asChild><a href="/settings">Company Profile</a></TabsTrigger>
          <TabsTrigger value="departments" asChild><a href="/settings/departments">Departments</a></TabsTrigger>
          <TabsTrigger value="designations" asChild><a href="/settings/designations">Designations</a></TabsTrigger>
          <TabsTrigger value="leave-policies" asChild><a href="/settings/leave-policies">Leave Policies</a></TabsTrigger>
          <TabsTrigger value="notifications" asChild><a href="/settings/notifications">Notifications</a></TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="roles" asChild><a href="/settings/roles">Roles</a></TabsTrigger>
          )}
        </TabsList>

        {/* Company Profile */}
        <TabsContent value="company">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6 max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Company Name *</Label>
                <Input value={profileForm.name || profile?.name || ""} onChange={e => setProfileField("name", e.target.value)} className="mt-1" />
              </div>
              <div><Label>Email</Label><Input value={profileForm.email || profile?.email || ""} onChange={e => setProfileField("email", e.target.value)} className="mt-1" /></div>
              <div><Label>Phone</Label><Input value={profileForm.phone || profile?.phone || ""} onChange={e => setProfileField("phone", e.target.value)} className="mt-1" /></div>
              <div><Label>Website</Label><Input value={profileForm.website || profile?.website || ""} onChange={e => setProfileField("website", e.target.value)} className="mt-1" /></div>
              <div className="col-span-2"><Label>Address</Label><Input value={profileForm.address || profile?.address || ""} onChange={e => setProfileField("address", e.target.value)} className="mt-1" /></div>
            </div>
            <div className="mt-6">
              <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Departments */}
        <TabsContent value="departments">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Departments</h3>
              <Button size="sm" onClick={() => setDeptOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">Head</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!depts || depts.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-10 text-muted-foreground">No departments found. Click "Add" to create your first department.</td></tr>
                  ) : depts.map((d: any, i: number) => (
                    <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{d.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{d.headName ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditDept(d)} className="h-7 w-7 p-0"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" title="Delete" onClick={() => deleteDept.mutate(d.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DeptDialog open={deptOpen} onClose={() => setDeptOpen(false)} />
          {editDept && <DeptDialog dept={editDept} open={!!editDept} onClose={() => setEditDept(null)} />}
        </TabsContent>

        {/* Designations */}
        <TabsContent value="designations">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Designations</h3>
              <Button size="sm" onClick={() => setDesigOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">Department</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!desigs || desigs.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-10 text-muted-foreground">No designations found. Click "Add" to create your first designation.</td></tr>
                  ) : desigs.map((d: any, i: number) => (
                    <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{d.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{d.departmentName ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditDesig(d)} className="h-7 w-7 p-0"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" title="Delete" onClick={() => deleteDesig.mutate(d.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DesigDialog open={desigOpen} onClose={() => setDesigOpen(false)} />
          {editDesig && <DesigDialog desig={editDesig} open={!!editDesig} onClose={() => setEditDesig(null)} />}
        </TabsContent>

        {/* Leave Policies */}
        <TabsContent value="leave-policies">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Leave Types & Policies</h3>
              <Button size="sm" onClick={() => setLeavePolicyOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3 text-center">Max Days/Year</th>
                    <th className="text-left px-5 py-3 text-center">Paid</th>
                    <th className="text-left px-5 py-3 text-center">Carry Forward</th>
                    <th className="text-left px-5 py-3">Description</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!leaveTypes || leaveTypes.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No leave types configured. Click "Add" to create your first leave type.</td></tr>
                  ) : leaveTypes.map((lt: any, i: number) => (
                    <tr key={lt.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{lt.name}</td>
                      <td className="px-5 py-3 text-center">{lt.maxDaysPerYear}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs font-medium ${(lt.isPaidLeave ?? lt.isPaid) ? "text-foreground" : "text-muted-foreground"}`}>{(lt.isPaidLeave ?? lt.isPaid) ? "Yes" : "No"}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs font-medium ${lt.isCarryForward ? "text-foreground" : "text-muted-foreground"}`}>{lt.isCarryForward ? "Yes" : "No"}</span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{lt.description ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditLeavePolicy(lt)} className="h-7 w-7 p-0"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" title="Delete" onClick={() => deleteLeaveType.mutate(lt.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <LeavePolicyDialog open={leavePolicyOpen} onClose={() => setLeavePolicyOpen(false)} />
          {editLeavePolicy && <LeavePolicyDialog policy={editLeavePolicy} open={!!editLeavePolicy} onClose={() => setEditLeavePolicy(null)} />}
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Notification Settings</h3>
              <p className="text-xs text-muted-foreground mt-1">Configure which events trigger email notifications</p>
            </div>
            <div className="divide-y divide-border">
              {!notifSettings || notifSettings.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No notification settings configured</div>
              ) : notifSettings.map((n: any) => (
                <div key={n.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{n.label}</p>
                    <p className="text-xs text-muted-foreground capitalize">Email notification</p>
                  </div>
                  <Switch
                    checked={n.isEnabled}
                    onCheckedChange={(checked) => toggleNotif.mutate({ eventType: n.key ?? n.eventType, isEnabled: checked })}
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Roles (super_admin only) */}
        {isSuperAdmin && (
          <TabsContent value="roles">
            <div className="space-y-6">
              {/* Role list */}
              <div className="bg-white border border-border rounded-lg shadow-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Roles</h3>
                  </div>
                  <Button size="sm" onClick={() => { setEditRole(null); setRoleDialogOpen(true); }}>
                    <Plus className="w-4 h-4 mr-1" /> Create Role
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left px-5 py-3">Role</th>
                        <th className="text-left px-5 py-3">Description</th>
                        <th className="text-left px-5 py-3">Type</th>
                        <th className="text-left px-5 py-3">Permissions</th>
                        <th className="text-right px-5 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!roles || roles.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No roles found</td></tr>
                      ) : roles.map((r, i) => (
                        <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {r.isProtected && <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                              <span className="font-medium capitalize">{r.name.replace(/_/g, " ")}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{r.description ?? "—"}</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.isSystem ? "bg-secondary text-foreground" : "bg-background border border-border text-muted-foreground"}`}>
                              {r.isSystem ? "System" : "Custom"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-muted-foreground text-xs">
                            {r.permissions.filter(p => p.canView).length} modules with view
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" title="View/Edit role" onClick={() => { setEditRole(r); setRoleDialogOpen(true); }} className="h-7 w-7 p-0">
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              {r.name !== "super_admin" && (
                                <Button size="sm" variant="ghost" title="Delete role" onClick={() => {
                                  if (confirm(`Delete the "${r.name.replace(/_/g, " ")}" role? This cannot be undone.`)) deleteRole.mutate(r.id);
                                }} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User Role Assignment */}
              <div className="bg-white border border-border rounded-lg shadow-sm">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold">User Role Assignment</h3>
                  <p className="text-xs text-muted-foreground mt-1">Assign roles to users. Changes take effect on their next login.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left px-5 py-3">User</th>
                        <th className="text-left px-5 py-3">Email</th>
                        <th className="text-left px-5 py-3">Current Role</th>
                        <th className="text-right px-5 py-3">Assign Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!adminUsers || adminUsers.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No users found</td></tr>
                      ) : adminUsers.map((u, i) => (
                        <tr key={u.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                          <td className="px-5 py-3 font-medium">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</td>
                          <td className="px-5 py-3 text-muted-foreground">{u.email ?? "—"}</td>
                          <td className="px-5 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary font-medium capitalize">{u.role.replace(/_/g, " ")}</span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Select
                              value={u.role}
                              onValueChange={(role) => assignUserRole.mutate({ userId: u.id, role })}
                            >
                              <SelectTrigger className="h-7 w-44 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {roles?.map(r => (
                                  <SelectItem key={r.id} value={r.name} className="text-xs capitalize">
                                    {r.name.replace(/_/g, " ")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <RoleDialog
              key={editRole?.id ?? "new-role"}
              role={editRole ?? undefined}
              open={roleDialogOpen}
              onClose={() => { setRoleDialogOpen(false); setEditRole(null); }}
            />
          </TabsContent>
        )}
      </Tabs>
    </PageContainer>
  );
}
