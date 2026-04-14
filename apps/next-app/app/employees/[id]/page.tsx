"use client";

import { useEmployee, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/utils";
import { toast } from "sonner";

export default function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const { data: emp, isLoading } = useEmployee(id ?? null);
  const { data: docs } = useQuery({
    queryKey: ["employee-docs", id],
    queryFn: () => fetchApi<any[]>(`/employees/${id}/documents`),
    enabled: !!id,
  });
  const { data: history } = useQuery({
    queryKey: ["employee-history", id],
    queryFn: () => fetchApi<any[]>(`/employees/${id}/history`),
    enabled: !!id,
  });

  if (isLoading) return <PageContainer><div className="text-center py-20 text-muted-foreground">Loading...</div></PageContainer>;
  if (!emp) return <PageContainer><div className="text-center py-20 text-muted-foreground">Employee not found</div></PageContainer>;

  return (
    <PageContainer>
      <PageHeader
        title={`${emp.firstName} ${emp.lastName}`}
        subtitle={emp.designationName ?? undefined}
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: `${emp.firstName} ${emp.lastName}` },
        ]}
        actions={<StatusBadge status={emp.status} />}
      />

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <Detail label="Employee Code" value={emp.employeeCode} mono />
              <Detail label="Email" value={emp.email} />
              <Detail label="Phone" value={emp.phone ?? "—"} />
              <Detail label="Gender" value={emp.gender ?? "—"} />
              <Detail label="Date of Birth" value={formatDate(emp.dateOfBirth)} />
              <Detail label="Address" value={emp.address ?? "—"} />
              <Detail label="Emergency Contact" value={emp.emergencyContact ?? "—"} />
              <Detail label="Emergency Phone" value={emp.emergencyPhone ?? "—"} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="employment">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <Detail label="Department" value={emp.departmentName ?? "—"} />
              <Detail label="Designation" value={emp.designationName ?? "—"} />
              <Detail label="Reporting Manager" value={emp.reportingManagerName ?? "—"} />
              <Detail label="Employment Type" value={emp.employmentType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} />
              <Detail label="Joining Date" value={formatDate(emp.joiningDate)} />
              <Detail label="Probation End" value={formatDate(emp.probationEndDate)} />
              <Detail label="Status" value={<StatusBadge status={emp.status} />} />
              {emp.lastWorkingDay && <Detail label="Last Working Day" value={formatDate(emp.lastWorkingDay)} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Document Type</th>
                    <th className="text-left px-5 py-3">File Name</th>
                    <th className="text-left px-5 py-3">Uploaded At</th>
                    <th className="text-left px-5 py-3">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {docs && docs.length > 0 ? docs.map((doc: any, i: number) => (
                    <tr key={doc.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3">{doc.documentType}</td>
                      <td className="px-5 py-3 text-primary">{doc.fileName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(doc.uploadedAt)}</td>
                      <td className="px-5 py-3"><StatusBadge status={doc.verifiedAt ? "approved" : "pending"} /></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No documents uploaded</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Change Type</th>
                    <th className="text-left px-5 py-3">Previous</th>
                    <th className="text-left px-5 py-3">New</th>
                    <th className="text-left px-5 py-3">Effective Date</th>
                    <th className="text-left px-5 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history && history.length > 0 ? history.map((h: any, i: number) => (
                    <tr key={h.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{h.changeType.replace(/_/g, " ")}</td>
                      <td className="px-5 py-3 text-muted-foreground">{h.previousValue ?? "—"}</td>
                      <td className="px-5 py-3">{h.newValue ?? "—"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(h.effectiveDate)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{h.notes ?? "—"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No history available</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
