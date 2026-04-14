import { db } from "@workspace/db";
import { onboardingChecklistsTable, onboardingTasksTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole, isPrivileged } from "@/lib/auth";
import { fireAutomationEvent } from "@/lib/automations";

async function buildChecklist(checklist: typeof onboardingChecklistsTable.$inferSelect) {
  const tasks = await db
    .select()
    .from(onboardingTasksTable)
    .where(eq(onboardingTasksTable.checklistId, checklist.id));

  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, checklist.employeeId));

  return {
    ...checklist,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "",
    tasks,
    completedCount: tasks.filter((t) => t.isCompleted).length,
    totalCount: tasks.length,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("employeeId") ?? undefined;

    let checklists = await db.select().from(onboardingChecklistsTable);

    if (!isPrivileged(user)) {
      // Employees can only see their own checklist
      const [self] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user.id));
      if (!self) return Response.json({ error: "No employee record linked to your account" }, { status: 403 });
      checklists = checklists.filter((c) => c.employeeId === self.id);
    } else if (clientId) {
      checklists = checklists.filter((c) => c.employeeId === clientId);
    }

    const result = await Promise.all(checklists.map(buildChecklist));
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

    const { employeeId, tasks } = await request.json() as {
      employeeId: string;
      tasks?: Array<{ title: string; assignedTo: string; assignedRole: string; dueDate?: string }>;
    };

    const clId = crypto.randomUUID();
    await db.insert(onboardingChecklistsTable).values({ id: clId, employeeId });
    const [checklist] = await db.select().from(onboardingChecklistsTable).where(eq(onboardingChecklistsTable.id, clId));

    if (tasks && tasks.length > 0) {
      await db.insert(onboardingTasksTable).values(
        tasks.map((t) => ({
          checklistId: checklist.id,
          title: t.title,
          assignedTo: t.assignedTo,
          assignedRole: t.assignedRole,
          dueDate: t.dueDate ?? null,
        }))
      );
    }

    fireAutomationEvent({ event: "onboarding.started", employeeId }).catch(console.error);

    return Response.json(await buildChecklist(checklist), { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
