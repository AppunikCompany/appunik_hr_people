import { db } from "@workspace/db";
import { exitRequestsTable, exitChecklistItemsTable, employeesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";
import { fireAutomationEvent } from "@/lib/automations";

const DEFAULT_CHECKLIST = [
  { task: "Collect resignation letter", assignedTo: "hr" },
  { task: "Conduct exit interview", assignedTo: "hr" },
  { task: "Update employee status to resigned", assignedTo: "hr" },
  { task: "Process Full & Final settlement", assignedTo: "hr" },
  { task: "Cancel health/group insurance", assignedTo: "hr" },
  { task: "Revoke email and system access", assignedTo: "it" },
  { task: "Collect laptop and accessories", assignedTo: "it" },
  { task: "Revoke VPN and tool access", assignedTo: "it" },
  { task: "Delete/archive employee data per policy", assignedTo: "it" },
  { task: "Complete knowledge transfer", assignedTo: "manager" },
  { task: "Handover ongoing projects and documentation", assignedTo: "manager" },
  { task: "Return ID card and access badge", assignedTo: "employee" },
  { task: "Return company assets (if any)", assignedTo: "employee" },
  { task: "Submit pending expense claims", assignedTo: "employee" },
  { task: "Recover salary advance/loans (if any)", assignedTo: "finance" },
  { task: "Issue Form 16 / tax documents", assignedTo: "finance" },
];

async function enrichRequest(exitReq: typeof exitRequestsTable.$inferSelect, employees: typeof employeesTable.$inferSelect[]) {
  const emp = employees.find(e => e.id === exitReq.employeeId);
  const items = await db.select().from(exitChecklistItemsTable).where(eq(exitChecklistItemsTable.exitRequestId, exitReq.id));
  const completed = items.filter(i => i.isCompleted).length;
  return {
    ...exitReq,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
    employeeCode: emp?.employeeCode ?? "",
    checklistTotal: items.length,
    checklistDone: completed,
  };
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "manager"])) return forbidden();

    const requests = await db.select().from(exitRequestsTable).orderBy(desc(exitRequestsTable.createdAt));
    const employees = await db.select().from(employeesTable);
    const result = await Promise.all(requests.map(r => enrichRequest(r, employees)));
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { employeeId, resignationDate, lastWorkingDay, reason } = await request.json() as {
      employeeId: string;
      resignationDate: string;
      lastWorkingDay: string;
      reason?: string;
    };

    const id = crypto.randomUUID();
    await db.insert(exitRequestsTable).values({ id, employeeId, resignationDate, lastWorkingDay, reason: reason ?? null });

    // Create default checklist
    for (const item of DEFAULT_CHECKLIST) {
      await db.insert(exitChecklistItemsTable).values({ id: crypto.randomUUID(), exitRequestId: id, ...item });
    }

    // Update employee record
    await db.update(employeesTable).set({ resignationDate, lastWorkingDay, status: "resigned" }).where(eq(employeesTable.id, employeeId));

    const [exitReq] = await db.select().from(exitRequestsTable).where(eq(exitRequestsTable.id, id));
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));

    fireAutomationEvent({ event: "employee.offboarding_started", employeeId, variables: { lastWorkingDay } }).catch(console.error);

    return Response.json({
      ...exitReq,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
      checklistTotal: DEFAULT_CHECKLIST.length,
      checklistDone: 0,
    }, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
