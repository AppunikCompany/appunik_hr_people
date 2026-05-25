import { useCurrentUser, useHeadcountReport, useAttendanceTeam, useLeaveRequests, useLeaveBalances, useHolidays } from "@/hooks/useApi";
import { StatusBadge } from "@/components/StatusBadge";
import { Users, Clock, Calendar, UserX, ArrowRight, Briefcase, TrendingUp, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { formatDate } from "@/lib/utils";

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

// ── Employee Personal Dashboard ──────────────────────────────────────────────
function EmployeeDashboard({ user, greeting, today }: { user: any; greeting: string; today: string }) {
  const { data: myRequests } = useLeaveRequests();          // backend filters to own requests
  const { data: myBalances } = useLeaveBalances(user?.employeeId ?? undefined);
  const { data: myAttendance } = useAttendanceTeam();      // backend filters to own record
  const { data: holidays } = useHolidays();

  const pendingCount = (myRequests as any[] ?? []).filter((r: any) => r.status === "pending" || r.status === "pending_doc").length;
  const approvedCount = (myRequests as any[] ?? []).filter((r: any) => r.status === "approved").length;

  // Today's status from attendance
  const myTodayRecord = (myAttendance as any[] ?? [])[0];
  const todayStatus = myTodayRecord?.status ?? "absent";
  const clockInTime = myTodayRecord?.clockIn
    ? new Date(myTodayRecord.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Upcoming holidays (next 3)
  const todayStr = new Date().toISOString().split("T")[0];
  const upcomingHolidays = (holidays as any[] ?? [])
    .filter((h: any) => h.date >= todayStr)
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .slice(0, 3);

  // Total available leave days across all types
  const totalAvailable = (myBalances as any[] ?? []).reduce((sum: number, b: any) => sum + Math.max(0, b.balance - b.used), 0);

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <p className="text-xs text-muted-foreground mb-1">{today}</p>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">{greeting}, {user?.firstName}!</h1>
        <p className="text-sm text-muted-foreground mt-1">Here's your personal overview for today.</p>
      </div>

      {/* Personal stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Today's Status"
          value={todayStatus === "absent" ? "Absent" : todayStatus === "wfo" ? "In Office" : todayStatus === "wfh" ? "WFH" : todayStatus}
          subtitle={clockInTime ? `Clocked in at ${clockInTime}` : "Not clocked in yet"}
          icon={Clock}
          trend={{ label: "Your attendance today", up: todayStatus !== "absent" }}
        />
        <StatCard
          title="Leave Balance"
          value={totalAvailable}
          subtitle="Total days available"
          icon={Calendar}
          trend={{ label: "Across all leave types", up: totalAvailable > 5 }}
        />
        <StatCard
          title="Pending Requests"
          value={pendingCount}
          subtitle="Awaiting approval"
          icon={AlertCircle}
          trend={{ label: "Your leave requests" }}
        />
        <StatCard
          title="Approved This Year"
          value={approvedCount}
          subtitle="Leave days approved"
          icon={CheckCircle2}
          trend={{ label: "Approved requests", up: true }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Leave Balances */}
        <SectionCard title="My Leave Balances" action={{ label: "View all", href: "/leave/balances" }}>
          <div className="divide-y divide-border max-h-[260px] overflow-y-auto">
            {myBalances && (myBalances as any[]).length > 0 ? (
              (myBalances as any[]).map((b: any) => {
                const available = Math.max(0, b.balance - b.used);
                const pct = b.balance > 0 ? Math.round((available / b.balance) * 100) : 0;
                return (
                  <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{b.leaveTypeName}</p>
                      <p className="text-[11px] text-muted-foreground">{b.used} used · {available} remaining</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-foreground rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-foreground w-6 text-right">{available}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-10 text-center">
                <Calendar className="w-8 h-8 text-border mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No leave balances found</p>
              </div>
            )}
          </div>
        </SectionCard>

        <div className="flex flex-col gap-6">
          {/* My Recent Requests */}
          <SectionCard title="My Recent Leave Requests" action={{ label: "View all", href: "/leave" }}>
            <div className="divide-y divide-border max-h-[130px] overflow-y-auto">
              {myRequests && (myRequests as any[]).length > 0 ? (
                (myRequests as any[]).slice(0, 3).map((req: any) => (
                  <div key={req.id} className="flex items-center justify-between px-5 py-3 hover:bg-secondary/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-foreground">{req.leaveTypeName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(req.startDate)} — {formatDate(req.endDate)} · {req.days} day{req.days !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>
                ))
              ) : (
                <div className="px-5 py-5 text-center text-sm text-muted-foreground">No leave requests yet</div>
              )}
            </div>
          </SectionCard>

          {/* Upcoming Holidays */}
          <SectionCard title="Upcoming Holidays" action={{ label: "View all", href: "/attendance/holidays" }}>
            <div className="divide-y divide-border">
              {upcomingHolidays.length > 0 ? (
                upcomingHolidays.map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{h.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(h.date)}</p>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-2 py-0.5 bg-secondary rounded-full">
                      {h.type ?? "Public"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="px-5 py-5 text-center text-sm text-muted-foreground">No upcoming holidays</div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ── Admin / Manager Dashboard ────────────────────────────────────────────────
function AdminDashboard({ user, greeting, today }: { user: any; greeting: string; today: string }) {
  const isAdmin = user?.role === "super_admin" || user?.role === "hr_admin";
  const { data: headcount } = useHeadcountReport();
  const { data: team } = useAttendanceTeam();           // backend filters: manager gets team, admin gets all
  const { data: pendingLeave } = useLeaveRequests({ status: "pending" }); // backend filters by role

  const wfoCount = (team as any[] ?? []).filter((t: any) => t.status === "wfo").length;
  const wfhCount = (team as any[] ?? []).filter((t: any) => t.status === "wfh").length;
  const absentCount = (team as any[] ?? []).filter((t: any) => t.status === "absent").length;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="mb-8">
        <p className="text-xs text-muted-foreground mb-1">{today}</p>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          {greeting}, {user?.firstName}!
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? "Here's what's happening in your organization today." : "Here's an overview of your team today."}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {isAdmin && (
          <StatCard
            title="Total Employees"
            value={headcount?.total ?? "—"}
            subtitle={`${headcount?.active ?? "—"} active`}
            icon={Users}
            trend={{ label: "Active headcount", up: true }}
          />
        )}
        <StatCard
          title="Present Today"
          value={wfoCount + wfhCount}
          subtitle={`${wfoCount} in office · ${wfhCount} remote`}
          icon={Clock}
          trend={{ label: isAdmin ? "Clocked in today" : "Team clocked in", up: true }}
        />
        <StatCard
          title="Absent Today"
          value={absentCount}
          subtitle="Not clocked in"
          icon={UserX}
          trend={{ label: isAdmin ? "Out of office" : "Team absent" }}
        />
        <StatCard
          title="Pending Leaves"
          value={(pendingLeave as any[] ?? []).length}
          subtitle="Awaiting approval"
          icon={Calendar}
          trend={{ label: "Need review" }}
        />
      </div>

      {/* Two column section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Today's Attendance */}
        <SectionCard
          title={isAdmin ? "Today's Attendance" : "Team Attendance Today"}
          action={{ label: "View all", href: "/attendance" }}
        >
          <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
            {team && (team as any[]).length > 0 ? (
              (team as any[]).slice(0, 12).map((entry: any) => (
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

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {isAdmin && (
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
          )}

          <SectionCard
            title="Pending Leave Requests"
            action={{ label: "Review all", href: "/leave" }}
          >
            <div className="divide-y divide-border max-h-[120px] overflow-y-auto">
              {pendingLeave && (pendingLeave as any[]).length > 0 ? (
                (pendingLeave as any[]).slice(0, 4).map((req: any) => (
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

// ── Main Dashboard (role-router) ─────────────────────────────────────────────
export default function Dashboard() {
  const { data: user } = useCurrentUser();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  if (!user) return null;

  if (user.role === "employee") {
    return <EmployeeDashboard user={user} greeting={greeting} today={today} />;
  }

  return <AdminDashboard user={user} greeting={greeting} today={today} />;
}
