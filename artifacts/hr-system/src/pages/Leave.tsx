import { useState } from "react";
import { useLocation } from "wouter";
import { useLeaveRequests, useLeaveTypes, useEmployees, useLeaveBalances, useCurrentUser, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Plus, Check, X, Calendar, Info, Edit2, Download, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

function isSickLeave(types: any[], leaveTypeId: string): boolean {
  const lt = types?.find((t: any) => t.id === leaveTypeId);
  if (!lt) return false;
  const name = (lt.name ?? "").toLowerCase();
  const code = (lt.code ?? "").toLowerCase();
  return name.includes("sick") || code === "sl" || code === "sick" || code === "sick_leave";
}

// ─── Apply Leave Dialog ────────────────────────────────────────────────────────
function ApplyLeaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: currentUser } = useCurrentUser();
  // Privileged roles can apply leave on behalf of any employee
  const isPrivileged = ["super_admin", "hr_admin", "it_admin", "manager"].includes(currentUser?.role ?? "");

  const [form, setForm] = useState({ employeeId: "", leaveTypeId: "", startDate: "", endDate: "", reason: "", leaveDuration: "full_day", medicalDocumentUrl: "" });
  const { data: employees } = useEmployees();
  const { data: types } = useLeaveTypes();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/leave/requests", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); onClose(); toast.success("Leave request submitted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const isHalfDay = form.leaveDuration !== "full_day";
  const sick = isSickLeave(types as any[] ?? [], form.leaveTypeId);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isAdvanceSick = sick && form.startDate && new Date(form.startDate) > today;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {/* Privileged roles select an employee; regular employees apply for themselves */}
          {isPrivileged ? (
            <div>
              <Label>Employee *</Label>
              <Select value={form.employeeId} onValueChange={v => set("employeeId", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {employees?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            currentUser?.firstName && (
              <div className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
                Applying as <span className="font-medium text-foreground">{currentUser.firstName} {currentUser.lastName}</span>
              </div>
            )
          )}
          <div>
            <Label>Leave Type *</Label>
            <Select value={form.leaveTypeId} onValueChange={v => set("leaveTypeId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
              <SelectContent>
                {types && (types as any[]).length > 0
                  ? (types as any[]).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                  : <SelectItem value="_none" disabled>No leave types configured</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Duration</Label>
            <Select value={form.leaveDuration} onValueChange={v => set("leaveDuration", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_day">Full Day</SelectItem>
                <SelectItem value="half_day_morning">Half Day (Morning)</SelectItem>
                <SelectItem value="half_day_afternoon">Half Day (Afternoon)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className={isHalfDay ? "" : "grid grid-cols-2 gap-4"}>
            <div>
              <Label>{isHalfDay ? "Date *" : "Start Date *"}</Label>
              <Input type="date" max="9999-12-31" value={form.startDate} onChange={e => set("startDate", e.target.value)} className="mt-1" />
            </div>
            {!isHalfDay && (
              <div>
                <Label>End Date *</Label>
                <Input type="date" max="9999-12-31" value={form.endDate} onChange={e => set("endDate", e.target.value)} className="mt-1" />
              </div>
            )}
          </div>

          {sick && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Sick leave <strong>cannot be applied in advance</strong> without a medical document. If the start date is a future date, a medical document link is required.</span>
            </div>
          )}

          {isAdvanceSick && (
            <div>
              <Label>Medical Document <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Paste a link to your medical document (e.g. Google Drive, email scan)"
                value={form.medicalDocumentUrl}
                onChange={e => set("medicalDocumentUrl", e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Required for advance sick leave. Share a Google Drive link or any accessible document URL.</p>
            </div>
          )}

          <div><Label>Reason</Label><Textarea value={form.reason} onChange={e => set("reason", e.target.value)} className="mt-1" rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (isPrivileged && !form.employeeId) { toast.error("Please select an employee"); return; }
              if (!form.leaveTypeId) { toast.error("Please select a leave type"); return; }
              if (!form.startDate) { toast.error("Start date is required"); return; }
              if (!isHalfDay && !form.endDate) { toast.error("End date is required"); return; }
              if (!isHalfDay && new Date(form.endDate) < new Date(form.startDate)) { toast.error("End date must be after start date"); return; }
              if (isAdvanceSick && !form.medicalDocumentUrl.trim()) { toast.error("Medical document is required for advance sick leave"); return; }
              const endDate = isHalfDay ? form.startDate : form.endDate;
              mutation.mutate({
                // Privileged roles send the selected employeeId; employees omit it
                // so the API resolves it automatically from the auth token
                ...(isPrivileged ? { employeeId: form.employeeId } : {}),
                leaveTypeId: form.leaveTypeId,
                startDate: form.startDate,
                endDate,
                reason: form.reason,
                isHalfDay,
                halfDayPeriod: isHalfDay ? form.leaveDuration : undefined,
                medicalDocumentUrl: form.medicalDocumentUrl || undefined,
              });
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Submitting..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Approve Dialog ────────────────────────────────────────────────────────────
function ApproveDialog({ req, onClose }: { req: any; onClose: () => void }) {
  const [approvedByRole, setApprovedByRole] = useState("manager");
  const [comment, setComment] = useState("");
  const qc = useQueryClient();
  const { data: employees } = useEmployees();

  // Find this employee's reporting manager
  const employee = (employees as any[] ?? []).find((e: any) => e.id === req?.employeeId);
  const manager = (employees as any[] ?? []).find((e: any) => e.id === employee?.reportingManagerId);
  const managerName = manager ? `${manager.firstName} ${manager.lastName}` : "Manager";

  const mutation = useMutation({
    mutationFn: () =>
      fetchApi(`/leave/requests/${req.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approvedByRole, comment: comment.trim() || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave approved successfully");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={!!req} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Approve Leave Request</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{req?.employeeName}</span> — {req?.leaveTypeName}
            <br />
            {req && <span className="text-xs">{formatDate(req.startDate)} – {formatDate(req.endDate)} ({req.days} {req.days === 1 ? "day" : "days"})</span>}
          </div>
          <div>
            <Label>Approving as *</Label>
            <Select value={approvedByRole} onValueChange={setApprovedByRole}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">{managerName}</SelectItem>
                <SelectItem value="hr_admin">HR Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Select the capacity in which you are approving this leave.</p>
          </div>
          <div>
            <Label>Comment (optional)</Label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Add a note for the employee..."
              className="mt-1"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
            {mutation.isPending ? "Approving..." : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject Dialog ────────────────────────────────────────────────────────────
function RejectDialog({ req, onClose }: { req: any; onClose: () => void }) {
  const [approvedByRole, setApprovedByRole] = useState("manager");
  const [comment, setComment] = useState("");
  const qc = useQueryClient();
  const { data: employees } = useEmployees();

  // Find this employee's reporting manager
  const employee = (employees as any[] ?? []).find((e: any) => e.id === req?.employeeId);
  const manager = (employees as any[] ?? []).find((e: any) => e.id === employee?.reportingManagerId);
  const managerName = manager ? `${manager.firstName} ${manager.lastName}` : "Manager";

  const mutation = useMutation({
    mutationFn: () =>
      fetchApi(`/leave/requests/${req.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ approvedByRole, comment: comment.trim() || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave rejected");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={!!req} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reject Leave Request</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{req?.employeeName}</span> — {req?.leaveTypeName}
            <br />
            {req && <span className="text-xs">{formatDate(req.startDate)} – {formatDate(req.endDate)} ({req.days} {req.days === 1 ? "day" : "days"})</span>}
          </div>
          <div>
            <Label>Rejecting as *</Label>
            <Select value={approvedByRole} onValueChange={setApprovedByRole}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">{managerName}</SelectItem>
                <SelectItem value="hr_admin">HR Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason for rejection (optional)</Label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Provide a reason for the employee..."
              className="mt-1"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} variant="destructive">
            {mutation.isPending ? "Rejecting..." : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Calendar Tab ──────────────────────────────────────────────────────────────
function LeaveCalendarTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const { data: requests, isLoading } = useLeaveRequests();

  const filtered = (requests ?? []).filter((r: any) => {
    const start = new Date(r.startDate);
    return start.getFullYear() === year && (start.getMonth() + 1) === month;
  });

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[year-1, year, year+1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-5 py-3">Employee</th>
              <th className="text-left px-5 py-3">Leave Type</th>
              <th className="text-left px-5 py-3">Start Date</th>
              <th className="text-left px-5 py-3">End Date</th>
              <th className="text-left px-5 py-3">Days</th>
              <th className="text-left px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                No leave requests for {months[month-1]} {year}
              </td></tr>
            ) : filtered.map((req: any, i: number) => (
              <tr key={req.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                <td className="px-5 py-3 font-medium text-foreground">{req.employeeName}</td>
                <td className="px-5 py-3 text-muted-foreground">{req.leaveTypeName}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(req.startDate)}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(req.endDate)}</td>
                <td className="px-5 py-3 text-center">{req.days}</td>
                <td className="px-5 py-3"><StatusBadge status={req.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Balances Tab ──────────────────────────────────────────────────────────────
function LeaveBalancesTab() {
  const { data: employees } = useEmployees();
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const { data: balances, isLoading } = useLeaveBalances(selectedEmpId || undefined);

  return (
    <div>
      <div className="mb-4">
        <Select value={selectedEmpId || "_all"} onValueChange={v => setSelectedEmpId(v === "_all" ? "" : v)}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select employee..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Select an employee</SelectItem>
            {employees?.map((e: any) => (
              <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-5 py-3">Leave Type</th>
              <th className="text-left px-5 py-3">Year</th>
              <th className="text-left px-5 py-3 text-center">Allocated</th>
              <th className="text-left px-5 py-3 text-center">Used</th>
              <th className="text-left px-5 py-3 text-center">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {!selectedEmpId ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Select an employee to view leave balances</td></tr>
            ) : isLoading ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
            ) : !balances || balances.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No leave balances found for this employee</td></tr>
            ) : balances.map((b: any, i: number) => (
              <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                <td className="px-5 py-3 font-medium text-foreground">{b.leaveTypeName}</td>
                <td className="px-5 py-3 text-muted-foreground">{b.year}</td>
                <td className="px-5 py-3 text-center">{b.balance + b.used}</td>
                <td className="px-5 py-3 text-center text-muted-foreground">{b.used}</td>
                <td className="px-5 py-3 text-center font-semibold text-foreground">{b.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Comp-Off Tab ──────────────────────────────────────────────────────────────
function CompOffTab() {
  const { data: requests, isLoading } = useLeaveRequests();
  const compoffRequests = (requests ?? []).filter((r: any) =>
    r.leaveTypeName?.toLowerCase().includes("comp") || r.leaveTypeName?.toLowerCase().includes("compensatory")
  );

  return (
    <div>
      <div className="mb-4 flex items-start gap-2 bg-secondary border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>Comp-Off (Compensatory Off) is granted when an employee works on a holiday or weekend. Requests with "Comp" or "Compensatory" leave type appear here.</p>
      </div>
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-5 py-3">Employee</th>
              <th className="text-left px-5 py-3">Leave Type</th>
              <th className="text-left px-5 py-3">Period</th>
              <th className="text-left px-5 py-3">Days</th>
              <th className="text-left px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
            ) : compoffRequests.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No comp-off requests found</td></tr>
            ) : compoffRequests.map((req: any, i: number) => (
              <tr key={req.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                <td className="px-5 py-3 font-medium text-foreground">{req.employeeName}</td>
                <td className="px-5 py-3 text-muted-foreground">{req.leaveTypeName}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">
                  {formatDate(req.startDate)} – {formatDate(req.endDate)}
                </td>
                <td className="px-5 py-3 text-center">{req.days}</td>
                <td className="px-5 py-3"><StatusBadge status={req.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Holiday Management Tab ────────────────────────────────────────────────────
function HolidayDialog({
  open, onClose, existing
}: { open: boolean; onClose: () => void; existing?: any }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [date, setDate] = useState(existing?.date ?? "");
  const [type, setType] = useState(existing?.type ?? "public");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      if (existing) {
        return fetchApi(`/holidays/${existing.id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), date, type }) });
      }
      return fetchApi("/holidays", { method: "POST", body: JSON.stringify({ name: name.trim(), date, type }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      onClose();
      toast.success(existing ? "Holiday updated" : "Holiday added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Reset form when dialog opens
  const handleOpen = (o: boolean) => { if (!o) onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Holiday Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Independence Day" className="mt-1" />
          </div>
          <div>
            <Label>Date *</Label>
            <Input type="date" max="9999-12-31" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public Holiday</SelectItem>
                <SelectItem value="optional">Optional Holiday</SelectItem>
                <SelectItem value="restricted">Restricted Holiday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!name.trim()) { toast.error("Holiday name is required"); return; }
              if (!date) { toast.error("Date is required"); return; }
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : existing ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HolidaysTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const qc = useQueryClient();

  const { data: holidays, isLoading } = useQuery({
    queryKey: ["holidays", year],
    queryFn: () => fetchApi(`/holidays?year=${year}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/holidays/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["holidays"] }); toast.success("Holiday deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const typeLabel: Record<string, string> = {
    public: "Public",
    optional: "Optional",
    restricted: "Restricted",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[year-1, year, year+1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Holiday
        </Button>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-5 py-3">Holiday</th>
              <th className="text-left px-5 py-3">Date</th>
              <th className="text-left px-5 py-3">Day</th>
              <th className="text-left px-5 py-3">Type</th>
              <th className="text-left px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
            ) : !holidays || (holidays as any[]).length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                No holidays configured for {year}
              </td></tr>
            ) : (holidays as any[])
                .slice()
                .sort((a: any, b: any) => a.date.localeCompare(b.date))
                .map((h: any, i: number) => {
                  const d = new Date(h.date + "T00:00:00");
                  const dayName = d.toLocaleDateString("en-IN", { weekday: "long" });
                  return (
                    <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium text-foreground">{h.name}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(h.date)}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{dayName}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          {typeLabel[h.type] ?? h.type ?? "Public"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditTarget(h)}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (confirm(`Delete "${h.name}"?`)) deleteMutation.mutate(h.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {addOpen && <HolidayDialog open={addOpen} onClose={() => setAddOpen(false)} />}
      {editTarget && (
        <HolidayDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          existing={editTarget}
        />
      )}
    </div>
  );
}

// ─── Reports Tab ───────────────────────────────────────────────────────────────
function LeaveReportsTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: requests, isLoading } = useLeaveRequests();

  const filtered = (requests ?? []).filter((r: any) => {
    const y = new Date(r.startDate).getFullYear();
    return y === year && (statusFilter === "all" || r.status === statusFilter);
  });

  const handleDownload = () => {
    const base = (window as any).__API_BASE__ ?? "";
    window.open(`${base}/api/leave/export?year=${year}`, "_blank");
  };

  // Aggregate stats
  const stats = filtered.reduce(
    (acc: any, r: any) => {
      acc.total++;
      if (r.status === "approved") { acc.approved++; acc.days += r.days; }
      else if (r.status === "pending") acc.pending++;
      else if (r.status === "rejected") acc.rejected++;
      return acc;
    },
    { total: 0, approved: 0, pending: 0, rejected: 0, days: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[year-1, year, year+1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="lop">LOP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={handleDownload}>
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Requests", value: stats.total, color: "text-foreground" },
          { label: "Approved", value: stats.approved, color: "text-green-600" },
          { label: "Pending", value: stats.pending, color: "text-amber-600" },
          { label: "Days Taken", value: stats.days, color: "text-blue-600" },
        ].map(card => (
          <div key={card.label} className="bg-white border border-border rounded-lg px-5 py-4 shadow-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Leave history table */}
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-5 py-3">Employee</th>
              <th className="text-left px-5 py-3">Leave Type</th>
              <th className="text-left px-5 py-3">Period</th>
              <th className="text-left px-5 py-3 text-center">Days</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Approved By</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No leave records found</td></tr>
            ) : filtered.map((req: any, i: number) => (
              <tr key={req.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                <td className="px-5 py-3 font-medium text-foreground">{req.employeeName}</td>
                <td className="px-5 py-3 text-muted-foreground">{req.leaveTypeName}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">
                  {formatDate(req.startDate)} – {formatDate(req.endDate)}
                </td>
                <td className="px-5 py-3 text-center">{req.days}</td>
                <td className="px-5 py-3"><StatusBadge status={req.status} /></td>
                <td className="px-5 py-3 text-muted-foreground text-xs">
                  {req.approvedByName
                    ? <span>{req.approvedByName} <span className="text-muted-foreground/60">({req.approvedByRole?.replace("_", " ")})</span></span>
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Leave Page ───────────────────────────────────────────────────────────
export default function Leave() {
  const [location] = useLocation();
  const [status, setStatus] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<any>(null);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const { data: requests, isLoading } = useLeaveRequests(status ? { status } : undefined);
  const qc = useQueryClient();

  const tabFromPath: Record<string, string> = {
    "/leave": "requests",
    "/leave/calendar": "calendar",
    "/leave/balances": "balances",
    "/leave/compoff": "compoff",
    "/leave/holidays": "holidays",
    "/leave/reports": "reports",
  };
  const activeTab = tabFromPath[location] ?? "requests";

  const cancelMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/leave/requests/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); toast.success("Leave request cancelled"); },
    onError: (e: any) => toast.error(e.message),
  });

  const tabItems = [
    { value: "requests", label: "Requests", path: "/leave" },
    { value: "calendar", label: "Calendar", path: "/leave/calendar" },
    { value: "balances", label: "Balances", path: "/leave/balances" },
    { value: "compoff", label: "Comp-Off", path: "/leave/compoff" },
    { value: "holidays", label: "Holidays", path: "/leave/holidays" },
    { value: "reports", label: "Reports", path: "/leave/reports" },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Leave Management"
        breadcrumbs={[{ label: "Leave" }]}
        actions={<Button size="sm" onClick={() => setApplyOpen(true)}><Plus className="w-4 h-4 mr-1" /> Apply Leave</Button>}
      />

      <Tabs value={activeTab}>
        <TabsList className="mb-4">
          {tabItems.map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              onClick={() => window.history.pushState({}, "", tab.path)}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="requests">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <Select value={status || "all"} onValueChange={v => setStatus(v === "all" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="lop">LOP</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Leave Type</th>
                    <th className="text-left px-5 py-3">Period</th>
                    <th className="text-left px-5 py-3">Days</th>
                    <th className="text-left px-5 py-3">Reason</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3 min-w-[120px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                  ) : !requests || requests.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No leave requests found</td></tr>
                  ) : requests.map((req: any, i: number) => (
                    <tr key={req.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium text-foreground">{req.employeeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {req.leaveTypeName}
                        {req.isHalfDay && <span className="ml-1 text-xs text-blue-600">(Half Day)</span>}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {formatDate(req.startDate)} – {formatDate(req.endDate)}
                      </td>
                      <td className="px-5 py-3 text-center">{req.days}</td>
                      <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{req.reason ?? "—"}</td>
                      <td className="px-5 py-3"><StatusBadge status={req.status} /></td>
                      <td className="px-5 py-3">
                        {(req.status === "pending" || req.status === "lop") && (
                          <div className="flex gap-1">
                            <Button
                              size="sm" variant="outline"
                              title="Approve"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50 h-7 px-2"
                              onClick={() => setApproveTarget(req)}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              title="Reject"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2"
                              onClick={() => setRejectTarget(req)}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              title="Cancel Request"
                              className="text-muted-foreground hover:text-foreground h-7 px-2"
                              onClick={() => {
                                if (confirm("Cancel this leave request?")) {
                                  cancelMutation.mutate(req.id);
                                }
                              }}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <LeaveCalendarTab />
        </TabsContent>

        <TabsContent value="balances">
          <LeaveBalancesTab />
        </TabsContent>

        <TabsContent value="compoff">
          <CompOffTab />
        </TabsContent>

        <TabsContent value="holidays">
          <HolidaysTab />
        </TabsContent>

        <TabsContent value="reports">
          <LeaveReportsTab />
        </TabsContent>
      </Tabs>

      <ApplyLeaveDialog open={applyOpen} onClose={() => setApplyOpen(false)} />
      {approveTarget && <ApproveDialog req={approveTarget} onClose={() => setApproveTarget(null)} />}
      {rejectTarget && <RejectDialog req={rejectTarget} onClose={() => setRejectTarget(null)} />}


    </PageContainer>
  );
}
