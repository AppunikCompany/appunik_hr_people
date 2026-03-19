import { useState } from "react";
import { useDepartments, useDesignations, useCompanyProfile, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";

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

export default function Settings() {
  const [deptOpen, setDeptOpen] = useState(false);
  const [editDept, setEditDept] = useState<any>(null);
  const [desigOpen, setDesigOpen] = useState(false);
  const [editDesig, setEditDesig] = useState<any>(null);
  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: profile } = useCompanyProfile();
  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "", website: "", address: "" });
  const [profileDirty, setProfileDirty] = useState(false);
  const qc = useQueryClient();

  const setProfile = (k: string, v: string) => { setProfileForm(f => ({ ...f, [k]: v })); setProfileDirty(true); };

  const saveProfile = useMutation({
    mutationFn: () => fetchApi("/admin/company-profile", { method: "PATCH", body: JSON.stringify({ name: profileForm.name || profile?.name, ...profileForm }) }),
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

  return (
    <PageContainer>
      <PageHeader title="Settings" breadcrumbs={[{ label: "Settings" }]} />

      <Tabs defaultValue="company">
        <TabsList className="mb-6">
          <TabsTrigger value="company">Company Profile</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="designations">Designations</TabsTrigger>
        </TabsList>

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
      </Tabs>
    </PageContainer>
  );
}
