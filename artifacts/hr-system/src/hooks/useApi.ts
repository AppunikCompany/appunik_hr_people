import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/utils";
import { getAuthToken } from "@/lib/auth-token";

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers,
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Domain types ────────────────────────────────────────────────────────────

export interface ModulePermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export interface AuthUser {
  id: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role: string;
  employeeId?: string | null;
  profileImageUrl?: string | null;
  permissions?: Record<string, ModulePermission>;
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: Array<{
    id: string;
    roleId: string;
    module: string;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }>;
}

export interface AdminUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  employeeId?: string | null;
  employeeCode?: string | null;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  managerId?: string | null;
  description?: string | null;
}

export interface Designation {
  id: string;
  name: string;
  departmentId?: string | null;
  level?: string | null;
}

export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  departmentName?: string | null;
  designationName?: string | null;
  reportingManagerId?: string | null;
  reportingManagerName?: string | null;
  employmentType: string;
  status: string;
  joiningDate: string;
  probationEndDate?: string | null;
  lastWorkingDay?: string | null;
  resignationDate?: string | null;
  fnfStatus?: string | null;
  userId?: string | null;
  workLocation?: string | null;
  profilePhoto?: string | null;
  zktecoMemberId?: number | null;
  zktecoDisplayId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveType {
  id: string;
  name: string;
  maxDaysPerYear: number;
  isPaid: boolean;
  isCarryForward: boolean;
  description?: string | null;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  employeeName?: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  managerComment?: string | null;
  createdAt: string;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName?: string;
  balance: number;
  used: number;
  year: number;
}

export interface AttendanceTeamEntry {
  employeeId: string;
  employeeName: string;
  department?: string | null;
  status: "wfo" | "wfh" | "absent";
  clockIn?: string | null;
  clockOut?: string | null;
  hoursWorked?: number | null;
  isLate?: boolean;
  isHalfDay?: boolean;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
  year: number;
}

export interface Asset {
  id: string;
  assetCode: string;
  name: string;
  categoryId?: string | null;
  categoryName?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  status: string;
  purchaseDate?: string | null;
  purchaseValue?: number | null;
  currentAssignee?: string | null;
  currentAssigneeName?: string | null;
  notes?: string | null;
}

export interface AssetCategory {
  id: string;
  name: string;
  description?: string | null;
}

export interface KraAssignment {
  id: string;
  employeeId: string;
  employeeName?: string;
  cycleId: string;
  cycleName?: string;
  kraTitle: string;
  weightage: number;
  target?: string | null;
  selfRating?: number | null;
  selfComment?: string | null;
  managerRating?: number | null;
  managerComment?: string | null;
  weightedScore?: number | null;
  status: string;
  createdAt: string;
}

export interface ReviewCycle {
  id: string;
  name: string;
  cycleType: string;
  startDate: string;
  endDate: string;
  closeDate: string;
  status: string;
}

export interface HeadcountReport {
  total: number;
  active: number;
  byDepartment: Array<{ department: string; count: number }>;
  byDesignation: Array<{ designation: string; count: number }>;
  byEmploymentType: Array<{ type: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

export interface OnboardingTask {
  id: string;
  checklistId: string;
  title: string;
  assignedTo: string;
  assignedRole: string;
  dueDate?: string | null;
  isCompleted: boolean;
  completedAt?: string | null;
}

export interface OnboardingChecklist {
  id: string;
  employeeId: string;
  employeeName?: string;
  tasks: OnboardingTask[];
  completedCount: number;
  totalCount: number;
  createdAt: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  triggerEvent: string;
  templateId: string;
  recipients: string;
  isActive: boolean;
  description?: string | null;
}

export interface AutomationLog {
  id: string;
  ruleId: string;
  employeeId: string;
  templateCode: string;
  recipientEmail: string;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  code: string;
  name: string;
  subject: string;
  bodyHtml: string;
  variables?: string[] | null;
}

export interface CompanyProfile {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  timezone?: string | null;
  workingDays?: string[] | null;
  workStartTime?: string | null;
  workEndTime?: string | null;
  lateGraceMinutes?: number | null;
}

export interface NotificationSetting {
  id: string;
  key: string;
  label: string;
  isEnabled: boolean;
  channel: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth-user"],
    queryFn: () => fetchApi<AuthUser>("/auth/user"),
    retry: false,
  });
}

export function useEmployees(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["employees", params],
    queryFn: () => fetchApi<Employee[]>(`/employees${qs}`),
  });
}

export function useEmployee(id: string | null) {
  return useQuery({
    queryKey: ["employee", id],
    queryFn: () => fetchApi<Employee>(`/employees/${id}`),
    enabled: !!id,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => fetchApi<Department[]>("/admin/departments"),
  });
}

export function useDesignations() {
  return useQuery({
    queryKey: ["designations"],
    queryFn: () => fetchApi<Designation[]>("/admin/designations"),
  });
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: ["leave-types"],
    queryFn: () => fetchApi<LeaveType[]>("/leave/types"),
  });
}

export function useLeaveRequests(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["leave-requests", params],
    queryFn: () => fetchApi<LeaveRequest[]>(`/leave/requests${qs}`),
  });
}

export function useLeaveBalances(employeeId?: string) {
  return useQuery({
    queryKey: ["leave-balances", employeeId],
    queryFn: () => fetchApi<LeaveBalance[]>(`/leave/balances${employeeId ? "?employeeId=" + employeeId : ""}`),
    enabled: !!employeeId,
  });
}

export function useAttendanceTeam() {
  return useQuery({
    queryKey: ["attendance-team"],
    queryFn: () => fetchApi<AttendanceTeamEntry[]>("/attendance/team"),
  });
}

export function useHolidays(year?: number) {
  return useQuery({
    queryKey: ["holidays", year],
    queryFn: () => fetchApi<Holiday[]>(`/holidays?year=${year ?? new Date().getFullYear()}`),
  });
}

export function useAssets(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["assets", params],
    queryFn: () => fetchApi<Asset[]>(`/assets${qs}`),
  });
}

export function useAssetCategories() {
  return useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => fetchApi<AssetCategory[]>("/assets/categories"),
  });
}

export function useKraAssignments(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["kra-assignments", params],
    queryFn: () => fetchApi<KraAssignment[]>(`/kra/assignments${qs}`),
  });
}

export function useReviewCycles() {
  return useQuery({
    queryKey: ["review-cycles"],
    queryFn: () => fetchApi<ReviewCycle[]>("/kra/review-cycles"),
  });
}

export function useHeadcountReport() {
  return useQuery({
    queryKey: ["headcount-report"],
    queryFn: () => fetchApi<HeadcountReport>("/reports/headcount"),
  });
}

export function useOnboardingChecklists(employeeId?: string) {
  return useQuery({
    queryKey: ["onboarding", employeeId],
    queryFn: () => fetchApi<OnboardingChecklist[]>(`/onboarding/checklists${employeeId ? "?employeeId=" + employeeId : ""}`),
  });
}

export function useAutomationRules() {
  return useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => fetchApi<AutomationRule[]>("/automations/rules"),
  });
}

export function useAutomationLogs() {
  return useQuery({
    queryKey: ["automation-logs"],
    queryFn: () => fetchApi<AutomationLog[]>("/automations/logs?limit=100"),
  });
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: () => fetchApi<EmailTemplate[]>("/automations/email-templates"),
  });
}

export function useCompanyProfile() {
  return useQuery({
    queryKey: ["company-profile"],
    queryFn: () => fetchApi<CompanyProfile>("/admin/company-profile"),
  });
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: ["notification-settings"],
    queryFn: () => fetchApi<NotificationSetting[]>("/admin/notification-settings"),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: () => fetchApi<Role[]>("/admin/roles"),
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchApi<AdminUser[]>("/admin/users"),
  });
}
