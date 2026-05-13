"use client";

import { useState, useEffect } from "react";
import { useDepartments, useDesignations, useCompanyProfile, useAdminUsers, useLeavePolicies, useLeaveTypes, useNotificationSettings, useFinancialYear, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Edit, Lock } from "lucide-react";
import { toast } from "sonner";

// These users are permanently locked as super_admin — cannot be changed via the UI
const LOCKED_SUPER_ADMIN_IDS = new Set([
  "user_3BTYJifFgKY8JX9HSuZO37z4Nyo", // Karan Panchal
  "user_3BUS7kFotpTtlKHSL15Buri0oYY", // Dhruv Khatri
  "user_3BUSRB6F5QIoqyVozGOB8BZah5d", // Yagnesh Khamar
]);

// super_admin cannot be assigned via the UI
const ROLES = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "it_admin", label: "IT Admin" },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-red-100 text-red-700 border-red-200",
  hr_admin: "bg-purple-100 text-purple-700 border-purple-200",
  it_admin: "bg-blue-100 text-blue-700 border-blue-200",
  manager: "bg-amber-100 text-amber-700 border-amber-200",
  employee: "bg-green-100 text-green-700 border-green-200",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
      <DialogContent className="max-w-sm">
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
      <DialogContent className="max-w-sm">
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

function LeavePolicyDialog({ policy, leaveTypes, existingTypeIds, open, onClose }: { policy?: any; leaveTypes: any[]; existingTypeIds: string[]; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!policy;
  const [form, setForm] = useState({
    leaveTypeId: policy?.leaveTypeId ?? "",
    noLeaveInProbation: policy?.noLeaveInProbation ?? false,
    minNoticeDays: String(policy?.minNoticeDays ?? 0),
    maxConsecutiveDays: policy?.maxConsecutiveDays != null ? String(policy.maxConsecutiveDays) : "",
    notes: policy?.notes ?? "",
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const availableTypes = isEdit ? leaveTypes : leaveTypes.filter(t => !existingTypeIds.includes(t.id) || t.id === form.leaveTypeId);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        leaveTypeId: form.leaveTypeId,
        noLeaveInProbation: form.noLeaveInProbation,
        minNoticeDays: parseInt(form.minNoticeDays) || 0,
        maxConsecutiveDays: form.maxConsecutiveDays ? parseInt(form.maxConsecutiveDays) : null,
        notes: form.notes || null,
      };
      return isEdit
        ? fetchApi(`/admin/leave-policies/${policy.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : fetchApi("/admin/leave-policies", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-policies"] }); onClose(); toast.success(isEdit ? "Policy updated" : "Policy created"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Leave Policy</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Leave Type *</Label>
            <Select value={form.leaveTypeId} onValueChange={v => set("leaveTypeId", v)} disabled={isEdit}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select leave type..." /></SelectTrigger>
              <SelectContent>{availableTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.noLeaveInProbation} onCheckedChange={v => set("noLeaveInProbation", v)} />
            <Label>Block leave during probation</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Min Notice Days</Label><Input type="number" value={form.minNoticeDays} onChange={e => set("minNoticeDays", e.target.value)} className="mt-1" min={0} /></div>
            <div><Label>Max Consecutive Days</Label><Input type="number" value={form.maxConsecutiveDays} onChange={e => set("maxConsecutiveDays", e.target.value)} className="mt-1" min={1} placeholder="No limit" /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => set("notes", e.target.value)} className="mt-1" rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.leaveTypeId || mutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Settings() {
  const [deptOpen, setDeptOpen] = useState(false);
  const [editDept, setEditDept] = useState<any>(null);
  const [desigOpen, setDesigOpen] = useState(false);
  const [editDesig, setEditDesig] = useState<any>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<any>(null);

  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: profile } = useCompanyProfile();
  const { data: adminUsers, isLoading: usersLoading } = useAdminUsers();
  const { data: policies } = useLeavePolicies();
  const { data: leaveTypes } = useLeaveTypes();
  const { data: notifSettings } = useNotificationSettings();
  const { data: fyConfig } = useFinancialYear();

  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "", website: "", address: "" });
  const [profileDirty, setProfileDirty] = useState(false);
  const [fyForm, setFyForm] = useState({ startMonth: 4, startDay: 1, endMonth: 3, endDay: 31, currentYear: "2025-26" });
  const [fyDirty, setFyDirty] = useState(false);

  useEffect(() => {
    if (fyConfig && !fyDirty) {
      setFyForm({ startMonth: fyConfig.startMonth, startDay: fyConfig.startDay, endMonth: fyConfig.endMonth, endDay: fyConfig.endDay, currentYear: fyConfig.currentYear });
    }
  }, [fyConfig]);

  const qc = useQueryClient();

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      fetchApi(`/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Role updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const setProfile = (k: string, v: string) => { setProfileForm(f => ({ ...f, [k]: v })); setProfileDirty(true); };

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

  const deletePolicy = useMutation({
    mutationFn: (id: string) => fetchApi(`/admin/leave-policies/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-policies"] }); toast.success("Policy deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleNotif = useMutation({
    mutationFn: ({ eventType, isEnabled }: { eventType: string; isEnabled: boolean }) =>
      fetchApi("/admin/notification-settings", { method: "PATCH", body: JSON.stringify({ eventType, isEnabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-settings"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const saveFy = useMutation({
    mutationFn: () => fetchApi("/admin/financial-year", { method: "PATCH", body: JSON.stringify(fyForm) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financial-year"] }); setFyDirty(false); toast.success("Financial year saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const existingPolicyTypeIds = (policies ?? []).map((p: any) => p.leaveTypeId);

  return (
    <PageContainer>
      <PageHeader title="Settings" breadcrumbs={[{ label: "Settings" }]} />

      <Tabs defaultValue="company">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="company">Company Profile</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="designations">Designations</TabsTrigger>
          <TabsTrigger value="leave-policies">Leave Policies</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="financial-year">Financial Year</TabsTrigger>
          <TabsTrigger value="users">Users & Roles</TabsTrigger>
        </TabsList>

        {/* ── COMPANY PROFILE ── */}
        <TabsContent value="company">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6 max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Company Name *</Label>
                <Input value={profileForm.name || profile?.name || ""} onChange={e => setProfile("name", e.target.value)} className="mt-1" />
              </div>
              <div><Label>Email</Label><Input value={profileForm.email || profile?.email || ""} onChange={e => setProfile("email", e.target.value)} className="mt-1" /></div>
              <div><Label>Phone</Label><Input value={profileForm.phone || profile?.phone || ""} onChange={e => setProfile("phone", e.target.value)} className="mt-1" /></div>
              <div><Label>Website</Label><Input value={profileForm.website || profile?.website || ""} onChange={e => setProfile("website", e.target.value)} className="mt-1" /></div>
              <div className="col-span-2"><Label>Address</Label><Input value={profileForm.address || profile?.address || ""} onChange={e => setProfile("address", e.target.value)} className="mt-1" /></div>
            </div>
            <div className="mt-6">
              <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── DEPARTMENTS ── */}
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
                  {depts?.map((d: any, i: number) => (
                    <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{d.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{d.headName ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditDept(d)} className="h-7 w-7 p-0"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteDept.mutate(d.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
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

        {/* ── DESIGNATIONS ── */}
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
                  {desigs?.map((d: any, i: number) => (
                    <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{d.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{d.departmentName ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditDesig(d)} className="h-7 w-7 p-0"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteDesig.mutate(d.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
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

        {/* ── LEAVE POLICIES ── */}
        <TabsContent value="leave-policies">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold">Leave Policies</h3>
                <p className="text-xs text-muted-foreground mt-0.5">One policy per leave type. Controls rules like probation blocks, notice periods and consecutive day limits.</p>
              </div>
              <Button size="sm" onClick={() => setPolicyOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Policy</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Leave Type</th>
                    <th className="text-left px-5 py-3">No Leave in Probation</th>
                    <th className="text-left px-5 py-3">Min Notice (days)</th>
                    <th className="text-left px-5 py-3">Max Consecutive (days)</th>
                    <th className="text-left px-5 py-3">Notes</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!policies || policies.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No leave policies configured</td></tr>
                  ) : policies.map((p: any, i: number) => (
                    <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{p.leaveTypeName ?? "—"}</td>
                      <td className="px-5 py-3">
                        <Badge variant="outline" className={p.noLeaveInProbation ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}>
                          {p.noLeaveInProbation ? "Blocked" : "Allowed"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{p.minNoticeDays ?? 0}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.maxConsecutiveDays ?? "No limit"}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs max-w-xs truncate">{p.notes ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditPolicy(p)} className="h-7 w-7 p-0"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deletePolicy.mutate(p.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {policyOpen && <LeavePolicyDialog leaveTypes={leaveTypes ?? []} existingTypeIds={existingPolicyTypeIds} open={policyOpen} onClose={() => setPolicyOpen(false)} />}
          {editPolicy && <LeavePolicyDialog policy={editPolicy} leaveTypes={leaveTypes ?? []} existingTypeIds={existingPolicyTypeIds} open={!!editPolicy} onClose={() => setEditPolicy(null)} />}
        </TabsContent>

        {/* ── NOTIFICATIONS ── */}
        <TabsContent value="notifications">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Notification Settings</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Toggle which system events trigger email notifications.</p>
            </div>
            <div className="divide-y divide-border">
              {!notifSettings || notifSettings.length === 0 ? (
                <p className="px-5 py-8 text-center text-muted-foreground text-sm">No notification settings found. They are seeded automatically on first run.</p>
              ) : notifSettings.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{s.eventType}</p>
                  </div>
                  <Switch
                    checked={s.isEnabled}
                    onCheckedChange={(v) => toggleNotif.mutate({ eventType: s.eventType, isEnabled: v })}
                    disabled={toggleNotif.isPending}
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── FINANCIAL YEAR ── */}
        <TabsContent value="financial-year">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6 max-w-lg">
            <h3 className="text-sm font-semibold mb-4">Financial Year Configuration</h3>
            <div className="space-y-4">
              <div>
                <Label>Current Year Label</Label>
                <Input value={fyForm.currentYear} onChange={e => { setFyForm(f => ({ ...f, currentYear: e.target.value })); setFyDirty(true); }} className="mt-1 max-w-xs" placeholder="e.g. 2025-26" />
              </div>
              <div>
                <Label>Financial Year Start</Label>
                <div className="flex items-center gap-3 mt-1">
                  <Select value={String(fyForm.startMonth)} onValueChange={v => { setFyForm(f => ({ ...f, startMonth: parseInt(v) })); setFyDirty(true); }}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, idx) => <SelectItem key={idx + 1} value={String(idx + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" value={fyForm.startDay} onChange={e => { setFyForm(f => ({ ...f, startDay: parseInt(e.target.value) || 1 })); setFyDirty(true); }} className="w-20" min={1} max={31} />
                  <span className="text-sm text-muted-foreground">day</span>
                </div>
              </div>
              <div>
                <Label>Financial Year End</Label>
                <div className="flex items-center gap-3 mt-1">
                  <Select value={String(fyForm.endMonth)} onValueChange={v => { setFyForm(f => ({ ...f, endMonth: parseInt(v) })); setFyDirty(true); }}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, idx) => <SelectItem key={idx + 1} value={String(idx + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" value={fyForm.endDay} onChange={e => { setFyForm(f => ({ ...f, endDay: parseInt(e.target.value) || 31 })); setFyDirty(true); }} className="w-20" min={1} max={31} />
                  <span className="text-sm text-muted-foreground">day</span>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <Button onClick={() => saveFy.mutate()} disabled={saveFy.isPending || !fyDirty}>
                {saveFy.isPending ? "Saving..." : "Save Financial Year"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── USERS & ROLES ── */}
        <TabsContent value="users">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Users & Roles</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Manage access roles for all users. Super Admins are permanently locked and cannot be changed.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">User</th>
                    <th className="text-left px-5 py-3">Email</th>
                    <th className="text-left px-5 py-3">Employee Code</th>
                    <th className="text-left px-5 py-3">Current Role</th>
                    <th className="text-left px-5 py-3">Change Role</th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
                  )}
                  {!usersLoading && (!adminUsers || adminUsers.length === 0) && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No users found</td></tr>
                  )}
                  {adminUsers?.map((u, i) => {
                    const isLocked = LOCKED_SUPER_ADMIN_IDS.has(u.id);
                    return (
                      <tr key={u.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                        <td className="px-5 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : <span className="text-muted-foreground italic">No name</span>}
                            {isLocked && <Lock className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{u.email ?? "—"}</td>
                        <td className="px-5 py-3">
                          {u.employeeCode
                            ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{u.employeeCode}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant="outline" className={`text-xs font-medium ${ROLE_COLORS[u.role] ?? ""}`}>
                            {u.role === "super_admin" ? "Super Admin" : ROLES.find(r => r.value === u.role)?.label ?? u.role}
                          </Badge>
                        </td>
                        <td className="px-5 py-3">
                          {isLocked ? (
                            <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Locked
                            </span>
                          ) : (
                            <Select value={u.role} onValueChange={(role) => changeRole.mutate({ userId: u.id, role })}>
                              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ROLES.map(r => <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
