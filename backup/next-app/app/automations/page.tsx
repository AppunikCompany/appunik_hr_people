"use client";

import { useState } from "react";
import { useAutomationRules, useAutomationLogs, useEmailTemplates, useWfhApprovalConfig, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/utils";
import { Edit, Plus, Trash2, Play, RefreshCw, FileSearch, CalendarClock, Megaphone, Eye } from "lucide-react";
import { toast } from "sonner";

const TRIGGER_TYPES = [
  { value: "event", label: "Event-based" },
  { value: "scheduled", label: "Scheduled (CRON)" },
];

const RECIPIENT_OPTIONS = [
  { value: "employee", label: "Employee only" },
  { value: "manager", label: "Manager only" },
  { value: "hr_admin", label: "HR Admin only" },
  { value: "hr_admin,manager", label: "HR Admin & Manager" },
  { value: "employee,hr_admin", label: "Employee & HR Admin" },
  { value: "employee,hr_admin,manager", label: "Employee, HR Admin & Manager" },
];

function slugify(s: string) {
  return "rule_" + s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function CreateRuleDialog({ templates, open, onClose }: { templates: any[]; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", code: "", triggerType: "event", triggerEvent: "", cronExpr: "", templateId: "", recipients: "employee",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => fetchApi("/automations/rules", { method: "POST", body: JSON.stringify({ ...form, code: form.code || slugify(form.name) }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automation-rules"] }); onClose(); toast.success("Rule created"); setForm({ name: "", code: "", triggerType: "event", triggerEvent: "", cronExpr: "", templateId: "", recipients: "employee" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create Automation Rule</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div><Label>Rule Name *</Label><Input value={form.name} onChange={e => { set("name", e.target.value); if (!form.code) set("code", slugify(e.target.value)); }} className="mt-1" placeholder="e.g. Birthday Wish" /></div>
          <div><Label>Code (unique slug) *</Label><Input value={form.code} onChange={e => set("code", e.target.value)} className="mt-1 font-mono text-xs" placeholder="rule_birthday" /></div>
          <div>
            <Label>Trigger Type *</Label>
            <Select value={form.triggerType} onValueChange={v => set("triggerType", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{TRIGGER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Trigger Event</Label><Input value={form.triggerEvent} onChange={e => set("triggerEvent", e.target.value)} className="mt-1 font-mono text-xs" placeholder="e.g. employee.created, leave.approved" /></div>
          {form.triggerType === "scheduled" && (
            <div><Label>CRON Expression</Label><Input value={form.cronExpr} onChange={e => set("cronExpr", e.target.value)} className="mt-1 font-mono text-xs" placeholder="0 9 * * * (daily at 9am)" /></div>
          )}
          <div>
            <Label>Email Template *</Label>
            <Select value={form.templateId} onValueChange={v => set("templateId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select template..." /></SelectTrigger>
              <SelectContent>{templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Recipients *</Label>
            <Select value={form.recipients} onValueChange={v => set("recipients", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{RECIPIENT_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || !form.templateId || mutation.isPending}>{mutation.isPending ? "Creating..." : "Create Rule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTemplateDialog({ template, open, onClose }: { template: any; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ subject: template?.subject ?? "", bodyHtml: template?.bodyHtml ?? "" });
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => fetchApi(`/automations/email-templates/${template.id}`, { method: "PATCH", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); onClose(); toast.success("Template updated"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit Email Template — {template?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div><Label>Subject</Label><Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="mt-1" /></div>
          <div><Label>Body (HTML)</Label><Textarea value={form.bodyHtml} onChange={e => setForm(f => ({ ...f, bodyHtml: e.target.value }))} className="mt-1 font-mono text-xs" rows={12} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: "", name: "", subject: "", bodyHtml: "", variables: "" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => fetchApi("/automations/email-templates", {
      method: "POST",
      body: JSON.stringify({ ...form, variables: form.variables ? form.variables.split(",").map(s => s.trim()).filter(Boolean) : [] }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); onClose(); toast.success("Template created"); setForm({ code: "", name: "", subject: "", bodyHtml: "", variables: "" }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Email Template</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
            <div><Label>Code * (unique)</Label><Input value={form.code} onChange={e => set("code", e.target.value)} className="mt-1 font-mono text-xs" placeholder="my_template" /></div>
          </div>
          <div><Label>Subject *</Label><Input value={form.subject} onChange={e => set("subject", e.target.value)} className="mt-1" /></div>
          <div><Label>Variables (comma-separated)</Label><Input value={form.variables} onChange={e => set("variables", e.target.value)} className="mt-1 font-mono text-xs" placeholder="firstName, fullName, date" /></div>
          <div><Label>Body (HTML) *</Label><Textarea value={form.bodyHtml} onChange={e => set("bodyHtml", e.target.value)} className="mt-1 font-mono text-xs" rows={8} placeholder="<p>Dear {{fullName}},</p>" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || !form.code || !form.subject || !form.bodyHtml || mutation.isPending}>{mutation.isPending ? "Creating..." : "Create Template"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Automations() {
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [addTemplateOpen, setAddTemplateOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split("T")[0]);
  const [expiryDays, setExpiryDays] = useState("30");
  const [regularizationDate, setRegularizationDate] = useState(new Date().toISOString().split("T")[0]);

  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);

  const { data: rules, isLoading: rulesLoading } = useAutomationRules();
  const { data: logs, isLoading: logsLoading } = useAutomationLogs();
  const { data: templates } = useEmailTemplates();
  const { data: wfhConfig } = useWfhApprovalConfig();
  const qc = useQueryClient();

  const toggleRule = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetchApi(`/automations/rules/${id}/toggle`, { method: "POST", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-rules"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => fetchApi(`/automations/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automation-rules"] }); toast.success("Rule deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => fetchApi(`/automations/email-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); toast.success("Template deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleWfh = useMutation({
    mutationFn: (enabled: boolean) => fetchApi("/automations/wfh-approval-config", { method: "POST", body: JSON.stringify({ enabled }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wfh-approval-config"] }); toast.success("WFH approval config updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const runScheduled = useMutation({
    mutationFn: () => fetchApi(`/automations/run-scheduled?date=${scheduleDate}`, { method: "POST" }),
    onSuccess: (data: any) => toast.success(`Scheduled automations ran for ${data.date}`),
    onError: (e: any) => toast.error(e.message),
  });

  const checkDocExpiry = useMutation({
    mutationFn: () => fetchApi(`/automations/check-document-expiry?days=${expiryDays}`, { method: "POST" }),
    onSuccess: (data: any) => toast.success(`Checked ${data.checked} docs — ${data.expiringSoon} expiring soon, ${data.notified} notified`),
    onError: (e: any) => toast.error(e.message),
  });

  const attendanceReg = useMutation({
    mutationFn: () => fetchApi(`/automations/attendance-regularization?date=${regularizationDate}`, { method: "POST" }),
    onSuccess: (data: any) => toast.success(data.message ?? `Flagged ${data.flagged} employees for ${data.date}`),
    onError: (e: any) => toast.error(e.message),
  });

  const seedTemplates = useMutation({
    mutationFn: () => fetchApi("/automations/seed-templates", { method: "POST" }),
    onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ["automation-rules"] }); qc.invalidateQueries({ queryKey: ["email-templates"] }); toast.success(`Seeded ${data.templatesSeeded?.length ?? 0} new · Updated ${data.templatesUpdated?.length ?? 0} templates · ${data.rulesSeeded?.length ?? 0} rules created`); },
    onError: (e: any) => toast.error(e.message),
  });

  const holidayAnnouncement = useMutation({
    mutationFn: () => fetchApi("/automations/holiday-announcement", { method: "POST" }),
    onSuccess: (data: any) => toast.success(data.message ?? `Announced ${data.holidays} holiday(s) — ${data.notified} notified`),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader title="Automations" breadcrumbs={[{ label: "Automations" }]} subtitle="Manage email automation rules, templates and configuration" />

      <Tabs defaultValue="rules">
        <TabsList className="mb-6">
          <TabsTrigger value="rules">Rules ({rules?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="templates">Email Templates ({templates?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        {/* ── RULES ── */}
        <TabsContent value="rules">
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Automation Rules</h3>
              <Button size="sm" onClick={() => setCreateRuleOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Rule</Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Rule</th>
                  <th className="text-left px-5 py-3">Trigger</th>
                  <th className="text-left px-5 py-3">Template</th>
                  <th className="text-left px-5 py-3">Recipients</th>
                  <th className="text-left px-5 py-3">Last Run</th>
                  <th className="text-left px-5 py-3">Active</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rulesLoading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                ) : !rules || rules.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No rules yet — use Configuration tab to seed defaults</td></tr>
                ) : rules.map((rule: any, i: number) => (
                  <tr key={rule.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{rule.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{rule.code}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-muted-foreground capitalize">{rule.triggerType}</p>
                      {rule.triggerEvent && <p className="text-xs text-muted-foreground">{rule.triggerEvent}</p>}
                      {rule.cronExpr && <p className="text-xs font-mono text-muted-foreground">{rule.cronExpr}</p>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{rule.templateName}</td>
                    <td className="px-5 py-3 text-muted-foreground capitalize">{rule.recipients}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{rule.lastRunAt ? formatDateTime(rule.lastRunAt) : "Never"}</td>
                    <td className="px-5 py-3">
                      <Switch checked={rule.isActive} onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, isActive: checked })} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete rule "${rule.name}"?`)) deleteRule.mutate(rule.id); }} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── EMAIL TEMPLATES ── */}
        <TabsContent value="templates">
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Email Templates</h3>
              <Button size="sm" onClick={() => setAddTemplateOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Template</Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Template</th>
                  <th className="text-left px-5 py-3">Code</th>
                  <th className="text-left px-5 py-3">Subject</th>
                  <th className="text-left px-5 py-3">Variables</th>
                  <th className="text-left px-5 py-3">Active</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!templates || templates.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No templates — use Configuration tab to seed defaults</td></tr>
                ) : templates.map((t: any, i: number) => (
                  <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                    <td className="px-5 py-3 font-medium text-foreground">{t.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{t.code}</td>
                    <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{t.subject}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{(t.variables ?? []).join(", ") || "—"}</td>
                    <td className="px-5 py-3"><StatusBadge status={t.isActive ? "active" : "inactive"} /></td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setPreviewTemplate(t)} className="h-7 text-xs"><Eye className="w-3.5 h-3.5 mr-1" /> Preview</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditTemplate(t)} className="h-7 text-xs"><Edit className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteTemplate.mutate(t.id); }} className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── LOGS ── */}
        <TabsContent value="logs">
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Rule</th>
                  <th className="text-left px-5 py-3">Employee</th>
                  <th className="text-left px-5 py-3">Recipient</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Sent At</th>
                  <th className="text-left px-5 py-3">Error</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                ) : !logs || logs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No automation logs yet</td></tr>
                ) : logs.map((log: any, i: number) => (
                  <tr key={log.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                    <td className="px-5 py-3 text-muted-foreground">{log.ruleName}</td>
                    <td className="px-5 py-3 text-muted-foreground">{log.employeeName ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{log.recipientEmail}</td>
                    <td className="px-5 py-3"><StatusBadge status={log.status} /></td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{formatDateTime(log.sentAt)}</td>
                    <td className="px-5 py-3 text-red-500 text-xs">{log.errorMessage ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── CONFIGURATION ── */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* WFH Approval */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">WFH Approval Required</CardTitle>
                <CardDescription className="text-xs">When enabled, employees must get manager approval before marking WFH.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={wfhConfig?.wfhRequiresApproval ?? false}
                    onCheckedChange={(v) => toggleWfh.mutate(v)}
                    disabled={toggleWfh.isPending}
                  />
                  <span className="text-sm text-muted-foreground">{wfhConfig?.wfhRequiresApproval ? "Approval required" : "No approval needed"}</span>
                </div>
              </CardContent>
            </Card>

            {/* Seed Templates */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Seed Default Templates & Rules</CardTitle>
                <CardDescription className="text-xs">Seeds all 15 default email templates and 15 automation rules. Safe to run multiple times (skips existing).</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" onClick={() => seedTemplates.mutate()} disabled={seedTemplates.isPending}>
                  {seedTemplates.isPending ? "Seeding..." : "Seed Now"}
                </Button>
              </CardContent>
            </Card>

            {/* Run Scheduled */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Play className="w-4 h-4" /> Run Scheduled Automations</CardTitle>
                <CardDescription className="text-xs">Manually trigger all scheduled rules for a specific date (birthday, anniversary, probation checks, etc.).</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="h-8 w-40 text-sm" />
                <Button size="sm" onClick={() => runScheduled.mutate()} disabled={runScheduled.isPending}>{runScheduled.isPending ? "Running..." : "Run"}</Button>
              </CardContent>
            </Card>

            {/* Document Expiry Check */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><FileSearch className="w-4 h-4" /> Check Document Expiry</CardTitle>
                <CardDescription className="text-xs">Notify employees whose documents are expiring within N days.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Input type="number" value={expiryDays} onChange={e => setExpiryDays(e.target.value)} className="h-8 w-20 text-sm" min={1} max={365} />
                  <span className="text-sm text-muted-foreground">days ahead</span>
                </div>
                <Button size="sm" onClick={() => checkDocExpiry.mutate()} disabled={checkDocExpiry.isPending}>{checkDocExpiry.isPending ? "Checking..." : "Check"}</Button>
              </CardContent>
            </Card>

            {/* Attendance Regularization */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Attendance Regularization</CardTitle>
                <CardDescription className="text-xs">Flag employees with no attendance record and no approved leave for a given date.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Input type="date" value={regularizationDate} onChange={e => setRegularizationDate(e.target.value)} className="h-8 w-40 text-sm" />
                <Button size="sm" onClick={() => attendanceReg.mutate()} disabled={attendanceReg.isPending}>{attendanceReg.isPending ? "Running..." : "Run"}</Button>
              </CardContent>
            </Card>

            {/* Holiday Announcement */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2"><Megaphone className="w-4 h-4" /> Holiday Announcement</CardTitle>
                <CardDescription className="text-xs">Send next month's holiday list to all active employees via email.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" onClick={() => holidayAnnouncement.mutate()} disabled={holidayAnnouncement.isPending}>{holidayAnnouncement.isPending ? "Sending..." : "Send Announcement"}</Button>
              </CardContent>
            </Card>

          </div>
        </TabsContent>
      </Tabs>

      {createRuleOpen && <CreateRuleDialog templates={templates ?? []} open={createRuleOpen} onClose={() => setCreateRuleOpen(false)} />}
      {editTemplate && <EditTemplateDialog template={editTemplate} open={!!editTemplate} onClose={() => setEditTemplate(null)} />}
      {addTemplateOpen && <AddTemplateDialog open={addTemplateOpen} onClose={() => setAddTemplateOpen(false)} />}

      {/* ── Email Preview Modal ── */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Preview — {previewTemplate?.name}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium">Subject:</span> {previewTemplate?.subject}
            </p>
            {previewTemplate?.variables?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Variables:</span>{" "}
                {previewTemplate.variables.map((v: string) => (
                  <code key={v} className="bg-muted px-1 py-0.5 rounded text-xs mr-1">{`{{${v}}}`}</code>
                ))}
              </p>
            )}
          </DialogHeader>
          <div className="overflow-y-auto border border-border rounded-lg bg-[#f4f6f9]" style={{ maxHeight: "65vh" }}>
            {previewTemplate?.bodyHtml ? (
              <iframe
                srcDoc={previewTemplate.bodyHtml}
                className="w-full rounded-lg block"
                style={{ height: "600px", minHeight: "600px" }}
                sandbox="allow-same-origin"
                title="Email Preview"
                onLoad={(e) => {
                  try {
                    const doc = e.currentTarget.contentDocument;
                    const h = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight;
                    if (h && h > 0) e.currentTarget.style.height = `${h + 24}px`;
                  } catch {}
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No HTML content</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button>
            <Button onClick={() => {
              const win = window.open("", "_blank");
              if (win) { win.document.write(previewTemplate?.bodyHtml ?? ""); win.document.close(); }
            }}>Open in New Tab</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
