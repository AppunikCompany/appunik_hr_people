import { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchApi, type AttendanceRecord } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Home, Clock, Coffee, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// ── Hook: live elapsed counter ────────────────────────────────────────────────

function useElapsed(fromIso: string | null | undefined): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!fromIso) { setSeconds(0); return; }
    const start = new Date(fromIso).getTime();
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fromIso]);
  return seconds;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  record: AttendanceRecord | null | undefined;
  compact?: boolean;
}

export function ClockWidget({ record, compact = false }: Props) {
  const qc = useQueryClient();

  // Clocked-in timer (pauses while on break)
  const workedElapsed = useElapsed(
    record?.type === "wfo" && record.clockIn && !record.clockOut && !record.isOnBreak
      ? record.clockIn
      : null
  );

  // Away timer
  const breakElapsed = useElapsed(record?.isOnBreak ? record.currentBreakStart : null);

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
    onSuccess: () => { invalidate(); toast.success("Clocked out. See you tomorrow!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const wfhMut = useMutation({
    mutationFn: () => fetchApi("/attendance/wfh", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (data: any) => {
      invalidate();
      toast.success(data?.needsApproval ? "WFH request sent — awaiting approval" : "Marked as WFH!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const awayMut = useMutation({
    mutationFn: () => fetchApi("/attendance/break-start", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { invalidate(); toast.info("Marked as Away"); },
    onError: (e: any) => toast.error(e.message),
  });

  const backMut = useMutation({
    mutationFn: () => fetchApi("/attendance/break-end", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { invalidate(); toast.success("Welcome back!"); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Not clocked in ──────────────────────────────────────────────────────────
  if (!record) {
    return (
      <div className="bg-white border border-border rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <Clock className="w-4 h-4 text-muted-foreground" />
        </div>
        {compact ? (
          <p className="text-xl font-semibold text-foreground mb-3">Not in yet</p>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">You haven't started your day yet. Choose how you're working today.</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => clockInMut.mutate()} disabled={clockInMut.isPending} className="flex-1">
            <LogIn className="w-3.5 h-3.5 mr-1.5" />
            Clock In
          </Button>
          <Button size="sm" variant="outline" onClick={() => wfhMut.mutate()} disabled={wfhMut.isPending} className="flex-1">
            <Home className="w-3.5 h-3.5 mr-1.5" />
            Mark WFH
          </Button>
        </div>
      </div>
    );
  }

  // ── WFH Pending ─────────────────────────────────────────────────────────────
  if (record.type === "wfh_pending") {
    return (
      <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
        </div>
        <p className={`font-semibold text-amber-600 ${compact ? "text-xl" : "text-lg"}`}>WFH Request Sent</p>
        <p className="text-xs text-muted-foreground mt-1">Waiting for manager approval.</p>
      </div>
    );
  }

  // ── WFH ─────────────────────────────────────────────────────────────────────
  if (record.type === "wfh") {
    return (
      <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">WFH</span>
        </div>
        <p className={`font-semibold text-blue-600 ${compact ? "text-xl" : "text-lg"}`}>Working From Home</p>
        <p className="text-xs text-muted-foreground mt-1">Have a productive day!</p>
      </div>
    );
  }

  // ── WFO: currently on a break (Away) ────────────────────────────────────────
  if (record.type === "wfo" && record.clockIn && !record.clockOut && record.isOnBreak) {
    const totalSoFar = (record.totalBreakMinutes ?? 0) + breakElapsed / 60;
    return (
      <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <Coffee className="w-3.5 h-3.5" />
            Away
          </span>
        </div>
        <p className={`font-mono font-semibold text-amber-600 ${compact ? "text-2xl" : "text-3xl"} tracking-tight`}>
          {formatHMS(breakElapsed)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">
          Away since {time(record.currentBreakStart!)}
          {record.totalBreakMinutes ? ` · Total away today: ${formatMinutes(totalSoFar)}` : ""}
        </p>
        <Button
          size="sm"
          onClick={() => backMut.mutate()}
          disabled={backMut.isPending}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white border-0"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
          I'm Back
        </Button>
      </div>
    );
  }

  // ── WFO: active at desk (clocked in, not on break, not clocked out) ──────────
  if (record.type === "wfo" && record.clockIn && !record.clockOut) {
    return (
      <div className="bg-white border border-green-200 rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            In Office
          </span>
        </div>
        <p className={`font-mono font-semibold text-foreground tracking-tight ${compact ? "text-2xl" : "text-3xl"}`}>
          {formatHMS(workedElapsed)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">
          Since {time(record.clockIn)}{record.isLate ? " · Late" : ""}
          {record.totalBreakMinutes ? ` · Away: ${formatMinutes(record.totalBreakMinutes)}` : ""}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => awayMut.mutate()}
            disabled={awayMut.isPending}
            className="flex-1 text-amber-600 hover:text-amber-700 border-amber-200 hover:bg-amber-50"
          >
            <Coffee className="w-3.5 h-3.5 mr-1.5" />
            Away
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => clockOutMut.mutate()}
            disabled={clockOutMut.isPending}
            className="flex-1 text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Clock Out
          </Button>
        </div>
      </div>
    );
  }

  // ── WFO: clocked out — day summary ──────────────────────────────────────────
  if (record.type === "wfo" && record.clockOut) {
    const clockInStr = record.clockIn ? time(record.clockIn) : "—";
    const clockOutStr = time(record.clockOut);
    return (
      <div className="bg-white border border-border rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">Done</span>
        </div>
        <p className={`font-semibold text-foreground ${compact ? "text-xl" : "text-lg"}`}>
          {record.hoursWorked != null ? `${record.hoursWorked.toFixed(1)}h worked` : "Day complete"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {clockInStr} → {clockOutStr}
          {record.isHalfDay ? " · Half day" : ""}
          {record.totalBreakMinutes ? ` · Away: ${formatMinutes(record.totalBreakMinutes)}` : ""}
        </p>
      </div>
    );
  }

  // ── Fallback (regularization-inserted or unknown type) ─────────────────────
  return (
    <div className="bg-white border border-border rounded-xl p-5 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
        <Clock className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground capitalize">{record.type?.replace(/_/g, " ")}</p>
    </div>
  );
}
