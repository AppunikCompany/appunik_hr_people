import { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchApi, type AttendanceRecord } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Home, Clock } from "lucide-react";
import { toast } from "sonner";

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Props {
  record: AttendanceRecord | null | undefined;
  compact?: boolean; // for dashboard stat-card layout
}

export function ClockWidget({ record, compact = false }: Props) {
  const qc = useQueryClient();
  const [elapsed, setElapsed] = useState(0);

  // Live timer when clocked in but not yet out
  useEffect(() => {
    if (record?.type === "wfo" && record.clockIn && !record.clockOut) {
      const start = new Date(record.clockIn).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }
    setElapsed(0);
  }, [record?.clockIn, record?.clockOut, record?.type]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["attendance-today"] });
    qc.invalidateQueries({ queryKey: ["attendance-team"] });
  };

  const clockInMut = useMutation({
    mutationFn: () => fetchApi("/attendance/clock-in", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { invalidate(); toast.success("Clocked in!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const clockOutMut = useMutation({
    mutationFn: () => fetchApi("/attendance/clock-out", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { invalidate(); toast.success("Clocked out!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const wfhMut = useMutation({
    mutationFn: () => fetchApi("/attendance/wfh", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (data: any) => {
      invalidate();
      toast.success(data?.needsApproval ? "WFH request submitted — awaiting approval" : "Marked as WFH!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const base = compact
    ? "bg-white border rounded-xl p-5 shadow-md flex flex-col gap-3"
    : "bg-white border rounded-xl p-5 shadow-md";

  // ── Not clocked in yet ───────────────────────────────────────────────────────
  if (!record) {
    return (
      <div className={`${base} border-border`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <Clock className="w-4 h-4 text-muted-foreground" />
        </div>
        {compact ? (
          <>
            <p className="text-2xl font-semibold text-foreground">Not in yet</p>
            <p className="text-xs text-muted-foreground -mt-1">Choose how you're working today</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mt-3 mb-4">You haven't clocked in yet. Choose how you're working today.</p>
        )}
        <div className={`flex gap-2 ${compact ? "" : "mt-2"}`}>
          <Button
            size="sm"
            onClick={() => clockInMut.mutate()}
            disabled={clockInMut.isPending}
            className="flex-1"
          >
            <LogIn className="w-4 h-4 mr-1.5" />
            Clock In
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => wfhMut.mutate()}
            disabled={wfhMut.isPending}
            className="flex-1"
          >
            <Home className="w-4 h-4 mr-1.5" />
            Mark WFH
          </Button>
        </div>
      </div>
    );
  }

  // ── WFH pending approval ─────────────────────────────────────────────────────
  if (record.type === "wfh_pending") {
    return (
      <div className={`${base} border-amber-200`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
        </div>
        <p className={`font-semibold text-amber-600 ${compact ? "text-xl mt-1" : "text-lg mt-3"}`}>WFH Request Sent</p>
        <p className="text-xs text-muted-foreground mt-0.5">Waiting for manager approval.</p>
      </div>
    );
  }

  // ── WFH approved ─────────────────────────────────────────────────────────────
  if (record.type === "wfh") {
    return (
      <div className={`${base} border-blue-200`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">WFH</span>
        </div>
        <p className={`font-semibold text-blue-600 ${compact ? "text-xl mt-1" : "text-lg mt-3"}`}>Working From Home</p>
        <p className="text-xs text-muted-foreground mt-0.5">Have a productive day!</p>
      </div>
    );
  }

  // ── WFO — active (clocked in, not yet out) ───────────────────────────────────
  if (record.type === "wfo" && record.clockIn && !record.clockOut) {
    const clockInTime = new Date(record.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return (
      <div className={`${base} border-green-200`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            In Office
          </span>
        </div>
        <p className={`font-mono font-semibold text-foreground tracking-tight ${compact ? "text-2xl mt-1" : "text-3xl mt-3"}`}>
          {formatElapsed(elapsed)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Clocked in at {clockInTime}{record.isLate ? " · Late" : ""}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => clockOutMut.mutate()}
          disabled={clockOutMut.isPending}
          className={`w-full text-orange-600 hover:text-orange-700 border-orange-200 hover:bg-orange-50 ${compact ? "mt-1" : "mt-4"}`}
        >
          <LogOut className="w-4 h-4 mr-1.5" />
          Clock Out
        </Button>
      </div>
    );
  }

  // ── WFO — done (clocked out) ─────────────────────────────────────────────────
  if (record.type === "wfo" && record.clockOut) {
    const clockInTime = record.clockIn
      ? new Date(record.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
      : "—";
    const clockOutTime = new Date(record.clockOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return (
      <div className={`${base} border-border`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">Done</span>
        </div>
        <p className={`font-semibold text-foreground ${compact ? "text-xl mt-1" : "text-lg mt-3"}`}>
          {record.hoursWorked != null ? `${record.hoursWorked.toFixed(1)}h worked` : "Day complete"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          In: {clockInTime} · Out: {clockOutTime}{record.isHalfDay ? " · Half day" : ""}
        </p>
      </div>
    );
  }

  // Fallback (e.g. regularization-inserted record)
  return (
    <div className={`${base} border-border`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
        <Clock className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground mt-3 capitalize">{record.type?.replace(/_/g, " ")}</p>
    </div>
  );
}
