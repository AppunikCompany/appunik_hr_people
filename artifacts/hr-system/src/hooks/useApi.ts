import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/utils";

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: () => fetchApi<{
      id: string | null;
      username?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      role: string;
      employeeId?: string | null;
      profileImageUrl?: string | null;
    }>("/auth/user"),
    retry: false,
  });
}

export function useEmployees(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["employees", params],
    queryFn: () => fetchApi<any[]>(`/employees${qs}`),
  });
}

export function useEmployee(id: string | null) {
  return useQuery({
    queryKey: ["employee", id],
    queryFn: () => fetchApi<any>(`/employees/${id}`),
    enabled: !!id,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => fetchApi<any[]>("/admin/departments"),
  });
}

export function useDesignations() {
  return useQuery({
    queryKey: ["designations"],
    queryFn: () => fetchApi<any[]>("/admin/designations"),
  });
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: ["leave-types"],
    queryFn: () => fetchApi<any[]>("/leave/types"),
  });
}

export function useLeaveRequests(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["leave-requests", params],
    queryFn: () => fetchApi<any[]>(`/leave/requests${qs}`),
  });
}

export function useLeaveBalances(employeeId?: string) {
  return useQuery({
    queryKey: ["leave-balances", employeeId],
    queryFn: () => fetchApi<any[]>(`/leave/balances${employeeId ? "?employeeId=" + employeeId : ""}`),
    enabled: !!employeeId,
  });
}

export function useAttendanceTeam() {
  return useQuery({
    queryKey: ["attendance-team"],
    queryFn: () => fetchApi<any[]>("/attendance/team"),
  });
}

export function useHolidays(year?: number) {
  return useQuery({
    queryKey: ["holidays", year],
    queryFn: () => fetchApi<any[]>(`/holidays?year=${year ?? new Date().getFullYear()}`),
  });
}

export function useAssets(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["assets", params],
    queryFn: () => fetchApi<any[]>(`/assets${qs}`),
  });
}

export function useAssetCategories() {
  return useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => fetchApi<any[]>("/assets/categories"),
  });
}

export function useKraAssignments(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["kra-assignments", params],
    queryFn: () => fetchApi<any[]>(`/kra/assignments${qs}`),
  });
}

export function useReviewCycles() {
  return useQuery({
    queryKey: ["review-cycles"],
    queryFn: () => fetchApi<any[]>("/kra/review-cycles"),
  });
}

export function useHeadcountReport() {
  return useQuery({
    queryKey: ["headcount-report"],
    queryFn: () => fetchApi<any>("/reports/headcount"),
  });
}

export function useOnboardingChecklists(employeeId?: string) {
  return useQuery({
    queryKey: ["onboarding", employeeId],
    queryFn: () => fetchApi<any[]>(`/onboarding/checklists${employeeId ? "?employeeId=" + employeeId : ""}`),
  });
}

export function useAutomationRules() {
  return useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => fetchApi<any[]>("/automations/rules"),
  });
}

export function useAutomationLogs() {
  return useQuery({
    queryKey: ["automation-logs"],
    queryFn: () => fetchApi<any[]>("/automations/logs?limit=100"),
  });
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: () => fetchApi<any[]>("/automations/email-templates"),
  });
}

export function useCompanyProfile() {
  return useQuery({
    queryKey: ["company-profile"],
    queryFn: () => fetchApi<any>("/admin/company-profile"),
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: ["notification-settings"],
    queryFn: () => fetchApi<any[]>("/admin/notification-settings"),
  });
}
