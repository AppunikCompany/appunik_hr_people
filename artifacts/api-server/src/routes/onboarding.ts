import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  onboardingChecklistsTable,
  onboardingTasksTable,
  employeesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

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

router.get("/onboarding/checklists", async (req, res) => {
  try {
    const { employeeId } = req.query as Record<string, string>;
    let checklists = await db.select().from(onboardingChecklistsTable);
    if (employeeId) checklists = checklists.filter((c) => c.employeeId === employeeId);
    const result = await Promise.all(checklists.map(buildChecklist));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/onboarding/checklists", async (req, res) => {
  try {
    const { employeeId, tasks } = req.body;
    const [checklist] = await db
      .insert(onboardingChecklistsTable)
      .values({ employeeId })
      .returning();

    if (tasks?.length > 0) {
      await db.insert(onboardingTasksTable).values(
        tasks.map((t: { title: string; assignedTo: string; assignedRole: string; dueDate?: string }) => ({
          checklistId: checklist.id,
          title: t.title,
          assignedTo: t.assignedTo,
          assignedRole: t.assignedRole,
          dueDate: t.dueDate ?? null,
        }))
      );
    }

    res.status(201).json(await buildChecklist(checklist));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/onboarding/tasks/:id/complete", async (req, res) => {
  try {
    const [task] = await db
      .update(onboardingTasksTable)
      .set({ isCompleted: true, completedAt: new Date() })
      .where(eq(onboardingTasksTable.id, req.params.id))
      .returning();
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
