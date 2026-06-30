import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useAutomationRules, useAutomationLogs, useEmailTemplates,
  fetchApi, type AutomationRule, type EmailTemplate,
} from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/utils";
import { Edit, Plus, Trash2, SendHorizonal, Zap, Mail, Clock, Info, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── All supported automation events ──────────────────────────────────────────

const TRIGGER_EVENTS = [
  { value: "employee.created",             label: "Employee Created",           group: "Employee" },
  { value: "employee.probation_end",       label: "Probation Ending",           group: "Employee" },
  { value: "employee.birthday",            label: "Birthday",                   group: "Employee" },
  { value: "employee.work_anniversary",    label: "Work Anniversary",           group: "Employee" },
  { value: "employee.offboarding_started", label: "Offboarding Started",        group: "Employee" },
  { value: "employee.document_expiry",     label: "Document Expiry",            group: "Employee" },
  { value: "leave.applied",                label: "Leave Applied",              group: "Leave" },
  { value: "leave.approved",               label: "Leave Approved",             group: "Leave" },
  { value: "leave.rejected",               label: "Leave Rejected",             group: "Leave" },
  { value: "leave.balance_low",            label: "Leave Balance Low",          group: "Leave" },
  { value: "attendance.late_arrival",      label: "Late Arrival",               group: "Attendance" },
  { value: "attendance.absent_no_leave",   label: "Absent Without Leave",       group: "Attendance" },
  { value: "attendance.wfh_requested",     label: "WFH Requested",              group: "Attendance" },
  { value: "asset.assigned",               label: "Asset Assigned",             group: "Assets" },
  { value: "asset.returned",               label: "Asset Returned",             group: "Assets" },
  { value: "onboarding.started",           label: "Onboarding Started",         group: "Onboarding" },
  { value: "onboarding.completed",         label: "Onboarding Completed",       group: "Onboarding" },
  { value: "onboarding.task_completed",    label: "Onboarding Task Completed",  group: "Onboarding" },
  { value: "kra.assigned",                 label: "KRA Assigned",               group: "Performance" },
  { value: "kra.self_assessed",            label: "KRA Self-Assessed",          group: "Performance" },
  { value: "kra.completed",                label: "KRA Completed",              group: "Performance" },
  { value: "kra.deadline_approaching",     label: "KRA Deadline Approaching",   group: "Performance" },
  { value: "holiday.announcement",         label: "Holiday Announcement",       group: "General" },
];

const RECIPIENT_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "hr_admin", label: "HR Admin" },
  { value: "manager",  label: "Reporting Manager" },
];

const COMMON_VARIABLES = [
  "{{firstName}}", "{{lastName}}", "{{fullName}}", "{{email}}", "{{employeeCode}}",
  "{{startDate}}", "{{endDate}}", "{{years}}", "{{daysRemaining}}",
  "{{kraTitle}}", "{{documentType}}", "{{expiryDate}}",
  "{{holidayList}}", "{{monthName}}", "{{date}}",
];

// ── Rule form dialog (create + edit) ─────────────────────────────────────────

interface RuleFormState {
  name: string;
  code: string;
  triggerType: string;
  triggerEvent: string;
  templateId: string;
  recipients: string[];
  customEmail: string;
}

const EMPTY_RULE: RuleFormState = {
  name: "", code: "", triggerType: "event", triggerEvent: "",
  templateId: "", recipients: ["employee"], customEmail: "",
};

function RuleDialog({
  open, onClose, editing, templates,
}: {
  open: boolean;
  onClose: () => void;
  editing: AutomationRule | null;
  templates: EmailTemplate[];
}) {
  const [form, setForm] = useState<RuleFormState>(EMPTY_RULE);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const existingRecipients = (editing.recipients ?? "employee").split(",").map((r) => r.trim());
      const knownValues = RECIPIENT_OPTIONS.map((o) => o.value);
      const custom = existingRecipients.filter((r) => !knownValues.includes(r));
      setForm({
        name: editing.name,
        code: editing.code,
        triggerType: editing.triggerType,
        triggerEvent: editing.triggerEvent ?? "",
        templateId: editing.templateId,
        recipients: existingRecipients.filter((r) => knownValues.includes(r)),
        customEmail: custom.join(", "),
      });
    } else {
      setForm(EMPTY_RULE);
    }
  }, [open, editing]);

  const set = <K extends keyof RuleFormState>(k: K, v: RuleFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleRecipient = (val: string) =>
    setForm((f) => ({
      ...f,
      recipients: f.recipients.includes(val)
        ? f.recipients.filter((r) => r !== val)
        : [...f.recipients, val],
    }));

  const buildRecipientsString = () => {
    const parts = [...form.recipients];
    if (form.customEmail.trim()) {
      form.customEmail.split(",").map((e) => e.trim()).filter(Boolean).forEach((e) => parts.push(e));
    }
    return parts.join(",");
  };

  const createMutation = useMutation({
    mutationFn: (d: any) => fetchApi("/automations/rules", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automation-rules"] }); onClose(); toast.success("Rule created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: (d: any) => fetchApi(`/automations/rules/${editing!.id}`, { method: "PATCH", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automation-rules"] }); onClose(); toast.success("Rule updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Rule name is required"); return; }
    if (!editing && !form.code.trim()) { toast.error("Rule code is required"); return; }
    if (!form.triggerEvent) { toast.error("Please select a trigger event"); return; }
    if (!form.templateId) { toast.error("Please select an email template"); return; }
    const recipients = buildRecipientsString();
    if (!recipients) { toast.error("At least one recipient is required"); return; }
    const payload = {
      name: form.name.trim(),
      ...(!editing && { code: form.code.trim().replace(/\s+/g, "_").toLowerCase() }),
      triggerType: form.triggerType,
      triggerEvent: form.triggerEvent || null,
      templateId: form.templateId,
      recipients,
    };
    if (editing) editMutation.mutate(payload);
    else createMutation.mutate(payload);
  };

  const isPending = createMutation.isPending || editMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Automation Rule" : "Create Automation Rule"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Rule Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" placeholder="e.g. Leave Approved Email" />
            </div>
            <div>
              <Label>Rule Code *</Label>
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                className="mt-1"
                placeholder="e.g. rule_leave_approved"
                disabled={!!editing}
              />
              {editing && <p className="text-[11px] text-muted-foreground mt-1">Code cannot be changed after creation.</p>}
            </div>
          </div>

          <div>
            <Label>Trigger Event *</Label>
            <Select value={form.triggerEvent} onValueChange={(v) => set("triggerEvent", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select when this rule fires…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {Object.entries(
                  TRIGGER_EVENTS.reduce((acc, e) => {
                    (acc[e.group] = acc[e.group] ?? []).push(e);
                    return acc;
                  }, {} as Record<string, typeof TRIGGER_EVENTS>)
                ).map(([group, events]) => (
                  <div key={group}>
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-secondary">{group}</p>
                    {events.map((ev) => (
                      <SelectItem key={ev.value} value={ev.value}>{ev.label}</SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Email Template *</Label>
            <Select value={form.templateId} onValueChange={(v) => set("templateId", v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select a template…" /></SelectTrigger>
              <SelectContent>
                {(templates as EmailTemplate[]).filter((t) => t.isActive !== false).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 text-muted-foreground text-xs font-mono">{t.code}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">Recipients *</Label>
            <div className="flex flex-wrap gap-2">
              {RECIPIENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleRecipient(opt.value)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-full border transition-colors",
                    form.recipients.includes(opt.value)
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Input
                value={form.customEmail}
                onChange={(e) => set("customEmail", e.target.value)}
                className="text-sm"
                placeholder="Custom email(s), comma-separated (optional)"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : editing ? "Save Changes" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Test send dialog ──────────────────────────────────────────────────────────

function TestSendDialog({ rule, open, onClose }: { rule: AutomationRule | null; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => { if (!open) { setEmail(""); setResult(null); } }, [open]);

  const mutation = useMutation({
    mutationFn: () => fetchApi(`/automations/rules/${rule!.id}/test`, { method: "POST", body: JSON.stringify({ testEmail: email }) }),
    onSuccess: (data: any) => { setResult(data); if (data.sent) toast.success(`Test email sent to ${email}`); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Send Test Email — {rule?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Sends the template with placeholder data to the address below. Subject will be prefixed with{" "}
            <code className="text-xs bg-secondary px-1 rounded">[TEST]</code>.
          </p>
          <div>
            <Label>Recipient Email *</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" placeholder="you@example.com" type="email" />
          </div>
          {result && (
            <div className={cn("rounded-lg px-3 py-2 text-xs", result.sent ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700")}>
              {result.sent
                ? `✓ Sent to ${result.to} — Subject: ${result.subject}`
                : `⚠ Not sent: ${result.reason}${result.preview ? ` — Preview: "${result.preview}…"` : ""}`}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => mutation.mutate()} disabled={!email || mutation.isPending}>
            <SendHorizonal className="w-4 h-4 mr-1.5" />
            {mutation.isPending ? "Sending…" : "Send Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Template editor with variable hints ──────────────────────────────────────

function TemplateEditor({
  subject, bodyHtml, onSubjectChange, onBodyChange,
}: {
  subject: string;
  bodyHtml: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
}) {
  const [showVars, setShowVars] = useState(false);

  return (
    <div className="space-y-3">
      <div>
        <Label>Subject *</Label>
        <Input value={subject} onChange={(e) => onSubjectChange(e.target.value)} className="mt-1" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Body (HTML) *</Label>
          <button
            type="button"
            onClick={() => setShowVars((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Info className="w-3 h-3" />
            {showVars ? "Hide variables" : "Available variables"}
          </button>
        </div>
        {showVars && (
          <div className="mb-2 p-2 bg-secondary rounded-lg flex flex-wrap gap-1">
            {COMMON_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onBodyChange(bodyHtml + v)}
                className="px-2 py-0.5 text-[11px] font-mono bg-white border border-border rounded hover:bg-foreground hover:text-background transition-colors"
                title={`Click to append ${v}`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
        <Textarea
          value={bodyHtml}
          onChange={(e) => onBodyChange(e.target.value)}
          className="font-mono text-xs"
          rows={12}
          placeholder={"<p>Dear {{fullName}},</p>\n<p>Your message here.</p>"}
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Use <code className="bg-secondary px-1 rounded">{"{{variable}}"}</code> syntax. Click variable chips above to insert them.
        </p>
      </div>
    </div>
  );
}

function CreateTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", code: "", subject: "", bodyHtml: "" });
  const qc = useQueryClient();

  useEffect(() => { if (!open) setForm({ name: "", code: "", subject: "", bodyHtml: "" }); }, [open]);

  const mutation = useMutation({
    mutationFn: () => fetchApi("/automations/email-templates", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); onClose(); toast.success("Template created"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Create Email Template</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Code *</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="mt-1" placeholder="e.g. custom_alert" />
            </div>
          </div>
          <TemplateEditor
            subject={form.subject}
            bodyHtml={form.bodyHtml}
            onSubjectChange={(v) => setForm((f) => ({ ...f, subject: v }))}
            onBodyChange={(v) => setForm((f) => ({ ...f, bodyHtml: v }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!form.name || !form.code || !form.subject || !form.bodyHtml) { toast.error("All fields are required"); return; }
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Creating…" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTemplateDialog({ template, open, onClose }: { template: EmailTemplate | null; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ subject: "", bodyHtml: "" });
  const qc = useQueryClient();

  useEffect(() => {
    if (open && template) setForm({ subject: template.subject, bodyHtml: template.bodyHtml });
  }, [open, template]);

  const mutation = useMutation({
    mutationFn: () => fetchApi(`/automations/email-templates/${template!.id}`, { method: "PATCH", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); onClose(); toast.success("Template updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Edit Template — {template?.name}</DialogTitle>
          <p className="text-xs text-muted-foreground font-mono">{template?.code}</p>
        </DialogHeader>
        <div className="py-2">
          <TemplateEditor
            subject={form.subject}
            bodyHtml={form.bodyHtml}
            onSubjectChange={(v) => setForm((f) => ({ ...f, subject: v }))}
            onBodyChange={(v) => setForm((f) => ({ ...f, bodyHtml: v }))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Automations() {
  const [location, navigate] = useLocation();
  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [testRule, setTestRule] = useState<AutomationRule | null>(null);
  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null);
  const [createTemplate, setCreateTemplate] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const { data: rules = [], isLoading: rulesLoading } = useAutomationRules();
  const { data: logs = [], isLoading: logsLoading } = useAutomationLogs();
  const { data: templates = [] } = useEmailTemplates();
  const { data: emailConfig, isLoading: configLoading } = useQuery({
    queryKey: ["email-config"],
    queryFn: () => fetchApi<{ configured: boolean; fromEmail: string; apiUrl: string; error?: string; probeStatus?: number }>("/automations/email-config"),
    staleTime: 30_000,
  });
  const qc = useQueryClient();

  const tabFromPath: Record<string, string> = {
    "/automations": "rules",
    "/automations/templates": "templates",
    "/automations/logs": "logs",
  };
  const pathFromTab: Record<string, string> = {
    rules: "/automations",
    templates: "/automations/templates",
    logs: "/automations/logs",
  };
  const activeTab = tabFromPath[location] ?? "rules";

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

  const openEdit = (rule: AutomationRule) => { setEditingRule(rule); setRuleDialog(true); };
  const openCreate = () => { setEditingRule(null); setRuleDialog(true); };

  const recipientBadges = (recipients: string) =>
    recipients.split(",").map((r) => r.trim()).map((r) => (
      <Badge key={r} variant="secondary" className="text-[10px] capitalize">{r}</Badge>
    ));

  const eventLabel = (ev: string | null) =>
    TRIGGER_EVENTS.find((e) => e.value === ev)?.label ?? ev ?? "—";

  return (
    <PageContainer>
      <PageHeader
        title="Email Automations"
        breadcrumbs={[{ label: "Automations" }]}
        subtitle="Build triggered emails for key HR events — sent automatically via ZeptoMail"
      />

      {/* ZeptoMail config status banner */}
      {configLoading ? null : emailConfig?.configured ? (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>ZeptoMail connected — sending from <strong>{emailConfig.fromEmail}</strong></span>
        </div>
      ) : (
        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">ZeptoMail not connected — emails will not send</p>
            {emailConfig?.error && <p className="text-xs mt-0.5 text-amber-700">{emailConfig.error}</p>}
            <p className="text-xs mt-1 text-amber-700">
              Add <code className="bg-amber-100 px-1 rounded">ZEPTOMAIL_API_KEY</code> (Send Mail Token) and <code className="bg-amber-100 px-1 rounded">FROM_EMAIL</code> to your Railway environment variables, then redeploy.
            </p>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => navigate(pathFromTab[v] ?? "/automations")}>
        <TabsList className="mb-4">
          <TabsTrigger value="rules"><Zap className="w-3.5 h-3.5 mr-1.5" />Rules</TabsTrigger>
          <TabsTrigger value="templates"><Mail className="w-3.5 h-3.5 mr-1.5" />Templates</TabsTrigger>
          <TabsTrigger value="logs"><Clock className="w-3.5 h-3.5 mr-1.5" />Logs</TabsTrigger>
        </TabsList>

        {/* ── RULES TAB ── */}
        <TabsContent value="rules">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Each rule binds a trigger event to an email template. Toggle to enable or disable without deleting.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={async () => {
                setSeeding(true);
                try {
                  await fetchApi("/automations/seed-templates", { method: "POST" });
                  qc.invalidateQueries({ queryKey: ["automation-rules"] });
                  qc.invalidateQueries({ queryKey: ["email-templates"] });
                  toast.success("Default rules and templates loaded");
                } catch (e: any) { toast.error(e.message); }
                finally { setSeeding(false); }
              }} disabled={seeding}>
                {seeding ? "Loading…" : "Load Defaults"}
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" /> New Rule
              </Button>
            </div>
          </div>

          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Rule</th>
                  <th className="text-left px-5 py-3">Trigger Event</th>
                  <th className="text-left px-5 py-3">Template</th>
                  <th className="text-left px-5 py-3">Recipients</th>
                  <th className="text-left px-5 py-3">Last Run</th>
                  <th className="text-left px-5 py-3">Active</th>
                  <th className="text-left px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rulesLoading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading…</td></tr>
                ) : (rules as AutomationRule[]).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center">
                      <p className="text-sm text-muted-foreground mb-1">No automation rules yet.</p>
                      <p className="text-xs text-muted-foreground">
                        Click <strong>Load Defaults</strong> to get 15 pre-built rules, or <strong>New Rule</strong> to create your own.
                      </p>
                    </td>
                  </tr>
                ) : (rules as AutomationRule[]).map((rule, i) => (
                  <tr key={rule.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{rule.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{rule.code}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-muted-foreground">{eventLabel(rule.triggerEvent)}</p>
                      <p className="text-[11px] text-muted-foreground/60 font-mono mt-0.5">{rule.triggerEvent}</p>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{rule.templateName ?? "—"}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">{recipientBadges(rule.recipients)}</div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">
                      {rule.lastRunAt ? formatDateTime(rule.lastRunAt) : "Never"}
                    </td>
                    <td className="px-5 py-3">
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, isActive: checked })}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-600"
                          title="Send test email"
                          onClick={() => setTestRule(rule)}
                        >
                          <SendHorizonal className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title="Edit rule"
                          onClick={() => openEdit(rule)}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete rule"
                          onClick={() => {
                            if (confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) {
                              deleteRule.mutate(rule.id);
                            }
                          }}
                          disabled={deleteRule.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── TEMPLATES TAB ── */}
        <TabsContent value="templates">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Templates use <code className="bg-secondary px-1 rounded text-xs">{"{{variable}}"}</code> syntax. Rules pick one template to send.
            </p>
            <Button size="sm" onClick={() => setCreateTemplate(true)}>
              <Plus className="w-4 h-4 mr-1" /> New Template
            </Button>
          </div>

          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Template</th>
                  <th className="text-left px-5 py-3">Code</th>
                  <th className="text-left px-5 py-3">Subject</th>
                  <th className="text-left px-5 py-3">Variables</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(templates as EmailTemplate[]).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    No templates yet. Click <strong>New Template</strong> or load defaults from the Rules tab.
                  </td></tr>
                ) : (templates as EmailTemplate[]).map((t, i) => (
                  <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                    <td className="px-5 py-3 font-medium text-foreground">{t.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{t.code}</td>
                    <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{t.subject}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">
                      {(t.variables ?? []).length > 0
                        ? (t.variables as string[]).map((v) => (
                            <Badge key={v} variant="secondary" className="text-[10px] font-mono mr-1">{`{{${v}}}`}</Badge>
                          ))
                        : "—"}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={t.isActive !== false ? "active" : "inactive"} /></td>
                    <td className="px-5 py-3">
                      <Button size="sm" variant="outline" onClick={() => setEditTemplate(t)} className="h-7 text-xs">
                        <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── LOGS TAB ── */}
        <TabsContent value="logs">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">Last 100 automation emails dispatched by the system.</p>
          </div>

          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Rule</th>
                  <th className="text-left px-5 py-3">Employee</th>
                  <th className="text-left px-5 py-3">Recipient Email</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Sent At</th>
                  <th className="text-left px-5 py-3">Error</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Loading…</td></tr>
                ) : (logs as any[]).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No automation emails sent yet.</td></tr>
                ) : (logs as any[]).map((log, i) => (
                  <tr key={log.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                    <td className="px-5 py-3 text-muted-foreground">{log.ruleName || log.templateCode}</td>
                    <td className="px-5 py-3 text-muted-foreground">{log.employeeName ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{log.recipientEmail}</td>
                    <td className="px-5 py-3"><StatusBadge status={log.status} /></td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{formatDateTime(log.sentAt)}</td>
                    <td className="px-5 py-3 text-xs">
                      {log.errorMessage
                        ? <span className="text-red-500" title={log.errorMessage}>{log.errorMessage}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <RuleDialog
        open={ruleDialog}
        onClose={() => { setRuleDialog(false); setEditingRule(null); }}
        editing={editingRule}
        templates={templates as EmailTemplate[]}
      />
      <TestSendDialog rule={testRule} open={!!testRule} onClose={() => setTestRule(null)} />
      <EditTemplateDialog template={editTemplate} open={!!editTemplate} onClose={() => setEditTemplate(null)} />
      <CreateTemplateDialog open={createTemplate} onClose={() => setCreateTemplate(false)} />
    </PageContainer>
  );
}
