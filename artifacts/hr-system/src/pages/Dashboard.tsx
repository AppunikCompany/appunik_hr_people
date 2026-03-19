import { useCurrentUser, useHeadcountReport, useAttendanceTeam, useLeaveRequests } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Users, Clock, Calendar, TrendingUp, UserCheck, Home, Briefcase } from "lucide-react";

function StatCard({ title, value, subtitle, icon: Icon, color }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-white border border-border rounded-lg p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: user } = useCurrentUser();
  const { data: headcount } = useHeadcountReport();
  const { data: team } = useAttendanceTeam();
  const { data: pendingLeave } = useLeaveRequests({ status: "pending" });

  const wfoCount = team?.filter((t: any) => t.status === "wfo").length ?? 0;
  const wfhCount = team?.filter((t: any) => t.status === "wfh").length ?? 0;
  const absentCount = team?.filter((t: any) => t.status === "absent").length ?? 0;

  const firstName = user?.firstName ?? "there";

  return (
    <PageContainer>
      <PageHeader
        title={`Good morning, ${firstName}!`}
        subtitle="Here's what's happening in your organization today."
        breadcrumbs={[{ label: "Dashboard" }]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Employees"
          value={headcount?.total ?? "—"}
          subtitle="Active headcount"
          icon={Users}
          color="bg-blue-600"
        />
        <StatCard
          title="Present Today"
          value={wfoCount + wfhCount}
          subtitle={`${wfoCount} WFO · ${wfhCount} WFH`}
          icon={Clock}
          color="bg-green-600"
        />
        <StatCard
          title="Absent Today"
          value={absentCount}
          subtitle="Not clocked in"
          icon={UserCheck}
          color="bg-red-500"
        />
        <StatCard
          title="Pending Leaves"
          value={pendingLeave?.length ?? "—"}
          subtitle="Awaiting approval"
          icon={Calendar}
          color="bg-yellow-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-border rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Today's Attendance</h2>
          </div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {team && team.length > 0 ? (
              team.slice(0, 15).map((entry: any, i: number) => (
                <div key={entry.employeeId} className={`flex items-center justify-between px-5 py-3 ${i % 2 === 0 ? "" : "bg-background"}`}>
                  <div>
                    <p className="text-sm font-medium text-foreground">{entry.employeeName}</p>
                    <p className="text-xs text-muted-foreground">{entry.department ?? "—"}</p>
                  </div>
                  <StatusBadge status={entry.status} />
                </div>
              ))
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No attendance data for today</div>
            )}
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Headcount by Department</h2>
          </div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {headcount?.byDepartment && headcount.byDepartment.length > 0 ? (
              headcount.byDepartment.map((dept: any, i: number) => (
                <div key={dept.department} className={`flex items-center justify-between px-5 py-3 ${i % 2 === 0 ? "" : "bg-background"}`}>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">{dept.department}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{dept.count}</span>
                </div>
              ))
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No department data available</div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
