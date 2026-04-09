import { useState } from "react";
import { useLocation } from "wouter";
import { useLeaveRequests, useLeaveTypes, useEmployees, useLeaveBalances, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Plus, Check, X, Calendar, Info } from "lucide-react";
import { toast } from "sonner";

function ApplyLeaveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ employeeId: "", leaveTypeId: "", startDate: "", endDate: "", reason: "" });
  const { data: employees } = useEmployees();
  const { data: types } = useLeaveTypes();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/leave/requests", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); onClose(); toast.success("Leave request submitted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Employee *</Label>
            <Select value={form.employeeId} onValueChange={v => set("employeeId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>
                {employees?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Leave Type *</Label>
            <Select value={form.leaveTypeId} onValueChange={v => set("leaveTypeId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select type..." /></SelectTrigger>
              <SelectContent>
                {types && types.length > 0
                  ? types.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                  : <SelectItem value="_none" disabled>No leave types configured</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date *</Label>
              <Input type="date" max="9999-12-31" value={form.startDate} onChange={e => set("startDate", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>End Date *</Label>
              <Input type="date" max="9999-12-31" value={form.endDate} onChange={e => set("endDate", e.target.value)} className="mt-1" />
            </div>
          </div>
          <div><Label>Reason</Label><Textarea value={form.reason} onChange={e => set("reason", e.target.value)} className="mt-1" rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!form.employeeId) { toast.error("Please select an employee"); return; }
              if (!form.leaveTypeId) { toast.error("Please select a leave type"); return; }
              if (!form.startDate) { toast.error("Start date is required"); return; }
              if (!form.endDate) { toast.error("End date is required"); return; }
              if (new Date(form.endDate) < new Date(form.startDate)) { toast.error("End date must be after start date"); return; }
              mutation.mutate(form);
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

export default function Leave() {
  const [location] = useLocation();
  const [status, setStatus] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const { data: requests, isLoading } = useLeaveRequests(status ? { status } : undefined);
  const qc = useQueryClient();

  const tabFromPath: Record<string, string> = {
    "/leave": "requests",
    "/leave/calendar": "calendar",
    "/leave/balances": "balances",
    "/leave/compoff": "compoff",
  };
  const activeTab = tabFromPath[location] ?? "requests";

  const approve = useMutation({
    mutationFn: (id: string) => fetchApi(`/leave/requests/${id}/approve`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); toast.success("Leave approved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (id: string) => fetchApi(`/leave/requests/${id}/reject`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests"] }); toast.success("Leave rejected"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Leave Management"
        breadcrumbs={[{ label: "Leave" }]}
        actions={<Button size="sm" onClick={() => setApplyOpen(true)}><Plus className="w-4 h-4 mr-1" /> Apply Leave</Button>}
      />

      <Tabs value={activeTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="requests" asChild><a href="/leave">Leave Requests</a></TabsTrigger>
          <TabsTrigger value="calendar" asChild><a href="/leave/calendar">Leave Calendar</a></TabsTrigger>
          <TabsTrigger value="balances" asChild><a href="/leave/balances">Leave Balances</a></TabsTrigger>
          <TabsTrigger value="compoff" asChild><a href="/leave/compoff">Comp-Off</a></TabsTrigger>
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
                    <th className="text-left px-5 py-3 min-w-[100px]">Actions</th>
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
                      <td className="px-5 py-3 text-muted-foreground">{req.leaveTypeName}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {formatDate(req.startDate)} – {formatDate(req.endDate)}
                      </td>
                      <td className="px-5 py-3 text-center">{req.days}</td>
                      <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{req.reason ?? "—"}</td>
                      <td className="px-5 py-3"><StatusBadge status={req.status} /></td>
                      <td className="px-5 py-3">
                        {req.status === "pending" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" title="Approve" className="text-green-600 hover:text-green-700 h-7 px-2" onClick={() => approve.mutate(req.id)}>
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" title="Reject" className="text-red-500 hover:text-red-600 h-7 px-2" onClick={() => reject.mutate(req.id)}>
                              <X className="w-3.5 h-3.5" />
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
      </Tabs>

      <ApplyLeaveDialog open={applyOpen} onClose={() => setApplyOpen(false)} />
    </PageContainer>
  );
}
