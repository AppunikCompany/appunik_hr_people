import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useEmployee, useEmployees, useDepartments, useDesignations, useCurrentUser, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Trash2, Plus, Monitor, Lock } from "lucide-react";
import { toast } from "sonner";

const EQUIPMENT_TYPES: Record<string, string> = {
  laptop: "Laptop", desktop: "Desktop", cpu: "CPU / Tower", monitor: "Monitor",
  mouse: "Mouse", keyboard: "Keyboard", headset: "Headset", webcam: "Webcam",
  printer: "Printer", tablet: "Tablet", phone: "Phone", other: "Other",
};
const EQ_ICONS: Record<string, string> = {
  laptop: "💻", desktop: "🖥️", cpu: "🖥️", monitor: "🖥️",
  mouse: "🖱️", keyboard: "⌨️", headset: "🎧", webcam: "📷",
  printer: "🖨️", tablet: "📱", phone: "📱", other: "📦",
};

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
];

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "probation", label: "Probation" },
  { value: "notice", label: "Notice Period" },
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
];

const MARITAL_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
];

const SOURCES_OF_HIRE = [
  "LinkedIn", "Indeed", "Naukri", "Referral", "Campus Recruitment",
  "Job Fair", "Company Website", "Recruiter", "Other",
];

export default function EmployeeDetail() {
  const [, params] = useRoute("/employees/:id");
  const id = params?.id;
  const { data: emp, isLoading } = useEmployee(id ?? null);
  const { data: currentUser } = useCurrentUser();

  const isHR = currentUser?.role === "super_admin" || currentUser?.role === "hr_admin";

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
  const { data: equipment = [] } = useQuery({
    queryKey: ["employee-equipment", id],
    queryFn: () => fetchApi<Array<{ id: string; equipmentType: string; customDescription: string | null }>>(`/employees/${id}/equipment`),
    enabled: !!id,
  });
  const { data: experience = [] } = useQuery({
    queryKey: ["employee-experience", id],
    queryFn: () => fetchApi<any[]>(`/employees/${id}/experience`),
    enabled: !!id,
  });
  const { data: education = [] } = useQuery({
    queryKey: ["employee-education", id],
    queryFn: () => fetchApi<any[]>(`/employees/${id}/education`),
    enabled: !!id,
  });
  const { data: exitData } = useQuery({
    queryKey: ["employee-exit", id],
    queryFn: () => fetchApi<any>(`/employees/${id}/exit`),
    enabled: !!id && isHR,
  });

  const { data: allEmployees = [] } = useEmployees();
  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [addDocOpen, setAddDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({ documentType: "", fileName: "", fileUrl: "", expiryDate: "" });

  const openEdit = () => {
    setEditForm({
      firstName: emp?.firstName ?? "",
      lastName: emp?.lastName ?? "",
      email: emp?.email ?? "",
      phone: emp?.phone ?? "",
      workPhone: (emp as any)?.workPhone ?? "",
      personalEmail: (emp as any)?.personalEmail ?? "",
      gender: emp?.gender ?? "",
      dateOfBirth: emp?.dateOfBirth ?? "",
      maritalStatus: (emp as any)?.maritalStatus ?? "",
      address: emp?.address ?? "",
      currentLocation: (emp as any)?.currentLocation ?? "",
      emergencyContact: emp?.emergencyContact ?? "",
      emergencyPhone: emp?.emergencyPhone ?? "",
      departmentId: emp?.departmentId ?? "",
      designationId: emp?.designationId ?? "",
      reportingManagerId: emp?.reportingManagerId ?? "",
      employmentType: emp?.employmentType ?? "full_time",
      workLocation: (emp as any)?.workLocation ?? "",
      seatingLocation: (emp as any)?.seatingLocation ?? "",
      sourceOfHire: (emp as any)?.sourceOfHire ?? "",
      joiningDate: emp?.joiningDate ?? "",
      totalExperienceYears: (emp as any)?.totalExperienceYears ?? "",
      probationEndDate: emp?.probationEndDate ?? "",
      status: emp?.status ?? "active",
      lastWorkingDay: emp?.lastWorkingDay ?? "",
      resignationDate: emp?.resignationDate ?? "",
      dateOfExit: (emp as any)?.dateOfExit ?? "",
      ctc: (emp as any)?.ctc ?? "",
      uanNumber: (emp as any)?.uanNumber ?? "",
      panNumber: (emp as any)?.panNumber ?? "",
      aadhaarNumber: (emp as any)?.aadhaarNumber ?? "",
      zktecoDisplayId: emp?.zktecoDisplayId ?? "",
      zktecoMemberId: emp?.zktecoMemberId ?? null,
    });
    setEditOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: (data: any) => fetchApi(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee", id] }); setEditOpen(false); toast.success("Employee updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => fetchApi(`/employees/${id}`, { method: "DELETE" }),
    onSuccess: () => { navigate("/employees"); toast.success("Employee deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const addDocMutation = useMutation({
    mutationFn: (data: any) => fetchApi(`/employees/${id}/documents`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-docs", id] }); setAddDocOpen(false); setDocForm({ documentType: "", fileName: "", fileUrl: "", expiryDate: "" }); toast.success("Document added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const setEdit = (k: string, v: any) => setEditForm((f: any) => ({ ...f, [k]: v }));

  if (isLoading) return <PageContainer><div className="text-center py-20 text-muted-foreground">Loading...</div></PageContainer>;
  if (!emp) return <PageContainer><div className="text-center py-20 text-muted-foreground">Employee not found</div></PageContainer>;

  const managers = (allEmployees as any[]).filter((e: any) => e.id !== id);

  return (
    <PageContainer>
      <PageHeader
        title={`${emp.firstName} ${emp.lastName}`}
        subtitle={emp.designationName ?? undefined}
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: `${emp.firstName} ${emp.lastName}` },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={emp.status} />
            {isHR && (
              <>
                <Button size="sm" variant="outline" onClick={openEdit}>
                  <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
              </>
            )}
          </div>
        }
      />

      <Tabs defaultValue="profile">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          {isHR && <TabsTrigger value="payroll">Payroll</TabsTrigger>}
          <TabsTrigger value="education">Education</TabsTrigger>
          <TabsTrigger value="experience">Experience</TabsTrigger>
          {isHR && <TabsTrigger value="exit">Exit Interview</TabsTrigger>}
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6 space-y-6">
            <Section title="Contact">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <Detail label="Employee Code" value={emp.employeeCode} mono />
                <Detail label="Company Email" value={emp.email} />
                <Detail label="Work Phone" value={(emp as any).workPhone} />
                <Detail label="Personal Email" value={(emp as any).personalEmail} />
                <Detail label="Mobile" value={emp.phone} />
              </div>
            </Section>
            <Section title="Personal">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <Detail label="Gender" value={emp.gender} />
                <Detail label="Date of Birth" value={formatDate(emp.dateOfBirth)} />
                <Detail label="Marital Status" value={(emp as any).maritalStatus ? cap((emp as any).maritalStatus) : null} />
                <Detail label="Current Location" value={(emp as any).currentLocation} />
                <Detail label="Permanent Address" value={emp.address} />
              </div>
            </Section>
            <Section title="Emergency Contact">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <Detail label="Contact Name" value={emp.emergencyContact} />
                <Detail label="Contact Phone" value={emp.emergencyPhone} />
              </div>
            </Section>
          </div>
        </TabsContent>

        {/* Employment */}
        <TabsContent value="employment">
          <div className="bg-white border border-border rounded-lg shadow-sm p-6 space-y-6">
            <Section title="Role & Organization">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <Detail label="Department" value={emp.departmentName} />
                <Detail label="Designation" value={emp.designationName} />
                <Detail label="Reporting Manager" value={emp.reportingManagerName} />
                <Detail label="Employment Type" value={emp.employmentType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} />
              </div>
            </Section>
            <Section title="Work Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <Detail label="Work Location" value={(emp as any).workLocation} />
                <Detail label="Seating Location" value={(emp as any).seatingLocation} />
                <Detail label="Source of Hire" value={(emp as any).sourceOfHire} />
                <Detail label="Total Experience" value={(emp as any).totalExperienceYears ? `${(emp as any).totalExperienceYears} years` : null} />
              </div>
            </Section>
            <Section title="Dates & Status">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <Detail label="Joining Date" value={formatDate(emp.joiningDate)} />
                <Detail label="Probation End" value={formatDate(emp.probationEndDate)} />
                <Detail label="Status" value={<StatusBadge status={emp.status} />} />
                {emp.lastWorkingDay && <Detail label="Last Working Day" value={formatDate(emp.lastWorkingDay)} />}
                {emp.resignationDate && <Detail label="Resignation Date" value={formatDate(emp.resignationDate)} />}
              </div>
            </Section>
          </div>
        </TabsContent>

        {/* Payroll (HR only) */}
        {isHR && (
          <TabsContent value="payroll">
            <div className="bg-white border border-border rounded-lg shadow-sm p-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5 p-2 bg-amber-50 border border-amber-200 rounded-md">
                <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Visible to HR Admins and Super Admins only</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <Detail label="CTC (Annual)" value={(emp as any).ctc} />
                <Detail label="UAN Number" value={(emp as any).uanNumber} mono />
                <Detail label="PAN Number" value={(emp as any).panNumber} mono />
                <Detail label="Aadhaar Number" value={(emp as any).aadhaarNumber ? maskAadhaar((emp as any).aadhaarNumber) : null} mono />
              </div>
            </div>
          </TabsContent>
        )}

        {/* Education */}
        <TabsContent value="education">
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
            {(education as any[]).length === 0 ? (
              <p className="text-center py-12 text-sm text-muted-foreground">No education details added yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {(education as any[]).map((edu: any) => (
                  <div key={edu.id} className="px-6 py-4">
                    <p className="font-medium text-sm">{edu.degree}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ""}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{edu.institution}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {edu.startYear}{edu.endYear ? ` – ${edu.endYear}` : ""}{edu.grade ? ` · ${edu.grade}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Experience */}
        <TabsContent value="experience">
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
            {(experience as any[]).length === 0 ? (
              <p className="text-center py-12 text-sm text-muted-foreground">No work experience added yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {(experience as any[]).map((exp: any) => (
                  <div key={exp.id} className="px-6 py-4">
                    <p className="font-medium text-sm">{exp.jobTitle}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{exp.companyName}{exp.location ? ` · ${exp.location}` : ""}</p>
                    <p className="text-xs text-muted-foreground mt-1">{exp.startDate} – {exp.isCurrent ? "Present" : (exp.endDate ?? "")}</p>
                    {exp.description && <p className="text-xs text-muted-foreground mt-1">{exp.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Exit Interview (HR only) */}
        {isHR && (
          <TabsContent value="exit">
            <div className="bg-white border border-border rounded-lg shadow-sm p-6">
              {!exitData ? (
                <p className="text-center py-8 text-sm text-muted-foreground">No exit request on record for this employee.</p>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                    <Detail label="Resignation Date" value={formatDate(exitData.resignationDate)} />
                    <Detail label="Last Working Day" value={formatDate(exitData.lastWorkingDay)} />
                    <Detail label="Exit Status" value={<StatusBadge status={exitData.status} />} />
                  </div>
                  {exitData.reason && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reason for Leaving</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{exitData.reason}</p>
                    </div>
                  )}
                  {exitData.exitInterviewNotes && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Exit Interview Notes</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{exitData.exitInterviewNotes}</p>
                    </div>
                  )}
                  {exitData.managerComment && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Manager Comment</p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{exitData.managerComment}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* Documents */}
        <TabsContent value="documents">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex justify-between items-center px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Documents</h3>
              {isHR && <Button size="sm" onClick={() => setAddDocOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Document</Button>}
            </div>
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

        {/* Equipment */}
        <TabsContent value="equipment">
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Monitor className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Declared Equipment ({equipment.length})</h3>
            </div>
            {equipment.length === 0 ? (
              <p className="text-center py-12 text-sm text-muted-foreground">
                This employee hasn't declared any equipment yet.
              </p>
            ) : (
              <div className="divide-y divide-secondary">
                {equipment.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="text-xl">{EQ_ICONS[item.equipmentType] ?? "📦"}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{EQUIPMENT_TYPES[item.equipmentType] ?? item.equipmentType}</p>
                      {item.customDescription && <p className="text-xs text-muted-foreground">{item.customDescription}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* History */}
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
          <div className="max-h-[72vh] overflow-y-auto pr-1 space-y-6 py-1">

            <FormSection title="Basic Info">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>First Name *</Label><Input value={editForm.firstName ?? ""} onChange={e => setEdit("firstName", e.target.value)} className="mt-1" /></div>
                <div><Label>Last Name *</Label><Input value={editForm.lastName ?? ""} onChange={e => setEdit("lastName", e.target.value)} className="mt-1" /></div>
                <div className="col-span-2"><Label>Company Email *</Label><Input type="email" value={editForm.email ?? ""} onChange={e => setEdit("email", e.target.value)} className="mt-1" /></div>
                <div><Label>Mobile</Label><Input placeholder="+91 98765 43210" value={editForm.phone ?? ""} onChange={e => setEdit("phone", e.target.value)} className="mt-1" /></div>
                <div><Label>Work Phone</Label><Input placeholder="+91 22 1234 5678" value={editForm.workPhone ?? ""} onChange={e => setEdit("workPhone", e.target.value)} className="mt-1" /></div>
                <div className="col-span-2"><Label>Personal Email</Label><Input type="email" placeholder="personal@example.com" value={editForm.personalEmail ?? ""} onChange={e => setEdit("personalEmail", e.target.value)} className="mt-1" /></div>
              </div>
            </FormSection>

            <FormSection title="Personal Details">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Gender</Label>
                  <Select value={editForm.gender || "none"} onValueChange={v => setEdit("gender", v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Date of Birth</Label><Input type="date" max="9999-12-31" value={editForm.dateOfBirth ?? ""} onChange={e => setEdit("dateOfBirth", e.target.value)} className="mt-1" /></div>
                <div>
                  <Label>Marital Status</Label>
                  <Select value={editForm.maritalStatus || "none"} onValueChange={v => setEdit("maritalStatus", v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {MARITAL_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Current Location</Label><Input placeholder="City, State" value={editForm.currentLocation ?? ""} onChange={e => setEdit("currentLocation", e.target.value)} className="mt-1" /></div>
                <div className="col-span-2">
                  <Label>Permanent Address</Label>
                  <Textarea placeholder="Full permanent address" rows={2} value={editForm.address ?? ""} onChange={e => setEdit("address", e.target.value)} className="mt-1" />
                </div>
              </div>
            </FormSection>

            <FormSection title="Emergency Contact">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact Name</Label><Input placeholder="Full name" value={editForm.emergencyContact ?? ""} onChange={e => setEdit("emergencyContact", e.target.value)} className="mt-1" /></div>
                <div><Label>Contact Phone</Label><Input placeholder="+91 98765 43210" value={editForm.emergencyPhone ?? ""} onChange={e => setEdit("emergencyPhone", e.target.value)} className="mt-1" /></div>
              </div>
            </FormSection>

            <FormSection title="Employment">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Department</Label>
                  <Select value={editForm.departmentId || "none"} onValueChange={v => setEdit("departmentId", v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(depts as any[] ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Designation</Label>
                  <Select value={editForm.designationId || "none"} onValueChange={v => setEdit("designationId", v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(desigs as any[] ?? []).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Reporting Manager</Label>
                  <Select value={editForm.reportingManagerId || "none"} onValueChange={v => setEdit("reportingManagerId", v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {managers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Employment Type</Label>
                  <Select value={editForm.employmentType ?? "full_time"} onValueChange={v => setEdit("employmentType", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editForm.status ?? "active"} onValueChange={v => setEdit("status", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Work Location</Label><Input placeholder="e.g. Mumbai Office, Remote" value={editForm.workLocation ?? ""} onChange={e => setEdit("workLocation", e.target.value)} className="mt-1" /></div>
                <div><Label>Seating Location</Label><Input placeholder="e.g. Desk 4B, Floor 2" value={editForm.seatingLocation ?? ""} onChange={e => setEdit("seatingLocation", e.target.value)} className="mt-1" /></div>
                <div>
                  <Label>Source of Hire</Label>
                  <Select value={editForm.sourceOfHire || "none"} onValueChange={v => setEdit("sourceOfHire", v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {SOURCES_OF_HIRE.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Total Experience (years)</Label><Input placeholder="e.g. 5.5" value={editForm.totalExperienceYears ?? ""} onChange={e => setEdit("totalExperienceYears", e.target.value)} className="mt-1" /></div>
                <div><Label>Joining Date *</Label><Input type="date" max="9999-12-31" value={editForm.joiningDate ?? ""} onChange={e => setEdit("joiningDate", e.target.value)} className="mt-1" /></div>
                <div><Label>Probation End Date</Label><Input type="date" max="9999-12-31" value={editForm.probationEndDate ?? ""} onChange={e => setEdit("probationEndDate", e.target.value)} className="mt-1" /></div>
                <div><Label>Resignation Date</Label><Input type="date" max="9999-12-31" value={editForm.resignationDate ?? ""} onChange={e => setEdit("resignationDate", e.target.value)} className="mt-1" /></div>
                <div><Label>Last Working Day</Label><Input type="date" max="9999-12-31" value={editForm.lastWorkingDay ?? ""} onChange={e => setEdit("lastWorkingDay", e.target.value)} className="mt-1" /></div>
              </div>
            </FormSection>

            <FormSection title="Payroll & Statutory">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>CTC (Annual)</Label><Input placeholder="e.g. 12,00,000 or 12 LPA" value={editForm.ctc ?? ""} onChange={e => setEdit("ctc", e.target.value)} className="mt-1" /></div>
                <div><Label>UAN Number</Label><Input placeholder="12-digit UAN" value={editForm.uanNumber ?? ""} onChange={e => setEdit("uanNumber", e.target.value)} className="mt-1 font-mono" /></div>
                <div><Label>PAN Number</Label><Input placeholder="ABCDE1234F" value={editForm.panNumber ?? ""} onChange={e => setEdit("panNumber", e.target.value.toUpperCase())} className="mt-1 font-mono" /></div>
                <div className="col-span-2"><Label>Aadhaar Number</Label><Input placeholder="12-digit Aadhaar number" value={editForm.aadhaarNumber ?? ""} onChange={e => setEdit("aadhaarNumber", e.target.value)} className="mt-1 font-mono" /></div>
              </div>
            </FormSection>

            <FormSection title="Biometric">
              <div>
                <Label>Biometric Device ID</Label>
                <Input
                  placeholder="e.g. M2, M3 (owners) or MEM12, MEM79 (staff)"
                  value={editForm.zktecoDisplayId ?? ""}
                  onChange={e => {
                    const raw = e.target.value.trim().toUpperCase();
                    const num = parseInt(raw.replace(/^(MEM|M)/, ""));
                    setEditForm((f: any) => ({ ...f, zktecoDisplayId: raw, zktecoMemberId: isNaN(num) ? null : num }));
                  }}
                  className="mt-1 font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">Use M1/M2/M3 for owners, MEM79 etc. for other employees.</p>
              </div>
            </FormSection>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editForm.firstName || !editForm.lastName || !editForm.email) {
                  toast.error("Name and email are required");
                  return;
                }
                updateMutation.mutate(editForm);
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Employee</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Are you sure you want to delete <strong>{emp.firstName} {emp.lastName}</strong>? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Document Dialog */}
      <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Document Type *</Label><Input value={docForm.documentType} onChange={e => setDocForm(f => ({ ...f, documentType: e.target.value }))} className="mt-1" placeholder="e.g. Aadhar Card, PAN Card..." /></div>
            <div><Label>File Name *</Label><Input value={docForm.fileName} onChange={e => setDocForm(f => ({ ...f, fileName: e.target.value }))} className="mt-1" placeholder="e.g. aadhar_card.pdf" /></div>
            <div><Label>File URL *</Label><Input value={docForm.fileUrl} onChange={e => setDocForm(f => ({ ...f, fileUrl: e.target.value }))} className="mt-1" placeholder="https://..." /></div>
            <div><Label>Expiry Date</Label><Input type="date" max="9999-12-31" value={docForm.expiryDate} onChange={e => setDocForm(f => ({ ...f, expiryDate: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDocOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!docForm.documentType || !docForm.fileName || !docForm.fileUrl) { toast.error("Document type, name, and URL are required"); return; } addDocMutation.mutate({ ...docForm, expiryDate: docForm.expiryDate || null }); }} disabled={addDocMutation.isPending}>
              {addDocMutation.isPending ? "Adding..." : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Detail({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 pb-1 border-b border-border">{title}</p>
      {children}
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function maskAadhaar(s: string) {
  if (s.length <= 4) return s;
  return "XXXX XXXX " + s.slice(-4);
}
