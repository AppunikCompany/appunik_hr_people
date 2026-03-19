import { useState } from "react";
import { useAttendanceTeam, useHolidays, fetchApi } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";

function AddHolidayDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    name: "",
    date: "",
    type: "national",
    year: new Date().getFullYear(),
  });
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (d: any) => fetchApi("/holidays", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["holidays"] }); onClose(); toast.success("Holiday added"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Holiday</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
          <div><Label>Date *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value, year: new Date(e.target.value).getFullYear() }))} className="mt-1" /></div>
          <div>
            <Label>Type</Label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm bg-background">
              <option value="national">National</option>
              <option value="optional">Optional</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>{mutation.isPending ? "Adding..." : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Attendance() {
  const [search, setSearch] = useState("");
  const [addHoliday, setAddHoliday] = useState(false);
  const { data: team, isLoading } = useAttendanceTeam();

  const filtered = team?.filter((e: any) =>
    !search || e.employeeName.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const wfo = team?.filter((e: any) => e.status === "wfo").length ?? 0;
  const wfh = team?.filter((e: any) => e.status === "wfh").length ?? 0;
  const absent = team?.filter((e: any) => e.status === "absent").length ?? 0;

  return (
    <PageContainer>
      <PageHeader
        title="Attendance"
        subtitle={`Today — ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
        breadcrumbs={[{ label: "Attendance" }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => setAddHoliday(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Holiday
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
          <p className="text-2xl font-semibold text-green-600">{wfo}</p>
          <p className="text-sm text-muted-foreground mt-1">In Office</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
          <p className="text-2xl font-semibold text-blue-600">{wfh}</p>
          <p className="text-sm text-muted-foreground mt-1">Work From Home</p>
        </div>
        <div className="bg-white border border-border rounded-lg p-4 shadow-sm text-center">
          <p className="text-2xl font-semibold text-red-500">{absent}</p>
          <p className="text-sm text-muted-foreground mt-1">Absent</p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-lg shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-5 py-3">Employee</th>
                <th className="text-left px-5 py-3">Department</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Clock In</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No records found</td></tr>
              ) : filtered.map((entry: any, i: number) => (
                <tr key={entry.employeeId} className={i % 2 === 0 ? "bg-white" : "bg-background"}>
                  <td className="px-5 py-3 font-medium text-foreground">{entry.employeeName}</td>
                  <td className="px-5 py-3 text-muted-foreground">{entry.department ?? "—"}</td>
                  <td className="px-5 py-3"><StatusBadge status={entry.status} /></td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {entry.clockIn ? new Date(entry.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddHolidayDialog open={addHoliday} onClose={() => setAddHoliday(false)} />
    </PageContainer>
  );
}
