import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useEmployee, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function EmployeeDetail() {
  const [, params] = useRoute("/employees/:id");
  const id = params?.id;
  const { data: emp, isLoading } = useEmployee(id ?? null);
  const { data: docs } = useQuery({
    queryKey: ["employee-docs", id],
    queryFn: () => fetchApi<any[]>(`/employees/${id}/documents`),
    enabled: !!id,
  });
  const { data: history } = useQuery({
    queryKey: ["employee-history", id],
    queryFn: () => fetchApi<any[]>(`/employees/${id}/history`),
    enabled: !!id,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [addDocOpen, setAddDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({ documentType: "", fileName: "", fileUrl: "", expiryDate: "" });

  const updateMutation = useMutation({
    mutationFn: (data: any) => fetchApi(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee", id] }); setEditOpen(false); toast.success("Employee updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => fetchApi(`/employees/${id}`, { method: "DELETE" }),
    onSuccess: () => { navigate("/employees"); toast.success("Employee deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const addDocMutation = useMutation({
    mutationFn: (data: any) => fetchApi(`/employees/${id}/documents`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-docs", id] }); setAddDocOpen(false); setDocForm({ documentType: "", fileName: "", fileUrl: "", expiryDate: "" }); toast.success("Document added"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <PageContainer><div className="text-center py-20 text-muted-foreground">Loading...</div></PageContainer>;
  if (!emp) return <PageContainer><div className="text-center py-20 text-muted-foreground">Employee not found</div></PageContainer>;

  return (
    <PageContainer>
      <PageHeader
        title={`${emp.firstName} ${emp.lastName}`}
        subtitle={emp.designationName ?? undefined}
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: `${emp.firstName} ${emp.lastName}` },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={emp.status} />
            <Button size="sm" variant="outline" onClick={() => { setEditForm({ firstName: emp.firstName, lastName: emp.lastName, email: emp.email, phone: emp.phone ?? "", joiningDate: emp.joiningDate, employmentType: emp.employmentType, status: emp.status, departmentId: emp.departmentId ?? "", designationId: emp.designationId ?? "" }); setEditOpen(true); }}>
              <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <Detail label="Employee Code" value={emp.employeeCode} mono />
              <Detail label="Email" value={emp.email} />
              <Detail label="Phone" value={emp.phone ?? "—"} />
              <Detail label="Gender" value={emp.gender ?? "—"} />
              <Detail label="Date of Birth" value={formatDate(emp.dateOfBirth)} />
              <Detail label="Address" value={emp.address ?? "—"} />
              <Detail label="Emergency Contact" value={emp.emergencyContact ?? "—"} />
              <Detail label="Emergency Phone" value={emp.emergencyPhone ?? "—"} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="employment">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <Detail label="Department" value={emp.departmentName ?? "—"} />
              <Detail label="Designation" value={emp.designationName ?? "—"} />
              <Detail label="Reporting Manager" value={emp.reportingManagerName ?? "—"} />
              <Detail label="Employment Type" value={emp.employmentType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} />
              <Detail label="Joining Date" value={formatDate(emp.joiningDate)} />
              <Detail label="Probation End" value={formatDate(emp.probationEndDate)} />
              <Detail label="Status" value={<StatusBadge status={emp.status} />} />
              {emp.lastWorkingDay && <Detail label="Last Working Day" value={formatDate(emp.lastWorkingDay)} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex justify-between items-center px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Documents</h3>
              <Button size="sm" onClick={() => setAddDocOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Document</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Document Type</th>
                    <th className="text-left px-5 py-3">File Name</th>
                    <th className="text-left px-5 py-3">Uploaded At</th>
                    <th className="text-left px-5 py-3">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {docs && docs.length > 0 ? docs.map((doc: any, i: number) => (
                    <tr key={doc.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3">{doc.documentType}</td>
                      <td className="px-5 py-3 text-primary">{doc.fileName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(doc.uploadedAt)}</td>
                      <td className="px-5 py-3"><StatusBadge status={doc.verifiedAt ? "approved" : "pending"} /></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No documents uploaded</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Change Type</th>
                    <th className="text-left px-5 py-3">Previous</th>
                    <th className="text-left px-5 py-3">New</th>
                    <th className="text-left px-5 py-3">Effective Date</th>
                    <th className="text-left px-5 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history && history.length > 0 ? history.map((h: any, i: number) => (
                    <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{h.changeType.replace(/_/g, " ")}</td>
                      <td className="px-5 py-3 text-muted-foreground">{h.previousValue ?? "—"}</td>
                      <td className="px-5 py-3">{h.newValue ?? "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(h.effectiveDate)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{h.notes ?? "—"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No history available</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div><Label>First Name *</Label><Input value={editForm.firstName ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, firstName: e.target.value }))} className="mt-1" /></div>
            <div><Label>Last Name *</Label><Input value={editForm.lastName ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, lastName: e.target.value }))} className="mt-1" /></div>
            <div className="col-span-2"><Label>Email *</Label><Input value={editForm.email ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, email: e.target.value }))} className="mt-1" /></div>
            <div className="col-span-2"><Label>Phone</Label><Input value={editForm.phone ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, phone: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!editForm.firstName || !editForm.lastName || !editForm.email) { toast.error("Name and email are required"); return; } updateMutation.mutate(editForm); }} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Employee</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Are you sure you want to delete <strong>{emp.firstName} {emp.lastName}</strong>? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Document Dialog */}
      <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Document Type *</Label><Input value={docForm.documentType} onChange={e => setDocForm(f => ({ ...f, documentType: e.target.value }))} className="mt-1" placeholder="e.g. Aadhar Card, PAN Card..." /></div>
            <div><Label>File Name *</Label><Input value={docForm.fileName} onChange={e => setDocForm(f => ({ ...f, fileName: e.target.value }))} className="mt-1" placeholder="e.g. aadhar_card.pdf" /></div>
            <div><Label>File URL *</Label><Input value={docForm.fileUrl} onChange={e => setDocForm(f => ({ ...f, fileUrl: e.target.value }))} className="mt-1" placeholder="https://..." /></div>
            <div><Label>Expiry Date</Label><Input type="date" max="9999-12-31" value={docForm.expiryDate} onChange={e => setDocForm(f => ({ ...f, expiryDate: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDocOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!docForm.documentType || !docForm.fileName || !docForm.fileUrl) { toast.error("Document type, name, and URL are required"); return; } addDocMutation.mutate({ ...docForm, expiryDate: docForm.expiryDate || null }); }} disabled={addDocMutation.isPending}>
              {addDocMutation.isPending ? "Adding..." : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
