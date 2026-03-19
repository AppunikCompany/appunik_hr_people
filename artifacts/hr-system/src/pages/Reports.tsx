import { useState } from "react";
import { useHeadcountReport, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#2563EB", "#16A34A", "#D97706", "#DC2626", "#7C3AED", "#0891B2"];

export default function Reports() {
  const [attMonth, setAttMonth] = useState(String(new Date().getMonth() + 1));
  const [attYear, setAttYear] = useState(String(new Date().getFullYear()));
  const { data: headcount, isLoading: hcLoading } = useHeadcountReport();
  const { data: attReport } = useQuery({
    queryKey: ["att-report", attMonth, attYear],
    queryFn: () => fetchApi<any[]>(`/reports/attendance?month=${attMonth}&year=${attYear}`),
  });
  const { data: attrition } = useQuery({
    queryKey: ["attrition", attYear],
    queryFn: () => fetchApi<any>(`/reports/attrition?year=${attYear}`),
  });

  return (
    <PageContainer>
      <PageHeader title="Reports & Analytics" breadcrumbs={[{ label: "Reports" }]} />

      <Tabs defaultValue="headcount">
        <TabsList className="mb-6">
          <TabsTrigger value="headcount">Headcount</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="attrition">Attrition</TabsTrigger>
        </TabsList>

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
                    <Tooltip />
                    <Bar dataKey="count" fill="#2563EB" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white border border-border rounded-lg shadow-sm p-5">
                <h3 className="text-sm font-semibold mb-4">By Employment Type</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={headcount?.byEmploymentType ?? []} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {(headcount?.byEmploymentType ?? []).map((_: any, index: number) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white border border-border rounded-lg shadow-sm p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Total Headcount: {headcount?.total ?? "—"}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="text-left px-4 py-3">Department</th>
                        <th className="text-right px-4 py-3">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {headcount?.byDepartment?.map((d: any, i: number) => (
                        <tr key={d.department} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                          <td className="px-4 py-3">{d.department}</td>
                          <td className="px-4 py-3 text-right font-medium">{d.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="attendance">
          <div className="flex items-center gap-3 mb-4">
            <Select value={attMonth} onValueChange={setAttMonth}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={attYear} onValueChange={setAttYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Employee</th>
                  <th className="text-right px-5 py-3">Present</th>
                  <th className="text-right px-5 py-3">WFH</th>
                  <th className="text-right px-5 py-3">Absent</th>
                  <th className="text-right px-5 py-3">Half Days</th>
                  <th className="text-right px-5 py-3">OT Hours</th>
                </tr>
              </thead>
              <tbody>
                {!attReport || attReport.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No data for this period</td></tr>
                ) : attReport.map((r: any, i: number) => (
                  <tr key={r.employeeId} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                    <td className="px-5 py-3 font-medium">{r.employeeName}</td>
                    <td className="px-5 py-3 text-right text-green-600">{r.presentDays}</td>
                    <td className="px-5 py-3 text-right text-blue-600">{r.wfhDays}</td>
                    <td className="px-5 py-3 text-right text-red-500">{r.absentDays}</td>
                    <td className="px-5 py-3 text-right">{r.halfDays}</td>
                    <td className="px-5 py-3 text-right">{r.overtimeHours.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="attrition">
          <div className="flex items-center gap-3 mb-4">
            <Select value={attYear} onValueChange={setAttYear}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
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
                    <Tooltip labelFormatter={(v) => `Q${v}`} />
                    <Bar dataKey="exits" fill="#DC2626" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border-border rounded-lg shadow-sm p-5 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Exits</p>
                    <p className="text-4xl font-semibold text-foreground">{attrition.totalExits}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Tenure</p>
                    <p className="text-2xl font-semibold text-foreground">{attrition.avgTenureMonths.toFixed(1)} <span className="text-sm text-muted-foreground">months</span></p>
                  </div>
                </div>
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
