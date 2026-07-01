import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useEmployees, useDepartments, useDesignations, useCurrentUser, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { Search, Eye, Edit2, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: string; sortDir: "asc" | "desc" }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-30 inline-block" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 inline-block" />
    : <ChevronDown className="w-3 h-3 ml-1 inline-block" />;
}

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
];

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "probation", label: "Probation" },
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
];

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employeeCode: string;
  departmentId: string | null;
  departmentName: string | null;
  designationId: string | null;
  designationName: string | null;
  joiningDate: string;
  employmentType: string;
  status: string;
};

type EmployeeForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  workLocation: string;
  departmentId: string;
  designationId: string;
  joiningDate: string;
  employmentType: string;
  status: string;
};

function EmployeeFormDialog({
  open,
  onClose,
  initial,
  employeeId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<EmployeeForm>;
  employeeId?: string;
}) {
  const isEdit = !!employeeId;
  const [form, setForm] = useState<EmployeeForm>({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    workLocation: (initial as any)?.workLocation ?? "",
    departmentId: initial?.departmentId ?? "",
    designationId: initial?.designationId ?? "",
    joiningDate: initial?.joiningDate ?? new Date().toISOString().split("T")[0],
    employmentType: initial?.employmentType ?? "full_time",
    status: initial?.status ?? "active",
  });
  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: EmployeeForm) =>
      isEdit
        ? fetchApi(`/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify(data) })
        : fetchApi("/employees", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      onClose();
      toast.success(isEdit ? "Employee updated" : "Employee added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof EmployeeForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Employee" : "Add New Employee"}</DialogTitle>
          <DialogDescription>{isEdit ? "Update the employee's details." : "Fill in the details for the new employee."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div>
            <Label>First Name *</Label>
            <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Last Name *</Label>
            <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className="mt-1" />
          </div>
          <div className="col-span-2">
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Work Location</Label>
            <Input placeholder="e.g. Mumbai Office, Remote" value={form.workLocation} onChange={(e) => set("workLocation", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Employment Type *</Label>
            <Select value={form.employmentType} onValueChange={(v) => set("employmentType", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={form.departmentId || "none"} onValueChange={(v) => set("departmentId", v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(depts as Array<{ id: string; name: string }> ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Designation</Label>
            <Select value={form.designationId || "none"} onValueChange={(v) => set("designationId", v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(desigs as Array<{ id: string; name: string }> ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Joining Date *</Label>
            <Input type="date" max="9999-12-31" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!form.firstName.trim()) { toast.error("First name is required"); return; }
              if (!form.lastName.trim()) { toast.error("Last name is required"); return; }
              if (!form.email.trim()) { toast.error("Email is required"); return; }
              if (!emailRegex.test(form.email.trim())) { toast.error("Invalid email format"); return; }
              if (!form.joiningDate) { toast.error("Joining date is required"); return; }
              mutation.mutate({ ...form, email: form.email.trim() });
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (isEdit ? "Saving..." : "Adding...") : (isEdit ? "Save Changes" : "Add Employee")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  open,
  onClose,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  employee: Employee | null;
}) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => fetchApi(`/employees/${employee?.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      onClose();
      toast.success(`${employee?.firstName} ${employee?.lastName} deleted`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Delete Employee</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{employee?.firstName} {employee?.lastName}</strong>? This action cannot be undone and will remove all their attendance, leave, and asset records.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrgChart({ employees }: { employees: Employee[] }) {
  // Group employees by department
  const byDept: Record<string, Employee[]> = {};
  for (const emp of employees) {
    const key = emp.departmentName ?? "Unassigned";
    if (!byDept[key]) byDept[key] = [];
    byDept[key].push(emp);
  }

  return (
    <div className="space-y-6">
      {Object.entries(byDept).map(([dept, emps]) => (
        <div key={dept} className="bg-white border border-border rounded-lg shadow-sm p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-foreground inline-block" />
            {dept}
            <span className="text-xs font-normal text-muted-foreground ml-1">({emps.length})</span>
          </h3>
          <div className="flex flex-wrap gap-3">
            {emps.map((emp) => (
              <Link key={emp.id} href={`/employees/${emp.id}`}>
                <div className="border border-border rounded-lg p-3 hover:border-foreground/30 hover:shadow-sm transition-all cursor-pointer min-w-[160px]">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-foreground font-semibold text-sm mb-2">
                    {emp.firstName[0]}{emp.lastName[0]}
                  </div>
                  <p className="text-sm font-medium text-foreground leading-tight">{emp.firstName} {emp.lastName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{emp.designationName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{emp.employeeCode}</p>
                  <StatusBadge status={emp.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
      {employees.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">No employees found</div>
      )}
    </div>
  );
}

export default function Employees() {
  const [location] = useLocation();
  const showOrgChart = location === "/employees/org-chart";

  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [sortKey, setSortKey] = useState<string>("joiningDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null);

  const { data: employees, isLoading } = useEmployees();
  const { data: depts } = useDepartments();
  const { data: currentUser } = useCurrentUser();
  const isPrivileged = ["super_admin", "hr_admin"].includes(currentUser?.role ?? "");

  const handleSort = (key: string) => {
    if (!isPrivileged) return;
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = (employees as Employee[] ?? []).filter((emp) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      emp.firstName.toLowerCase().includes(q) ||
      emp.lastName.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      emp.employeeCode.toLowerCase().includes(q);
    const matchDept = !dept || emp.departmentId === dept;
    const matchStatus = !status || emp.status === status;
    return matchSearch && matchDept && matchStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av: string, bv: string;
    switch (sortKey) {
      case "name": av = `${a.firstName} ${a.lastName}`; bv = `${b.firstName} ${b.lastName}`; break;
      case "department": av = a.departmentName ?? ""; bv = b.departmentName ?? ""; break;
      case "designation": av = a.designationName ?? ""; bv = b.designationName ?? ""; break;
      case "status": av = a.status; bv = b.status; break;
      case "joiningDate":
      default: av = a.joiningDate; bv = b.joiningDate; break;
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <PageContainer>
      <PageHeader
        title={showOrgChart ? "Org Chart" : "Employees"}
        breadcrumbs={showOrgChart ? [{ label: "Employees", href: "/employees" }, { label: "Org Chart" }] : [{ label: "Employees", href: "/employees" }, { label: "All Employees" }]}
        actions={null}
      />

      {showOrgChart ? (
        <OrgChart employees={employees as Employee[] ?? []} />
      ) : (
      <div className="bg-white border border-border rounded-lg shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={dept || "all"} onValueChange={(v) => setDept(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {(depts as Array<{ id: string; name: string }> ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                <th
                  className={`text-left px-5 py-3 ${isPrivileged ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                  onClick={() => handleSort("name")}
                >
                  Employee {isPrivileged && <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />}
                </th>
                <th className="text-left px-5 py-3">ID</th>
                <th
                  className={`text-left px-5 py-3 ${isPrivileged ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                  onClick={() => handleSort("department")}
                >
                  Department {isPrivileged && <SortIcon col="department" sortKey={sortKey} sortDir={sortDir} />}
                </th>
                <th
                  className={`text-left px-5 py-3 ${isPrivileged ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                  onClick={() => handleSort("designation")}
                >
                  Designation {isPrivileged && <SortIcon col="designation" sortKey={sortKey} sortDir={sortDir} />}
                </th>
                <th
                  className={`text-left px-5 py-3 ${isPrivileged ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                  onClick={() => handleSort("joiningDate")}
                >
                  Joining Date {isPrivileged && <SortIcon col="joiningDate" sortKey={sortKey} sortDir={sortDir} />}
                </th>
                <th
                  className={`text-left px-5 py-3 ${isPrivileged ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                  onClick={() => handleSort("status")}
                >
                  Status {isPrivileged && <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />}
                </th>
                <th className="text-left px-5 py-3 min-w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground">No employees found</td>
                </tr>
              ) : (
                sorted.map((emp, i) => (
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
                      <div className="flex items-center gap-1">
                        <Link href={`/employees/${emp.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditEmployee(emp)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteEmployee(emp)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
          Showing {sorted.length} of {(employees as Employee[] ?? []).length} employees
        </div>
      </div>
      )}

      {editEmployee && (
        <EmployeeFormDialog
          open={!!editEmployee}
          onClose={() => setEditEmployee(null)}
          employeeId={editEmployee.id}
          initial={{
            firstName: editEmployee.firstName,
            lastName: editEmployee.lastName,
            email: editEmployee.email,
            phone: editEmployee.phone ?? "",
            departmentId: editEmployee.departmentId ?? "",
            designationId: editEmployee.designationId ?? "",
            joiningDate: editEmployee.joiningDate,
            employmentType: editEmployee.employmentType,
            status: editEmployee.status,
          }}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleteEmployee}
        onClose={() => setDeleteEmployee(null)}
        employee={deleteEmployee}
      />

    </PageContainer>
  );
}
