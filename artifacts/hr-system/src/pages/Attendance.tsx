import { useState } from "react";
import { useLocation } from "wouter";
import { useAttendanceTeam, useAttendanceToday, useHolidays, useCurrentUser, fetchApi } from "@/hooks/useApi";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ClockWidget } from "@/components/ClockWidget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import { Search, Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS = [2024, 2025, 2026];

const EMPTY_HOLIDAY = { name: "", date: "", type: "national", year: new Date().getFullYear() };

function AddHolidayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState(EMPTY_HOLIDAY);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/holidays", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["holidays"] }); setForm(EMPTY_HOLIDAY); onClose(); toast.success("Holiday added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Holiday name is required"); return; }
    if (!form.date) { toast.error("Date is required"); return; }
    mutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setForm(EMPTY_HOLIDAY); onClose(); } }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Add Holiday</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" placeholder="e.g. Diwali" /></div>
          <div><Label>Date *</Label><Input type="date" max="9999-12-31" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value, year: new Date(e.target.value).getFullYear() }))} className="mt-1" /></div>
          <div>
            <Label>Type</Label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm bg-background">
              <option value="national">National</option>
              <option value="optional">Optional</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setForm(EMPTY_HOLIDAY); onClose(); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>{mutation.isPending ? "Adding..." : "Add Holiday"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegularizationDialog({ open, onClose, date }: { open: boolean; onClose: () => void; date?: string }) {
  const [form, setForm] = useState({ date: date ?? "", requestedClockIn: "", requestedClockOut: "", reason: "" });
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/attendance/regularization", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regularization"] });
      onClose();
      toast.success("Regularization request submitted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.date) { toast.error("Date is required"); return; }
    if (!form.reason.trim()) { toast.error("Reason is required"); return; }
    mutation.mutate({ ...form, employeeId: user?.employeeId });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Request Attendance Regularization</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Use this to correct missed clock-in/clock-out entries. HR admin will review and approve.</span>
          </div>
          <div>
            <Label>Date *</Label>
            <Input type="date" max={new Date().toISOString().split("T")[0]} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Requested Clock In</Label>
              <Input type="time" value={form.requestedClockIn} onChange={e => setForm(f => ({ ...f, requestedClockIn: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Requested Clock Out</Label>
              <Input type="time" value={form.requestedClockOut} onChange={e => setForm(f => ({ ...f, requestedClockOut: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Reason *</Label>
            <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="mt-1" rows={3} placeholder="Explain why the regularization is needed..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>{mutation.isPending ? "Submitting..." : "Submit Request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Attendance() {
  const [location, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [addHoliday, setAddHoliday] = useState(false);
  const [regularizationOpen, setRegularizationOpen] = useState(false);
  const [regularizationDate, setRegularizationDate] = useState<string | undefined>();
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [monthlySubTab, setMonthlySubTab] = useState(false);

  const { data: team, isLoading } = useAttendanceTeam();
  const { data: holidays, isLoading: holidaysLoading } = useHolidays();
  const { data: user } = useCurrentUser();
  const { data: todayRecord } = useAttendanceToday();

  const { data: monthlyReport, isLoading: monthlyLoading } = useQuery({
    queryKey: ["att-report", month, year],
    queryFn: () => fetchApi<any[]>(`/reports/attendance?month=${month}&year=${year}`),
  });

  const { data: myAttendance, isLoading: myLoading } = useQuery({
    queryKey: ["my-attendance", user?.id, month, year],
    queryFn: () => fetchApi<any>(`/self-service/attendance/${user?.id}?month=${month}&year=${year}`),
    enabled: !!user?.id,
  });

  const activeTab =
    location === "/attendance/my" ? "my" :
    location === "/attendance/holidays" ? "holidays" :
    "daily";

  const handleTabChange = (tab: string) => {
    if (tab === "daily") navigate("/attendance");
    else if (tab === "my") navigate("/attendance/my");
    else if (tab === "holidays") navigate("/attendance/holidays");
  };

  const filtered = team?.filter((e: any) =>
    !search || e.employeeName.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const wfo = team?.filter((e: any) => e.status === "wfo").length ?? 0;
  const wfh = team?.filter((e: any) => e.status === "wfh").length ?? 0;
  const absent = team?.filter((e: any) => e.status === "absent").length ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title="Attendance"
        subtitle={`Today — ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
        breadcrumbs={[{ label: "Attendance" }]}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>

        {/* ── Tab navigation bar — Daily View only for privileged roles ── */}
        <TabsList className="mb-4">
          {user && user.role !== "employee" && (
            <TabsTrigger value="daily">Daily View</TabsTrigger>
          )}
          <TabsTrigger value="my">My Attendance</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>

        {/* ── DAILY VIEW with Monthly View toggle ── */}
        <TabsContent value="daily">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMonthlySubTab(false)}
              className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${!monthlySubTab ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-secondary"}`}
            >
              Team Today
            </button>
            <button
              onClick={() => setMonthlySubTab(true)}
              className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${monthlySubTab ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-secondary"}`}
            >
              Monthly View
            </button>
          </div>

          {!monthlySubTab ? (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
                  <p className="text-2xl font-semibold text-green-600">{wfo}</p>
                  <p className="text-sm text-muted-foreground mt-1">In Office</p>
                </div>
                <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
                  <p className="text-2xl font-semibold text-foreground">{wfh}</p>
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
                    <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                      {isLoading ? (
                        <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                      ) : filtered.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No records found</td></tr>
                      ) : filtered.map((entry: any, i: number) => (
                        <tr key={entry.employeeId} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                          <td className="px-5 py-3 font-medium text-foreground">{entry.employeeName}</td>
                          <td className="px-5 py-3 text-muted-foreground">{entry.department ?? "—"}</td>
                          <td className="px-5 py-3"><StatusBadge status={entry.status} /></td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {entry.clockIn ? new Date(entry.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* Monthly View */
            <>
              <div className="flex items-center gap-3 mb-4">
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-5 py-3">Employee</th>
                      <th className="text-left px-5 py-3">Department</th>
                      <th className="text-right px-5 py-3">Present</th>
                      <th className="text-right px-5 py-3">WFH</th>
                      <th className="text-right px-5 py-3">Absent</th>
                      <th className="text-right px-5 py-3">Half Days</th>
                      <th className="text-right px-5 py-3">OT Hrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyLoading ? (
                      <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                    ) : !monthlyReport || monthlyReport.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No data for {MONTHS[parseInt(month) - 1]} {year}</td></tr>
                    ) : monthlyReport.map((r: any, i: number) => (
                      <tr key={r.employeeId} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                        <td className="px-5 py-3 font-medium text-foreground">{r.employeeName}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.department ?? "—"}</td>
                        <td className="px-5 py-3 text-right text-green-600 font-medium">{r.presentDays}</td>
                        <td className="px-5 py-3 text-right text-muted-foreground font-medium">{r.wfhDays}</td>
                        <td className="px-5 py-3 text-right text-red-500">{r.absentDays}</td>
                        <td className="px-5 py-3 text-right">{r.halfDays}</td>
                        <td className="px-5 py-3 text-right">{(r.overtimeHours ?? 0).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── MY ATTENDANCE ── */}
        <TabsContent value="my">
          {/* Clock-in / Clock-out widget */}
          <div className="mb-5 max-w-sm">
            <ClockWidget record={todayRecord} />
          </div>

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setRegularizationDate(undefined); setRegularizationOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Request Regularization
            </Button>
          </div>

          {!user?.id ? (
            <div className="text-center py-20 text-muted-foreground">Loading user info...</div>
          ) : (
            <>
              {myAttendance?.summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                  {[
                    { label: "Present (WFO)", value: myAttendance.summary.presentDays },
                    { label: "Work From Home", value: myAttendance.summary.wfhDays },
                    { label: "Half Days", value: myAttendance.summary.halfDays },
                    { label: "Late Days", value: myAttendance.summary.lateDays },
                    { label: "Total Hours", value: (myAttendance.summary.totalHours ?? 0).toFixed(1) + "h" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white border border-border rounded-lg p-4 text-center shadow-sm">
                      <div className="text-xl font-bold text-foreground">{value}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-5 py-3">Date</th>
                      <th className="text-left px-5 py-3">Type</th>
                      <th className="text-left px-5 py-3">Clock In</th>
                      <th className="text-left px-5 py-3">Clock Out</th>
                      <th className="text-left px-5 py-3">Hours</th>
                      <th className="text-left px-5 py-3">Late</th>
                      <th className="text-left px-5 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myLoading ? (
                      <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                    ) : (myAttendance?.records ?? []).length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No attendance records for this month</td></tr>
                    ) : (myAttendance?.records ?? []).map((r: any) => (
                      <tr key={r.id} className="border-b border-secondary hover:bg-background">
                        <td className="px-5 py-3 font-medium">{r.date}</td>
                        <td className="px-5 py-3"><StatusBadge status={r.type} /></td>
                        <td className="px-5 py-3 text-muted-foreground">{r.clockIn ? new Date(r.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.clockOut ? new Date(r.clockOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.hoursWorked?.toFixed(1) ?? "—"}</td>
                        <td className="px-5 py-3">
                          {r.isLate ? <span className="text-xs text-red-500 font-medium">Late</span> : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => { setRegularizationDate(r.date); setRegularizationOpen(true); }}>
                            Regularize
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── HOLIDAYS ── */}
        <TabsContent value="holidays">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={() => setAddHoliday(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Holiday
            </Button>
          </div>
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Holiday</th>
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-left px-5 py-3">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {holidaysLoading ? (
                    <tr><td colSpan={3} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                  ) : !holidays || (holidays as any[]).length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-10 text-muted-foreground">No holidays added yet. Use "Add Holiday" to add one.</td></tr>
                  ) : (holidays as any[]).map((h: any, i: number) => (
                    <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium text-foreground">{h.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(h.date)}</td>
                      <td className="px-5 py-3 text-muted-foreground capitalize">{h.type?.replace(/_/g, " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AddHolidayDialog open={addHoliday} onClose={() => setAddHoliday(false)} />
      <RegularizationDialog open={regularizationOpen} onClose={() => setRegularizationOpen(false)} date={regularizationDate} />
    </PageContainer>
  );
}
