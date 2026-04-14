"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, useEmployees } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, RefreshCw, FileText, Eye, Printer } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

function GenerateLetterDialog({ template, open, onClose }: { template: any; open: boolean; onClose: () => void }) {
  const { data: employees } = useEmployees();
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState("");
  const [extraVars, setExtraVars] = useState<Record<string, string>>({});
  const commonVars = ["fullName", "firstName", "lastName", "employeeCode", "designation", "department", "joiningDate", "lastWorkingDay", "currentDate", "companyName"];
  const customVars = (template?.variables ?? []).filter((v: string) => !commonVars.includes(v));

  const mutation = useMutation({
    mutationFn: () => fetchApi("/letters/generate", { method: "POST", body: JSON.stringify({ employeeId, templateId: template.id, extraVars }) }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["generated-letters"] });
      onClose();
      toast.success("Letter generated");
      // Open print preview
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<!DOCTYPE html><html><head><title>${template.name}</title><style>body{margin:0;padding:0;} @media print{body{margin:0;}}</style></head><body>${data.generatedHtml}<script>window.onload=()=>{window.print();}<\/script></body></html>`);
        w.document.close();
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Generate — {template?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Employee *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>{employees?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} — {e.employeeCode}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {customVars.map((v: string) => (
            <div key={v}>
              <Label className="capitalize">{v.replace(/([A-Z])/g, " $1")}</Label>
              <Input value={extraVars[v] ?? ""} onChange={e => setExtraVars(p => ({ ...p, [v]: e.target.value }))} className="mt-1" placeholder={`Enter ${v}...`} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Employee details (name, code, designation, department, dates) are filled automatically.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!employeeId || mutation.isPending}>{mutation.isPending ? "Generating..." : "Generate & Print"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({ template, open, onClose }: { template?: any; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!template;
  const [form, setForm] = useState({
    name: template?.name ?? "",
    code: template?.code ?? "",
    variables: (template?.variables ?? []).join(", "),
    bodyHtml: template?.bodyHtml ?? "",
    isActive: template?.isActive ?? true,
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const mutation = useMutation({
    mutationFn: () => {
      const body = { ...form, variables: form.variables ? form.variables.split(",").map((s: string) => s.trim()).filter(Boolean) : [] };
      return isEdit
        ? fetchApi(`/letters/templates/${template.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : fetchApi("/letters/templates", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["letter-templates"] }); onClose(); toast.success(isEdit ? "Template updated" : "Template created"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Letter Template</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" /></div>
            <div><Label>Code * (unique slug)</Label><Input value={form.code} onChange={e => set("code", e.target.value)} className="mt-1 font-mono text-xs" /></div>
          </div>
          <div><Label>Variables (comma-separated)</Label><Input value={form.variables} onChange={e => set("variables", e.target.value)} className="mt-1 font-mono text-xs" placeholder="ctc, reportingDate, grossSalary" /></div>
          <div><Label>Body (HTML) *</Label><Textarea value={form.bodyHtml} onChange={e => set("bodyHtml", e.target.value)} className="mt-1 font-mono text-xs" rows={14} /></div>
          <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} /><Label>Active</Label></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || !form.code || !form.bodyHtml || mutation.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewLetterDialog({ letter, open, onClose }: { letter: any; open: boolean; onClose: () => void }) {
  const print = () => {
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><title>${letter.templateName}</title></head><body>${letter.generatedHtml}<script>window.onload=()=>{window.print();}<\/script></body></html>`);
      w.document.close();
    }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{letter?.templateName} — {letter?.employeeName}</DialogTitle>
        </DialogHeader>
        <div className="border border-border rounded p-4 bg-white" dangerouslySetInnerHTML={{ __html: letter?.generatedHtml ?? "" }} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={print}><Printer className="w-4 h-4 mr-1" /> Print / Save PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Letters() {
  const qc = useQueryClient();
  const [generateFor, setGenerateFor] = useState<any>(null);
  const [tmplDialog, setTmplDialog] = useState<{ template?: any } | null>(null);
  const [viewLetter, setViewLetter] = useState<any>(null);

  const { data: templates } = useQuery({ queryKey: ["letter-templates"], queryFn: () => fetchApi<any[]>("/letters/templates") });
  const { data: generated } = useQuery({ queryKey: ["generated-letters"], queryFn: () => fetchApi<any[]>("/letters/generated") });

  const seedTemplates = useMutation({
    mutationFn: () => fetchApi("/letters/templates/seed", { method: "POST" }),
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["letter-templates"] }); toast.success(`Seeded: ${d.seeded?.join(", ") || "All already exist"}`); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => fetchApi(`/letters/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["letter-templates"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteGenerated = useMutation({
    mutationFn: (id: string) => fetchApi(`/letters/generated/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["generated-letters"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader title="Letter Generation" breadcrumbs={[{ label: "Letters" }]} subtitle="Generate and manage HR letters for employees" />

      <Tabs defaultValue="templates">
        <TabsList className="mb-6">
          <TabsTrigger value="templates">Templates ({templates?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="generated">Generated Letters ({generated?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold">Letter Templates</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Click "Generate" on any template to produce a filled letter for an employee</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => seedTemplates.mutate()} disabled={seedTemplates.isPending}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Seed Defaults</Button>
                <Button size="sm" onClick={() => setTmplDialog({})}><Plus className="w-4 h-4 mr-1" /> Add Template</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">Code</th>
                    <th className="text-left px-5 py-3">Variables</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!templates || templates.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No templates — click "Seed Defaults" to add 8 standard letter types</td></tr>
                  ) : templates.map((t: any, i: number) => (
                    <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" />{t.name}</td>
                      <td className="px-5 py-3"><Badge variant="outline" className="font-mono text-xs">{t.code}</Badge></td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{(t.variables ?? []).join(", ") || "—"}</td>
                      <td className="px-5 py-3"><Badge variant="outline" className={t.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500"}>{t.isActive ? "Active" : "Inactive"}</Badge></td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => setGenerateFor(t)} className="h-7 text-xs px-3">Generate</Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setTmplDialog({ template: t })}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete "${t.name}"?`)) deleteTemplate.mutate(t.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="generated">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Generated Letters History</h3>
              <p className="text-xs text-muted-foreground mt-0.5">All letters generated for employees. Click view to preview or print.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">Letter Type</th>
                    <th className="text-left px-5 py-3">Generated On</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!generated || generated.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No letters generated yet</td></tr>
                  ) : generated.map((l: any, i: number) => (
                    <tr key={l.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium">{l.employeeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{l.templateName}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(l.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => setViewLetter(l)}><Eye className="w-3.5 h-3.5 mr-1" /> View</Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteGenerated.mutate(l.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {generateFor && <GenerateLetterDialog template={generateFor} open={!!generateFor} onClose={() => setGenerateFor(null)} />}
      {tmplDialog !== null && <TemplateDialog template={tmplDialog.template} open={true} onClose={() => setTmplDialog(null)} />}
      {viewLetter && <ViewLetterDialog letter={viewLetter} open={!!viewLetter} onClose={() => setViewLetter(null)} />}
    </PageContainer>
  );
}
