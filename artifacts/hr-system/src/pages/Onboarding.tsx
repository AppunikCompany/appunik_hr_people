import { useState } from "react";
import { useOnboardingChecklists, useEmployees, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Plus, CheckCircle, Circle } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_TASKS = [
  { title: "System account setup", assignedTo: "IT Admin", assignedRole: "it_admin" },
  { title: "Email & communication tools access", assignedTo: "IT Admin", assignedRole: "it_admin" },
  { title: "ID card issuance", assignedTo: "HR Admin", assignedRole: "hr_admin" },
  { title: "Offer letter & joining documents", assignedTo: "HR Admin", assignedRole: "hr_admin" },
  { title: "Asset allocation (laptop/devices)", assignedTo: "IT Admin", assignedRole: "it_admin" },
  { title: "Induction & org overview", assignedTo: "HR Admin", assignedRole: "hr_admin" },
  { title: "Team introduction", assignedTo: "Manager", assignedRole: "manager" },
  { title: "KRA / goal setting", assignedTo: "Manager", assignedRole: "manager" },
  { title: "Benefits & policies walkthrough", assignedTo: "HR Admin", assignedRole: "hr_admin" },
];

function CreateChecklistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [empId, setEmpId] = useState("");
  const { data: employees } = useEmployees();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => fetchApi("/onboarding/checklists", {
      method: "POST",
      body: JSON.stringify({ employeeId: empId, tasks: DEFAULT_TASKS }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding"] }); onClose(); toast.success("Checklist created"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Create Onboarding Checklist</DialogTitle></DialogHeader>
        <div className="py-2">
          <Label>Employee *</Label>
          <Select value={empId} onValueChange={setEmpId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee..." /></SelectTrigger>
            <SelectContent>
              {employees?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">A default checklist with {DEFAULT_TASKS.length} tasks will be created.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!empId || mutation.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Onboarding() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState<any>(null);
  const { data: checklists, isLoading } = useOnboardingChecklists();
  const qc = useQueryClient();

  const completeTask = useMutation({
    mutationFn: (taskId: string) => fetchApi(`/onboarding/tasks/${taskId}/complete`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["onboarding"] }); toast.success("Task completed"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Onboarding"
        breadcrumbs={[{ label: "Onboarding" }]}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Checklist</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Loading...</div>
          ) : !checklists || checklists.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No onboarding checklists</div>
          ) : checklists.map((cl: any) => (
            <div
              key={cl.id}
              onClick={() => setSelectedChecklist(cl)}
              className={`bg-white border rounded-lg p-4 cursor-pointer shadow-sm hover:border-primary transition-colors ${selectedChecklist?.id === cl.id ? "border-primary" : "border-border"}`}
            >
              <p className="font-medium text-foreground">{cl.employeeName}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatDate(cl.createdAt)}</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${cl.totalCount > 0 ? (cl.completedCount / cl.totalCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{cl.completedCount}/{cl.totalCount}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2">
          {selectedChecklist ? (
            <div className="bg-white border border-border rounded-lg shadow-sm">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-sm font-semibold">{selectedChecklist.employeeName} — Onboarding Tasks</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedChecklist.completedCount} of {selectedChecklist.totalCount} completed</p>
              </div>
              <div className="divide-y divide-border">
                {selectedChecklist.tasks.map((task: any, i: number) => (
                  <div key={task.id} className={`flex items-center gap-4 px-5 py-3 ${i % 2 === 0 ? "bg-white" : "bg-background"}`}>
                    <button
                      onClick={() => !task.isCompleted && completeTask.mutate(task.id)}
                      className="flex-shrink-0"
                    >
                      {task.isCompleted
                        ? <CheckCircle className="w-5 h-5 text-green-500" />
                        : <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                      }
                    </button>
                    <div className="flex-1">
                      <p className={`text-sm ${task.isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</p>
                      <p className="text-xs text-muted-foreground">{task.assignedTo} · {task.assignedRole}</p>
                    </div>
                    {task.dueDate && <span className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Select a checklist to view tasks
            </div>
          )}
        </div>
      </div>

      <CreateChecklistDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageContainer>
  );
}
