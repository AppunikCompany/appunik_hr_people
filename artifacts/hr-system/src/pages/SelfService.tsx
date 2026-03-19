import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi, useEmployees } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-green-50 text-green-700",
    pending: "bg-yellow-50 text-yellow-700",
    rejected: "bg-red-50 text-red-700",
    wfo: "bg-blue-50 text-blue-700",
    wfh: "bg-purple-50 text-purple-700",
    present: "bg-green-50 text-green-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-700"}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

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
        <label className="block text-sm font-medium text-[#111827] mb-1.5">Select Employee</label>
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
        <div className="bg-white border border-[#E5E7EB] rounded-lg p-16 text-center text-[#6B7280] text-sm">
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
                <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-[#111827] mb-4">Personal Information</h3>
                  <dl className="space-y-3">
                    {[
                      { label: "Full Name", value: `${profile.firstName} ${profile.lastName}` },
                      { label: "Employee Code", value: profile.employeeCode },
                      { label: "Email", value: profile.email },
                      { label: "Phone", value: profile.phone ?? "—" },
                      { label: "Gender", value: profile.gender ?? "—" },
                      { label: "Date of Birth", value: profile.dateOfBirth ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center py-1 border-b border-[#F3F4F6] last:border-0">
                        <dt className="text-xs text-[#6B7280]">{label}</dt>
                        <dd className="text-sm font-medium text-[#111827]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-[#111827] mb-4">Employment Details</h3>
                  <dl className="space-y-3">
                    {[
                      { label: "Joining Date", value: profile.joiningDate ?? "—" },
                      { label: "Employment Type", value: profile.employmentType ?? "—" },
                      { label: "Status", value: profile.status ?? "—" },
                      { label: "Work Location", value: profile.workLocation ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center py-1 border-b border-[#F3F4F6] last:border-0">
                        <dt className="text-xs text-[#6B7280]">{label}</dt>
                        <dd className="text-sm font-medium text-[#111827]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-6 md:col-span-2">
                  <h3 className="text-sm font-semibold text-[#111827] mb-4">Leave Balances (Current Year)</h3>
                  {leaveSummary?.balances && leaveSummary.balances.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {leaveSummary.balances.map((b) => (
                        <div key={b.leaveTypeName} className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-[#2563EB]">{b.available}</div>
                          <div className="text-xs text-[#6B7280] mt-0.5">{b.leaveTypeName}</div>
                          <div className="text-xs text-[#9CA3AF] mt-1">{b.used} used / {b.allocated} total</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#6B7280]">No leave balance data</p>
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
                  <div key={label} className="bg-white border border-[#E5E7EB] rounded-lg p-3 text-center shadow-sm">
                    <div className="text-xl font-bold text-[#111827]">{value}</div>
                    <div className="text-xs text-[#6B7280] mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Clock In</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Clock Out</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Hours</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Late</th>
                  </tr>
                </thead>
                <tbody>
                  {(attendance?.records ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-[#F9FAFB] hover:bg-[#F9FAFB]">
                      <td className="px-4 py-3 font-medium">{r.date}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.type} /></td>
                      <td className="px-4 py-3 text-[#6B7280]">{r.clockIn ? new Date(r.clockIn).toLocaleTimeString() : "—"}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{r.clockOut ? new Date(r.clockOut).toLocaleTimeString() : "—"}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{r.hoursWorked?.toFixed(1) ?? "—"}</td>
                      <td className="px-4 py-3">
                        {r.isLate ? <Badge variant="destructive" className="text-xs">Late</Badge> : <span className="text-[#6B7280] text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                  {(attendance?.records ?? []).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-[#6B7280] text-sm">No attendance records for this month</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="leave">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-[#111827]">Leave Balances</h3>
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
                        <span className="font-medium text-[#111827]">{b.leaveTypeName}</span>
                        <span className="text-[#6B7280]">{b.available} / {b.allocated} days left</span>
                      </div>
                      <div className="h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#2563EB] rounded-full"
                          style={{ width: `${b.allocated > 0 ? ((b.used / b.allocated) * 100) : 0}%` }}
                        />
                      </div>
                      <div className="flex gap-3 text-xs text-[#9CA3AF]">
                        <span>{b.used} used</span>
                        <span>{b.pending} pending</span>
                        <span>{b.available} available</span>
                      </div>
                    </div>
                  ))}
                  {(leaveSummary?.balances ?? []).length === 0 && (
                    <p className="text-sm text-[#6B7280] text-center py-4">No leave balance data</p>
                  )}
                </div>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#F3F4F6]">
                  <h3 className="text-sm font-semibold text-[#111827]">Recent Leave Requests</h3>
                </div>
                <div className="divide-y divide-[#F3F4F6]">
                  {(leaveSummary?.recentRequests ?? []).map((r) => (
                    <div key={r.id} className="px-5 py-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-[#111827]">{r.leaveTypeName ?? "Leave"}</p>
                          <p className="text-xs text-[#6B7280]">{r.startDate} → {r.endDate} · {r.days} day{r.days !== 1 ? "s" : ""}</p>
                          {r.reason && <p className="text-xs text-[#9CA3AF] mt-0.5 italic">{r.reason}</p>}
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  ))}
                  {(leaveSummary?.recentRequests ?? []).length === 0 && (
                    <p className="px-5 py-8 text-center text-sm text-[#6B7280]">No leave requests yet</p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="assets">
            <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#F3F4F6]">
                <h3 className="text-sm font-semibold text-[#111827]">Assigned Assets ({myAssets.length})</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Asset</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Code</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#6B7280] uppercase">Assigned On</th>
                  </tr>
                </thead>
                <tbody>
                  {myAssets.map((a) => (
                    <tr key={a.assetCode} className="border-b border-[#F9FAFB] hover:bg-[#F9FAFB]">
                      <td className="px-4 py-3 font-medium text-[#111827]">{a.assetName}</td>
                      <td className="px-4 py-3 text-[#6B7280] font-mono text-xs">{a.assetCode}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{a.category}</td>
                      <td className="px-4 py-3 text-[#6B7280]">{a.assignedAt ? new Date(a.assignedAt).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                  {myAssets.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-[#6B7280] text-sm">No assets assigned</td></tr>
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
