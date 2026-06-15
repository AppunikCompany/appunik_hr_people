import { useState, useEffect } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { fetchApi, type AttendanceRecord } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Home, Clock, Coffee, RotateCcw, MoonStar, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

// Working-hours window: 8:00 AM – 10:00 PM
function isWithinWorkingHours(): boolean {
  const h = new Date().getHours();
  return h >= 8 && h < 22;
}

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

// ── Break History ────────────────────────────────────────────────────────────

function BreakHistory({ breaks, isOnBreak, currentBreakStart }: {
  breaks?: AttendanceRecord["breaks"];
  isOnBreak?: boolean;
  currentBreakStart?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const completed = (breaks ?? []).filter((b) => b.breakEnd);
  const total = completed.length + (isOnBreak ? 1 : 0);
  if (total === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {total} away period{total !== 1 ? "s" : ""} today
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {(breaks ?? []).map((b, i) => (
            <div key={b.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Coffee className="w-3 h-3 text-amber-500" />
                <span className="font-mono">{time(b.breakStart ?? "")}</span>
                <span>→</span>
                <span className="font-mono">{b.breakEnd ? time(b.breakEnd) : <span className="text-amber-500 italic">ongoing</span>}</span>
              </div>
              {b.durationMinutes != null && (
                <span className="text-amber-600 font-medium">{formatMinutes(b.durationMinutes)}</span>
              )}
            </div>
          ))}
          {isOnBreak && !breaks?.find((b) => !b.breakEnd) && currentBreakStart && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <Coffee className="w-3 h-3" />
              <span className="font-mono">{time(currentBreakStart)}</span>
              <span>→</span>
              <span className="italic">ongoing…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  record: AttendanceRecord | null | undefined;
  compact?: boolean;
}

export function ClockWidget({ record, compact = false }: Props) {
  const qc = useQueryClient();

  // Re-evaluate window every minute so the UI reacts when the clock crosses 8 AM or 10 PM
  const [withinHours, setWithinHours] = useState(isWithinWorkingHours());
  useEffect(() => {
    const id = setInterval(() => setWithinHours(isWithinWorkingHours()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  // ── Outside working hours (before 8 AM or after 10 PM) ─────────────────────
  if (!withinHours) {
    return (
      <div className="bg-white border border-border rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <MoonStar className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className={`font-semibold text-muted-foreground ${compact ? "text-lg" : "text-base"}`}>Outside working hours</p>
        <p className="text-xs text-muted-foreground mt-1">Clock-in is available between 8:00 AM and 10:00 PM.</p>
      </div>
    );
  }

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
  // ── WFH: currently on a break (Away) ────────────────────────────────────────
  if (record.type === "wfh" && record.isOnBreak) {
    const totalSoFar = (record.totalBreakMinutes ?? 0) + breakElapsed / 60;
    return (
      <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <Coffee className="w-3.5 h-3.5" />
            Away · WFH
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
        <BreakHistory breaks={record.breaks} isOnBreak={record.isOnBreak} currentBreakStart={record.currentBreakStart} />
      </div>
    );
  }

  // ── WFH: checked out — day summary ─────────────────────────────────────────
  if (record.type === "wfh" && record.clockOut) {
    return (
      <div className="bg-white border border-border rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">Done · WFH</span>
        </div>
        <p className={`font-semibold text-foreground ${compact ? "text-xl" : "text-lg"}`}>
          {record.hoursWorked != null ? `${record.hoursWorked.toFixed(1)}h worked` : "Day complete"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Checked out at {time(record.clockOut)}
          {record.isHalfDay ? " · Half day" : ""}
          {record.totalBreakMinutes ? ` · Away: ${formatMinutes(record.totalBreakMinutes)}` : ""}
        </p>
        <BreakHistory breaks={record.breaks} isOnBreak={false} />
      </div>
    );
  }

  // ── WFH: active (not on break) ───────────────────────────────────────────────
  if (record.type === "wfh") {
    return (
      <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Attendance</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            WFH
          </span>
        </div>
        <p className={`font-semibold text-blue-600 ${compact ? "text-xl" : "text-lg"}`}>Working From Home</p>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Have a productive day!
          {record.totalBreakMinutes ? ` · Away: ${formatMinutes(record.totalBreakMinutes)}` : ""}
        </p>
        {withinHours && (
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
              Check Out
            </Button>
          </div>
        )}
        <BreakHistory breaks={record.breaks} isOnBreak={false} />
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
        {withinHours && (
          <Button
            size="sm"
            onClick={() => backMut.mutate()}
            disabled={backMut.isPending}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white border-0"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            I'm Back
          </Button>
        )}
        <BreakHistory breaks={record.breaks} isOnBreak={record.isOnBreak} currentBreakStart={record.currentBreakStart} />
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
        {withinHours && (
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
        )}
        <BreakHistory breaks={record.breaks} isOnBreak={record.isOnBreak} currentBreakStart={record.currentBreakStart} />
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
        <BreakHistory breaks={record.breaks} isOnBreak={false} />
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
