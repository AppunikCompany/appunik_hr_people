import { useState } from "react";
import { useLocation } from "wouter";
import { useHeadcountReport, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList } from "recharts";
import { Download } from "lucide-react";
import { toast } from "sonner";

const CHART_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS = [2024, 2025, 2026];

function formatEnum(val: string): string {
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type AttRecord = { employeeId: string; employeeCode: string; employeeName: string; department: string | null; presentDays: number; wfhDays: number; absentDays: number; halfDays: number; lopDays: number; leaveDays: number; totalDays: number; overtimeHours: number };
type DeptCount = { department: string; count: number };

function downloadCSV(data: string, filename: string) {
  const blob = new Blob([data], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [location] = useLocation();
  const tabFromPath: Record<string, string> = {
    "/reports": "headcount",
    "/reports/attendance": "attendance",
    "/reports/wfh": "wfh",
    "/reports/attrition": "attrition",
    "/reports/assets": "assets",
    "/reports/kra": "kra",
  };
  const activeTab = tabFromPath[location] ?? "headcount";

  const [attMonth, setAttMonth] = useState(String(new Date().getMonth() + 1));
  const [attYear, setAttYear] = useState(String(new Date().getFullYear()));

  const { data: headcount, isLoading: hcLoading } = useHeadcountReport();

  const { data: attReport } = useQuery({
    queryKey: ["att-report", attMonth, attYear],
    queryFn: () => fetchApi<AttRecord[]>(`/reports/attendance?month=${attMonth}&year=${attYear}`),
  });

  const { data: attrition } = useQuery({
    queryKey: ["attrition", attYear],
    queryFn: () => fetchApi<{ year: number; totalExits: number; byQuarter: Array<{ quarter: number; exits: number }>; avgTenureMonths: number; byDepartment: DeptCount[] }>(`/reports/attrition?year=${attYear}`),
  });

  const { data: wfhRatio } = useQuery({
    queryKey: ["wfh-ratio", attMonth, attYear],
    queryFn: () => fetchApi<{ totalWfo: number; totalWfh: number; total: number; wfhPercentage: number; byDepartment: Array<{ department: string; wfo: number; wfh: number; wfhPercent: number }> }>(`/reports/wfh-ratio?month=${attMonth}&year=${attYear}`),
  });

  const { data: assetInventory } = useQuery({
    queryKey: ["asset-inventory-report"],
    queryFn: () => fetchApi<{ total: number; assigned: number; available: number; maintenance: number; retired: number; utilizationRate: number; byStatus: Array<{ status: string; count: number }>; byCategory: Array<{ category: string; count: number }> }>("/reports/asset-inventory"),
  });

  const { data: kraSummary } = useQuery({
    queryKey: ["kra-summary-report"],
    queryFn: () => fetchApi<{ total: number; avgFinalScore: number; byStatus: Array<{ status: string; count: number }>; byDepartment: Array<{ department: string; total: number; avgScore: number | null }> }>("/reports/kra-summary"),
  });

  const exportAttendanceCSV = () => {
    if (!attReport) return;
    const headers = ["Employee ID", "Employee", "Department", "Present Days", "WFH Days", "Absent Days", "Half Days", "OT Hours"];
    const rows = attReport.map((r) => [r.employeeCode, r.employeeName, r.department ?? "", r.presentDays, r.wfhDays, r.absentDays, r.halfDays, r.overtimeHours.toFixed(1)].join(","));
    downloadCSV([headers.join(","), ...rows].join("\n"), `attendance_${MONTHS[parseInt(attMonth) - 1]}_${attYear}.csv`);
    toast.success(`Attendance report exported — ${attReport.length} employees`);
  };

  const exportHeadcountCSV = () => {
    if (!headcount?.byDepartment) return;
    const headers = ["Department", "Count"];
    const rows = (headcount.byDepartment as DeptCount[]).map((r) => `${r.department},${r.count}`);
    downloadCSV([headers.join(","), ...rows].join("\n"), `headcount_${attYear}.csv`);
    toast.success("Headcount report exported");
  };

  return (
    <PageContainer>
      <PageHeader title="Reports & Analytics" breadcrumbs={[{ label: "Reports" }]} />

      <Tabs value={activeTab}>

        <TabsContent value="headcount">
          {hcLoading ? (
            <div className="text-center py-20 text-muted-foreground">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">By Department</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={headcount?.byDepartment ?? []}>
                    <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: "transparent" }} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {(headcount?.byDepartment ?? []).map((_: unknown, index: number) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                      <LabelList dataKey="count" position="top" style={{ fontSize: 11, fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">By Employment Type</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={(headcount?.byEmploymentType ?? []).map((d: any) => ({ ...d, type: formatEnum(d.type) }))}
                      dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80}
                      labelLine={{ stroke: "#999", strokeWidth: 1 }}
                      label={({ name, percent }: { name: string; percent: number }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    >
                      {(headcount?.byEmploymentType ?? []).map((_: unknown, index: number) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend formatter={(value: string) => formatEnum(value)} />
                    <Tooltip cursor={{ fill: "transparent" }} formatter={(value: unknown, name: string) => [String(value ?? ""), formatEnum(name)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Total Headcount: {headcount?.total ?? "—"}</h3>
                  <Button variant="outline" size="sm" onClick={exportHeadcountCSV}>
                    <Download className="w-4 h-4 mr-1.5" /> Export CSV
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-4 py-3">Department</th>
                      <th className="text-right px-4 py-3">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(headcount?.byDepartment as DeptCount[] ?? []).map((d, i) => (
                      <tr key={d.department} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                        <td className="px-4 py-3">{d.department}</td>
                        <td className="px-4 py-3 text-right font-medium">{d.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="attendance">
          <div className="flex items-center gap-3 mb-4">
            <Select value={attMonth} onValueChange={setAttMonth}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={attYear} onValueChange={setAttYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportAttendanceCSV} className="ml-auto">
              <Download className="w-4 h-4 mr-1.5" /> Export CSV
            </Button>
          </div>
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Employee</th>
                  <th className="text-left px-5 py-3">Emp ID</th>
                  <th className="text-left px-5 py-3">Dept</th>
                  <th className="text-right px-5 py-3">Present</th>
                  <th className="text-right px-5 py-3">WFH</th>
                  <th className="text-right px-5 py-3">Absent</th>
                  <th className="text-right px-5 py-3">Half Days</th>
                  <th className="text-right px-5 py-3">OT Hrs</th>
                </tr>
              </thead>
              <tbody>
                {!attReport || attReport.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No data for this period</td></tr>
                ) : attReport.map((r, i) => (
                  <tr key={r.employeeId} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                    <td className="px-5 py-3 font-medium text-foreground">{r.employeeName}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{r.employeeCode}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.department ?? "No Department"}</td>
                    <td className="px-5 py-3 text-right text-green-600 font-medium">{r.presentDays}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground font-medium">{r.wfhDays}</td>
                    <td className="px-5 py-3 text-right text-red-500">{r.absentDays}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{r.halfDays}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{r.overtimeHours.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="wfh">
          <div className="flex items-center gap-3 mb-4">
            <Select value={attMonth} onValueChange={setAttMonth}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={attYear} onValueChange={setAttYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {wfhRatio ? (
            wfhRatio.total === 0 ? (
              <div className="text-center py-20 text-muted-foreground">No attendance data for {MONTHS[parseInt(attMonth) - 1]} {attYear}</div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">Overall WFH vs WFO</h3>
                <div className="flex items-center gap-8 mb-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{wfhRatio.wfhPercentage}%</p>
                    <p className="text-xs text-muted-foreground mt-1">WFH</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{100 - wfhRatio.wfhPercentage}%</p>
                    <p className="text-xs text-muted-foreground mt-1">WFO</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{wfhRatio.total}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Days</p>
                  </div>
                </div>
                <div className="h-4 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-foreground rounded-full" style={{ width: `${wfhRatio.wfhPercentage}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{wfhRatio.totalWfh} WFH days</span>
                  <span>{wfhRatio.totalWfo} WFO days</span>
                </div>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">WFH % by Department</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={wfhRatio.byDepartment}>
                    <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip cursor={{ fill: "transparent" }} formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="wfhPercent" fill="#24292E" radius={[3, 3, 0, 0]} name="WFH %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            )
          ) : (
            <div className="text-center py-20 text-muted-foreground">Loading...</div>
          )}
        </TabsContent>

        <TabsContent value="attrition">
          <div className="flex items-center gap-3 mb-4">
            <Select value={attYear} onValueChange={setAttYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {attrition ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">Quarterly Exits — {attrition.year}</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={attrition.byQuarter}>
                    <XAxis dataKey="quarter" tickFormatter={(v) => `Q${v}`} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: "transparent" }} labelFormatter={(v) => `Q${v}`} />
                    <Bar dataKey="exits" fill="#F34141" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <div className="flex flex-col items-center justify-center h-full gap-6 py-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Exits</p>
                    <p className="text-5xl font-semibold text-foreground">{attrition.totalExits}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Tenure</p>
                    <p className="text-3xl font-semibold text-foreground">{attrition.avgTenureMonths} <span className="text-sm text-muted-foreground">months</span></p>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm p-5 lg:col-span-2">
                <h3 className="text-sm font-semibold mb-4">Exits by Department</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={attrition.byDepartment ?? []}>
                    <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: "transparent" }} />
                    <Bar dataKey="count" fill="#F34141" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground">Loading...</div>
          )}
        </TabsContent>

        <TabsContent value="assets">
          {assetInventory ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">Asset Status Overview</h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: "Total Assets", value: assetInventory.total },
                    { label: "Assigned", value: assetInventory.assigned },
                    { label: "Available", value: assetInventory.available },
                    { label: "Maintenance", value: assetInventory.maintenance },
                    { label: "Retired", value: assetInventory.retired },
                    { label: "Utilization", value: `${assetInventory.utilizationRate}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-secondary rounded-lg p-3 text-center border border-border">
                      <div className="text-2xl font-bold text-foreground">{value}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={assetInventory.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={70}>
                      {assetInventory.byStatus.map((_: unknown, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip cursor={{ fill: "transparent" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">Assets by Category</h3>
                {assetInventory.byCategory && assetInventory.byCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={assetInventory.byCategory} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip cursor={{ fill: "transparent" }} />
                      <Bar dataKey="count" fill="#24292E" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No asset category data available</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground">Loading...</div>
          )}
        </TabsContent>

        <TabsContent value="kra">
          {kraSummary ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">KRA Status Distribution</h3>
                <div className="text-center mb-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Final Score</p>
                  <p className="text-4xl font-bold text-foreground">{kraSummary.avgFinalScore}<span className="text-lg text-muted-foreground">/5</span></p>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={kraSummary.byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={70}>
                      {kraSummary.byStatus.map((_: unknown, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip cursor={{ fill: "transparent" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">Avg Score by Department</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-xs uppercase text-muted-foreground">
                      <th className="text-left px-3 py-2">Department</th>
                      <th className="text-right px-3 py-2">KRAs</th>
                      <th className="text-right px-3 py-2">Avg Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kraSummary.byDepartment.length === 0 ? (
                      <tr><td colSpan={3} className="text-center py-8 text-muted-foreground text-sm">No performance data available</td></tr>
                    ) : kraSummary.byDepartment.map((d, i) => (
                      <tr key={d.department} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                        <td className="px-3 py-2 font-medium text-foreground">{d.department}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{d.total}</td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">{d.avgScore ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground">Loading...</div>
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
