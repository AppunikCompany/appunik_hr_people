import { useCurrentUser, fetchApi } from "@/hooks/useApi";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Mail, Phone, Briefcase, Calendar, Shield, MapPin, User, Camera } from "lucide-react";
import { toast } from "sonner";

function formatEnum(val: string | null | undefined): string {
  if (!val) return "—";
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function calculateTenure(fromDateStr: string | null | undefined): string {
  if (!fromDateStr) return "—";
  const from = new Date(fromDateStr);
  if (isNaN(from.getTime())) return "—";
  const now = new Date();
  let years = now.getFullYear() - from.getFullYear();
  let months = now.getMonth() - from.getMonth();
  let days = now.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (parts.length === 0) {
    parts.push(days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "Less than a day");
  }
  return parts.join(", ");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col py-2 border-b border-secondary last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground mt-0.5">{value || "—"}</dd>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-lg shadow-sm p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" /> {title}
      </h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">{children}</dl>
    </div>
  );
}

export default function Profile() {
  const { data: user } = useCurrentUser();
  const empId = user?.employeeId;
  const qc = useQueryClient();
  const [photoUploading, setPhotoUploading] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["self-profile", empId],
    queryFn: () => fetchApi<Record<string, any>>(`/self-service/profile/${empId}`),
    enabled: !!empId,
  });

  const photoUpdateMutation = useMutation({
    mutationFn: (profileImageUrl: string | null) =>
      fetchApi("/me/profile-image", { method: "PATCH", body: JSON.stringify({ profileImageUrl }) }),
    onSuccess: (_data, profileImageUrl) => {
      qc.invalidateQueries({ queryKey: ["self-profile", empId] });
      qc.invalidateQueries({ queryKey: ["auth-user"] });
      toast.success(profileImageUrl ? "Profile photo updated" : "Profile photo removed");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update photo"),
  });

  const handlePhotoChange = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 4_000_000) { toast.error("Image must be smaller than 4 MB"); return; }
    setPhotoUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      photoUpdateMutation.mutate(dataUrl);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to read file");
    } finally {
      setPhotoUploading(false);
    }
  };

  const { data: leaveSummary } = useQuery({
    queryKey: ["self-leave", empId, new Date().getFullYear()],
    queryFn: () => fetchApi<{ balances: any[]; recentRequests: any[] }>(`/self-service/leave-summary/${empId}?year=${new Date().getFullYear()}`),
    enabled: !!empId,
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
          <div className="relative group">
            {profile?.profileImageUrl ? (
              <img
                src={profile.profileImageUrl}
                alt={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`}
                className="w-20 h-20 rounded-full object-cover border border-border bg-secondary mb-4"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-foreground text-2xl font-bold mb-4">
                {(user?.firstName ?? "?")?.[0]}{(user?.lastName ?? "")?.[0]}
              </div>
            )}
            <label className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity mb-4">
              <Camera className="w-5 h-5 text-white" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={photoUploading || photoUpdateMutation.isPending}
                onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <h2 className="text-lg font-semibold text-foreground">{user?.firstName} {user?.lastName}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{profile?.designationName ?? formatEnum(user?.role)}</p>
          {profile?.status && (
            <div className="mt-3"><StatusBadge status={profile.status} /></div>
          )}
          <div className="w-full mt-4 pt-4 border-t border-border space-y-2 text-left">
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
            {profile?.workLocation && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span>{profile.workLocation}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="w-4 h-4 flex-shrink-0" />
              <span className="capitalize">{formatEnum(user?.role)}</span>
            </div>
          </div>
          {profile?.profileImageUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-3 text-xs text-muted-foreground"
              onClick={() => photoUpdateMutation.mutate(null)}
              disabled={photoUpdateMutation.isPending}
            >
              Remove photo
            </Button>
          )}
        </div>

        {/* Right column */}
        <div className="md:col-span-2 space-y-6">

          {/* Employment Details */}
          <SectionCard icon={Briefcase} title="Employment Details">
            <Field label="Employee Code" value={profile?.employeeCode} />
            <Field label="Department" value={profile?.departmentName} />
            <Field label="Designation" value={profile?.designationName} />
            <Field label="Reporting Manager" value={profile?.reportingManagerName} />
            <Field label="Employment Type" value={formatEnum(profile?.employmentType)} />
            <Field label="Work Location" value={profile?.workLocation} />
            <Field label="Seating Location" value={profile?.seatingLocation} />
            <Field label="Joining Date" value={profile?.joiningDate ? formatDate(profile.joiningDate) : null} />
            <Field label="AppUnik Tenure" value={calculateTenure(profile?.joiningDate)} />
            <Field label="Status" value={formatEnum(profile?.status)} />
          </SectionCard>

          {/* Personal Details */}
          <SectionCard icon={User} title="Personal Details">
            <Field label="Mobile" value={profile?.phone} />
            <Field label="Work Phone" value={profile?.workPhone} />
            <Field label="Personal Email" value={profile?.personalEmail} />
            <Field label="Gender" value={formatEnum(profile?.gender)} />
            <Field label="Date of Birth" value={profile?.dateOfBirth ? formatDate(profile.dateOfBirth) : null} />
            <Field label="Marital Status" value={formatEnum(profile?.maritalStatus)} />
            <Field label="Current Location" value={profile?.currentLocation} />
            <Field label="Permanent Address" value={profile?.address} />
          </SectionCard>

          {/* Emergency Contact */}
          {(profile?.emergencyContact || profile?.emergencyPhone) && (
            <SectionCard icon={Phone} title="Emergency Contact">
              <Field label="Contact Name" value={profile?.emergencyContact} />
              <Field label="Contact Phone" value={profile?.emergencyPhone} />
            </SectionCard>
          )}

          {/* Leave Balances */}
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
