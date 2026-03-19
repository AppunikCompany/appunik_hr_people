import { useState } from "react";
import { Link } from "wouter";
import { useEmployees, useDepartments, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { Plus, Search, Eye, Edit } from "lucide-react";
import { useDesignations } from "@/hooks/useApi";
import { toast } from "sonner";

function AddEmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    departmentId: "", designationId: "", joiningDate: new Date().toISOString().split("T")[0],
    employmentType: "full_time", status: "active",
  });
  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: any) => fetchApi("/employees", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      onClose();
      toast.success("Employee added successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Employee</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div><Label>First Name *</Label><Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="mt-1" /></div>
          <div><Label>Last Name *</Label><Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className="mt-1" /></div>
          <div className="col-span-2"><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1" /></div>
          <div>
            <Label>Employment Type *</Label>
            <Select value={form.employmentType} onValueChange={(v) => set("employmentType", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full Time</SelectItem>
                <SelectItem value="part_time">Part Time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={form.departmentId} onValueChange={(v) => set("departmentId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Designation</Label>
            <Select value={form.designationId} onValueChange={(v) => set("designationId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {desigs?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Joining Date *</Label><Input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} className="mt-1" /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="probation">Probation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding..." : "Add Employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Employees() {
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const { data: employees, isLoading } = useEmployees();
  const { data: depts } = useDepartments();

  const filtered = employees?.filter((emp: any) => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      emp.firstName.toLowerCase().includes(q) ||
      emp.lastName.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      emp.employeeCode.toLowerCase().includes(q);
    const matchDept = !dept || emp.departmentId === dept;
    const matchStatus = !status || emp.status === status;
    return matchSearch && matchDept && matchStatus;
  }) ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Employees"
        breadcrumbs={[{ label: "Employees" }]}
        actions={
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add Employee
          </Button>
        }
      />

      <div className="bg-white border border-border rounded-lg shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={dept || "all"} onValueChange={v => setDept(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status || "all"} onValueChange={v => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="probation">Probation</SelectItem>
              <SelectItem value="resigned">Resigned</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-5 py-3">Employee</th>
                <th className="text-left px-5 py-3">ID</th>
                <th className="text-left px-5 py-3">Department</th>
                <th className="text-left px-5 py-3">Designation</th>
                <th className="text-left px-5 py-3">Joining Date</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No employees found</td></tr>
              ) : filtered.map((emp: any, i: number) => (
                <tr key={emp.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-medium text-foreground">{emp.firstName} {emp.lastName}</p>
                      <p className="text-xs text-muted-foreground">{emp.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{emp.employeeCode}</td>
                  <td className="px-5 py-3 text-muted-foreground">{emp.departmentName ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{emp.designationName ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(emp.joiningDate)}</td>
                  <td className="px-5 py-3"><StatusBadge status={emp.status} /></td>
                  <td className="px-5 py-3">
                    <Link href={`/employees/${emp.id}`}>
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
          Showing {filtered.length} of {employees?.length ?? 0} employees
        </div>
      </div>

      <AddEmployeeDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </PageContainer>
  );
}
