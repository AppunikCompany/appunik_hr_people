"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, useEmployees } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

const ASSIGNEE_COLORS: Record<string, string> = {
  hr: "bg-purple-50 text-purple-700 border-purple-200",
  it: "bg-blue-50 text-blue-700 border-blue-200",
  manager: "bg-amber-50 text-amber-700 border-amber-200",
  employee: "bg-green-50 text-green-700 border-green-200",
  finance: "bg-red-50 text-red-700 border-red-200",
};

function InitiateExitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: employees } = useEmployees();
  const qc = useQueryClient();
  const [form, setForm] = useState({ employeeId: "", resignationDate: "", lastWorkingDay: "", reason: "" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => fetchApi("/exit/requests", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exit-requests"] }); onClose(); toast.success("Exit initiated and checklist created"); setForm({ employeeId: "", resignationDate: "", lastWorkingDay: "", reason: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Initiate Exit Process</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Employee *</Label>
            <Select value={form.employeeId} onValueChange={v => set("employeeId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>{employees?.filter((e: any) => e.status === "active").map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} — {e.employeeCode}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Resignation Date *</Label><Input type="date" value={form.resignationDate} onChange={e => set("resignationDate", e.target.value)} className="mt-1" /></div>
            <div><Label>Last Working Day *</Label><Input type="date" value={form.lastWorkingDay} onChange={e => set("lastWorkingDay", e.target.value)} className="mt-1" /></div>
          </div>
          <div><Label>Reason</Label><Textarea value={form.reason} onChange={e => set("reason", e.target.value)} className="mt-1" rows={3} placeholder="Reason for leaving..." /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.employeeId || !form.resignationDate || !form.lastWorkingDay || mutation.isPending}>{mutation.isPending ? "Initiating..." : "Initiate Exit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExitDetailDialog({ exitRequest, open, onClose }: { exitRequest: any; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(exitRequest?.exitInterviewNotes ?? "");

  const { data: checklist } = useQuery({
    queryKey: ["exit-checklist", exitRequest?.id],
    queryFn: () => fetchApi<any[]>(`/exit/checklist/${exitRequest.id}`),
    enabled: !!exitRequest?.id,
  });

  const toggleItem = useMutation({
    mutationFn: ({ id, isCompleted }: { id: string; isCompleted: boolean }) =>
      fetchApi(`/exit/checklist/${id}`, { method: "PATCH", body: JSON.stringify({ isCompleted }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exit-checklist", exitRequest.id] }),
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => fetchApi(`/exit/requests/${exitRequest.id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exit-requests"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveNotes = useMutation({
    mutationFn: () => fetchApi(`/exit/requests/${exitRequest.id}`, { method: "PATCH", body: JSON.stringify({ exitInterviewNotes: notes }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exit-requests"] }); toast.success("Notes saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const groupedChecklist = (checklist ?? []).reduce((acc: any, item: any) => {
    if (!acc[item.assignedTo]) acc[item.assignedTo] = [];
    acc[item.assignedTo].push(item);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exit — {exitRequest?.employeeName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 text-sm py-2">
          <div className="bg-muted rounded p-3"><p className="text-xs text-muted-foreground">Resignation Date</p><p className="font-medium mt-0.5">{formatDate(exitRequest?.resignationDate)}</p></div>
          <div className="bg-muted rounded p-3"><p className="text-xs text-muted-foreground">Last Working Day</p><p className="font-medium mt-0.5">{formatDate(exitRequest?.lastWorkingDay)}</p></div>
          <div className="bg-muted rounded p-3"><p className="text-xs text-muted-foreground">Status</p><div className="mt-0.5"><StatusBadge status={exitRequest?.status} /></div></div>
        </div>

        {exitRequest?.reason && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
            <p className="text-xs font-medium text-amber-700 mb-1">Reason for Leaving</p>
            {exitRequest.reason}
          </div>
        )}

        <div className="flex gap-2">
          {exitRequest?.status === "pending" && <Button size="sm" variant="outline" className="text-green-600" onClick={() => updateStatus.mutate("approved")}>Approve</Button>}
          {exitRequest?.status === "pending" && <Button size="sm" variant="outline" className="text-red-500" onClick={() => updateStatus.mutate("rejected")}>Reject</Button>}
          {exitRequest?.status === "approved" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate("completed")}>Mark Completed</Button>}
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3">Exit Checklist ({checklist?.filter((i: any) => i.isCompleted).length ?? 0}/{checklist?.length ?? 0} done)</h4>
          {Object.entries(groupedChecklist).map(([dept, items]: [string, any]) => (
            <div key={dept} className="mb-4">
              <Badge variant="outline" className={`text-xs mb-2 ${ASSIGNEE_COLORS[dept] ?? ""}`}>{dept.toUpperCase()}</Badge>
              <div className="space-y-2">
                {items.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded border border-border hover:bg-muted/50 cursor-pointer" onClick={() => toggleItem.mutate({ id: item.id, isCompleted: !item.isCompleted })}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${item.isCompleted ? "bg-green-600 border-green-600" : "border-gray-300"}`}>
                      {item.isCompleted && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className={`text-sm ${item.isCompleted ? "line-through text-muted-foreground" : ""}`}>{item.task}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">Exit Interview Notes</h4>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Notes from exit interview..." />
          <Button size="sm" className="mt-2" onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}>Save Notes</Button>
        </div>

        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExitManagement() {
  const [initiateOpen, setInitiateOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: exits, isLoading } = useQuery({ queryKey: ["exit-requests"], queryFn: () => fetchApi<any[]>("/exit/requests") });

  const filtered = (exits ?? []).filter((e: any) => statusFilter === "all" || e.status === statusFilter);
  const active = (exits ?? []).filter((e: any) => ["pending", "approved"].includes(e.status)).length;

  return (
    <PageContainer>
      <PageHeader title="Exit Management" breadcrumbs={[{ label: "Exit Management" }]} subtitle="Manage employee offboarding, checklists and exit interviews" />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
          <p className="text-2xl font-semibold text-amber-600">{active}</p>
          <p className="text-sm text-muted-foreground mt-1">Active Exits</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
          <p className="text-2xl font-semibold text-green-600">{(exits ?? []).filter((e: any) => e.status === "completed").length}</p>
          <p className="text-sm text-muted-foreground mt-1">Completed</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
          <p className="text-2xl font-semibold text-blue-600">{exits?.length ?? 0}</p>
          <p className="text-sm text-muted-foreground mt-1">Total Exits</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setInitiateOpen(true)}><Plus className="w-4 h-4 mr-1" /> Initiate Exit</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-5 py-3">Employee</th>
                <th className="text-left px-5 py-3">Resignation Date</th>
                <th className="text-left px-5 py-3">Last Working Day</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Checklist</th>
                <th className="text-right px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No exit requests found</td></tr>
              ) : filtered.map((e: any, i: number) => (
                <tr key={e.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{e.employeeName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{e.employeeCode}</p>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(e.resignationDate)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(e.lastWorkingDay)}</td>
                  <td className="px-5 py-3"><StatusBadge status={e.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: e.checklistTotal ? `${(e.checklistDone / e.checklistTotal) * 100}%` : "0%" }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{e.checklistDone}/{e.checklistTotal}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => setSelected(e)}><ClipboardList className="w-3.5 h-3.5 mr-1" /> View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <InitiateExitDialog open={initiateOpen} onClose={() => setInitiateOpen(false)} />
      {selected && <ExitDetailDialog exitRequest={selected} open={!!selected} onClose={() => setSelected(null)} />}
    </PageContainer>
  );
}
