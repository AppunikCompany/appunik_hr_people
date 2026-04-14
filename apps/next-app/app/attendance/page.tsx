"use client";

import { useState } from "react";
import { useAttendanceTeam, useHolidays, useMonthlyAttendance, useWfhPending, useEmployees, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Search, Plus, Download, Check, X, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function HolidayDialog({ holiday, open, onClose }: { holiday?: any; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!holiday;
  const [form, setForm] = useState({ name: holiday?.name ?? "", date: holiday?.date ?? "", type: holiday?.type ?? "national", year: holiday?.year ?? new Date().getFullYear() });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => isEdit
      ? fetchApi(`/holidays/${holiday.id}`, { method: "PATCH", body: JSON.stringify(form) })
      : fetchApi("/holidays", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["holidays"] }); onClose(); toast.success(isEdit ? "Holiday updated" : "Holiday added"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Holiday</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
          <div><Label>Date *</Label><Input type="date" value={form.date} onChange={e => { set("date", e.target.value); set("year", new Date(e.target.value).getFullYear()); }} className="mt-1" /></div>
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={v => set("type", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="national">National</SelectItem>
                <SelectItem value="optional">Optional</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || !form.date || mutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualEntryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: employees } = useEmployees();
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ employeeId: "", date: today, type: "wfo", clockIn: "", clockOut: "", notes: "" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => fetchApi("/attendance/manual", { method: "POST", body: JSON.stringify({ ...form, clockIn: form.clockIn ? `${form.date}T${form.clockIn}:00` : undefined, clockOut: form.clockOut ? `${form.date}T${form.clockOut}:00` : undefined }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-team"] }); qc.invalidateQueries({ queryKey: ["attendance-monthly"] }); onClose(); toast.success("Attendance marked"); setForm({ employeeId: "", date: today, type: "wfo", clockIn: "", clockOut: "", notes: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Manual Attendance Entry</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Employee *</Label>
            <Select value={form.employeeId} onValueChange={v => set("employeeId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>{employees?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date *</Label><Input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="mt-1" /></div>
            <div>
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wfo">WFO</SelectItem>
                  <SelectItem value="wfh">WFH</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {(form.type === "wfo" || form.type === "half_day") && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Clock In</Label><Input type="time" value={form.clockIn} onChange={e => set("clockIn", e.target.value)} className="mt-1" /></div>
              <div><Label>Clock Out</Label><Input type="time" value={form.clockOut} onChange={e => set("clockOut", e.target.value)} className="mt-1" /></div>
            </div>
          )}
          <div><Label>Notes</Label><Input value={form.notes} onChange={e => set("notes", e.target.value)} className="mt-1" placeholder="Optional" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.employeeId || mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Attendance() {
  const today = new Date();
  const [search, setSearch] = useState("");
  const [holidayDialog, setHolidayDialog] = useState<{ holiday?: any } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [empFilter, setEmpFilter] = useState("");

  const { data: team, isLoading: teamLoading } = useAttendanceTeam();
  const { data: holidays } = useHolidays(today.getFullYear());
  const { data: monthlyRecords } = useMonthlyAttendance(month, year, empFilter || undefined);
  const { data: wfhPending } = useWfhPending();
  const { data: employees } = useEmployees();
  const qc = useQueryClient();

  const filtered = (team ?? []).filter((e: any) => !search || e.employeeName.toLowerCase().includes(search.toLowerCase()));
  const wfo = team?.filter((e: any) => e.status === "wfo").length ?? 0;
  const wfh = team?.filter((e: any) => e.status === "wfh" || e.status === "wfh_pending").length ?? 0;
  const absent = team?.filter((e: any) => e.status === "absent").length ?? 0;

  const deleteHoliday = useMutation({
    mutationFn: (id: string) => fetchApi(`/holidays/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["holidays"] }); toast.success("Holiday deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const approveWfh = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      fetchApi(`/attendance/wfh/${id}/approve`, { method: "POST", body: JSON.stringify({ approved }) }),
    onSuccess: (_d, vars) => { qc.invalidateQueries({ queryKey: ["wfh-pending"] }); qc.invalidateQueries({ queryKey: ["attendance-team"] }); toast.success(vars.approved ? "WFH approved" : "WFH rejected"); },
    onError: (e: any) => toast.error(e.message),
  });

  const exportAttendance = () => {
    window.open(`/api/attendance/export?month=${month}&year=${year}`, "_blank");
  };

  const TYPE_COLORS: Record<string, string> = {
    wfo: "text-green-700 bg-green-50",
    wfh: "text-blue-700 bg-blue-50",
    wfh_pending: "text-amber-700 bg-amber-50",
    absent: "text-red-600 bg-red-50",
    half_day: "text-orange-700 bg-orange-50",
  };

  return (
    <PageContainer>
      <PageHeader title="Attendance" subtitle={`Today — ${today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`} breadcrumbs={[{ label: "Attendance" }]} />

      <Tabs defaultValue="today">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="monthly">Monthly View</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="wfh-approvals">WFH Approvals {wfhPending && wfhPending.length > 0 && <span className="ml-1 bg-amber-500 text-white text-xs rounded-full w-4 h-4 inline-flex items-center justify-center">{wfhPending.length}</span>}</TabsTrigger>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
        </TabsList>

        {/* ── TODAY ── */}
        <TabsContent value="today">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
              <p className="text-2xl font-semibold text-green-600">{wfo}</p>
              <p className="text-sm text-muted-foreground mt-1">In Office (WFO)</p>
            </div>
            <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
              <p className="text-2xl font-semibold text-blue-600">{wfh}</p>
              <p className="text-sm text-muted-foreground mt-1">Work From Home</p>
            </div>
            <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
              <p className="text-2xl font-semibold text-red-500">{absent}</p>
              <p className="text-sm text-muted-foreground mt-1">Absent</p>
            </div>
          </div>
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Department</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Clock In</th>
                  </tr>
                </thead>
                <tbody>
                  {teamLoading ? (
                    <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No records found</td></tr>
                  ) : filtered.map((entry: any, i: number) => (
                    <tr key={entry.employeeId} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{entry.employeeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{entry.department ?? "—"}</td>
                      <td className="px-5 py-3"><StatusBadge status={entry.status} /></td>
                      <td className="px-5 py-3 text-muted-foreground">{entry.clockIn ? new Date(entry.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── MONTHLY ── */}
        <TabsContent value="monthly">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Monthly Attendance</h3>
              <div className="flex items-center gap-3">
                <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="w-24 h-9 text-sm" />
                <Select value={empFilter} onValueChange={setEmpFilter}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="All employees" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Employees</SelectItem>
                    {employees?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={exportAttendance}><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Type</th>
                    <th className="text-left px-5 py-3">Clock In</th>
                    <th className="text-left px-5 py-3">Clock Out</th>
                    <th className="text-left px-5 py-3">Hours</th>
                    <th className="text-left px-5 py-3">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {!monthlyRecords || monthlyRecords.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No records for {MONTHS[month - 1]} {year}</td></tr>
                  ) : monthlyRecords.map((r: any, i: number) => {
                    const emp = employees?.find((e: any) => e.id === r.employeeId);
                    return (
                      <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                        <td className="px-5 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                        <td className="px-5 py-3 font-medium">{emp ? `${emp.firstName} ${emp.lastName}` : r.employeeId}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[r.type] ?? "text-gray-600 bg-gray-50"}`}>{r.type}</span>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{r.clockIn ? new Date(r.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{r.clockOut ? new Date(r.clockOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.hoursWorked != null ? r.hoursWorked.toFixed(1) + "h" : "—"}</td>
                        <td className="px-5 py-3">
                          <div className="flex gap-1">
                            {r.isLate && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">Late</span>}
                            {r.isHalfDay && <span className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">Half Day</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── HOLIDAYS ── */}
        <TabsContent value="holidays">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Holidays — {today.getFullYear()}</h3>
              <Button size="sm" onClick={() => setHolidayDialog({})}><Plus className="w-4 h-4 mr-1" /> Add Holiday</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-left px-5 py-3">Type</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!holidays || holidays.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No holidays added yet</td></tr>
                  ) : [...holidays].sort((a: any, b: any) => a.date.localeCompare(b.date)).map((h: any, i: number) => (
                    <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{h.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(h.date)}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${h.type === "national" ? "bg-blue-50 text-blue-700" : h.type === "optional" ? "bg-amber-50 text-amber-700" : "bg-purple-50 text-purple-700"}`}>{h.type}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setHolidayDialog({ holiday: h })}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteHoliday.mutate(h.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── WFH APPROVALS ── */}
        <TabsContent value="wfh-approvals">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Pending WFH Approvals</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Employees who have requested WFH and are awaiting manager approval</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-left px-5 py-3">Notes</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!wfhPending || wfhPending.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No pending WFH requests</td></tr>
                  ) : wfhPending.map((r: any, i: number) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{r.employeeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(r.date)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{r.notes ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700 h-7 px-3" onClick={() => approveWfh.mutate({ id: r.id, approved: true })}><Check className="w-3.5 h-3.5 mr-1" /> Approve</Button>
                          <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 h-7 px-3" onClick={() => approveWfh.mutate({ id: r.id, approved: false })}><X className="w-3.5 h-3.5 mr-1" /> Reject</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* ── MANUAL ENTRY ── */}
        <TabsContent value="manual">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6 max-w-lg">
            <h3 className="text-sm font-semibold mb-2">Manual Attendance Entry</h3>
            <p className="text-xs text-muted-foreground mb-6">HR can manually record or override attendance for any employee on any date. If a record already exists for that date, it will be updated.</p>
            <Button onClick={() => setManualOpen(true)}><Plus className="w-4 h-4 mr-1" /> Mark Attendance</Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {holidayDialog !== null && <HolidayDialog holiday={holidayDialog.holiday} open={true} onClose={() => setHolidayDialog(null)} />}
      <ManualEntryDialog open={manualOpen} onClose={() => setManualOpen(false)} />
    </PageContainer>
  );
}
