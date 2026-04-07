import { useCurrentUser, useHeadcountReport, useAttendanceTeam, useLeaveRequests } from "@/hooks/useApi";
import { StatusBadge } from "@/components/StatusBadge";
import { Users, Clock, Calendar, UserX, ArrowRight, Briefcase, TrendingUp } from "lucide-react";
import { Link } from "wouter";

function StatCard({ title, value, subtitle, icon: Icon, trend }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { label: string; up?: boolean };
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-5 shadow-md flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-foreground" />
        </div>
      </div>
      <div>
        <p className="text-3xl font-semibold text-foreground tracking-tight">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {trend && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-border">
          <TrendingUp className={`w-3 h-3 ${trend.up ? "text-green-600" : "text-muted-foreground"}`} />
          <span className="text-xs text-muted-foreground">{trend.label}</span>
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, action, children }: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-xl shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action && (
          <Link href={action.href}>
            <span className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              {action.label} <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        )}
      </div>
      {children}
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
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="p-6 max-w-[1200px] mx-auto">

      {/* Page header */}
      <div className="mb-8">
        <p className="text-xs text-muted-foreground mb-1">{today}</p>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          {greeting}, {firstName}!
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here's what's happening in your organization today.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Employees"
          value={headcount?.total ?? "—"}
          subtitle={`${headcount?.active ?? "—"} active`}
          icon={Users}
          trend={{ label: "Active headcount", up: true }}
        />
        <StatCard
          title="Present Today"
          value={wfoCount + wfhCount}
          subtitle={`${wfoCount} in office · ${wfhCount} remote`}
          icon={Clock}
          trend={{ label: "Clocked in today", up: true }}
        />
        <StatCard
          title="Absent Today"
          value={absentCount}
          subtitle="Not clocked in"
          icon={UserX}
          trend={{ label: "Out of office" }}
        />
        <StatCard
          title="Pending Leaves"
          value={pendingLeave?.length ?? "—"}
          subtitle="Awaiting approval"
          icon={Calendar}
          trend={{ label: "Need review" }}
        />
      </div>

      {/* Two column section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Today's Attendance */}
        <SectionCard
          title="Today's Attendance"
          action={{ label: "View all", href: "/attendance" }}
        >
          <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
            {team && team.length > 0 ? (
              team.slice(0, 12).map((entry: any) => (
                <div key={entry.employeeId} className="flex items-center justify-between px-5 py-3 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-semibold text-foreground">
                        {entry.employeeName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground leading-tight">{entry.employeeName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {entry.employeeCode ? `${entry.employeeCode} · ` : ""}{entry.department ?? "—"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={entry.status} />
                </div>
              ))
            ) : (
              <div className="px-5 py-10 text-center">
                <Clock className="w-8 h-8 text-border mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No attendance data for today</p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Right column: Headcount + Pending leave summary */}
        <div className="flex flex-col gap-6">
          <SectionCard
            title="Headcount by Department"
            action={{ label: "Full report", href: "/reports" }}
          >
            <div className="divide-y divide-border max-h-[180px] overflow-y-auto">
              {headcount?.byDepartment && headcount.byDepartment.length > 0 ? (
                headcount.byDepartment.map((dept: any) => {
                  const pct = headcount.total > 0 ? Math.round((dept.count / headcount.total) * 100) : 0;
                  return (
                    <div key={dept.department} className="flex items-center gap-3 px-5 py-3">
                      <Briefcase className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-foreground flex-1 truncate">{dept.department}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full bg-foreground rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-sm font-medium text-foreground w-4 text-right">{dept.count}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">No department data</div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Pending Leave Requests"
            action={{ label: "Review all", href: "/leave" }}
          >
            <div className="divide-y divide-border max-h-[120px] overflow-y-auto">
              {pendingLeave && pendingLeave.length > 0 ? (
                pendingLeave.slice(0, 4).map((req: any) => (
                  <div key={req.id} className="flex items-center justify-between px-5 py-3 hover:bg-secondary/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{req.employeeName}</p>
                      <p className="text-[11px] text-muted-foreground">{req.leaveTypeName} · {req.days} day{req.days !== 1 ? "s" : ""}</p>
                    </div>
                    <StatusBadge status="pending" />
                  </div>
                ))
              ) : (
                <div className="px-5 py-6 text-center text-sm text-muted-foreground">No pending requests</div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
