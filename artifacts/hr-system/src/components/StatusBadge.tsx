import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { dot: string; text: string; label?: string }> = {
  active: { dot: "bg-green-500", text: "text-green-700", label: "Active" },
  inactive: { dot: "bg-gray-400", text: "text-gray-600", label: "Inactive" },
  on_leave: { dot: "bg-yellow-500", text: "text-yellow-700", label: "On Leave" },
  probation: { dot: "bg-blue-400", text: "text-blue-700", label: "Probation" },
  resigned: { dot: "bg-red-400", text: "text-red-700", label: "Resigned" },
  terminated: { dot: "bg-red-600", text: "text-red-800", label: "Terminated" },
  pending: { dot: "bg-yellow-500", text: "text-yellow-700", label: "Pending" },
  pending_doc: { dot: "bg-orange-500", text: "text-orange-700", label: "Doc Pending" },
  approved: { dot: "bg-green-500", text: "text-green-700", label: "Approved" },
  rejected: { dot: "bg-red-500", text: "text-red-700", label: "Rejected" },
  cancelled: { dot: "bg-gray-400", text: "text-gray-600", label: "Cancelled" },
  lop: { dot: "bg-red-400", text: "text-red-600", label: "Loss of Pay" },
  available: { dot: "bg-green-500", text: "text-green-700", label: "Available" },
  assigned: { dot: "bg-blue-500", text: "text-blue-700", label: "Assigned" },
  maintenance: { dot: "bg-yellow-500", text: "text-yellow-700", label: "Maintenance" },
  retired: { dot: "bg-gray-400", text: "text-gray-600", label: "Retired" },
  open: { dot: "bg-green-500", text: "text-green-700", label: "Open" },
  closed: { dot: "bg-gray-400", text: "text-gray-600", label: "Closed" },
  wfo: { dot: "bg-green-500", text: "text-green-700", label: "WFO" },
  wfh: { dot: "bg-blue-500", text: "text-blue-700", label: "WFH" },
  absent: { dot: "bg-red-400", text: "text-red-700", label: "Absent" },
  completed: { dot: "bg-green-500", text: "text-green-700", label: "Completed" },
  success: { dot: "bg-green-500", text: "text-green-700", label: "Success" },
  failed: { dot: "bg-red-500", text: "text-red-700", label: "Failed" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    dot: "bg-gray-400",
    text: "text-gray-600",
    label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        config.text,
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", config.dot)} />
      {config.label}
    </span>
  );
}
