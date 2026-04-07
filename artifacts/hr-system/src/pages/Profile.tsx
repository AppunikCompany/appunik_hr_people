import { useCurrentUser, fetchApi } from "@/hooks/useApi";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/utils";
import { User, Mail, Phone, Briefcase, Calendar, Shield } from "lucide-react";

function formatEnum(val: string | null | undefined): string {
  if (!val) return "—";
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Profile() {
  const { data: user } = useCurrentUser();

  const { data: profile } = useQuery({
    queryKey: ["self-profile", user?.id],
    queryFn: () => fetchApi<Record<string, any>>(`/self-service/profile/${user?.id}`),
    enabled: !!user?.id,
  });

  const { data: leaveSummary } = useQuery({
    queryKey: ["self-leave", user?.id, new Date().getFullYear()],
    queryFn: () => fetchApi<{ balances: any[]; recentRequests: any[] }>(`/self-service/leave-summary/${user?.id}?year=${new Date().getFullYear()}`),
    enabled: !!user?.id,
  });

  return (
    <PageContainer>
      <PageHeader
        title="My Profile"
        subtitle="Your personal and employment information"
        breadcrumbs={[{ label: "My Profile" }]}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Avatar Card */}
        <div className="bg-white border border-border rounded-lg shadow-sm p-6 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-foreground text-2xl font-bold mb-4">
            {(user?.firstName ?? "?")?.[0]}{(user?.lastName ?? "")?.[0]}
          </div>
          <h2 className="text-lg font-semibold text-foreground">{user?.firstName} {user?.lastName}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{profile?.designationName ?? user?.role ?? "—"}</p>
          {profile?.status && (
            <div className="mt-3">
              <StatusBadge status={profile.status} />
            </div>
          )}
          <div className="w-full mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{user?.email ?? "—"}</span>
            </div>
            {profile?.phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4 flex-shrink-0" />
                <span>{profile.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="w-4 h-4 flex-shrink-0" />
              <span className="capitalize">{formatEnum(user?.role)}</span>
            </div>
          </div>
        </div>

        {/* Employment Details */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-muted-foreground" /> Employment Details
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {[
                { label: "Employee Code", value: profile?.employeeCode },
                { label: "Department", value: profile?.departmentName },
                { label: "Designation", value: profile?.designationName },
                { label: "Employment Type", value: formatEnum(profile?.employmentType) },
                { label: "Joining Date", value: profile?.joiningDate ? formatDate(profile.joiningDate) : "—" },
                { label: "Status", value: formatEnum(profile?.status) },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col py-2 border-b border-secondary last:border-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm font-medium text-foreground mt-0.5">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-white border border-border rounded-lg shadow-sm p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" /> Leave Balances — {new Date().getFullYear()}
            </h3>
            {leaveSummary?.balances && leaveSummary.balances.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {leaveSummary.balances.map((b: any) => (
                  <div key={b.leaveTypeName} className="bg-secondary border border-border rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{b.available}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{b.leaveTypeName}</div>
                    <div className="text-xs text-muted-foreground/70 mt-1">{b.used} used / {b.allocated} total</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No leave balance data available.</p>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
