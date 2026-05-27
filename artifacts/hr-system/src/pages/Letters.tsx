import { useState, useRef } from "react";
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
import { Plus, Edit2, Trash2, Download, FileText, Send, Eye, Upload, FolderOpen, BookOpen, User } from "lucide-react";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  policy: "Policy",
  handbook: "Handbook",
  sop: "SOP",
  general: "General",
  other: "Other",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  offer_letter: "Offer Letter",
  appointment_letter: "Appointment Letter",
  experience_letter: "Experience Letter",
  salary_slip: "Salary Slip",
  nda: "NDA",
  other: "Other",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]); // strip "data:...;base64,"
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadFromBase64(fileData: string, fileName: string, mimeType: string) {
  const bytes = new Uint8Array(
    atob(fileData).split("").map((c) => c.charCodeAt(0))
  );
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function fileCategoryIcon(mimeType: string) {
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.includes("image")) return "🖼️";
  return "📎";
}

// ── File Picker shared component ─────────────────────────────────────────────

function FilePicker({
  onFile,
  accept = ".pdf,.doc,.docx,.jpg,.jpeg,.png",
}: {
  onFile: (file: File) => void;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}>
        <Upload className="w-4 h-4 mr-1.5" /> Choose File
      </Button>
    </div>
  );
}

// ── Upload Company Document Dialog ───────────────────────────────────────────

function UploadCompanyDocDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [file, setFile] = useState<File | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Please choose a file");
      const fileData = await fileToBase64(file);
      return fetchApi("/documents/company", {
        method: "POST",
        body: JSON.stringify({
          name, description, category,
          fileName: file.name, fileData, mimeType: file.type || "application/octet-stream",
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-docs"] });
      toast.success("Document uploaded");
      setName(""); setDescription(""); setCategory("general"); setFile(null);
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Upload Company Document</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Document Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="e.g. Leave Policy 2026" />
          </div>
          <div>
            <Label>Category</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={2} placeholder="Optional short description..." />
          </div>
          <div>
            <Label>File *</Label>
            <div className="mt-1 flex items-center gap-3">
              <FilePicker onFile={setFile} />
              {file && (
                <span className="text-sm text-muted-foreground truncate max-w-[180px]">{file.name}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Accepted: PDF, Word, images (max ~15 MB)</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name.trim() || !file}>
            {mutation.isPending ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Upload Employee Document Dialog ──────────────────────────────────────────

function UploadEmployeeDocDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const { data: employees } = useEmployees({ status: "active" });
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Please choose a file");
      const fileData = await fileToBase64(file);
      return fetchApi("/documents/employee", {
        method: "POST",
        body: JSON.stringify({
          employeeId, name, documentType,
          fileName: file.name, fileData, mimeType: file.type || "application/octet-stream",
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-docs"] });
      toast.success("Document uploaded for employee");
      setEmployeeId(""); setName(""); setDocumentType("other"); setFile(null);
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Upload Employee Document</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
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
          <div>
            <Label>Document Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="e.g. Offer Letter" />
          </div>
          <div>
            <Label>Document Type</Label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            >
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>File *</Label>
            <div className="mt-1 flex items-center gap-3">
              <FilePicker onFile={setFile} />
              {file && (
                <span className="text-sm text-muted-foreground truncate max-w-[180px]">{file.name}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Accepted: PDF, Word, images (max ~15 MB)</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !employeeId || !name.trim() || !file}
          >
            {mutation.isPending ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Template Dialog (Create / Edit) ──────────────────────────────────────────

function TemplateDialog({ open, onClose, template }: { open: boolean; onClose: () => void; template?: any }) {
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Template" : "New Letter Template"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          <div>
            <Label>Template Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="e.g. Offer Letter, Experience Letter" />
          </div>
          <div>
            <Label>Body (HTML) *</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1">
              Variables:{" "}
              {["{{employee_name}}", "{{designation}}", "{{joining_date}}", "{{date}}", "{{employee_code}}"].map((v) => (
                <code key={v} className="bg-secondary px-1 rounded text-xs mr-1">{v}</code>
              ))}
            </p>
            <Textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="mt-1 font-mono text-xs"
              rows={16}
              placeholder="<p>Dear {{employee_name}},</p>..."
            />
          </div>
        </div>
        <DialogFooter className="pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => {
            if (!name.trim()) { toast.error("Template name is required"); return; }
            if (!bodyHtml.trim()) { toast.error("Template body is required"); return; }
            mutation.mutate({ name, bodyHtml });
          }} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : isEdit ? "Update Template" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Generate Letter Dialog ────────────────────────────────────────────────────

function GenerateLetterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [templateId, setTemplateId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const { data: templates } = useQuery({ queryKey: ["letter-templates"], queryFn: () => fetchApi<any[]>("/letters/templates") });
  const { data: employees } = useEmployees({ status: "active" });
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => fetchApi("/letters/generate", { method: "POST", body: JSON.stringify({ templateId, employeeId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["letter-generated"] });
      onClose(); setTemplateId(""); setEmployeeId("");
      toast.success("Letter generated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setTemplateId(""); setEmployeeId(""); } }}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Generate Letter from Template</DialogTitle></DialogHeader>
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

// ── Letter Preview Dialog ─────────────────────────────────────────────────────

function LetterPreviewDialog({ letter, onClose }: { letter: any; onClose: () => void }) {
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${letter.templateName} — ${letter.employeeName}</title>
      <style>body{font-family:'Times New Roman',serif;font-size:12pt;margin:2cm;color:#000;line-height:1.6}
      h1,h2,h3{font-family:Arial,sans-serif}@media print{body{margin:1cm}}</style></head>
      <body>${letter.generatedHtml}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  return (
    <Dialog open={!!letter} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{letter?.templateName} — {letter?.employeeName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto border border-border rounded-lg p-6 bg-white text-sm" style={{ fontFamily: "serif", lineHeight: "1.8" }}>
          <div dangerouslySetInnerHTML={{ __html: letter?.generatedHtml ?? "" }} />
        </div>
        <DialogFooter className="pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={print}><Download className="w-4 h-4 mr-1.5" /> Print / Download PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Default template HTML ─────────────────────────────────────────────────────
const DEFAULT_TEMPLATE_HTML = `<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px;">
  <div style="text-align: right; margin-bottom: 30px;"><p>Date: {{date}}</p></div>
  <p>To,</p><p><strong>{{employee_name}}</strong></p><br/>
  <p>Dear {{first_name}},</p>
  <p>This letter is to certify that <strong>{{employee_name}}</strong> (Employee Code: {{employee_code}})
  is employed with our organization as <strong>{{designation}}</strong> since {{joining_date}}.</p>
  <p>This letter is issued as per the request of the individual for submission wherever required.</p>
  <br/><p>For [Company Name],</p><br/><br/>
  <p>______________________</p><p>HR Manager</p>
</div>`;

// ── Main Component ────────────────────────────────────────────────────────────

export default function Letters() {
  const { data: user } = useCurrentUser();
  const isPrivileged = user?.role === "super_admin" || user?.role === "hr_admin";

  const qc = useQueryClient();

  // ── Data queries ──
  const { data: templates, isLoading: tLoading } = useQuery({
    queryKey: ["letter-templates"],
    queryFn: () => fetchApi<any[]>("/letters/templates"),
    enabled: isPrivileged,
  });
  const { data: generated, isLoading: gLoading } = useQuery({
    queryKey: ["letter-generated"],
    queryFn: () => fetchApi<any[]>("/letters/generated"),
  });
  const { data: companyDocs, isLoading: cdLoading } = useQuery({
    queryKey: ["company-docs"],
    queryFn: () => fetchApi<any[]>("/documents/company"),
  });
  const { data: employeeDocs, isLoading: edLoading } = useQuery({
    queryKey: ["employee-docs"],
    queryFn: () => fetchApi<any[]>("/documents/employee"),
  });

  // ── Dialog states ──
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [previewLetter, setPreviewLetter] = useState<any>(null);
  const [uploadCompanyOpen, setUploadCompanyOpen] = useState(false);
  const [uploadEmployeeOpen, setUploadEmployeeOpen] = useState(false);

  // ── Mutations ──
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
  const deleteCompanyDoc = useMutation({
    mutationFn: (id: string) => fetchApi(`/documents/company/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["company-docs"] }); toast.success("Document removed"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteEmployeeDoc = useMutation({
    mutationFn: (id: string) => fetchApi(`/documents/employee/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee-docs"] }); toast.success("Document deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Download helpers ──
  const downloadCompanyDoc = async (doc: any) => {
    try {
      const res = await fetchApi<{ fileName: string; mimeType: string; fileData: string }>(
        `/documents/company/${doc.id}/download`
      );
      downloadFromBase64(res.fileData, res.fileName, res.mimeType);
    } catch (e: any) { toast.error(e.message); }
  };
  const downloadEmployeeDoc = async (doc: any) => {
    try {
      const res = await fetchApi<{ fileName: string; mimeType: string; fileData: string }>(
        `/documents/employee/${doc.id}/download`
      );
      downloadFromBase64(res.fileData, res.fileName, res.mimeType);
    } catch (e: any) { toast.error(e.message); }
  };

  // ── Tab layout ──
  // HR: company-docs | employee-letters | templates
  // Employee: company-docs | my-letters
  const defaultTab = isPrivileged ? "company-docs" : "company-docs";

  return (
    <PageContainer>
      <PageHeader title="Documents & Letters" breadcrumbs={[{ label: "Documents & Letters" }]} />

      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="company-docs">
            <BookOpen className="w-4 h-4 mr-1.5" />Company Documents
          </TabsTrigger>
          {isPrivileged && (
            <TabsTrigger value="employee-letters">
              <User className="w-4 h-4 mr-1.5" />Employee Letters
            </TabsTrigger>
          )}
          {!isPrivileged && (
            <TabsTrigger value="my-letters">
              <FileText className="w-4 h-4 mr-1.5" />My Letters
            </TabsTrigger>
          )}
          {isPrivileged && (
            <TabsTrigger value="templates">
              <Edit2 className="w-4 h-4 mr-1.5" />Letter Templates
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── COMPANY DOCUMENTS ── */}
        <TabsContent value="company-docs">
          {isPrivileged && (
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={() => setUploadCompanyOpen(true)}>
                <Upload className="w-4 h-4 mr-1.5" /> Upload Document
              </Button>
            </div>
          )}
          {!isPrivileged && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5 text-sm text-blue-700">
              <BookOpen className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Company policies and documents are available below for reference. These are read-only.</span>
            </div>
          )}
          {cdLoading ? (
            <div className="text-center py-20 text-muted-foreground">Loading...</div>
          ) : !companyDocs || companyDocs.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No company documents yet</p>
              {isPrivileged && <p className="text-xs mt-1">Click "Upload Document" to add policies, handbooks, or SOPs.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {companyDocs.map((doc: any) => (
                <div key={doc.id} className="bg-white border border-border rounded-lg shadow-sm p-5 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0 text-xl">
                      {fileCategoryIcon(doc.mimeType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{doc.name}</p>
                      <span className="inline-block text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full mt-0.5">
                        {CATEGORY_LABELS[doc.category] ?? doc.category}
                      </span>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(doc.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1" onClick={() => downloadCompanyDoc(doc)}>
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                    </Button>
                    {isPrivileged && (
                      <Button size="sm" variant="ghost" className="px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => { if (confirm(`Remove "${doc.name}"?`)) deleteCompanyDoc.mutate(doc.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── EMPLOYEE LETTERS (HR view) ── */}
        {isPrivileged && (
          <TabsContent value="employee-letters">
            <div className="flex gap-2 justify-end mb-4">
              <Button size="sm" variant="outline" onClick={() => setUploadEmployeeOpen(true)}>
                <Upload className="w-4 h-4 mr-1.5" /> Upload File
              </Button>
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                <Send className="w-4 h-4 mr-1.5" /> Generate from Template
              </Button>
            </div>

            {/* Generated letters */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Generated Letters</h3>
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
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                    ) : !generated || generated.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No letters generated yet.</td></tr>
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
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600"
                              onClick={() => { if (confirm(`Delete letter for ${letter.employeeName}?`)) deleteLetter.mutate(letter.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Uploaded employee documents */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Uploaded Documents</h3>
              <div className="bg-white border border-border rounded-lg shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-5 py-3">Employee</th>
                      <th className="text-left px-5 py-3">Document Name</th>
                      <th className="text-left px-5 py-3">Type</th>
                      <th className="text-left px-5 py-3">File</th>
                      <th className="text-left px-5 py-3">Uploaded</th>
                      <th className="text-right px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edLoading ? (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                    ) : !employeeDocs || employeeDocs.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No documents uploaded yet.</td></tr>
                    ) : employeeDocs.map((doc: any, i: number) => (
                      <tr key={doc.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                        <td className="px-5 py-3 font-medium text-foreground">{doc.employeeName}</td>
                        <td className="px-5 py-3 text-foreground">{doc.name}</td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}</td>
                        <td className="px-5 py-3 text-muted-foreground text-xs truncate max-w-[140px]">
                          {fileCategoryIcon(doc.mimeType)} {doc.fileName}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(doc.createdAt)}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => downloadEmployeeDoc(doc)} title="Download">
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600"
                              onClick={() => { if (confirm(`Delete "${doc.name}"?`)) deleteEmployeeDoc.mutate(doc.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        )}

        {/* ── MY LETTERS (Employee view) ── */}
        {!isPrivileged && (
          <TabsContent value="my-letters">
            {/* Generated letters as cards */}
            {(generated && generated.length > 0) && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">Letters from HR</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {generated.map((letter: any) => (
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
                      <Button size="sm" variant="outline" className="w-full" onClick={() => setPreviewLetter(letter)}>
                        <Eye className="w-3.5 h-3.5 mr-1.5" /> View & Print
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Uploaded documents as cards */}
            {(employeeDocs && employeeDocs.length > 0) && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">Documents</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {employeeDocs.map((doc: any) => (
                    <div key={doc.id} className="bg-white border border-border rounded-lg shadow-sm p-5 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0 text-xl">
                          {fileCategoryIcon(doc.mimeType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">{doc.name}</p>
                          <span className="text-xs text-muted-foreground">{DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(doc.createdAt)}</p>
                        </div>
                      </div>
                      <Button size="sm" className="w-full" onClick={() => downloadEmployeeDoc(doc)}>
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {(!generated || generated.length === 0) && (!employeeDocs || employeeDocs.length === 0) && (
              <div className="text-center py-20 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No letters or documents yet</p>
                <p className="text-xs mt-1">Your HR team will upload documents here for you.</p>
              </div>
            )}
          </TabsContent>
        )}

        {/* ── LETTER TEMPLATES (HR only) ── */}
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
                          <Button size="sm" variant="ghost" className="h-7 px-2"
                            onClick={() => { setEditTemplate(t); setTemplateDialogOpen(true); }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-600"
                            onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteTemplate.mutate(t.id); }}>
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
      </Tabs>

      {/* ── Dialogs ── */}
      <TemplateDialog
        key={editTemplate?.id ?? "new"}
        open={templateDialogOpen}
        onClose={() => { setTemplateDialogOpen(false); setEditTemplate(null); }}
        template={editTemplate}
      />
      <GenerateLetterDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
      <UploadCompanyDocDialog open={uploadCompanyOpen} onClose={() => setUploadCompanyOpen(false)} />
      <UploadEmployeeDocDialog open={uploadEmployeeOpen} onClose={() => setUploadEmployeeOpen(false)} />
      {previewLetter && <LetterPreviewDialog letter={previewLetter} onClose={() => setPreviewLetter(null)} />}
    </PageContainer>
  );
}
