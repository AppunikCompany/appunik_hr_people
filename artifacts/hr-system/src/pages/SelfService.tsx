import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi, useEmployees } from "@/hooks/useApi";
import { formatDate } from "@/lib/utils";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";

function formatEnum(val: string | null | undefined): string {
  if (!val) return "—";
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function SelfService() {
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const { data: employees = [] } = useEmployees({ status: "active" });

  const { data: leaveSummary } = useQuery({
    queryKey: ["self-leave", selectedEmployee, year],
    queryFn: () => fetchApi<{
      balances: Array<{ leaveTypeName: string; allocated: number; used: number; pending: number; available: number }>;
      recentRequests: Array<{ id: string; leaveTypeName: string; startDate: string; endDate: string; days: number; status: string; reason: string }>;
    }>(`/self-service/leave-summary/${selectedEmployee}?year=${year}`),
    enabled: !!selectedEmployee,
  });

  const { data: attendance } = useQuery({
    queryKey: ["self-attendance", selectedEmployee, month, year],
    queryFn: () => fetchApi<{
      records: Array<{ id: string; date: string; type: string; clockIn: string | null; clockOut: string | null; hoursWorked: number | null; isLate: boolean }>;
      summary: { presentDays: number; wfhDays: number; halfDays: number; lateDays: number; totalHours: number };
    }>(`/self-service/attendance/${selectedEmployee}?month=${month}&year=${year}`),
    enabled: !!selectedEmployee,
  });

  const { data: myAssets = [] } = useQuery({
    queryKey: ["self-assets", selectedEmployee],
    queryFn: () => fetchApi<Array<{ assetName: string; assetCode: string; category: string; assignedAt: string }>>(`/self-service/assets/${selectedEmployee}`),
    enabled: !!selectedEmployee,
  });

  const { data: profile } = useQuery({
    queryKey: ["self-profile", selectedEmployee],
    queryFn: () => fetchApi<Record<string, string>>(`/self-service/profile/${selectedEmployee}`),
    enabled: !!selectedEmployee,
  });

  const handleExportAttendance = () => {
    if (!attendance?.records) return;
    const headers = ["Date", "Type", "Clock In", "Clock Out", "Hours", "Late"];
    const rows = attendance.records.map((r) => [
      r.date,
      r.type,
      r.clockIn ? new Date(r.clockIn).toLocaleTimeString() : "",
      r.clockOut ? new Date(r.clockOut).toLocaleTimeString() : "",
      r.hoursWorked?.toFixed(1) ?? "",
      r.isLate ? "Yes" : "No",
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${MONTHS[parseInt(month) - 1]}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer>
      <PageHeader title="Employee Self-Service" breadcrumbs={[{ label: "Self-Service" }]} />

      <div className="mb-6">
        <label className="block text-sm font-medium text-foreground mb-1.5">Select Employee</label>
        <Select value={selectedEmployee || "none"} onValueChange={(v) => setSelectedEmployee(v === "none" ? "" : v)}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Choose an employee…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Choose an employee…</SelectItem>
            {(employees as Array<{ id: string; firstName: string; lastName: string; employeeCode: string }>).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.firstName} {e.lastName} — {e.employeeCode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedEmployee ? (
        <div className="bg-white border border-border rounded-lg p-16 text-center text-muted-foreground text-sm">
          Select an employee to view their self-service portal
        </div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="leave">Leave</TabsTrigger>
            <TabsTrigger value="assets">My Assets</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {profile && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-border rounded-lg shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Personal Information</h3>
                  <dl className="space-y-3">
                    {[
                      { label: "Full Name", value: `${profile.firstName} ${profile.lastName}` },
                      { label: "Employee Code", value: profile.employeeCode },
                      { label: "Email", value: profile.email },
                      { label: "Phone", value: profile.phone ?? "—" },
                      { label: "Gender", value: profile.gender ?? "—" },
                      { label: "Date of Birth", value: profile.dateOfBirth ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center py-1 border-b border-secondary last:border-0">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="text-sm font-medium text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="bg-white border border-border rounded-lg shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Employment Details</h3>
                  <dl className="space-y-3">
                    {[
                      { label: "Joining Date", value: profile.joiningDate ? formatDate(profile.joiningDate) : "—" },
                      { label: "Employment Type", value: formatEnum(profile.employmentType) },
                      { label: "Status", value: formatEnum(profile.status) },
                      { label: "Work Location", value: profile.workLocation ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center py-1 border-b border-secondary last:border-0">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="text-sm font-medium text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="bg-white border border-border rounded-lg shadow-sm p-6 md:col-span-2">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Leave Balances (Current Year)</h3>
                  {leaveSummary?.balances && leaveSummary.balances.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {leaveSummary.balances.map((b) => (
                        <div key={b.leaveTypeName} className="bg-secondary border border-border rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-foreground">{b.available}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{b.leaveTypeName}</div>
                          <div className="text-xs text-muted-foreground/70 mt-1">{b.used} used / {b.allocated} total</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No leave balance data</p>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="attendance">
            <div className="flex items-center gap-3 mb-4">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2023, 2024, 2025, 2026].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleExportAttendance} className="ml-auto">
                <Download className="w-4 h-4 mr-1.5" /> Export CSV
              </Button>
            </div>

            {attendance?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                {[
                  { label: "Present (WFO)", value: attendance.summary.presentDays },
                  { label: "Work From Home", value: attendance.summary.wfhDays },
                  { label: "Half Days", value: attendance.summary.halfDays },
                  { label: "Late Days", value: attendance.summary.lateDays },
                  { label: "Total Hours", value: attendance.summary.totalHours.toFixed(1) + "h" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-border rounded-lg p-3 text-center shadow-sm">
                    <div className="text-xl font-bold text-foreground">{value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Clock In</th>
                    <th className="text-left px-4 py-3">Clock Out</th>
                    <th className="text-left px-4 py-3">Hours</th>
                    <th className="text-left px-4 py-3">Late</th>
                  </tr>
                </thead>
                <tbody>
                  {(attendance?.records ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-secondary hover:bg-background">
                      <td className="px-4 py-3 font-medium text-foreground">{r.date}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.type} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{r.clockIn ? new Date(r.clockIn).toLocaleTimeString() : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.clockOut ? new Date(r.clockOut).toLocaleTimeString() : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.hoursWorked?.toFixed(1) ?? "—"}</td>
                      <td className="px-4 py-3">
                        {r.isLate ? <Badge variant="destructive" className="text-xs">Late</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                  {(attendance?.records ?? []).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No attendance records for this month</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="leave">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Leave Balances</h3>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger className="w-24 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026].map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  {(leaveSummary?.balances ?? []).map((b) => (
                    <div key={b.leaveTypeName} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-foreground">{b.leaveTypeName}</span>
                        <span className="text-muted-foreground">{b.available} / {b.allocated} days left</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-foreground rounded-full"
                          style={{ width: `${b.allocated > 0 ? ((b.used / b.allocated) * 100) : 0}%` }}
                        />
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>{b.used} used</span>
                        <span>{b.pending} pending</span>
                        <span>{b.available} available</span>
                      </div>
                    </div>
                  ))}
                  {(leaveSummary?.balances ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No leave balance data</p>
                  )}
                </div>
              </div>

              <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Recent Leave Requests</h3>
                </div>
                <div className="divide-y divide-border">
                  {(leaveSummary?.recentRequests ?? []).map((r) => (
                    <div key={r.id} className="px-5 py-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-foreground">{r.leaveTypeName ?? "Leave"}</p>
                          <p className="text-xs text-muted-foreground">{r.startDate} → {r.endDate} · {r.days} day{r.days !== 1 ? "s" : ""}</p>
                          {r.reason && <p className="text-xs text-muted-foreground/70 mt-0.5 italic">{r.reason}</p>}
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  ))}
                  {(leaveSummary?.recentRequests ?? []).length === 0 && (
                    <p className="px-5 py-8 text-center text-sm text-muted-foreground">No leave requests yet</p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="assets">
            <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Assigned Assets ({myAssets.length})</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-4 py-3">Asset</th>
                    <th className="text-left px-4 py-3">Code</th>
                    <th className="text-left px-4 py-3">Category</th>
                    <th className="text-left px-4 py-3">Assigned On</th>
                  </tr>
                </thead>
                <tbody>
                  {myAssets.map((a) => (
                    <tr key={a.assetCode} className="border-b border-secondary hover:bg-background">
                      <td className="px-4 py-3 font-medium text-foreground">{a.assetName}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{a.assetCode}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.category}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.assignedAt ? new Date(a.assignedAt).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                  {myAssets.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">No assets assigned</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
}
