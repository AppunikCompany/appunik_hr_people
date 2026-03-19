import { useState } from "react";
import { useLeaveRequests, useLeaveTypes, useEmployees, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Plus, Check, X } from "lucide-react";
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
      <DialogContent className="max-w-md">
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
                {types?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Start Date *</Label><Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} className="mt-1" /></div>
            <div><Label>End Date *</Label><Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} className="mt-1" /></div>
          </div>
          <div><Label>Reason</Label><Textarea value={form.reason} onChange={e => set("reason", e.target.value)} className="mt-1" rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>{mutation.isPending ? "Submitting..." : "Submit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Leave() {
  const [status, setStatus] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const { data: requests, isLoading } = useLeaveRequests(status ? { status } : undefined);
  const qc = useQueryClient();

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
        title="Leave Requests"
        breadcrumbs={[{ label: "Leave" }]}
        actions={<Button size="sm" onClick={() => setApplyOpen(true)}><Plus className="w-4 h-4 mr-1" /> Apply Leave</Button>}
      />

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
                <th className="text-left px-5 py-3">Actions</th>
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
                        <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700 h-7 px-2" onClick={() => approve.mutate(req.id)}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 h-7 px-2" onClick={() => reject.mutate(req.id)}>
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

      <ApplyLeaveDialog open={applyOpen} onClose={() => setApplyOpen(false)} />
    </PageContainer>
  );
}
