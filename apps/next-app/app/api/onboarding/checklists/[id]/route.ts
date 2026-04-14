import { db } from "@workspace/db";
import { onboardingChecklistsTable, onboardingTasksTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const [checklist] = await db.select().from(onboardingChecklistsTable).where(eq(onboardingChecklistsTable.id, id));
    if (!checklist) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(await buildChecklist(checklist));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
