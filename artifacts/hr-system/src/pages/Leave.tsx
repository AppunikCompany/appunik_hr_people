import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Plus, Check, X, Calendar, Info, Edit2, Download, Trash2, RotateCcw, Upload, AlertTriangle, BanknoteIcon } from "lucide-react";
import { toast } from "sonner";

function isSickLeave(types: any[], leaveTypeId: string): boolean {
  const lt = types?.find((t: any) => t.id === leaveTypeId);
  if (!lt) return false;
  const name = (lt.name ?? "").toLowerCase();
  const code = (lt.code ?? "").toLowerCase();
  return name.includes("sick") || code === "sl" || code === "sick" || code === "sick_leave";
}

function isLwpType(types: any[], leaveTypeId: string): boolean {
  const lt = types?.find((t: any) => t.id === leaveTypeId);
  return (lt?.code ?? "").toLowerCase() === "lwp";
}

// ─── Apply Leave Dialog ────────────────────────────────────────────────────────
function ApplyLeaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: currentUser } = useCurrentUser();
  // Privileged roles can apply leave on behalf of any employee
  const isPrivileged = ["super_admin", "hr_admin", "it_admin", "manager"].includes(currentUser?.role ?? "");

  const [form, setForm] = useState({ employeeId: "", leaveTypeId: "", startDate: "", endDate: "", reason: "", leaveDuration: "full_day", medicalDocumentUrl: "" });
  const [lwpAcknowledged, setLwpAcknowledged] = useState(false);
  const { data: employees } = useEmployees({ status: "active" });
  const { data: types } = useLeaveTypes();
  const qc = useQueryClient();

  // Fetch balance for the relevant employee to detect LWP
  const balanceEmpId = isPrivileged ? form.employeeId : (currentUser?.employeeId ?? "");
  const { data: balances } = useLeaveBalances(balanceEmpId || undefined);
  const selectedBalance = (balances as any[] ?? []).find((b: any) => b.leaveTypeId === form.leaveTypeId);

  // Reset acknowledgement whenever leave type or employee changes
  useEffect(() => { setLwpAcknowledged(false); }, [form.leaveTypeId, form.employeeId]);

  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/leave/requests", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); onClose(); toast.success("Leave request submitted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const isHalfDay = form.leaveDuration !== "full_day";
  const sick = isSickLeave(types as any[] ?? [], form.leaveTypeId);
  const isExplicitLwp = isLwpType(types as any[] ?? [], form.leaveTypeId);
  const todayStr = new Date().toISOString().split("T")[0];

  // Estimate days for warning logic (rough count, exact count done server-side)
  const estimateDays = () => {
    if (isHalfDay) return 0.5;
    if (!form.startDate || !form.endDate) return 0;
    let count = 0; const cur = new Date(form.startDate);
    const end = new Date(form.endDate);
    while (cur <= end) { const d = cur.getDay(); if (d !== 0 && d !== 6) count++; cur.setDate(cur.getDate() + 1); }
    return count;
  };
  const estDays = estimateDays();

  // LWP detection: explicit choice OR balance exhausted
  const remaining = selectedBalance?.balance ?? null;
  const isAutoLwp = !isExplicitLwp && remaining !== null && estDays > 0 && remaining < estDays;
  const isLwp = isExplicitLwp || isAutoLwp;
  const lwpDays = isExplicitLwp ? estDays : isAutoLwp ? Math.max(0, estDays - (remaining ?? 0)) : 0;
  const isFullyLwp = isExplicitLwp || (isAutoLwp && (remaining ?? 0) <= 0);

  const isBackdated = sick && form.startDate && form.startDate < todayStr;
  // Advance = sick leave with a future start date — document required upfront, no grace period
  const isAdvance = sick && form.startDate && form.startDate > todayStr;
  const sickDoc3Plus = sick && !isAdvance && estDays >= 3;  // mandatory (can upload later, backdated/today only)
  const sickDocOptional = sick && !isAdvance && estDays === 2; // optional, soft warning
  const showDocField = sick && (isAdvance || estDays >= 2);  // show doc field for advance or 2+ days

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
                {(() => {
                  const allTypes = (types as any[] ?? []);
                  const regular = allTypes.filter((t: any) => (t.code ?? "").toLowerCase() !== "lwp");
                  const lwp = allTypes.find((t: any) => (t.code ?? "").toLowerCase() === "lwp");
                  return (
                    <>
                      {regular.length > 0
                        ? regular.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                        : <SelectItem value="_none" disabled>No leave types configured</SelectItem>}
                      {lwp && (
                        <>
                          <div className="my-1 border-t border-border" />
                          <SelectItem key={lwp.id} value={lwp.id}>
                            <span className="flex items-center gap-1.5">
                              <BanknoteIcon className="w-3.5 h-3.5 text-red-500" />
                              {lwp.name}
                            </span>
                          </SelectItem>
                        </>
                      )}
                    </>
                  );
                })()}
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

          {/* Backdated sick leave notice */}
          {isBackdated && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>This is a <strong>backdated</strong> sick leave. Your manager will be notified for review.</span>
            </div>
          )}

          {/* Advance sick leave — doc required upfront */}
          {isAdvance && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Sick leave <strong>planned in advance</strong> requires a supporting document (doctor's appointment letter, medical certificate, etc.) before it can be submitted.
              </span>
            </div>
          )}

          {/* 2-day optional document warning */}
          {sickDocOptional && !sickDoc3Plus && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>For 2-day sick leave, a medical document is <strong>recommended</strong>. HR may request proof later.</span>
            </div>
          )}

          {/* 3+ day mandatory document notice */}
          {sickDoc3Plus && (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Sick leave of <strong>3 or more days</strong> requires a medical document.
                You can submit now and upload the document later — but it <strong>must be uploaded within 3 days</strong> or the leave will be converted to Loss of Pay.
              </span>
            </div>
          )}

          {/* Document upload field for advance / 2+ days sick leave */}
          {showDocField && (
            <div>
              <Label>
                Medical Document{" "}
                {isAdvance
                  ? <span className="text-red-600 text-xs">(required for advance sick leave)</span>
                  : sickDoc3Plus
                    ? <span className="text-orange-600 text-xs">(required within 3 days)</span>
                    : <span className="text-muted-foreground text-xs">(optional)</span>}
              </Label>
              <Input
                placeholder="Paste a Google Drive link, prescription scan URL, etc."
                value={form.medicalDocumentUrl}
                onChange={e => set("medicalDocumentUrl", e.target.value)}
                className="mt-1"
              />
            </div>
          )}

          <div><Label>Reason</Label><Textarea value={form.reason} onChange={e => set("reason", e.target.value)} className="mt-1" rows={3} /></div>

          {/* ── LWP Warning ───────────────────────────────────────────── */}
          {isLwp && (
            <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 space-y-2">
              <div className="flex items-start gap-2">
                <BanknoteIcon className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                <div className="text-sm text-red-800">
                  {isExplicitLwp ? (
                    <>
                      You have selected <strong>Leave Without Pay</strong>. {estDays > 0 ? `All ${estDays}d` : "This leave"} will be
                      unpaid regardless of your available balance.
                    </>
                  ) : isFullyLwp ? (
                    <>
                      <strong>No leave balance remaining.</strong> This entire request ({estDays}d) will be
                      treated as <strong>Leave Without Pay</strong> and will affect your salary.
                    </>
                  ) : (
                    <>
                      You have <strong>{remaining}d remaining</strong> for this leave type.
                      <strong> {lwpDays}d</strong> of this request will be treated as{" "}
                      <strong>Leave Without Pay</strong> and will affect your salary.
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="lwp-ack"
                  checked={lwpAcknowledged}
                  onCheckedChange={(v) => setLwpAcknowledged(!!v)}
                />
                <label htmlFor="lwp-ack" className="text-xs text-red-800 cursor-pointer select-none">
                  I understand that this leave will be unpaid and will be deducted from my salary.
                </label>
              </div>
            </div>
          )}
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
              if (isAdvance && !form.medicalDocumentUrl.trim()) { toast.error("A medical document is required for advance sick leave"); return; }
              if (isLwp && !lwpAcknowledged) { toast.error("Please acknowledge that this leave will be unpaid"); return; }
              const endDate = isHalfDay ? form.startDate : form.endDate;
              mutation.mutate({
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
            disabled={mutation.isPending || (isLwp && !lwpAcknowledged)}
          >
            {mutation.isPending ? "Submitting..." : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Upload Document Dialog ───────────────────────────────────────────────────
function UploadDocDialog({ req, onClose }: { req: any; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      fetchApi(`/leave/requests/${req.id}/document`, {
        method: "PATCH",
        body: JSON.stringify({ medicalDocumentUrl: url.trim() }),
      }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["leave-requests"] });
      onClose();
      toast.success(data.statusChanged
        ? "Document uploaded — leave is now pending manager approval"
        : "Document updated successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={!!req} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Upload Medical Document</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{req?.employeeName}</span> — {req?.leaveTypeName}
            <br />
            {req && <span className="text-xs">{formatDate(req.startDate)} – {formatDate(req.endDate)} ({req.days} {req.days === 1 ? "day" : "days"})</span>}
          </div>
          {req?.documentDeadlineAt && (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Document deadline: <strong>{formatDate(new Date(req.documentDeadlineAt).toISOString().split("T")[0])}</strong>. After this date the leave converts to Loss of Pay.</span>
            </div>
          )}
          <div>
            <Label>Document URL *</Label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Paste Google Drive, Dropbox, or any accessible link..."
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Share a link to a prescription, doctor's note, or medical certificate.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!url.trim()) { toast.error("Please enter a document URL"); return; }
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Uploading..." : "Upload Document"}
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
  const { data: employees } = useEmployees({ status: "active" });

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
  const { data: employees } = useEmployees({ status: "active" });

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

// ─── Adjust Balance Dialog ────────────────────────────────────────────────────
function AdjustBalanceDialog({ balance, onClose }: { balance: any; onClose: () => void }) {
  // annual entitlement = total balance minus any carry-forward already recorded
  const annualEntitlement = (balance.used + balance.balance) - (balance.carriedForward ?? 0);
  const [usedStr, setUsedStr] = useState(String(balance.used));
  const [carryStr, setCarryStr] = useState(String(balance.carriedForward ?? 0));
  const qc = useQueryClient();

  const used = Math.max(0, parseFloat(usedStr) || 0);
  const carried = Math.max(0, parseFloat(carryStr) || 0);
  const totalBalance = annualEntitlement + carried;   // new total entitlement
  const remaining = Math.max(0, totalBalance - used);

  const mutation = useMutation({
    mutationFn: () => fetchApi(`/leave/balances/${balance.id}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: remaining, used, carriedForward: carried }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Balance updated");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={!!balance} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Adjust Leave Balance</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md bg-secondary px-3 py-2 text-sm">
            <p className="font-medium text-foreground">{balance.leaveTypeName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Annual entitlement: <strong>{annualEntitlement} days</strong> · Year: {balance.year}
            </p>
          </div>

          <div>
            <Label>Carry Forward Days (from previous year)</Label>
            <Input
              type="number"
              min="0"
              max="365"
              step="0.5"
              value={carryStr}
              onChange={e => setCarryStr(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Extra days carried over from last year. Added on top of the annual entitlement.
            </p>
          </div>

          <div>
            <Label>Days Already Used</Label>
            <Input
              type="number"
              min="0"
              max={totalBalance}
              step="0.5"
              value={usedStr}
              onChange={e => setUsedStr(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Days consumed so far this year (approved leaves).
            </p>
          </div>

          <div className="rounded-md bg-secondary px-3 py-2 text-sm space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Annual entitlement</span><span>{annualEntitlement}d</span>
            </div>
            {carried > 0 && (
              <div className="flex justify-between text-xs text-blue-600">
                <span>+ Carry forward</span><span>+{carried}d</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-1.5">
              <span>Used</span><span>−{used}d</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span>Remaining</span>
              <span className={remaining <= 0 ? "text-red-600" : remaining <= 2 ? "text-amber-600" : "text-green-700"}>
                {remaining}d
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Balances Tab ──────────────────────────────────────────────────────────────
function LeaveBalancesTab() {
  const { data: currentUser } = useCurrentUser();
  const isPrivileged = ["super_admin", "hr_admin", "it_admin", "manager"].includes(currentUser?.role ?? "");

  const { data: employees } = useEmployees({ status: "active" });
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [adjustBalance, setAdjustBalance] = useState<any>(null);

  // For employees: always load own balance automatically via their employeeId.
  // For privileged roles: load based on dropdown selection.
  const effectiveEmpId = isPrivileged ? selectedEmpId : (currentUser?.employeeId ?? "");
  const { data: balances, isLoading } = useLeaveBalances(effectiveEmpId || undefined);

  // Fetch LWP requests to show per-type LWP days in the balance table
  const { data: lopRequests } = useLeaveRequests(effectiveEmpId ? { status: "lop", employeeId: effectiveEmpId } : { status: "lop" });
  const currentYear = new Date().getFullYear();
  const lopByType = new Map<string, number>();
  for (const r of (lopRequests as any[] ?? [])) {
    if (new Date(r.startDate).getFullYear() === currentYear) {
      lopByType.set(r.leaveTypeId, (lopByType.get(r.leaveTypeId) ?? 0) + (r.days ?? 0));
    }
  }
  const totalLwpDays = Array.from(lopByType.values()).reduce((s, v) => s + v, 0);

  const balanceRows = (balances as any[] ?? []);
  const totalAllocated = balanceRows.reduce((s: number, b: any) => s + b.used + b.balance, 0);
  const totalUsed = balanceRows.reduce((s: number, b: any) => s + b.used, 0);
  const totalRemaining = balanceRows.reduce((s: number, b: any) => s + b.balance, 0);

  return (
    <div>
      {/* Privileged roles see an employee selector; employees see their own name as context */}
      <div className="mb-4">
        {isPrivileged ? (
          <Select value={selectedEmpId || "_all"} onValueChange={v => setSelectedEmpId(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select employee..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Select an employee</SelectItem>
              {employees?.map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          currentUser?.firstName && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-md text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{currentUser.firstName} {currentUser.lastName}</span>
              <span>— your leave balance for {new Date().getFullYear()}</span>
            </div>
          )
        )}
      </div>

      <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-5 py-3">Leave Type</th>
              <th className="text-left px-5 py-3">Year</th>
              <th className="text-center px-5 py-3">Allocated</th>
              <th className="text-center px-5 py-3">Used</th>
              <th className="text-center px-5 py-3">Remaining</th>
              <th className="text-center px-5 py-3 text-red-600">LWP Days</th>
              {isPrivileged && <th className="text-right px-5 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isPrivileged && !selectedEmpId ? (
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Select an employee to view and adjust their leave balances</td></tr>
            ) : isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
            ) : balanceRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted-foreground">
                  No leave balances found.{isPrivileged && " Go to Settings → Leave Policies and click \"Allocate for " + new Date().getFullYear() + "\" first."}
                </td>
              </tr>
            ) : (
              <>
                {balanceRows.map((b: any, i: number) => {
                  const allocated = b.used + b.balance;
                  const pct = allocated > 0 ? Math.round((b.balance / allocated) * 100) : 0;
                  const lwpForType = lopByType.get(b.leaveTypeId) ?? 0;
                  return (
                    <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium text-foreground">{b.leaveTypeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{b.year}</td>
                      <td className="px-5 py-3 text-center">{allocated}</td>
                      <td className="px-5 py-3 text-center text-muted-foreground">{b.used}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`font-semibold ${b.balance <= 0 ? "text-red-600" : b.balance <= 2 ? "text-amber-600" : "text-green-700"}`}>
                          {b.balance}
                        </span>
                        {b.carriedForward > 0 && (
                          <div className="text-[10px] text-blue-600 mt-0.5">incl. {b.carriedForward}d carried</div>
                        )}
                        <div className="mt-1 w-full max-w-[80px] mx-auto h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full rounded-full ${b.balance <= 0 ? "bg-red-500" : b.balance <= 2 ? "bg-amber-500" : "bg-green-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {lwpForType > 0
                          ? <span className="font-semibold text-red-600">{lwpForType}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      {isPrivileged && (
                        <td className="px-5 py-3 text-right">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAdjustBalance(b)}>
                            Adjust
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="border-t-2 border-border bg-secondary font-semibold text-foreground">
                  <td className="px-5 py-3" colSpan={2}>Total</td>
                  <td className="px-5 py-3 text-center">{totalAllocated}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{totalUsed}</td>
                  <td className="px-5 py-3 text-center text-green-700">{totalRemaining}</td>
                  <td className="px-5 py-3 text-center text-red-600">{totalLwpDays > 0 ? totalLwpDays : "—"}</td>
                  {isPrivileged && <td />}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {adjustBalance && (
        <AdjustBalanceDialog balance={adjustBalance} onClose={() => setAdjustBalance(null)} />
      )}
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
// ─── LWP Tab ──────────────────────────────────────────────────────────────────
function LwpTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(0); // 0 = all months
  const { data: currentUser } = useCurrentUser();
  const isPrivileged = ["super_admin", "hr_admin", "it_admin", "manager"].includes(currentUser?.role ?? "");

  const { data: allRequests, isLoading } = useLeaveRequests({ status: "lop" });

  const filtered = (allRequests ?? []).filter((r: any) => {
    const d = new Date(r.startDate);
    const matchYear = d.getFullYear() === year;
    const matchMonth = month === 0 || d.getMonth() + 1 === month;
    return matchYear && matchMonth;
  });

  const totalDays = filtered.reduce((sum: number, r: any) => sum + (r.days ?? 0), 0);
  const pendingCount = filtered.filter((r: any) => r.status === "lop" && !r.approvedById).length;
  const approvedCount = filtered.filter((r: any) => r.approvedById).length;
  const uniqueEmployees = new Set(filtered.map((r: any) => r.employeeId)).size;

  const handleExport = () => {
    const headers = ["Employee", "Leave Type", "Start Date", "End Date", "Days", "Reason", "Approved By"];
    const rows = filtered.map((r: any) => [
      r.employeeName, r.leaveTypeName, r.startDate, r.endDate, r.days,
      `"${(r.reason ?? "").replace(/"/g, '""')}"`,
      r.approvedByName ?? "Pending",
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `lwp_report_${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const MONTHS = ["All Months","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="space-y-5">
      {/* Header filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[year-1, year, year+1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {isPrivileged && (
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "LWP Requests", value: filtered.length, color: "text-red-600" },
          { label: "Total LWP Days", value: totalDays, color: "text-red-700" },
          { label: "Employees Affected", value: uniqueEmployees, color: "text-amber-600" },
          { label: "Pending Approval", value: pendingCount, color: "text-amber-500" },
        ].map(card => (
          <div key={card.label} className="bg-white border border-border rounded-lg px-5 py-4 shadow-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Explanation banner */}
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-sm text-red-800">
        <BanknoteIcon className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          <strong>Leave Without Pay (LWP)</strong> is triggered when an employee's leave balance is exhausted.
          These days are unpaid and should be shared with payroll for salary deductions.
        </span>
      </div>

      {/* LWP requests table */}
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-red-50 text-xs uppercase tracking-wider text-red-700 border-b border-red-100">
              {isPrivileged && <th className="text-left px-5 py-3">Employee</th>}
              <th className="text-left px-5 py-3">Leave Type</th>
              <th className="text-left px-5 py-3">Period</th>
              <th className="text-center px-5 py-3">LWP Days</th>
              <th className="text-left px-5 py-3">Reason</th>
              <th className="text-left px-5 py-3">Approved By</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">
                <BanknoteIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                No Leave Without Pay records for this period.
              </td></tr>
            ) : filtered.map((req: any, i: number) => (
              <tr key={req.id} className={`border-b border-secondary ${i % 2 === 0 ? "bg-white" : "bg-red-50/30"}`}>
                {isPrivileged && <td className="px-5 py-3 font-medium text-foreground">{req.employeeName}</td>}
                <td className="px-5 py-3 text-muted-foreground">{req.leaveTypeName}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(req.startDate)} – {formatDate(req.endDate)}</td>
                <td className="px-5 py-3 text-center font-semibold text-red-600">{req.days}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{req.reason || "—"}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">
                  {req.approvedByName
                    ? <span className="text-green-700">{req.approvedByName}</span>
                    : <span className="text-amber-600">Pending</span>}
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-red-100 font-semibold text-red-800 border-t-2 border-red-200">
                {isPrivileged && <td className="px-5 py-3">Total</td>}
                <td className="px-5 py-3" colSpan={isPrivileged ? 2 : 3} />
                <td className="px-5 py-3 text-center">{totalDays}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

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
      else if (r.status === "lop") { acc.lop++; acc.lopDays += r.days; }
      return acc;
    },
    { total: 0, approved: 0, pending: 0, rejected: 0, days: 0, lop: 0, lopDays: 0 }
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
              <SelectItem value="pending_doc">Doc Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="lop">Loss of Pay</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={handleDownload}>
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Requests", value: stats.total, color: "text-foreground" },
          { label: "Approved", value: stats.approved, color: "text-green-600" },
          { label: "Pending", value: stats.pending, color: "text-amber-600" },
          { label: "Days Taken", value: stats.days, color: "text-blue-600" },
          { label: "LWP Days", value: stats.lopDays, color: "text-red-600" },
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
  const [uploadDocTarget, setUploadDocTarget] = useState<any>(null);
  const { data: requests, isLoading } = useLeaveRequests(status ? { status } : undefined);
  const qc = useQueryClient();

  const tabFromPath: Record<string, string> = {
    "/leave": "requests",
    "/leave/calendar": "calendar",
    "/leave/balances": "balances",
    "/leave/compoff": "compoff",
    "/leave/holidays": "holidays",
    "/leave/lwp": "lwp",
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
    { value: "lwp", label: "Without Pay", path: "/leave/lwp" },
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
                  <SelectItem value="pending_doc">Doc Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="lop">Loss of Pay</SelectItem>
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
                        {req.isBackdated && <span className="ml-1 text-xs text-purple-600 bg-purple-50 px-1 py-0.5 rounded">(Backdated)</span>}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {formatDate(req.startDate)} – {formatDate(req.endDate)}
                      </td>
                      <td className="px-5 py-3 text-center">{req.days}</td>
                      <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{req.reason ?? "—"}</td>
                      <td className="px-5 py-3"><StatusBadge status={req.status} /></td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          {(req.status === "pending" || req.status === "lop") && (
                            <>
                              <Button size="sm" variant="outline" title="Approve" className="text-green-600 hover:text-green-700 hover:bg-green-50 h-7 px-2" onClick={() => setApproveTarget(req)}>
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" title="Reject" className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2" onClick={() => setRejectTarget(req)}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Cancel Request" className="text-muted-foreground hover:text-foreground h-7 px-2" onClick={() => { if (confirm("Cancel this leave request?")) cancelMutation.mutate(req.id); }}>
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          {req.status === "pending_doc" && (
                            <>
                              <Button size="sm" variant="outline" title="Upload Medical Document" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 h-7 px-2 gap-1 text-xs" onClick={() => setUploadDocTarget(req)}>
                                <Upload className="w-3.5 h-3.5" /> Doc
                              </Button>
                              <Button size="sm" variant="ghost" title="Cancel Request" className="text-muted-foreground hover:text-foreground h-7 px-2" onClick={() => { if (confirm("Cancel this leave request?")) cancelMutation.mutate(req.id); }}>
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
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

        <TabsContent value="lwp">
          <LwpTab />
        </TabsContent>

        <TabsContent value="reports">
          <LeaveReportsTab />
        </TabsContent>
      </Tabs>

      <ApplyLeaveDialog open={applyOpen} onClose={() => setApplyOpen(false)} />
      {approveTarget && <ApproveDialog req={approveTarget} onClose={() => setApproveTarget(null)} />}
      {rejectTarget && <RejectDialog req={rejectTarget} onClose={() => setRejectTarget(null)} />}
      {uploadDocTarget && <UploadDocDialog req={uploadDocTarget} onClose={() => setUploadDocTarget(null)} />}


    </PageContainer>
  );
}
