import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Employees from "@/pages/Employees";
import EmployeeDetail from "@/pages/EmployeeDetail";
import Attendance from "@/pages/Attendance";
import Leave from "@/pages/Leave";
import Onboarding from "@/pages/Onboarding";
import Assets from "@/pages/Assets";
import Performance from "@/pages/Performance";
import Reports from "@/pages/Reports";
import Automations from "@/pages/Automations";
import Settings from "@/pages/Settings";
import { useCurrentUser } from "@/hooks/useApi";
import { apiUrl } from "@/lib/utils";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function NotFound() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">404</h1>
        <p className="text-muted-foreground mt-2">Page not found</p>
      </div>
    </div>
  );
}

function LoginPage() {
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-sm p-10 w-full max-w-sm text-center">
        <div className="w-12 h-12 bg-[#2563EB] rounded-lg flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[#111827] mb-1">HR System</h1>
        <p className="text-sm text-[#6B7280] mb-6">TechNova Solutions Pvt. Ltd.</p>
        <p className="text-sm text-[#6B7280] mb-6">Sign in to access the HR Management System.</p>
        <a
          href={apiUrl("/login")}
          className="block w-full bg-[#2563EB] hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
        >
          Sign in with Replit
        </a>
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.id === null) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/employees" component={Employees} />
        <Route path="/employees/org-chart" component={Employees} />
        <Route path="/employees/:id" component={EmployeeDetail} />
        <Route path="/attendance" component={Attendance} />
        <Route path="/attendance/my" component={Attendance} />
        <Route path="/attendance/holidays" component={Attendance} />
        <Route path="/leave" component={Leave} />
        <Route path="/leave/calendar" component={Leave} />
        <Route path="/leave/balances" component={Leave} />
        <Route path="/leave/compoff" component={Leave} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/assets" component={Assets} />
        <Route path="/performance" component={Performance} />
        <Route path="/performance/cycles" component={Performance} />
        <Route path="/performance/templates" component={Performance} />
        <Route path="/reports" component={Reports} />
        <Route path="/reports/attendance" component={Reports} />
        <Route path="/reports/attrition" component={Reports} />
        <Route path="/automations" component={Automations} />
        <Route path="/automations/templates" component={Automations} />
        <Route path="/automations/logs" component={Automations} />
        <Route path="/settings" component={Settings} />
        <Route path="/settings/departments" component={Settings} />
        <Route path="/settings/designations" component={Settings} />
        <Route path="/settings/leave-policies" component={Settings} />
        <Route path="/settings/notifications" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthGate>
          <Router />
        </AuthGate>
      </WouterRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

export default App;
