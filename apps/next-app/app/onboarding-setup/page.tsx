"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, ChevronLeft, Briefcase, GraduationCap, FileText, User, Trash2, Plus, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Experience {
  id: string;
  companyName: string;
  jobTitle: string;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  description?: string | null;
}

interface Education {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy?: string | null;
  startYear: string;
  endYear?: string | null;
  grade?: string | null;
  certificateUrl?: string | null;
}

interface Document {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
}

interface OnboardingStatus {
  completed: boolean;
  employeeId: string | null;
}

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { label: "Personal Details", icon: User },
  { label: "Past Experience", icon: Briefcase },
  { label: "Documents", icon: FileText },
  { label: "Education", icon: GraduationCap },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = step.icon;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                  done && "bg-primary border-primary text-primary-foreground",
                  active && "border-primary bg-primary/10 text-primary",
                  !done && !active && "border-muted-foreground/30 text-muted-foreground/40 bg-background"
                )}
              >
                {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground/50"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-16 h-0.5 mb-5 mx-1 transition-all",
                  i < current ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Personal Details ─────────────────────────────────────────────────

function PersonalDetailsStep({ onNext }: { onNext: () => void }) {
  const [form, setForm] = useState({
    phone: "",
    gender: "",
    dateOfBirth: "",
    address: "",
    emergencyContact: "",
    emergencyPhone: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      fetchApi("/me/personal-details", {
        method: "PATCH",
        body: JSON.stringify(form),
      }),
    onSuccess: () => onNext(),
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Phone Number">
          <Input placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Gender">
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={form.gender}
            onChange={set("gender")}
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Date of Birth">
          <Input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
        </Field>
        <Field label="Emergency Contact Name">
          <Input placeholder="Full name" value={form.emergencyContact} onChange={set("emergencyContact")} />
        </Field>
        <Field label="Emergency Contact Phone">
          <Input placeholder="+91 98765 43210" value={form.emergencyPhone} onChange={set("emergencyPhone")} />
        </Field>
      </div>
      <Field label="Home Address">
        <Textarea
          placeholder="Enter your full home address"
          rows={3}
          value={form.address}
          onChange={set("address")}
        />
      </Field>
      <div className="flex justify-end pt-2">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Continue"}
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Experience ───────────────────────────────────────────────────────

function ExperienceStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery<Experience[]>({
    queryKey: ["me-experience"],
    queryFn: () => fetchApi("/me/experience"),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    jobTitle: "",
    location: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    description: "",
  });

  const add = useMutation({
    mutationFn: () =>
      fetchApi("/me/experience", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-experience"] });
      setShowForm(false);
      setForm({ companyName: "", jobTitle: "", location: "", startDate: "", endDate: "", isCurrent: false, description: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchApi(`/me/experience/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-experience"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <div className="space-y-4">
      {items.length === 0 && !showForm && (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
          No experience added yet. Add your work history below.
        </div>
      )}

      {items.map((exp) => (
        <div key={exp.id} className="border border-border rounded-lg p-4 flex justify-between gap-4">
          <div>
            <p className="font-medium text-sm text-foreground">{exp.jobTitle}</p>
            <p className="text-sm text-muted-foreground">{exp.companyName}{exp.location ? ` · ${exp.location}` : ""}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {exp.startDate} — {exp.isCurrent ? "Present" : (exp.endDate ?? "—")}
            </p>
            {exp.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{exp.description}</p>}
          </div>
          <button
            onClick={() => remove.mutate(exp.id)}
            className="text-muted-foreground hover:text-destructive flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Company Name">
              <Input placeholder="Acme Corp" value={form.companyName} onChange={set("companyName")} />
            </Field>
            <Field label="Job Title">
              <Input placeholder="Software Engineer" value={form.jobTitle} onChange={set("jobTitle")} />
            </Field>
            <Field label="Location">
              <Input placeholder="Bangalore, India" value={form.location} onChange={set("location")} />
            </Field>
            <Field label="Start Date">
              <Input type="month" value={form.startDate} onChange={set("startDate")} />
            </Field>
            {!form.isCurrent && (
              <Field label="End Date">
                <Input type="month" value={form.endDate} onChange={set("endDate")} />
              </Field>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isCurrent}
              onChange={(e) => setForm((f) => ({ ...f, isCurrent: e.target.checked }))}
              className="rounded"
            />
            Currently working here
          </label>
          <Field label="Description (optional)">
            <Textarea placeholder="Brief description of your role and responsibilities" rows={2} value={form.description} onChange={set("description")} />
          </Field>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending || !form.companyName || !form.jobTitle || !form.startDate}>
              {add.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Plus className="w-4 h-4" /> Add work experience
        </button>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button onClick={onNext}>
          Continue <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Documents ────────────────────────────────────────────────────────

const DOC_TYPES = ["Aadhaar Card", "PAN Card", "Passport", "Driving License", "Voter ID", "10th Marksheet", "12th Marksheet", "Offer Letter", "Relieving Letter", "Other"];

function DocumentsStep({ employeeId, onNext, onBack }: { employeeId: string | null; onNext: () => void; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: docs = [] } = useQuery<Document[]>({
    queryKey: ["employee-docs", employeeId],
    queryFn: () => fetchApi(`/employees/${employeeId}/documents`),
    enabled: !!employeeId,
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ documentType: "", fileName: "", fileUrl: "" });

  const add = useMutation({
    mutationFn: () =>
      fetchApi(`/employees/${employeeId}/documents`, {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-docs", employeeId] });
      setShowForm(false);
      setForm({ documentType: "", fileName: "", fileUrl: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload your identity and employment documents. Provide a publicly accessible link (Google Drive, Dropbox, etc.) for each document.
      </p>

      {docs.length === 0 && !showForm && (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
          No documents added yet.
        </div>
      )}

      {docs.map((doc) => (
        <div key={doc.id} className="border border-border rounded-lg p-4 flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{doc.documentType}</p>
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline truncate block"
            >
              {doc.fileName}
            </a>
          </div>
        </div>
      ))}

      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <Field label="Document Type">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={form.documentType}
              onChange={set("documentType")}
            >
              <option value="">Select type</option>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="File Name">
            <Input placeholder="e.g. aadhaar_front.pdf" value={form.fileName} onChange={set("fileName")} />
          </Field>
          <Field label="Document URL">
            <Input placeholder="https://drive.google.com/..." value={form.fileUrl} onChange={set("fileUrl")} />
          </Field>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => add.mutate()}
              disabled={add.isPending || !form.documentType || !form.fileName || !form.fileUrl}
            >
              {add.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Plus className="w-4 h-4" /> Add document
        </button>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button onClick={onNext}>
          Continue <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Education ────────────────────────────────────────────────────────

function EducationStep({ onBack, onFinish }: { onBack: () => void; onFinish: () => void }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery<Education[]>({
    queryKey: ["me-education"],
    queryFn: () => fetchApi("/me/education"),
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    institution: "",
    degree: "",
    fieldOfStudy: "",
    startYear: "",
    endYear: "",
    grade: "",
    certificateUrl: "",
  });

  const add = useMutation({
    mutationFn: () =>
      fetchApi("/me/education", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-education"] });
      setShowForm(false);
      setForm({ institution: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "", grade: "", certificateUrl: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchApi(`/me/education/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-education"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: () => fetchApi("/me/onboarding/complete", { method: "POST" }),
    onSuccess: () => onFinish(),
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      {items.length === 0 && !showForm && (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
          No education records added yet.
        </div>
      )}

      {items.map((edu) => (
        <div key={edu.id} className="border border-border rounded-lg p-4 flex justify-between gap-4">
          <div>
            <p className="font-medium text-sm text-foreground">{edu.degree}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ""}</p>
            <p className="text-sm text-muted-foreground">{edu.institution}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {edu.startYear} — {edu.endYear ?? "Present"}{edu.grade ? ` · ${edu.grade}` : ""}
            </p>
            {edu.certificateUrl && (
              <a href={edu.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 block">
                View certificate
              </a>
            )}
          </div>
          <button
            onClick={() => remove.mutate(edu.id)}
            className="text-muted-foreground hover:text-destructive flex-shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {showForm && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Institution">
              <Input placeholder="IIT Bombay" value={form.institution} onChange={set("institution")} />
            </Field>
            <Field label="Degree">
              <Input placeholder="B.Tech / MBA / B.Sc" value={form.degree} onChange={set("degree")} />
            </Field>
            <Field label="Field of Study">
              <Input placeholder="Computer Science" value={form.fieldOfStudy} onChange={set("fieldOfStudy")} />
            </Field>
            <Field label="Grade / CGPA (optional)">
              <Input placeholder="8.5 / 10" value={form.grade} onChange={set("grade")} />
            </Field>
            <Field label="Start Year">
              <Input type="number" placeholder="2018" min="1950" max="2030" value={form.startYear} onChange={set("startYear")} />
            </Field>
            <Field label="End Year">
              <Input type="number" placeholder="2022" min="1950" max="2030" value={form.endYear} onChange={set("endYear")} />
            </Field>
          </div>
          <Field label="Certificate URL (optional)">
            <Input placeholder="https://drive.google.com/..." value={form.certificateUrl} onChange={set("certificateUrl")} />
          </Field>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => add.mutate()}
              disabled={add.isPending || !form.institution || !form.degree || !form.startYear}
            >
              {add.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Plus className="w-4 h-4" /> Add education
        </button>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
          {complete.isPending ? "Finishing…" : "Complete Onboarding"}
          <CheckCircle2 className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─── Done screen ──────────────────────────────────────────────────────────────

function DoneScreen() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">You're all set!</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Your profile is complete. Welcome aboard — let's get started.
      </p>
      <Button onClick={() => router.replace("/")} className="mt-2">
        Go to Dashboard
      </Button>
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingSetupPage() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  const { data: status } = useQuery<OnboardingStatus>({
    queryKey: ["onboarding-status"],
    queryFn: () => fetchApi("/me/onboarding-status"),
  });

  const employeeId = status?.employeeId ?? null;

  if (done) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-border rounded-xl shadow-sm p-8">
        <DoneScreen />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-border rounded-xl shadow-sm p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Welcome to HR System</h1>
            <p className="text-xs text-muted-foreground">Complete your profile to get started</p>
          </div>
        </div>

        <StepIndicator current={step} />

        <div className="mt-2">
          {step === 0 && <PersonalDetailsStep onNext={() => setStep(1)} />}
          {step === 1 && <ExperienceStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
          {step === 2 && <DocumentsStep employeeId={employeeId} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <EducationStep onBack={() => setStep(2)} onFinish={() => setDone(true)} />}
        </div>
      </div>
    </div>
  );
}
