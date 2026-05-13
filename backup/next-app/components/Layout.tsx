"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { useCurrentUser, fetchApi } from "@/hooks/useApi";
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
  LayoutDashboard,
  FileText,
  DoorOpen,
  Megaphone,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const ONBOARDING_SKIP_PATHS = ["/onboarding-setup", "/sign-in"];

function OnboardingGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ONBOARDING_SKIP_PATHS.some((p) => pathname.startsWith(p))) return;
    fetchApi<{ completed: boolean }>("/me/onboarding-status")
      .then(({ completed }) => {
        if (!completed) router.replace("/onboarding-setup");
      })
      .catch(() => {});
  }, [pathname, router]);

  return null;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    label: "Employees",
    href: "/employees",
    icon: Users,
  },
  {
    label: "Attendance",
    href: "/attendance",
    icon: Clock,
  },
  {
    label: "Leave",
    href: "/leave",
    icon: Calendar,
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
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  {
    label: "Automations",
    href: "/automations",
    icon: Zap,
  },
  {
    label: "Self-Service",
    href: "/self-service",
    icon: LayoutDashboard,
  },
  {
    label: "Letters",
    href: "/letters",
    icon: FileText,
  },
  {
    label: "Exit",
    href: "/exit",
    icon: DoorOpen,
  },
  {
    label: "Announcements",
    href: "/announcements",
    icon: Megaphone,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

function NavItemRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(item.href + "/");

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

interface LayoutProps {
  children: React.ReactNode;
}

function SidebarUserMenu({
  collapsed,
  user,
  initials,
  fullName,
  onSignOut,
}: {
  collapsed: boolean;
  user: ReturnType<typeof useCurrentUser>["data"];
  initials: string;
  fullName: string;
  onSignOut: () => void;
}) {
  return (
    <div className="border-t border-border px-2 py-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-secondary transition-colors text-left",
            )}
          >
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
              <span className="flex items-center gap-2 cursor-pointer">
                <User className="w-4 h-4" /> My Profile
              </span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onSignOut}
            className="flex items-center gap-2 text-destructive cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LayoutWithClerk({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: user } = useCurrentUser();
  const { signOut } = useClerk();

  const initials =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .map((n) => n![0])
      .join("")
      .toUpperCase() || "?";

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "User";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <OnboardingGuard />
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

        <SidebarUserMenu
          collapsed={collapsed}
          user={user}
          initials={initials}
          fullName={fullName}
          onSignOut={() => void signOut()}
        />
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

function LayoutWithoutClerk({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: user } = useCurrentUser();

  const initials =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .map((n) => n![0])
      .join("")
      .toUpperCase() || "?";

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "User";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <OnboardingGuard />
      <aside
        className={cn(
          "flex flex-col bg-white border-r border-border transition-all duration-200 flex-shrink-0",
          collapsed ? "w-14" : "w-56",
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

        <SidebarUserMenu
          collapsed={collapsed}
          user={user}
          initials={initials}
          fullName={fullName}
          onSignOut={() => {
            window.location.href = "/";
          }}
        />
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export function Layout({
  children,
  clerkEnabled,
}: LayoutProps & { clerkEnabled: boolean }) {
  if (clerkEnabled) {
    return <LayoutWithClerk>{children}</LayoutWithClerk>;
  }
  return <LayoutWithoutClerk>{children}</LayoutWithoutClerk>;
}
