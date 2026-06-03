import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignedIn, SignedOut, useAuth } from "@clerk/clerk-react";
import { Toaster } from "sonner";
import { setGetTokenFn } from "@/lib/auth-token";
import { fetchApi } from "@/hooks/useApi";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import OnboardingSetup from "@/pages/OnboardingSetup";
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
import SelfService from "@/pages/SelfService";
import Profile from "@/pages/Profile";
import Letters from "@/pages/Letters";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/**
 * Bridges Clerk's getToken into the standalone fetchApi function
 * so API calls automatically include the Bearer token.
 */
function AuthTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setGetTokenFn(getToken);
  }, [getToken]);
  return null;
}

const ONBOARDING_SKIP_PATHS = ["/onboarding-setup"];

function OnboardingGuard() {
  const [location, navigate] = useLocation();
  const { data } = useQuery<{ completed: boolean }>({
    queryKey: ["onboarding-status"],
    queryFn: () => fetchApi("/me/onboarding-status"),
    retry: false,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!data) return;
    if (ONBOARDING_SKIP_PATHS.some((p) => location.startsWith(p))) return;
    if (!data.completed) navigate("/onboarding-setup");
  }, [data, location, navigate]);
  return null;
}

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

function Router() {
  return (
    <>
      <OnboardingGuard />
      <Switch>
        <Route path="/onboarding-setup" component={OnboardingSetup} />
        <Route>
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
              <Route path="/leave/holidays" component={Leave} />
              <Route path="/leave/lwp" component={Leave} />
              <Route path="/leave/reports" component={Leave} />
              <Route path="/onboarding" component={Onboarding} />
              <Route path="/assets" component={Assets} />
              <Route path="/performance" component={Performance} />
              <Route path="/performance/cycles" component={Performance} />
              <Route path="/performance/templates" component={Performance} />
              <Route path="/reports" component={Reports} />
              <Route path="/reports/attendance" component={Reports} />
              <Route path="/reports/wfh" component={Reports} />
              <Route path="/reports/attrition" component={Reports} />
              <Route path="/reports/assets" component={Reports} />
              <Route path="/reports/kra" component={Reports} />
              <Route path="/automations" component={Automations} />
              <Route path="/automations/templates" component={Automations} />
              <Route path="/automations/logs" component={Automations} />
              <Route path="/settings" component={Settings} />
              <Route path="/settings/departments" component={Settings} />
              <Route path="/settings/designations" component={Settings} />
              <Route path="/settings/leave-policies" component={Settings} />
              <Route path="/settings/notifications" component={Settings} />
              <Route path="/settings/roles" component={Settings} />
              <Route path="/letters" component={Letters} />
              <Route path="/self-service" component={SelfService} />
              <Route path="/profile" component={Profile} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </Route>
      </Switch>
    </>
  );
}

function App() {
  // Dev-friendly mode: allow running without Clerk keys.
  // Backend supports dev auth bypass (hr_admin) when NODE_ENV !== "production".
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="p-4 border-b border-border bg-muted text-sm text-muted-foreground">
            Running without Clerk auth. Set <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> to enable login.
          </div>
          <Router />
        </WouterRouter>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <AuthTokenBridge />
        <SignedIn>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </SignedIn>
        <SignedOut>
          <div className="flex items-center justify-center min-h-screen bg-background">
            <SignIn
              routing="hash"
              appearance={{
                elements: {
                  // Hide "Don't have an account? Sign up" — access is invite-only
                  footerAction__signUp: { display: "none" },
                },
              }}
            />
          </div>
        </SignedOut>
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
