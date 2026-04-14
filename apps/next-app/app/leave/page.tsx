"use client";

import { useState } from "react";
import { useLeaveRequests, useLeaveTypes, useLeaveBalances, useLeaveCalendar, useCompoffs, useEmployees, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Plus, Check, X, Download, Trash2, Edit, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";

// ── IT Company Standard Policies Data ──
const IT_POLICIES = [
  { code: "CL", name: "Casual Leave", days: 6, paid: true, carry: false, accrual: "0.5/month", description: "For personal/family needs. Can be taken with 1 day notice." },
  { code: "SL", name: "Sick Leave", days: 6, paid: true, carry: false, accrual: "0.5/month", description: "For illness or medical appointments. Medical certificate may be required for >2 consecutive days." },
  { code: "EL", name: "Earned Leave", days: 15, paid: true, carry: true, accrual: "1.25/month", description: "Accrued based on days worked. Carry forward up to 30 days. Encashable at exit." },
  { code: "ML", name: "Maternity Leave", days: 182, paid: true, carry: false, accrual: "—", description: "26 weeks as per Maternity Benefit Act. Applicable after 80 days of work in 12 months." },
  { code: "PAT", name: "Paternity Leave", days: 15, paid: true, carry: false, accrual: "—", description: "For new fathers within 6 months of child birth/adoption." },
  { code: "BL", name: "Bereavement Leave", days: 5, paid: true, carry: false, accrual: "—", description: "For immediate family member's demise. Supporting documents required." },
  { code: "MAR", name: "Marriage Leave", days: 3, paid: true, carry: false, accrual: "—", description: "For own marriage. Once in a career. Supporting documents required." },
  { code: "LOP", name: "Loss of Pay", days: 0, paid: false, carry: false, accrual: "—", description: "Automatically applied when other leave balances are exhausted. Deducted from salary." },
  { code: "CO", name: "Compensatory Off", days: 0, paid: true, carry: false, accrual: "Manual", description: "Granted for working on designated holidays or weekends. Must be used within 90 days." },
];

// ── Dialogs ──

function ApplyLeaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ employeeId: "", leaveTypeId: "", startDate: "", endDate: "", reason: "" });
  const { data: employees } = useEmployees();
  const { data: types } = useLeaveTypes();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => fetchApi("/leave/requests", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); onClose(); toast.success("Leave request submitted"); setForm({ employeeId: "", leaveTypeId: "", startDate: "", endDate: "", reason: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Employee *</Label>
            <Select value={form.employeeId} onValueChange={v => set("employeeId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>{employees?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Leave Type *</Label>
            <Select value={form.leaveTypeId} onValueChange={v => set("leaveTypeId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
              <SelectContent>{types?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date *</Label><Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} className="mt-1" /></div>
            <div><Label>End Date *</Label><Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} className="mt-1" /></div>
          </div>
          <div><Label>Reason</Label><Textarea value={form.reason} onChange={e => set("reason", e.target.value)} className="mt-1" rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.employeeId || !form.leaveTypeId || !form.startDate || !form.endDate || mutation.isPending}>{mutation.isPending ? "Submitting..." : "Submit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveRejectDialog({ request, action, open, onClose }: { request: any; action: "approve" | "reject"; open: boolean; onClose: () => void }) {
  const [comment, setComment] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => fetchApi(`/leave/requests/${request.id}/${action}`, { method: "POST", body: JSON.stringify({ comment }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); onClose(); toast.success(`Leave ${action}d`); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="capitalize">{action} Leave — {request?.employeeName}</DialogTitle></DialogHeader>
        <div className="py-2">
          <Label>Comment (optional)</Label>
          <Textarea value={comment} onChange={e => setComment(e.target.value)} className="mt-1" rows={3} placeholder="Add a comment..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className={action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>
            {mutation.isPending ? "Processing..." : action === "approve" ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypeDialog({ type, open, onClose }: { type?: any; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!type;
  const [form, setForm] = useState({
    name: type?.name ?? "", code: type?.code ?? "",
    maxDaysPerYear: String(type?.maxDaysPerYear ?? ""),
    accrualPerMonth: type?.accrualPerMonth != null ? String(type.accrualPerMonth) : "",
    isCarryForward: type?.isCarryForward ?? false,
    maxCarryForward: type?.maxCarryForward != null ? String(type.maxCarryForward) : "",
    isPaidLeave: type?.isPaidLeave ?? true,
    isActive: type?.isActive ?? true,
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name, code: form.code.toUpperCase(),
        maxDaysPerYear: parseInt(form.maxDaysPerYear) || 0,
        accrualPerMonth: form.accrualPerMonth ? parseFloat(form.accrualPerMonth) : null,
        isCarryForward: form.isCarryForward,
        maxCarryForward: form.maxCarryForward ? parseInt(form.maxCarryForward) : null,
        isPaidLeave: form.isPaidLeave, isActive: form.isActive,
      };
      return isEdit
        ? fetchApi(`/leave/types/${type.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : fetchApi("/leave/types", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-types"] }); onClose(); toast.success(isEdit ? "Leave type updated" : "Leave type created"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Leave Type</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
            <div><Label>Code * (e.g. CL, SL)</Label><Input value={form.code} onChange={e => set("code", e.target.value)} className="mt-1 font-mono" maxLength={10} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Max Days / Year</Label><Input type="number" value={form.maxDaysPerYear} onChange={e => set("maxDaysPerYear", e.target.value)} className="mt-1" min={0} /></div>
            <div><Label>Accrual / Month</Label><Input type="number" value={form.accrualPerMonth} onChange={e => set("accrualPerMonth", e.target.value)} className="mt-1" step="0.25" placeholder="Optional" /></div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2"><Switch checked={form.isPaidLeave} onCheckedChange={v => set("isPaidLeave", v)} /><Label>Paid Leave</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.isCarryForward} onCheckedChange={v => set("isCarryForward", v)} /><Label>Carry Forward</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} /><Label>Active</Label></div>
          </div>
          {form.isCarryForward && (
            <div className="max-w-xs"><Label>Max Carry Forward Days</Label><Input type="number" value={form.maxCarryForward} onChange={e => set("maxCarryForward", e.target.value)} className="mt-1" min={0} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || !form.code || mutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustBalanceDialog({ balance, open, onClose }: { balance: any; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [newBalance, setNewBalance] = useState(String(balance?.balance ?? ""));
  const mutation = useMutation({
    mutationFn: () => fetchApi(`/leave/balances/${balance.id}`, { method: "PATCH", body: JSON.stringify({ balance: parseFloat(newBalance) }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-balances"] }); onClose(); toast.success("Balance adjusted"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Adjust Leave Balance</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{balance?.leaveTypeName} balance for this employee</p>
        <div className="py-2">
          <Label>New Balance (days)</Label>
          <Input type="number" value={newBalance} onChange={e => setNewBalance(e.target.value)} className="mt-1" step="0.5" min={0} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrantCompoffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: employees } = useEmployees();
  const qc = useQueryClient();
  const [form, setForm] = useState({ employeeId: "", workDate: "", creditDays: "1", reason: "", expiryDate: "" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => fetchApi("/leave/compoff", {
      method: "POST",
      body: JSON.stringify({ ...form, creditDays: parseFloat(form.creditDays), expiryDate: form.expiryDate || null }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compoffs"] }); onClose(); toast.success("Comp-off granted"); setForm({ employeeId: "", workDate: "", creditDays: "1", reason: "", expiryDate: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Grant Compensatory Off</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Employee *</Label>
            <Select value={form.employeeId} onValueChange={v => set("employeeId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>{employees?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Work Date *</Label><Input type="date" value={form.workDate} onChange={e => set("workDate", e.target.value)} className="mt-1" /></div>
            <div><Label>Credit Days *</Label><Input type="number" value={form.creditDays} onChange={e => set("creditDays", e.target.value)} className="mt-1" min={0.5} step={0.5} /></div>
          </div>
          <div><Label>Expiry Date</Label><Input type="date" value={form.expiryDate} onChange={e => set("expiryDate", e.target.value)} className="mt-1" /></div>
          <div><Label>Reason</Label><Textarea value={form.reason} onChange={e => set("reason", e.target.value)} className="mt-1" rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.employeeId || !form.workDate || mutation.isPending}>Grant</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ──

export default function Leave() {
  const qc = useQueryClient();
  const today = new Date();
  const [statusFilter, setStatusFilter] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ request: any; action: "approve" | "reject" } | null>(null);
  const [ltDialog, setLtDialog] = useState<{ type?: any } | null>(null);
  const [balDialog, setBalDialog] = useState<any>(null);
  const [compoffOpen, setCompoffOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [allocYear, setAllocYear] = useState(String(today.getFullYear()));

  const { data: requests, isLoading: reqLoading } = useLeaveRequests(statusFilter ? { status: statusFilter } : undefined);
  const { data: types } = useLeaveTypes();
  const { data: balances } = useLeaveBalances();
  const { data: calendar } = useLeaveCalendar(calMonth, calYear);
  const { data: compoffs } = useCompoffs();
  const { data: employees } = useEmployees();

  const empMap = new Map((employees ?? []).map((e: any) => [e.id, `${e.firstName} ${e.lastName}`]));

  const deleteRequest = useMutation({
    mutationFn: (id: string) => fetchApi(`/leave/requests/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); toast.success("Request deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteType = useMutation({
    mutationFn: (id: string) => fetchApi(`/leave/types/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-types"] }); toast.success("Leave type deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const seedTypes = useMutation({
    mutationFn: () => fetchApi("/leave/types/seed", { method: "POST" }),
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["leave-types"] }); toast.success(`Seeded: ${d.seeded?.join(", ") || "All already exist"}`); },
    onError: (e: any) => toast.error(e.message),
  });

  const allocate = useMutation({
    mutationFn: () => fetchApi("/leave/balances/allocate", { method: "POST", body: JSON.stringify({ year: parseInt(allocYear) }) }),
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["leave-balances"] }); toast.success(`Allocated ${d.created} balance records for ${d.year}`); },
    onError: (e: any) => toast.error(e.message),
  });

  const exportLeave = () => {
    window.open(`/api/leave/export?year=${today.getFullYear()}`, "_blank");
  };

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <PageContainer>
      <PageHeader title="Leave Management" breadcrumbs={[{ label: "Leave" }]} />

      <Tabs defaultValue="requests">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="types">Leave Types</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="compoff">Comp-off</TabsTrigger>
          <TabsTrigger value="policies">IT Policies</TabsTrigger>
        </TabsList>

        {/* ── REQUESTS ── */}
        <TabsContent value="requests">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="lop">LOP</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={exportLeave}><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
                <Button size="sm" onClick={() => setApplyOpen(true)}><Plus className="w-4 h-4 mr-1" /> Apply Leave</Button>
              </div>
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
                    <th className="text-left px-5 py-3">Comment</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reqLoading ? (
                    <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                  ) : !requests || requests.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No leave requests found</td></tr>
                  ) : requests.map((req: any, i: number) => (
                    <tr key={req.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{req.employeeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{req.leaveTypeName}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(req.startDate)} – {formatDate(req.endDate)}</td>
                      <td className="px-5 py-3 text-center">{req.days}</td>
                      <td className="px-5 py-3 text-muted-foreground max-w-[150px] truncate">{req.reason ?? "—"}</td>
                      <td className="px-5 py-3"><StatusBadge status={req.status} /></td>
                      <td className="px-5 py-3 text-muted-foreground text-xs max-w-[120px] truncate">{req.managerComment ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {req.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700 h-7 px-2" onClick={() => setActionDialog({ request: req, action: "approve" })}><Check className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 h-7 px-2" onClick={() => setActionDialog({ request: req, action: "reject" })}><X className="w-3.5 h-3.5" /></Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this request?")) deleteRequest.mutate(req.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── LEAVE TYPES ── */}
        <TabsContent value="types">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold">Leave Types</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Define all leave types available in your organisation</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => seedTypes.mutate()} disabled={seedTypes.isPending}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Seed IT Defaults</Button>
                <Button size="sm" onClick={() => setLtDialog({})}><Plus className="w-4 h-4 mr-1" /> Add Type</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">Code</th>
                    <th className="text-left px-5 py-3">Max Days/Yr</th>
                    <th className="text-left px-5 py-3">Accrual/Mo</th>
                    <th className="text-left px-5 py-3">Paid</th>
                    <th className="text-left px-5 py-3">Carry Forward</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!types || types.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No leave types — click "Seed IT Defaults" to add standard types</td></tr>
                  ) : types.map((t: any, i: number) => (
                    <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{t.name}</td>
                      <td className="px-5 py-3 font-mono text-xs"><Badge variant="outline">{t.code}</Badge></td>
                      <td className="px-5 py-3 text-muted-foreground text-center">{t.maxDaysPerYear || "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground text-center">{t.accrualPerMonth ?? "—"}</td>
                      <td className="px-5 py-3"><Badge variant="outline" className={t.isPaidLeave ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-600 border-gray-200"}>{t.isPaidLeave ? "Paid" : "Unpaid"}</Badge></td>
                      <td className="px-5 py-3 text-muted-foreground">{t.isCarryForward ? `Yes (max ${t.maxCarryForward ?? "∞"})` : "No"}</td>
                      <td className="px-5 py-3"><StatusBadge status={t.isActive ? "active" : "inactive"} /></td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setLtDialog({ type: t })}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete leave type "${t.name}"?`)) deleteType.mutate(t.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── BALANCES ── */}
        <TabsContent value="balances">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold">Leave Balances</h3>
                <p className="text-xs text-muted-foreground mt-0.5">View and adjust employee leave balances for the current year</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Input type="number" value={allocYear} onChange={e => setAllocYear(e.target.value)} className="w-24 h-8 text-sm" />
                  <Button size="sm" onClick={() => allocate.mutate()} disabled={allocate.isPending}>{allocate.isPending ? "Allocating..." : "Allocate Year Balances"}</Button>
                </div>
                <Button size="sm" variant="outline" onClick={exportLeave}><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Leave Type</th>
                    <th className="text-left px-5 py-3">Year</th>
                    <th className="text-left px-5 py-3">Allocated</th>
                    <th className="text-left px-5 py-3">Used</th>
                    <th className="text-left px-5 py-3">Balance</th>
                    <th className="text-right px-5 py-3">Adjust</th>
                  </tr>
                </thead>
                <tbody>
                  {!balances || balances.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No balances found — click "Allocate Year Balances" after adding employees and leave types</td></tr>
                  ) : balances.map((b: any, i: number) => (
                    <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{empMap.get(b.employeeId) ?? b.employeeId}</td>
                      <td className="px-5 py-3 text-muted-foreground">{b.leaveTypeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{b.year}</td>
                      <td className="px-5 py-3 text-center">{(b.balance + b.used).toFixed(1)}</td>
                      <td className="px-5 py-3 text-center text-red-600">{b.used.toFixed(1)}</td>
                      <td className="px-5 py-3 text-center font-semibold text-green-700">{b.balance.toFixed(1)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBalDialog(b)}><Edit className="w-3 h-3 mr-1" /> Adjust</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── CALENDAR ── */}
        <TabsContent value="calendar">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Leave Calendar</h3>
              <div className="flex items-center gap-3">
                <Select value={String(calMonth)} onValueChange={v => setCalMonth(parseInt(v))}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" value={calYear} onChange={e => setCalYear(parseInt(e.target.value))} className="w-24 h-9 text-sm" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Leave Type</th>
                    <th className="text-left px-5 py-3">From</th>
                    <th className="text-left px-5 py-3">To</th>
                    <th className="text-left px-5 py-3">Days</th>
                    <th className="text-left px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!calendar || calendar.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No leaves in {MONTHS[calMonth - 1]} {calYear}</td></tr>
                  ) : calendar.map((entry: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{entry.employeeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{entry.leaveType}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(entry.startDate)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(entry.endDate)}</td>
                      <td className="px-5 py-3 text-center">{entry.days}</td>
                      <td className="px-5 py-3"><StatusBadge status={entry.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── COMP-OFF ── */}
        <TabsContent value="compoff">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold">Compensatory Off</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Grant comp-off to employees who worked on holidays or weekends</p>
              </div>
              <Button size="sm" onClick={() => setCompoffOpen(true)}><Plus className="w-4 h-4 mr-1" /> Grant Comp-off</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Work Date</th>
                    <th className="text-left px-5 py-3">Credit Days</th>
                    <th className="text-left px-5 py-3">Expiry Date</th>
                    <th className="text-left px-5 py-3">Reason</th>
                    <th className="text-left px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!compoffs || compoffs.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No comp-off records</td></tr>
                  ) : compoffs.map((c: any, i: number) => (
                    <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{empMap.get(c.employeeId) ?? "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(c.workDate)}</td>
                      <td className="px-5 py-3 text-center">{c.creditDays}</td>
                      <td className="px-5 py-3 text-muted-foreground">{c.expiryDate ? formatDate(c.expiryDate) : "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{c.reason ?? "—"}</td>
                      <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── IT POLICIES ── */}
        <TabsContent value="policies">
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800">Standard IT Company Leave Policy</p>
                <p className="text-xs text-blue-700 mt-1">These are the standard leave types for an IT company as per Indian labour laws and industry norms. Click "Seed Leave Types" to automatically create these in your system.</p>
              </div>
              <Button size="sm" onClick={() => seedTypes.mutate()} disabled={seedTypes.isPending} className="shrink-0"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Seed Leave Types</Button>
            </div>
            <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Code</th>
                    <th className="text-left px-5 py-3">Leave Type</th>
                    <th className="text-left px-5 py-3">Days / Year</th>
                    <th className="text-left px-5 py-3">Accrual</th>
                    <th className="text-left px-5 py-3">Paid</th>
                    <th className="text-left px-5 py-3">Carry Forward</th>
                    <th className="text-left px-5 py-3">Policy Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {IT_POLICIES.map((p, i) => (
                    <tr key={p.code} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3"><Badge variant="outline" className="font-mono">{p.code}</Badge></td>
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-5 py-3 text-muted-foreground text-center">{p.days || "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.accrual}</td>
                      <td className="px-5 py-3"><Badge variant="outline" className={p.paid ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-600"}>{p.paid ? "Paid" : "Unpaid"}</Badge></td>
                      <td className="px-5 py-3"><Badge variant="outline" className={p.carry ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-500"}>{p.carry ? "Yes" : "No"}</Badge></td>
                      <td className="px-5 py-3 text-muted-foreground text-xs max-w-xs">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ApplyLeaveDialog open={applyOpen} onClose={() => setApplyOpen(false)} />
      {actionDialog && <ApproveRejectDialog request={actionDialog.request} action={actionDialog.action} open={!!actionDialog} onClose={() => setActionDialog(null)} />}
      {ltDialog !== null && <LeaveTypeDialog type={ltDialog.type} open={!!ltDialog} onClose={() => setLtDialog(null)} />}
      {balDialog && <AdjustBalanceDialog balance={balDialog} open={!!balDialog} onClose={() => setBalDialog(null)} />}
      <GrantCompoffDialog open={compoffOpen} onClose={() => setCompoffOpen(false)} />
    </PageContainer>
  );
}
