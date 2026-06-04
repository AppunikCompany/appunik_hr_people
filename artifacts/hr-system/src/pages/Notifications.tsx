import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useNotifications, fetchApi, type AppNotification } from "@/hooks/useApi";
import { PageHeader, PageContainer } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { CheckCheck, Bell, BellOff, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<string, string> = {
  "leave.applied":               "📋",
  "leave.approved":              "✅",
  "leave.rejected":              "❌",
  "leave.balance_low":           "⚠️",
  "wfh.approved":                "🏠",
  "wfh.rejected":                "❌",
  "regularization.approved":     "✅",
  "regularization.rejected":     "❌",
  "attendance.clock_in_reminder":"⏰",
  "attendance.clock_out_reminder":"⏰",
  "asset.assigned":              "💻",
  "document.uploaded":           "📄",
  "onboarding.started":          "🎉",
  "employee.joined":             "👋",
  "birthday":                    "🎂",
  "work_anniversary":            "🎉",
  "kra.assigned":                "🎯",
  "announcement":                "📢",
  "holiday.announcement":        "🏖️",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function groupByDate(items: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const map = new Map<string, AppNotification[]>();

  for (const n of items) {
    const d = new Date(n.createdAt).toDateString();
    const label = d === today ? "Today" : d === yesterday ? "Yesterday" : new Date(n.createdAt).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(n);
  }

  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

export default function Notifications() {
  const { data: notifications = [], isLoading } = useNotifications();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const markRead = useMutation({
    mutationFn: (id: string) => fetchApi(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => fetchApi("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const handleClick = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const groups = groupByDate(notifications);

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        breadcrumbs={[{ label: "Notifications" }]}
        actions={
          unreadCount > 0 ? (
            <Button size="sm" variant="outline" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              <CheckCheck className="w-4 h-4 mr-1.5" />
              Mark all as read
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">Loading notifications…</div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <BellOff className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-sm">You're all caught up! No notifications yet.</p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {group.label}
              </p>
              <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm divide-y divide-secondary">
                {group.items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-secondary/50 transition-colors",
                      !n.isRead && "bg-blue-50/60 hover:bg-blue-50"
                    )}
                  >
                    {/* Unread dot */}
                    <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", !n.isRead ? "bg-blue-500" : "bg-transparent")} />

                    {/* Icon */}
                    <span className="text-lg leading-none shrink-0 mt-0.5">
                      {TYPE_ICONS[n.type] ?? "🔔"}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", !n.isRead ? "font-semibold text-foreground" : "text-foreground")}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>

                    {n.link && <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
