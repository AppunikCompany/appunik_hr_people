import { useState } from "react";
import { useCurrentUser, useEmployees, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Plus, Edit2, Trash2, Download, FileText, Send, Eye } from "lucide-react";
import { toast } from "sonner";

// ── API helpers ──
const fetchTemplates = () => fetchApi<any[]>("/letters/templates");
const fetchGenerated = () => fetchApi<any[]>("/letters/generated");

// ── Template Dialog (Create / Edit) ──
function TemplateDialog({
  open, onClose, template
}: { open: boolean; onClose: () => void; template?: any }) {
  const isEdit = !!template;
  const [name, setName] = useState(template?.name ?? "");
  const [bodyHtml, setBodyHtml] = useState(template?.bodyHtml ?? DEFAULT_TEMPLATE_HTML);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (d: any) =>
      isEdit
        ? fetchApi(`/letters/templates/${template.id}`, { method: "PUT", body: JSON.stringify(d) })
        : fetchApi("/letters/templates", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["letter-templates"] });
      onClose();
      toast.success(isEdit ? "Template updated" : "Template created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    if (!bodyHtml.trim()) { toast.error("Template body is required"); return; }
    mutation.mutate({ name, bodyHtml });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Template" : "New Letter Template"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          <div>
            <Label>Template Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="e.g. Offer Letter, Experience Letter" />
          </div>
          <div>
            <Label>Body (HTML) *</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1">
              Use variables: <code className="bg-secondary px-1 rounded text-xs">{"{{employee_name}}"}</code>{" "}
              <code className="bg-secondary px-1 rounded text-xs">{"{{designation}}"}</code>{" "}
              <code className="bg-secondary px-1 rounded text-xs">{"{{joining_date}}"}</code>{" "}
              <code className="bg-secondary px-1 rounded text-xs">{"{{date}}"}</code>{" "}
              <code className="bg-secondary px-1 rounded text-xs">{"{{employee_code}}"}</code>
            </p>
            <Textarea
              value={bodyHtml}
              onChange={e => setBodyHtml(e.target.value)}
              className="mt-1 font-mono text-xs"
              rows={16}
              placeholder="<p>Dear {{employee_name}},</p>..."
            />
          </div>
        </div>
        <DialogFooter className="pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : isEdit ? "Update Template" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Generate Letter Dialog ──
function GenerateLetterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [templateId, setTemplateId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const { data: templates } = useQuery({ queryKey: ["letter-templates"], queryFn: fetchTemplates });
  const { data: employees } = useEmployees({ status: "active" });
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => fetchApi("/letters/generate", { method: "POST", body: JSON.stringify({ templateId, employeeId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["letter-generated"] });
      onClose();
      setTemplateId("");
      setEmployeeId("");
      toast.success("Letter generated successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setTemplateId(""); setEmployeeId(""); } }}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Generate Letter</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Template *</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select template..." /></SelectTrigger>
              <SelectContent>
                {(templates ?? []).filter((t: any) => t.isActive).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Employee *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setTemplateId(""); setEmployeeId(""); }}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!templateId || !employeeId || mutation.isPending}>
            {mutation.isPending ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Letter Preview Dialog ──
function LetterPreviewDialog({ letter, onClose }: { letter: any; onClose: () => void }) {
  const downloadPdf = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${letter.templateName} — ${letter.employeeName}</title>
          <style>
            body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 2cm; color: #000; line-height: 1.6; }
            h1, h2, h3 { font-family: Arial, sans-serif; }
            @media print { body { margin: 1cm; } }
          </style>
        </head>
        <body>${letter.generatedHtml}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  return (
    <Dialog open={!!letter} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{letter?.templateName} — {letter?.employeeName}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto border border-border rounded-lg p-6 bg-white text-sm" style={{ fontFamily: "serif", lineHeight: "1.8" }}>
          <div dangerouslySetInnerHTML={{ __html: letter?.generatedHtml ?? "" }} />
        </div>
        <DialogFooter className="pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={downloadPdf}>
            <Download className="w-4 h-4 mr-1.5" /> Print / Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Default template HTML ──
const DEFAULT_TEMPLATE_HTML = `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
  <div style="text-align: right; margin-bottom: 30px;">
    <p>Date: {{date}}</p>
  </div>

  <p>To,</p>
  <p><strong>{{employee_name}}</strong></p>

  <br/>

  <p>Dear {{first_name}},</p>

  <p>This letter is to certify that <strong>{{employee_name}}</strong> (Employee Code: {{employee_code}})
  is employed with our organization as <strong>{{designation}}</strong> since {{joining_date}}.</p>

  <p>This letter is issued as per the request of the individual for submission wherever required.</p>

  <br/>

  <p>For [Company Name],</p>
  <br/><br/>
  <p>______________________</p>
  <p>HR Manager</p>
</div>`;

// ── Main Component ──
export default function Letters() {
  const { data: user } = useCurrentUser();
  const isPrivileged = user?.role === "super_admin" || user?.role === "hr_admin";

  const { data: templates, isLoading: tLoading } = useQuery({
    queryKey: ["letter-templates"],
    queryFn: fetchTemplates,
    enabled: isPrivileged,
  });

  const { data: generated, isLoading: gLoading } = useQuery({
    queryKey: ["letter-generated"],
    queryFn: fetchGenerated,
  });

  const qc = useQueryClient();

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [previewLetter, setPreviewLetter] = useState<any>(null);

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => fetchApi(`/letters/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["letter-templates"] }); toast.success("Template deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteLetter = useMutation({
    mutationFn: (id: string) => fetchApi(`/letters/generated/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["letter-generated"] }); toast.success("Letter deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Letters"
        breadcrumbs={[{ label: "Letters" }]}
      />

      <Tabs defaultValue={isPrivileged ? "generated" : "my-letters"}>
        <TabsList className="mb-6">
          {isPrivileged && <TabsTrigger value="generated">All Letters</TabsTrigger>}
          {isPrivileged && <TabsTrigger value="templates">Templates</TabsTrigger>}
          {!isPrivileged && <TabsTrigger value="my-letters">My Letters</TabsTrigger>}
        </TabsList>

        {/* ── Generated Letters (Admin view) ── */}
        {isPrivileged && (
          <TabsContent value="generated">
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                <Send className="w-4 h-4 mr-1.5" /> Generate Letter
              </Button>
            </div>
            <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
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
                  {gLoading ? (
                    <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                  ) : !generated || generated.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No letters generated yet. Click "Generate Letter" to create one.
                    </td></tr>
                  ) : generated.map((letter: any, i: number) => (
                    <tr key={letter.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium text-foreground">{letter.employeeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{letter.templateName}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(letter.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPreviewLetter(letter)} title="Preview">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600" onClick={() => {
                            if (confirm(`Delete this letter for ${letter.employeeName}?`)) deleteLetter.mutate(letter.id);
                          }} title="Delete">
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
        )}

        {/* ── Templates (Admin view) ── */}
        {isPrivileged && (
          <TabsContent value="templates">
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={() => { setEditTemplate(null); setTemplateDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-1.5" /> New Template
              </Button>
            </div>
            <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Template Name</th>
                    <th className="text-left px-5 py-3">Code</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Last Updated</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tLoading ? (
                    <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                  ) : !templates || templates.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No templates yet. Click "New Template" to create one.
                    </td></tr>
                  ) : templates.map((t: any, i: number) => (
                    <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium text-foreground">{t.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{t.code}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.isActive ? "bg-green-100 text-green-700" : "bg-secondary text-muted-foreground"}`}>
                          {t.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(t.updatedAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditTemplate(t); setTemplateDialogOpen(true); }} title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600" onClick={() => {
                            if (confirm(`Delete template "${t.name}"?`)) deleteTemplate.mutate(t.id);
                          }} title="Delete">
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
        )}

        {/* ── My Letters (Employee view) ── */}
        {!isPrivileged && (
          <TabsContent value="my-letters">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {gLoading ? (
                <div className="col-span-3 text-center py-20 text-muted-foreground">Loading...</div>
              ) : !generated || generated.length === 0 ? (
                <div className="col-span-3 text-center py-20 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No letters available</p>
                  <p className="text-xs mt-1">Your HR team will add letters here for you to download.</p>
                </div>
              ) : generated.map((letter: any) => (
                <div key={letter.id} className="bg-white border border-border rounded-lg shadow-sm p-5 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{letter.templateName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(letter.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setPreviewLetter(letter)}>
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      <TemplateDialog
        key={editTemplate?.id ?? "new"}
        open={templateDialogOpen}
        onClose={() => { setTemplateDialogOpen(false); setEditTemplate(null); }}
        template={editTemplate}
      />
      <GenerateLetterDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
      {previewLetter && <LetterPreviewDialog letter={previewLetter} onClose={() => setPreviewLetter(null)} />}
    </PageContainer>
  );
}
