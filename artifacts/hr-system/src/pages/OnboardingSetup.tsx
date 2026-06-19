"use client";

import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, ChevronLeft, Briefcase, GraduationCap, User, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Experience {
  id: string;
  companyName: string;
  jobTitle: string;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
}

interface Education {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy?: string | null;
  startYear: string;
  endYear?: string | null;
}

const STEPS = [
  { label: "Personal Details", icon: User },
  { label: "Experience", icon: Briefcase },
  { label: "Education", icon: GraduationCap },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                done ? "bg-primary border-primary text-primary-foreground" :
                active ? "border-primary text-primary" :
                "border-muted-foreground/30 text-muted-foreground/30"
              )}>
                {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <span className={cn("text-xs font-medium", active ? "text-primary" : done ? "text-primary" : "text-muted-foreground/50")}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("w-16 h-0.5 mb-5 mx-1", i < current ? "bg-primary" : "bg-muted-foreground/20")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PersonalDetailsStep({ onNext }: { onNext: () => void }) {
  const [form, setForm] = useState({
    phone: "", gender: "", dateOfBirth: "", maritalStatus: "",
    personalEmail: "", currentLocation: "", address: "",
    emergencyContact: "", emergencyPhone: "",
  });
  const mut = useMutation({
    mutationFn: () => fetchApi("/me/personal-details", { method: "PATCH", body: JSON.stringify(form) }),
    onSuccess: onNext,
    onError: () => toast.error("Failed to save details"),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Personal Details</h2>
      <p className="text-sm text-muted-foreground">Help us complete your profile.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Mobile Number</label>
          <Input placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Gender</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.gender} onChange={set("gender")}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Date of Birth</label>
          <Input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Marital Status</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm bg-background" value={form.maritalStatus} onChange={set("maritalStatus")}>
            <option value="">Select</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="divorced">Divorced</option>
            <option value="widowed">Widowed</option>
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-sm font-medium">Personal Email</label>
          <Input type="email" placeholder="your.personal@email.com" value={form.personalEmail} onChange={set("personalEmail")} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-sm font-medium">Current Location</label>
          <Input placeholder="City, State (where you currently live)" value={form.currentLocation} onChange={set("currentLocation")} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-sm font-medium">Permanent Address</label>
          <Textarea placeholder="Your full permanent address" rows={2} value={form.address} onChange={set("address")} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Emergency Contact Name</label>
          <Input placeholder="Full name" value={form.emergencyContact} onChange={set("emergencyContact")} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Emergency Contact Phone</label>
          <Input placeholder="+91 98765 43210" value={form.emergencyPhone} onChange={set("emergencyPhone")} />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Saving…" : "Next"} <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function ExperienceStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery<Experience[]>({
    queryKey: ["onboarding-experience"],
    queryFn: () => fetchApi("/me/experience"),
  });
  const [form, setForm] = useState({ companyName: "", jobTitle: "", location: "", startDate: "", endDate: "", isCurrent: false });
  const add = useMutation({
    mutationFn: () => fetchApi("/me/experience", { method: "POST", body: JSON.stringify({ ...form, isCurrent: form.isCurrent }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding-experience"] }); setForm({ companyName: "", jobTitle: "", location: "", startDate: "", endDate: "", isCurrent: false }); },
    onError: () => toast.error("Failed to add experience"),
  });
  const del = useMutation({
    mutationFn: (id: string) => fetchApi(`/me/experience/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-experience"] }),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Past Experience</h2>
      <p className="text-sm text-muted-foreground">Add your previous work experience. You can skip this step if you're a fresher.</p>

      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((exp) => (
            <div key={exp.id} className="flex items-start justify-between p-3 border rounded-lg bg-muted/30">
              <div>
                <p className="font-medium text-sm">{exp.jobTitle} at {exp.companyName}</p>
                <p className="text-xs text-muted-foreground">{exp.startDate} — {exp.isCurrent ? "Present" : (exp.endDate ?? "")}</p>
              </div>
              <Button variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={() => del.mutate(exp.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="border rounded-lg p-4 space-y-3 bg-muted/10">
        <p className="text-sm font-medium">Add Experience</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Company Name" value={form.companyName} onChange={set("companyName")} />
          <Input placeholder="Job Title" value={form.jobTitle} onChange={set("jobTitle")} />
          <Input placeholder="Location" value={form.location} onChange={set("location")} />
          <div className="flex gap-2">
            <Input type="date" placeholder="Start" value={form.startDate} onChange={set("startDate")} />
            {!form.isCurrent && <Input type="date" placeholder="End" value={form.endDate} onChange={set("endDate")} />}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.isCurrent} onChange={set("isCurrent")} className="rounded" />
            Currently working here
          </label>
        </div>
        <Button variant="outline" size="sm" onClick={() => add.mutate()} disabled={add.isPending || !form.companyName || !form.jobTitle}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button onClick={onNext}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
      </div>
    </div>
  );
}

function EducationStep({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery<Education[]>({
    queryKey: ["onboarding-education"],
    queryFn: () => fetchApi("/me/education"),
  });
  const [form, setForm] = useState({ institution: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "" });
  const add = useMutation({
    mutationFn: () => fetchApi("/me/education", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding-education"] }); setForm({ institution: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "" }); },
    onError: () => toast.error("Failed to add education"),
  });
  const del = useMutation({
    mutationFn: (id: string) => fetchApi(`/me/education/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-education"] }),
  });
  const complete = useMutation({
    mutationFn: () => fetchApi("/me/onboarding/complete", { method: "POST" }),
    onSuccess: onComplete,
    onError: () => toast.error("Failed to complete onboarding"),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Education</h2>
      <p className="text-sm text-muted-foreground">Add your educational qualifications.</p>

      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((edu) => (
            <div key={edu.id} className="flex items-start justify-between p-3 border rounded-lg bg-muted/30">
              <div>
                <p className="font-medium text-sm">{edu.degree}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ""}</p>
                <p className="text-xs text-muted-foreground">{edu.institution} · {edu.startYear}{edu.endYear ? `–${edu.endYear}` : ""}</p>
              </div>
              <Button variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={() => del.mutate(edu.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="border rounded-lg p-4 space-y-3 bg-muted/10">
        <p className="text-sm font-medium">Add Education</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Institution / University" value={form.institution} onChange={set("institution")} />
          <Input placeholder="Degree (e.g. B.Tech)" value={form.degree} onChange={set("degree")} />
          <Input placeholder="Field of Study" value={form.fieldOfStudy} onChange={set("fieldOfStudy")} />
          <div className="flex gap-2">
            <Input placeholder="Start Year" value={form.startYear} onChange={set("startYear")} maxLength={4} />
            <Input placeholder="End Year" value={form.endYear} onChange={set("endYear")} maxLength={4} />
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => add.mutate()} disabled={add.isPending || !form.institution || !form.degree || !form.startYear}>
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
          {complete.isPending ? "Saving…" : "Complete Setup"} <CheckCircle2 className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function DoneScreen() {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold">You're all set!</h2>
      <p className="text-muted-foreground max-w-sm">Your profile is complete. Welcome to the team — let's get started.</p>
      <Button className="mt-2" onClick={() => navigate("/")}>Go to Dashboard</Button>
    </div>
  );
}

export default function OnboardingSetup() {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl bg-card border rounded-2xl shadow-lg p-8">
        <DoneScreen />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl bg-card border rounded-2xl shadow-lg p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Welcome! Let's set up your profile</h1>
          <p className="text-sm text-muted-foreground mt-1">Step {step + 1} of {STEPS.length}</p>
        </div>
        <StepIndicator current={step} />
        {step === 0 && <PersonalDetailsStep onNext={() => setStep(1)} />}
        {step === 1 && <ExperienceStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
        {step === 2 && <EducationStep onComplete={() => setDone(true)} onBack={() => setStep(1)} />}
      </div>
    </div>
  );
}
