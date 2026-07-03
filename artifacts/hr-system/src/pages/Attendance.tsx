import { useState, useEffect } from "react";
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
import { Search, Plus, AlertCircle, ChevronDown, ChevronRight, LogIn, LogOut, Coffee, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// ── Day timeline helpers ──────────────────────────────────────────────────────
function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
function fmtDur(minutes: number | null | undefined) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function DayTimeline({ record }: { record: any }) {
  const breaks: any[] = record.breaks ?? [];
  const events: { time: string; label: string; icon: React.ReactNode; color: string }[] = [];

  if (record.clockIn) {
    events.push({ time: fmtTime(record.clockIn), label: "Clocked In", icon: <LogIn className="w-3 h-3" />, color: "text-green-600 bg-green-50 border-green-200" });
  }
  for (const b of breaks) {
    if (b.breakStart) {
      events.push({ time: fmtTime(b.breakStart), label: "Went Away" + (b.durationMinutes ? ` · ${fmtDur(b.durationMinutes)}` : ""), icon: <Coffee className="w-3 h-3" />, color: "text-amber-600 bg-amber-50 border-amber-200" });
    }
    if (b.breakEnd) {
      events.push({ time: fmtTime(b.breakEnd), label: "Came Back", icon: <RotateCcw className="w-3 h-3" />, color: "text-blue-600 bg-blue-50 border-blue-200" });
    }
  }
  if (record.clockOut) {
    events.push({ time: fmtTime(record.clockOut), label: "Clocked Out", icon: <LogOut className="w-3 h-3" />, color: "text-red-500 bg-red-50 border-red-200" });
  }

  if (events.length === 0) return <p className="text-xs text-muted-foreground py-2">No detailed timeline available.</p>;

  return (
    <div className="flex flex-col gap-1.5 py-2 pl-2">
      {events.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground w-14 shrink-0">{e.time}</span>
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${e.color}`}>
            {e.icon}{e.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function AttendanceRow({ r, onRegularize }: { r: any; onRegularize: (date: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasBreaks = r.type === "wfo" && r.clockIn;
  return (
    <>
      <tr className="border-b border-secondary hover:bg-background cursor-pointer" onClick={() => hasBreaks && setExpanded(!expanded)}>
        <td className="px-4 py-3 font-medium">
          <div className="flex items-center gap-1.5">
            {hasBreaks
              ? (expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />)
              : <span className="w-3.5" />}
            {r.date}
          </div>
        </td>
        <td className="px-4 py-3"><StatusBadge status={r.type} /></td>
        <td className="px-4 py-3 text-muted-foreground text-sm">{fmtTime(r.clockIn)}</td>
        <td className="px-4 py-3 text-muted-foreground text-sm">{fmtTime(r.clockOut)}</td>
        <td className="px-4 py-3 text-muted-foreground text-sm">{r.hoursWorked?.toFixed(1) ?? "—"}</td>
        <td className="px-4 py-3 text-sm">
          {(r.breaks?.length ?? 0) > 0
            ? <span className="text-xs text-amber-600 font-medium">{r.breaks.length}× away</span>
            : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="px-4 py-3">
          {r.isLate ? <span className="text-xs text-red-500 font-medium">Late</span> : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => onRegularize(r.date)}>
            Regularize
          </Button>
        </td>
      </tr>
      {expanded && hasBreaks && (
        <tr className="bg-secondary/30 border-b border-secondary">
          <td colSpan={8} className="px-8 py-1">
            <DayTimeline record={r} />
          </td>
        </tr>
      )}
    </>
  );
}

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

// ── Biometric (EasyTime Pro) status panel — HR / super-admin only ──────────────
function BiometricPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["biometric-status"],
    queryFn: () => fetchApi<any>("/attendance/biometric/status"),
    refetchInterval: 60_000,
  });

  const syncMut = useMutation({
    mutationFn: () => fetchApi<any>("/attendance/biometric/sync", { method: "POST" }),
    onSuccess: (s: any) => {
      qc.invalidateQueries({ queryKey: ["biometric-status"] });
      qc.invalidateQueries({ queryKey: ["att-daily"] });
      if (s?.ok) toast.success(`Synced — ${s.created} created, ${s.updated} updated${s.skippedUnmapped ? `, ${s.skippedUnmapped} unmapped` : ""}`);
      else toast.error(s?.error ?? "Sync failed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: () => fetchApi<any>("/attendance/biometric/test-connection"),
    onSuccess: () => toast.success("Connection OK — credentials valid"),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading…</div>;

  const configured = data?.configured;
  const status = data?.status;

  if (!configured) {
    return (
      <div className="bg-white border border-border rounded-lg shadow-sm p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Biometric sync is not configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Set <code className="text-xs bg-secondary px-1 py-0.5 rounded">EASYTIME_URL</code>,{" "}
              <code className="text-xs bg-secondary px-1 py-0.5 rounded">EASYTIME_USERNAME</code> and{" "}
              <code className="text-xs bg-secondary px-1 py-0.5 rounded">EASYTIME_PASSWORD</code> in the server environment,
              then redeploy. Once configured, punches from the fingerprint machine sync automatically every 15 minutes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">EasyTime Pro server</p>
          <p className="font-mono text-sm text-foreground">{data?.serverUrl ?? "—"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
            {testMut.isPending ? "Testing…" : "Test connection"}
          </Button>
          <Button size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            {syncMut.isPending ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Last run", value: status?.ranAt ? new Date(status.ranAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never", color: "text-foreground" },
          { label: "Processed", value: status?.processed ?? 0, color: "text-foreground" },
          { label: "Created", value: status?.created ?? 0, color: "text-green-600" },
          { label: "Updated", value: status?.updated ?? 0, color: "text-blue-600" },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-border rounded-lg px-4 py-3 shadow-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className={`text-lg font-semibold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {status?.lastPunchTime && (
        <p className="text-sm text-muted-foreground">
          Latest punch seen: <span className="font-mono text-foreground">{status.lastPunchTime}</span> (IST)
        </p>
      )}

      {status?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{status.error}</span>
        </div>
      )}

      {status?.unmappedCodes?.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">
            {status.unmappedCodes.length} device code(s) not matched to any employee
          </p>
          <p className="text-xs mt-1">
            These punches were skipped. Add the matching <strong>Employee Code</strong> to each person (or fix it on the device) so they map:
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {status.unmappedCodes.map((c: string) => (
              <span key={c} className="font-mono text-xs bg-white border border-amber-300 px-1.5 py-0.5 rounded">{c}</span>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Office punches sync automatically every 15 minutes. Biometric punches take priority over manual clock-ins for office (WFO) days; WFH stays manual.
      </p>
    </div>
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
  const [dailySubTab, setDailySubTab] = useState(false);
  const [biometricSubTab, setBiometricSubTab] = useState(false);
  const [dailyDate, setDailyDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; id: string; note: string }>({ open: false, id: "", note: "" });

  const { data: team, isLoading } = useAttendanceTeam();
  const { data: holidays, isLoading: holidaysLoading } = useHolidays();
  const { data: user } = useCurrentUser();
  const { data: todayRecord } = useAttendanceToday();

  const { data: monthlyReport, isLoading: monthlyLoading } = useQuery({
    queryKey: ["att-report", month, year],
    queryFn: () => fetchApi<any[]>(`/reports/attendance?month=${month}&year=${year}`),
  });

  const { data: myAttendance, isLoading: myLoading } = useQuery({
    queryKey: ["my-attendance", user?.employeeId, month, year],
    queryFn: () => fetchApi<any>(`/self-service/attendance/${user?.employeeId}?month=${month}&year=${year}`),
    enabled: !!user?.employeeId,
  });

  const { data: dailyReport, isLoading: dailyLoading } = useQuery({
    queryKey: ["att-daily", dailyDate],
    queryFn: () => fetchApi<any[]>(`/attendance/daily?date=${dailyDate}`),
    enabled: dailySubTab,
  });

  const { data: myRegularizations } = useQuery({
    queryKey: ["regularization", user?.id],
    queryFn: () => fetchApi<any[]>("/attendance/regularization"),
    enabled: !!user?.id,
  });

  // HR: all regularization requests across all employees
  const { data: allRegularizations, isLoading: regLoading } = useQuery({
    queryKey: ["regularization-all"],
    queryFn: () => fetchApi<any[]>("/attendance/regularization"),
    enabled: !!user && user.role !== "employee",
  });

  const qc = useQueryClient();
  const approveMut = useMutation({
    mutationFn: ({ id, status, reviewNote }: { id: string; status: string; reviewNote?: string }) =>
      fetchApi(`/attendance/regularization/${id}`, { method: "PATCH", body: JSON.stringify({ status, reviewNote }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regularization-all"] });
      qc.invalidateQueries({ queryKey: ["regularization"] });
      toast.success("Request updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Employees should always land on "my" — redirect them away from the team daily view
  useEffect(() => {
    if (user && user.role === "employee" && location === "/attendance") {
      navigate("/attendance/my");
    }
  }, [user, location]);

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
              onClick={() => { setMonthlySubTab(false); setDailySubTab(false); setBiometricSubTab(false); }}
              className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${!monthlySubTab && !dailySubTab && !biometricSubTab ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-secondary"}`}
            >
              Team Today
            </button>
            <button
              onClick={() => { setDailySubTab(true); setMonthlySubTab(false); setBiometricSubTab(false); }}
              className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${dailySubTab ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-secondary"}`}
            >
              Daily View
            </button>
            <button
              onClick={() => { setMonthlySubTab(true); setDailySubTab(false); setBiometricSubTab(false); }}
              className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${monthlySubTab ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-secondary"}`}
            >
              Monthly View
            </button>
            <button
              onClick={() => { setBiometricSubTab(true); setDailySubTab(false); setMonthlySubTab(false); }}
              className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${biometricSubTab ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-secondary"}`}
            >
              Biometric
            </button>
          </div>

          {biometricSubTab ? (
            <BiometricPanel />
          ) : dailySubTab ? (
            /* Daily View — pick any date, see everyone's clock-in/out */
            <>
              <div className="flex items-center gap-3 mb-4">
                <Input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  value={dailyDate}
                  onChange={(e) => setDailyDate(e.target.value)}
                  className="w-44"
                />
                <span className="text-sm text-muted-foreground">
                  {dailyReport ? `${dailyReport.filter((r: any) => r.status === "wfo").length} in office · ${dailyReport.filter((r: any) => r.status === "wfh").length} WFH · ${dailyReport.filter((r: any) => r.status === "absent").length} absent` : ""}
                </span>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-5 py-3">Employee</th>
                      <th className="text-left px-5 py-3">Department</th>
                      <th className="text-left px-5 py-3">Status</th>
                      <th className="text-left px-5 py-3">Clock In</th>
                      <th className="text-left px-5 py-3">Clock Out</th>
                      <th className="text-right px-5 py-3">Hours</th>
                      <th className="text-left px-5 py-3">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyLoading ? (
                      <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                    ) : !dailyReport || dailyReport.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No records for {dailyDate}</td></tr>
                    ) : dailyReport.map((r: any, i: number) => (
                      <tr key={r.employeeId} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                        <td className="px-5 py-3 font-medium text-foreground">{r.employeeName}</td>
                        <td className="px-5 py-3 text-muted-foreground">{r.department}</td>
                        <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                        <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                          {r.clockIn ? new Date(r.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                          {r.clockOut ? new Date(r.clockOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground">
                          {r.hoursWorked != null ? r.hoursWorked.toFixed(1) + "h" : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {r.isLate && <span className="text-xs bg-red-50 text-red-500 border border-red-200 px-1.5 py-0.5 rounded-full font-medium">Late</span>}
                            {r.isHalfDay && <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">Half Day</span>}
                            {!r.isLate && !r.isHalfDay && r.status !== "absent" && r.status !== "on_leave" && r.clockIn && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : !monthlySubTab ? (
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

          {/* ── HR: Regularization Requests ── */}
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-foreground mb-3">Regularization Requests</h3>
            <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Date</th>
                    <th className="text-left px-5 py-3">Req. Clock In</th>
                    <th className="text-left px-5 py-3">Req. Clock Out</th>
                    <th className="text-left px-5 py-3">Reason</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {regLoading ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                  ) : !allRegularizations || allRegularizations.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No regularization requests</td></tr>
                  ) : allRegularizations.map((r: any, i: number) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium text-foreground">{r.employeeName || "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{r.date}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {r.requestedClockIn ? new Date(r.requestedClockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {r.requestedClockOut ? new Date(r.requestedClockOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground max-w-[180px] truncate" title={r.reason}>{r.reason}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === "approved" ? "bg-green-100 text-green-700" :
                          r.status === "rejected" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Pending"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {r.status === "pending" ? (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                              disabled={approveMut.isPending}
                              onClick={() => approveMut.mutate({ id: r.id, status: "approved" })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => setRejectDialog({ open: true, id: r.id, note: "" })}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{r.reviewNote ? `"${r.reviewNote}"` : "—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-left px-4 py-3">Clock In</th>
                      <th className="text-left px-4 py-3">Clock Out</th>
                      <th className="text-left px-4 py-3">Hours</th>
                      <th className="text-left px-4 py-3">Away</th>
                      <th className="text-left px-4 py-3">Late</th>
                      <th className="text-left px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myLoading ? (
                      <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                    ) : (myAttendance?.records ?? []).length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No attendance records for this month</td></tr>
                    ) : (myAttendance?.records ?? []).map((r: any) => (
                      <AttendanceRow key={r.id} r={r} onRegularize={(date) => { setRegularizationDate(date); setRegularizationOpen(true); }} />
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-muted-foreground px-4 py-2 border-t border-secondary">
                  Click a WFO row to expand the full day timeline.
                </p>
              </div>

              {/* ── Regularization Requests ── */}
              {myRegularizations && myRegularizations.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    {user?.role !== "employee" ? "Regularization Requests (All Employees)" : "My Regularization Requests"}
                  </h3>
                  <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                          {user?.role !== "employee" && <th className="text-left px-5 py-3">Employee</th>}
                          <th className="text-left px-5 py-3">Date</th>
                          <th className="text-left px-5 py-3">Req. Clock In</th>
                          <th className="text-left px-5 py-3">Req. Clock Out</th>
                          <th className="text-left px-5 py-3">Reason</th>
                          <th className="text-left px-5 py-3">Status</th>
                          {user?.role !== "employee" && <th className="text-left px-5 py-3">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {myRegularizations.map((r: any) => (
                          <tr key={r.id} className="border-b border-secondary hover:bg-background">
                            {user?.role !== "employee" && (
                              <td className="px-5 py-3 font-medium text-foreground">{r.employeeName || "—"}</td>
                            )}
                            <td className="px-5 py-3 font-medium">{r.date}</td>
                            <td className="px-5 py-3 text-muted-foreground">
                              {r.requestedClockIn ? new Date(r.requestedClockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">
                              {r.requestedClockOut ? new Date(r.requestedClockOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="px-5 py-3 text-muted-foreground max-w-[160px] truncate" title={r.reason}>{r.reason}</td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                r.status === "approved" ? "bg-green-100 text-green-700" :
                                r.status === "rejected" ? "bg-red-100 text-red-700" :
                                "bg-amber-100 text-amber-700"
                              }`}>
                                {r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Pending"}
                              </span>
                            </td>
                            {user?.role !== "employee" && (
                              <td className="px-5 py-3">
                                {r.status === "pending" ? (
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                      disabled={approveMut.isPending}
                                      onClick={() => approveMut.mutate({ id: r.id, status: "approved" })}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                                      onClick={() => setRejectDialog({ open: true, id: r.id, note: "" })}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{r.reviewNote ? `"${r.reviewNote}"` : "—"}</span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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

      {/* ── Reject regularization dialog ── */}
      <Dialog open={rejectDialog.open} onOpenChange={(o) => { if (!o) setRejectDialog({ open: false, id: "", note: "" }); }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Reject Regularization Request</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Optionally provide a reason for rejection:</p>
            <Textarea
              value={rejectDialog.note}
              onChange={(e) => setRejectDialog((d) => ({ ...d, note: e.target.value }))}
              rows={3}
              placeholder="e.g. Timing not matching system logs..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, id: "", note: "" })}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={approveMut.isPending}
              onClick={() => {
                approveMut.mutate(
                  { id: rejectDialog.id, status: "rejected", reviewNote: rejectDialog.note.trim() || undefined },
                  { onSuccess: () => setRejectDialog({ open: false, id: "", note: "" }) }
                );
              }}
            >
              {approveMut.isPending ? "Rejecting..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
