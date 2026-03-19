import { useState } from "react";
import { Link, useRoute } from "wouter";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useApi";
import {
  Users,
  Clock,
  Calendar,
  UserPlus,
  Package,
  Target,
  BarChart3,
  Settings,
  Zap,
  User,
  LogOut,
  Menu,
  X,
  Building2,
  ChevronDown,
  LayoutDashboard,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { label: string; href: string }[];
}

const navItems: NavItem[] = [
  {
    label: "Employees",
    href: "/employees",
    icon: Users,
    children: [
      { label: "All Employees", href: "/employees" },
      { label: "Org Chart", href: "/employees/org-chart" },
    ],
  },
  {
    label: "Attendance",
    href: "/attendance",
    icon: Clock,
    children: [
      { label: "Daily View", href: "/attendance" },
      { label: "My Attendance", href: "/attendance/my" },
      { label: "Holidays", href: "/attendance/holidays" },
    ],
  },
  {
    label: "Leave",
    href: "/leave",
    icon: Calendar,
    children: [
      { label: "Leave Requests", href: "/leave" },
      { label: "Leave Calendar", href: "/leave/calendar" },
      { label: "Leave Balances", href: "/leave/balances" },
      { label: "Comp-Off", href: "/leave/compoff" },
    ],
  },
  {
    label: "Onboarding",
    href: "/onboarding",
    icon: UserPlus,
  },
  {
    label: "Assets",
    href: "/assets",
    icon: Package,
  },
  {
    label: "Performance",
    href: "/performance",
    icon: Target,
    children: [
      { label: "KRA Assignments", href: "/performance" },
      { label: "Review Cycles", href: "/performance/cycles" },
      { label: "Templates", href: "/performance/templates" },
    ],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    children: [
      { label: "Headcount", href: "/reports" },
      { label: "Attendance", href: "/reports/attendance" },
      { label: "Attrition", href: "/reports/attrition" },
    ],
  },
  {
    label: "Automations",
    href: "/automations",
    icon: Zap,
    children: [
      { label: "Rules", href: "/automations" },
      { label: "Email Templates", href: "/automations/templates" },
      { label: "Logs", href: "/automations/logs" },
    ],
  },
  {
    label: "Self-Service",
    href: "/self-service",
    icon: LayoutDashboard,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    children: [
      { label: "Company Profile", href: "/settings" },
      { label: "Departments", href: "/settings/departments" },
      { label: "Designations", href: "/settings/designations" },
      { label: "Leave Policies", href: "/settings/leave-policies" },
      { label: "Notifications", href: "/settings/notifications" },
    ],
  },
];

function NavItemRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [isActive] = useRoute(item.href + "/:rest*");
  const [isExact] = useRoute(item.href);
  const active = isActive || isExact;

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
            "hover:bg-secondary text-foreground",
            active && "border-l-2 border-primary text-primary font-medium rounded-l-none pl-[calc(0.75rem-2px)]"
          )}
        >
          <item.icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
            </>
          )}
        </button>
        {!collapsed && open && (
          <div className="ml-7 mt-1 space-y-0.5">
            {item.children.map((child) => (
              <NavChildItem key={child.href} item={child} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link href={item.href}>
      <span
        className={cn(
          "flex items-center gap-3 px-3 py-2 text-sm rounded-md cursor-pointer transition-colors",
          "hover:bg-secondary text-foreground",
          active && "border-l-2 border-primary text-primary font-medium rounded-l-none pl-[calc(0.75rem-2px)]"
        )}
      >
        <item.icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        {!collapsed && <span>{item.label}</span>}
      </span>
    </Link>
  );
}

function NavChildItem({ item }: { item: { label: string; href: string } }) {
  const [isExact] = useRoute(item.href);
  return (
    <Link href={item.href}>
      <span
        className={cn(
          "flex items-center px-3 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
          "hover:bg-secondary text-muted-foreground hover:text-foreground",
          isExact && "text-primary font-medium"
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: user } = useCurrentUser();
  const BASE_URL = import.meta.env.BASE_URL ?? "/";

  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((n) => n![0])
    .join("")
    .toUpperCase() || "?";

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "User";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          "flex flex-col bg-white border-r border-border transition-all duration-200 flex-shrink-0",
          collapsed ? "w-14" : "w-56"
        )}
      >
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border h-14">
          <Building2 className="w-6 h-6 text-primary flex-shrink-0" />
          {!collapsed && (
            <span className="text-sm font-semibold text-foreground truncate">HR System</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-muted-foreground hover:text-foreground p-0.5"
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navItems.map((item) => (
            <NavItemRow key={item.href} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <div className="border-t border-border px-2 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-secondary transition-colors text-left",
              )}>
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarImage src={user?.profileImageUrl ?? undefined} />
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{fullName}</p>
                    <p className="text-xs text-muted-foreground truncate capitalize">{user?.role ?? "employee"}</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <span className="flex items-center gap-2 cursor-pointer"><User className="w-4 h-4" /> My Profile</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={`${BASE_URL.replace(/\/$/, "")}/api/logout`} className="flex items-center gap-2 text-destructive">
                  <LogOut className="w-4 h-4" /> Logout
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
