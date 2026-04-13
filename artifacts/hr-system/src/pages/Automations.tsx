import { useState } from "react";
import { useLocation } from "wouter";
import { useAutomationRules, useAutomationLogs, useEmailTemplates, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/utils";
import { Edit, Plus } from "lucide-react";
import { toast } from "sonner";

function CreateTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", code: "", subject: "", bodyHtml: "" });
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => fetchApi("/automations/email-templates", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); onClose(); toast.success("Template created"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Create Email Template</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><Label>Code *</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="mt-1" placeholder="e.g. custom_alert" /></div>
          </div>
          <div><Label>Subject *</Label><Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="mt-1" /></div>
          <div><Label>Body (HTML)</Label><Textarea value={form.bodyHtml} onChange={e => setForm(f => ({ ...f, bodyHtml: e.target.value }))} className="mt-1 font-mono text-xs" rows={10} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (!form.name || !form.code || !form.subject) { toast.error("Name, code, and subject are required"); return; } mutation.mutate(); }} disabled={mutation.isPending}>{mutation.isPending ? "Creating..." : "Create"}</Button>
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
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
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

export default function Automations() {
  const [location] = useLocation();
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [seeding, setSeeding] = useState(false);
  const [createTemplate, setCreateTemplate] = useState(false);
  const { data: rules, isLoading: rulesLoading } = useAutomationRules();
  const { data: logs, isLoading: logsLoading } = useAutomationLogs();
  const { data: templates } = useEmailTemplates();
  const qc = useQueryClient();

  const tabFromPath: Record<string, string> = {
    "/automations": "rules",
    "/automations/templates": "templates",
    "/automations/logs": "logs",
  };
  const activeTab = tabFromPath[location] ?? "rules";

  const toggleRule = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetchApi(`/automations/rules/${id}/toggle`, { method: "POST", body: JSON.stringify({ isActive }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automation-rules"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader title="Automations" breadcrumbs={[{ label: "Automations" }]} subtitle="Manage email automation rules and templates" />

      <Tabs value={activeTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="rules" asChild><a href="/automations">Rules ({rules?.length ?? 0})</a></TabsTrigger>
          <TabsTrigger value="templates" asChild><a href="/automations/templates">Email Templates</a></TabsTrigger>
          <TabsTrigger value="logs" asChild><a href="/automations/logs">Logs</a></TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <div className="flex justify-end mb-4">
            <Button size="sm" variant="outline" onClick={async () => {
              setSeeding(true);
              try {
                await fetchApi("/automations/seed-templates", { method: "POST" });
                qc.invalidateQueries({ queryKey: ["automation-rules"] });
                qc.invalidateQueries({ queryKey: ["email-templates"] });
                toast.success("Automation rules and templates seeded successfully");
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setSeeding(false);
              }
            }} disabled={seeding}>
              {seeding ? "Seeding..." : "Seed Default Rules"}
            </Button>
          </div>
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Rule</th>
                  <th className="text-left px-5 py-3">Trigger</th>
                  <th className="text-left px-5 py-3">Template</th>
                  <th className="text-left px-5 py-3">Recipients</th>
                  <th className="text-left px-5 py-3">Last Run</th>
                  <th className="text-left px-5 py-3 min-w-[80px]">Active</th>
                </tr>
              </thead>
              <tbody>
                {rulesLoading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                ) : !rules || rules.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No automation rules configured</td></tr>
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
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, isActive: checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={() => setCreateTemplate(true)}><Plus className="w-4 h-4 mr-1" /> New Template</Button>
          </div>
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-3">Template</th>
                  <th className="text-left px-5 py-3">Code</th>
                  <th className="text-left px-5 py-3">Subject</th>
                  <th className="text-left px-5 py-3">Variables</th>
                  <th className="text-left px-5 py-3">Active</th>
                  <th className="text-left px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!templates || templates.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No email templates</td></tr>
                ) : templates.map((t: any, i: number) => (
                  <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                    <td className="px-5 py-3 font-medium text-foreground">{t.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{t.code}</td>
                    <td className="px-5 py-3 text-muted-foreground max-w-xs truncate">{t.subject}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{(t.variables ?? []).join(", ") || "—"}</td>
                    <td className="px-5 py-3"><StatusBadge status={t.isActive ? "active" : "inactive"} /></td>
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
      </Tabs>

      {editTemplate && (
        <EditTemplateDialog template={editTemplate} open={!!editTemplate} onClose={() => setEditTemplate(null)} />
      )}
      <CreateTemplateDialog open={createTemplate} onClose={() => setCreateTemplate(false)} />
    </PageContainer>
  );
}
