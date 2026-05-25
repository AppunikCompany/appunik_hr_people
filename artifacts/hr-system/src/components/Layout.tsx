import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { useClerk } from "@clerk/clerk-react";
import { cn } from "@/lib/utils";
import { useCurrentUser, useCompanyProfile } from "@/hooks/useApi";
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
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const HAS_CLERK = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: string;
  children?: { label: string; href: string }[];
}

const ALL_NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Employees",
    href: "/employees",
    icon: Users,
    module: "employees",
    children: [
      { label: "All Employees", href: "/employees" },
      { label: "Org Chart", href: "/employees/org-chart" },
    ],
  },
  {
    label: "Attendance",
    href: "/attendance",
    icon: Clock,
    module: "attendance",
    // children are role-filtered in the layout render
    children: [
      { label: "Daily View", href: "/attendance", roles: ["super_admin", "hr_admin", "manager", "it_admin"] },
      { label: "My Attendance", href: "/attendance/my" },
      { label: "Holidays", href: "/attendance/holidays" },
    ] as any,
  },
  {
    label: "Leave",
    href: "/leave",
    icon: Calendar,
    module: "leave",
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
    module: "onboarding",
  },
  {
    label: "Assets",
    href: "/assets",
    icon: Package,
    module: "assets",
  },
  {
    label: "Performance",
    href: "/performance",
    icon: Target,
    module: "performance",
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
    module: "reports",
    children: [
      { label: "Headcount", href: "/reports" },
      { label: "Attendance", href: "/reports/attendance" },
      { label: "WFH / WFO", href: "/reports/wfh" },
      { label: "Attrition", href: "/reports/attrition" },
      { label: "Asset Inventory", href: "/reports/assets" },
      { label: "KRA Performance", href: "/reports/kra" },
    ],
  },
  {
    label: "Automations",
    href: "/automations",
    icon: Zap,
    module: "automations",
    children: [
      { label: "Rules", href: "/automations" },
      { label: "Email Templates", href: "/automations/templates" },
      { label: "Logs", href: "/automations/logs" },
    ],
  },
  {
    label: "Letters",
    href: "/letters",
    icon: FileText,
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
    module: "settings",
    children: [
      { label: "Company Profile", href: "/settings" },
      { label: "Departments", href: "/settings/departments" },
      { label: "Designations", href: "/settings/designations" },
      { label: "Leave Policies", href: "/settings/leave-policies" },
      { label: "Notifications", href: "/settings/notifications" },
      { label: "Roles", href: "/settings/roles" },
    ],
  },
];

function NavItemRow({ item, collapsed, userRole }: { item: NavItem; collapsed: boolean; userRole?: string }) {
  const [isActive] = useRoute(item.href + "/:rest*");
  const [isExact] = useRoute(item.href);
  const active = isActive || isExact;
  const [open, setOpen] = useState(active);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  if (item.children) {
    // Filter children by role when a child has a `roles` whitelist
    const visibleChildren = item.children.filter((child: any) =>
      !child.roles || child.roles.includes(userRole ?? "employee")
    );
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          title={collapsed ? item.label : undefined}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all duration-150",
            active
              ? "bg-foreground text-background font-medium"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-150", open && "rotate-180")} />
            </>
          )}
        </button>
        {!collapsed && open && (
          <div className="ml-3 mt-0.5 pl-4 border-l border-border space-y-0.5 py-0.5">
            {visibleChildren.map((child: any) => (
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
        title={collapsed ? item.label : undefined}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg cursor-pointer transition-all duration-150",
          active
            ? "bg-foreground text-background font-medium"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
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
          "flex items-center px-2 py-1.5 text-xs rounded-md cursor-pointer transition-colors",
          isExact
            ? "text-foreground font-semibold"
            : "text-muted-foreground hover:text-foreground"
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

function ClerkLogoutItem() {
  const { signOut } = useClerk();

  return (
    <DropdownMenuItem onClick={() => signOut()} className="flex items-center gap-2 text-destructive cursor-pointer">
      <LogOut className="w-4 h-4" /> Logout
    </DropdownMenuItem>
  );
}

export function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: user } = useCurrentUser();
  const { data: companyProfile } = useCompanyProfile();

  const systemName = companyProfile?.name ? `${companyProfile.name}'s HR System` : "HR System";

  useEffect(() => {
    document.title = systemName;
  }, [systemName]);

  // Filter nav items based on user permissions
  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (!item.module) return true; // Self-Service has no module restriction
    if (!user) return false;
    if (user.role === "super_admin") return true;
    const perm = user.permissions?.[item.module];
    return perm?.view === true;
  });

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
          collapsed ? "w-[60px]" : "w-[220px]"
        )}
      >
        {/* Brand header */}
        <div className={cn(
          "flex items-center border-b border-border h-14 flex-shrink-0",
          collapsed ? "px-3 justify-center" : "px-4 gap-2.5"
        )}>
          <Link href="/">
            <span className={cn("flex items-center gap-2.5 cursor-pointer", collapsed ? "" : "flex-1 min-w-0")}>
              <div className="w-7 h-7 bg-foreground rounded-lg flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity">
                <Building2 className="w-4 h-4 text-background" />
              </div>
              {!collapsed && (
                <span className="text-[13px] font-semibold text-foreground truncate leading-tight hover:text-primary transition-colors">{systemName}</span>
              )}
            </span>
          </Link>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="text-muted-foreground hover:text-foreground p-0.5 flex-shrink-0"
              title="Collapse sidebar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center py-2 text-muted-foreground hover:text-foreground border-b border-border"
            title="Expand sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navItems.map((item) => (
            <NavItemRow key={item.href} item={item} collapsed={collapsed} userRole={user?.role} />
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-border px-2 py-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-secondary transition-colors text-left",
              )}>
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarImage src={user?.profileImageUrl ?? undefined} />
                  <AvatarFallback className="text-xs bg-foreground text-background font-semibold">{initials}</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{fullName}</p>
                    <p className="text-[11px] text-muted-foreground truncate capitalize">{user?.role ?? "employee"}</p>
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
              {HAS_CLERK ? (
                <ClerkLogoutItem />
              ) : (
                <DropdownMenuItem disabled className="flex items-center gap-2 text-muted-foreground cursor-not-allowed">
                  <LogOut className="w-4 h-4" /> Logout (auth disabled)
                </DropdownMenuItem>
              )}
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
