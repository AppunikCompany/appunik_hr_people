import { useState } from "react";
import { Link } from "wouter";
import { useEmployees, useDepartments, useDesignations, fetchApi } from "@/hooks/useApi";
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
import { Plus, Search, Eye, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
      <DialogContent className="max-w-lg">
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
            <Input type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} className="mt-1" />
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
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
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
      <DialogContent className="max-w-sm">
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

export default function Employees() {
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null);

  const { data: employees, isLoading } = useEmployees();
  const { data: depts } = useDepartments();

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

      <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E5E7EB]">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" />
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
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F9FAFB] text-xs uppercase tracking-wider text-[#6B7280]">
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
                <tr>
                  <td colSpan={7} className="text-center py-10 text-[#6B7280]">Loading...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-[#6B7280]">No employees found</td>
                </tr>
              ) : (
                filtered.map((emp, i) => (
                  <tr key={emp.id} className={i % 2 === 0 ? "bg-white" : "bg-[#F9FAFB]"}>
                    <td className="px-5 py-3">
                      <div>
                        <p className="font-medium text-[#111827]">{emp.firstName} {emp.lastName}</p>
                        <p className="text-xs text-[#6B7280]">{emp.email}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[#6B7280] font-mono text-xs">{emp.employeeCode}</td>
                    <td className="px-5 py-3 text-[#6B7280]">{emp.departmentName ?? "—"}</td>
                    <td className="px-5 py-3 text-[#6B7280]">{emp.designationName ?? "—"}</td>
                    <td className="px-5 py-3 text-[#6B7280]">{formatDate(emp.joiningDate)}</td>
                    <td className="px-5 py-3"><StatusBadge status={emp.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/employees/${emp.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-[#6B7280] hover:text-[#111827]">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-[#6B7280] hover:text-[#2563EB]"
                          onClick={() => setEditEmployee(emp)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-[#6B7280] hover:text-red-600"
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

        <div className="px-5 py-3 border-t border-[#E5E7EB] text-xs text-[#6B7280]">
          Showing {filtered.length} of {(employees as Employee[] ?? []).length} employees
        </div>
      </div>

      <EmployeeFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />

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
