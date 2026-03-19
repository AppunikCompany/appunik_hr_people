import { useState } from "react";
import { useKraAssignments, useReviewCycles, useEmployees, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Plus, Star } from "lucide-react";
import { toast } from "sonner";

function CreateCycleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: "", cycleType: "annual", startDate: "", endDate: "", closeDate: "" });
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/kra/review-cycles", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-cycles"] }); onClose(); toast.success("Review cycle created"); },
    onError: (e: any) => toast.error(e.message),
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Review Cycle</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} className="mt-1" placeholder="e.g. Annual Review 2025-26" /></div>
          <div>
            <Label>Type</Label>
            <Select value={form.cycleType} onValueChange={v => set("cycleType", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="half_yearly">Half Yearly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Start</Label><Input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)} className="mt-1" /></div>
            <div><Label>End</Label><Input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)} className="mt-1" /></div>
            <div><Label>Close</Label><Input type="date" value={form.closeDate} onChange={e => set("closeDate", e.target.value)} className="mt-1" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>{mutation.isPending ? "Creating..." : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RateDialog({ assignment, open, onClose }: { assignment: any; open: boolean; onClose: () => void }) {
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => fetchApi(`/kra/assignments/${assignment?.id}/manager-rate`, {
      method: "POST",
      body: JSON.stringify({ managerRating: parseFloat(rating), managerComment: comment }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kra-assignments"] }); onClose(); toast.success("Rating submitted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Manager Rating</DialogTitle></DialogHeader>
        {assignment && <p className="text-sm text-muted-foreground px-1">{assignment.kraTitle} — {assignment.employeeName}</p>}
        <div className="space-y-4 py-2">
          <div>
            <Label>Rating (1–5) *</Label>
            <Input type="number" min="1" max="5" step="0.5" value={rating} onChange={e => setRating(e.target.value)} className="mt-1" />
          </div>
          <div><Label>Comment</Label><Textarea value={comment} onChange={e => setComment(e.target.value)} className="mt-1" rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!rating || mutation.isPending}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Performance() {
  const [cycleId, setCycleId] = useState("");
  const [createCycleOpen, setCreateCycleOpen] = useState(false);
  const [rateAssignment, setRateAssignment] = useState<any>(null);
  const { data: cycles } = useReviewCycles();
  const { data: assignments, isLoading } = useKraAssignments(cycleId ? { cycleId } : undefined);
  const qc = useQueryClient();

  const closeCycle = useMutation({
    mutationFn: (id: string) => fetchApi(`/kra/review-cycles/${id}/close`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-cycles"] }); toast.success("Cycle closed"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Performance Management"
        breadcrumbs={[{ label: "Performance" }]}
        actions={<Button size="sm" onClick={() => setCreateCycleOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Cycle</Button>}
      />

      <Tabs defaultValue="assignments">
        <TabsList className="mb-6">
          <TabsTrigger value="assignments">KRA Assignments</TabsTrigger>
          <TabsTrigger value="cycles">Review Cycles</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <Select value={cycleId || "all"} onValueChange={v => setCycleId(v === "all" ? "" : v)}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Filter by review cycle..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cycles</SelectItem>
                  {cycles?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Employee</th>
                    <th className="text-left px-5 py-3">KRA</th>
                    <th className="text-left px-5 py-3">Weightage</th>
                    <th className="text-left px-5 py-3">Self Rating</th>
                    <th className="text-left px-5 py-3">Manager Rating</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
                  ) : !assignments || assignments.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No KRA assignments found</td></tr>
                  ) : assignments.map((a: any, i: number) => (
                    <tr key={a.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium text-foreground">{a.employeeName}</td>
                      <td className="px-5 py-3 text-muted-foreground">{a.kraTitle}</td>
                      <td className="px-5 py-3 text-center">{a.weightage}%</td>
                      <td className="px-5 py-3 text-center">{a.selfRating ?? "—"}</td>
                      <td className="px-5 py-3 text-center">{a.managerRating ?? "—"}</td>
                      <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-5 py-3">
                        {(a.status === "self_assessed" || a.status === "pending") && (
                          <Button size="sm" variant="outline" onClick={() => setRateAssignment(a)} className="h-7 text-xs">
                            <Star className="w-3.5 h-3.5 mr-1" /> Rate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cycles">
          <div className="bg-white border border-border rounded-lg shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">Type</th>
                    <th className="text-left px-5 py-3">Period</th>
                    <th className="text-left px-5 py-3">Close Date</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="text-left px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!cycles || cycles.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No review cycles</td></tr>
                  ) : cycles.map((c: any, i: number) => (
                    <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                      <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                      <td className="px-5 py-3 text-muted-foreground capitalize">{c.cycleType.replace(/_/g, " ")}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(c.startDate)} – {formatDate(c.endDate)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(c.closeDate)}</td>
                      <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-5 py-3">
                        {c.status === "open" && (
                          <Button size="sm" variant="outline" onClick={() => closeCycle.mutate(c.id)} className="h-7 text-xs">Close</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <CreateCycleDialog open={createCycleOpen} onClose={() => setCreateCycleOpen(false)} />
      {rateAssignment && (
        <RateDialog assignment={rateAssignment} open={!!rateAssignment} onClose={() => setRateAssignment(null)} />
      )}
    </PageContainer>
  );
}
