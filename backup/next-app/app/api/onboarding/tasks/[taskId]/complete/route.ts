import { db } from "@workspace/db";
import { onboardingTasksTable, onboardingChecklistsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { fireAutomationEvent } from "@/lib/automations";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { taskId } = await params;
    await db.update(onboardingTasksTable).set({ isCompleted: true, completedAt: new Date() }).where(eq(onboardingTasksTable.id, taskId));
    const [task] = await db.select().from(onboardingTasksTable).where(eq(onboardingTasksTable.id, taskId));
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });

    const [checklist] = await db
      .select()
      .from(onboardingChecklistsTable)
      .where(eq(onboardingChecklistsTable.id, task.checklistId));

    if (checklist) {
      const allTasks = await db
        .select()
        .from(onboardingTasksTable)
        .where(eq(onboardingTasksTable.checklistId, checklist.id));
      const allDone = allTasks.every((t) => t.isCompleted);
      fireAutomationEvent({ event: "onboarding.task_completed", employeeId: checklist.employeeId }).catch(console.error);
      if (allDone) {
        fireAutomationEvent({ event: "onboarding.completed", employeeId: checklist.employeeId }).catch(console.error);
      }
    }

    return Response.json(task);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
