import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  onboardingChecklistsTable,
  onboardingTasksTable,
  employeesTable,
  employeeDocumentsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { fireAutomationEvent } from "../lib/automations";
import { PRIVILEGED_ROLES, resolveEmployeeId } from "../lib/ownership";

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

router.get("/onboarding/checklists", requireAuth, async (req, res): Promise<void> => {
  try {
    const { employeeId: clientId } = req.query as Record<string, string>;
    const user = req.user;

    let checklists = await db.select().from(onboardingChecklistsTable);

    if (!PRIVILEGED_ROLES.has(user?.role ?? "")) {
      // Employees can only see their own checklist
      const [self] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user?.id ?? ""));
      if (!self) { res.status(403).json({ error: "No employee record linked to your account" }); return; }
      checklists = checklists.filter((c) => c.employeeId === self.id);
    } else if (clientId) {
      checklists = checklists.filter((c) => c.employeeId === clientId);
    }

    const result = await Promise.all(checklists.map(buildChecklist));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/onboarding/checklists", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { employeeId, tasks } = req.body as {
      employeeId: string;
      tasks?: Array<{ title: string; assignedTo: string; assignedRole: string; dueDate?: string }>;
    };

    // Check for duplicate: if a checklist already exists for this employee, return 409
    const existing = await db
      .select()
      .from(onboardingChecklistsTable)
      .where(eq(onboardingChecklistsTable.employeeId, employeeId));
    if (existing.length > 0) {
      res.status(409).json({ error: "An onboarding checklist already exists for this employee" });
      return;
    }

    const clId = crypto.randomUUID();
    await db.insert(onboardingChecklistsTable).values({ id: clId, employeeId });
    const [checklist] = await db.select().from(onboardingChecklistsTable).where(eq(onboardingChecklistsTable.id, clId));

    if (tasks && tasks.length > 0) {
      await db.insert(onboardingTasksTable).values(
        tasks.map((t) => ({
          id: crypto.randomUUID(),
          checklistId: checklist.id,
          title: t.title,
          assignedTo: t.assignedTo,
          assignedRole: t.assignedRole,
          dueDate: t.dueDate ?? null,
        }))
      );
    }

    fireAutomationEvent({ event: "onboarding.started", employeeId }).catch(console.error);

    res.status(201).json(await buildChecklist(checklist));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/onboarding/tasks/:id/complete", requireAuth, async (req, res) => {
  try {
    await db.update(onboardingTasksTable).set({ isCompleted: true, completedAt: new Date() }).where(eq(onboardingTasksTable.id, (req.params.id as string)));
    const [task] = await db.select().from(onboardingTasksTable).where(eq(onboardingTasksTable.id, (req.params.id as string)));
    if (!task) { res.status(404).json({ error: "Not found" }); return; }

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

    res.json(task);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete("/onboarding/checklists/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const id = req.params.id as string;
    const [checklist] = await db.select().from(onboardingChecklistsTable).where(eq(onboardingChecklistsTable.id, id));
    if (!checklist) { res.status(404).json({ error: "Checklist not found" }); return; }
    // Tasks will cascade delete via FK constraint
    await db.delete(onboardingTasksTable).where(eq(onboardingTasksTable.checklistId, id));
    await db.delete(onboardingChecklistsTable).where(eq(onboardingChecklistsTable.id, id));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── OB-03: Document submission tracker — employee uploads, HR verifies ──
router.get("/onboarding/documents/:employeeId", requireAuth, async (req, res): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    const docs = await db.select().from(employeeDocumentsTable).where(eq(employeeDocumentsTable.employeeId, empId));

    // Expected document types for onboarding
    const requiredDocs = ["offer_letter", "pan_card", "aadhaar", "degree", "nda", "bank_details", "photo"];
    const submittedMap = new Map(docs.map((d) => [d.documentType, d]));

    const tracker = requiredDocs.map((docType) => {
      const doc = submittedMap.get(docType);
      return {
        documentType: docType,
        status: doc ? (doc.verifiedAt ? "verified" : "submitted") : "pending",
        fileName: doc?.fileName ?? null,
        fileUrl: doc?.fileUrl ?? null,
        uploadedAt: doc?.uploadedAt ?? null,
        verifiedAt: doc?.verifiedAt ?? null,
        verifiedBy: doc?.verifiedBy ?? null,
      };
    });

    res.json(tracker);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── OB-03: HR verifies a submitted document ──
router.post("/onboarding/documents/:docId/verify", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res): Promise<void> => {
  try {
    const docId = req.params.docId as string;
    await db.update(employeeDocumentsTable)
      .set({ verifiedAt: new Date(), verifiedBy: req.user?.id ?? null })
      .where(eq(employeeDocumentsTable.id, docId));
    const [doc] = await db.select().from(employeeDocumentsTable).where(eq(employeeDocumentsTable.id, docId));
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── OB-04: Account setup checklist with specialized task types ──
router.post("/onboarding/checklists/:id/setup-tasks", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res): Promise<void> => {
  try {
    const checklistId = req.params.id as string;
    const [checklist] = await db.select().from(onboardingChecklistsTable).where(eq(onboardingChecklistsTable.id, checklistId));
    if (!checklist) { res.status(404).json({ error: "Checklist not found" }); return; }

    // Default IT account setup tasks
    const setupTasks = [
      { title: "Create company email account", assignedTo: "IT Admin", assignedRole: "it_admin" },
      { title: "Set up Slack workspace access", assignedTo: "IT Admin", assignedRole: "it_admin" },
      { title: "Grant GitHub/GitLab repository access", assignedTo: "IT Admin", assignedRole: "it_admin" },
      { title: "Provision project management tools (Jira/Trello)", assignedTo: "IT Admin", assignedRole: "it_admin" },
      { title: "Set up VPN and security credentials", assignedTo: "IT Admin", assignedRole: "it_admin" },
      { title: "Configure development environment", assignedTo: "IT Admin", assignedRole: "it_admin" },
    ];

    await db.insert(onboardingTasksTable).values(
      setupTasks.map((t) => ({
        id: crypto.randomUUID(),
        checklistId,
        title: t.title,
        assignedTo: t.assignedTo,
        assignedRole: t.assignedRole,
      }))
    );

    res.status(201).json(await buildChecklist(checklist));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── OB-06: Auto-trigger asset assignment on joining ──
// This fires when onboarding starts (already called in POST /onboarding/checklists).
// Adding explicit endpoint to trigger asset assignment checklist for a new joiner.
router.post("/onboarding/checklists/:id/assign-assets", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res): Promise<void> => {
  try {
    const checklistId = req.params.id as string;
    const [checklist] = await db.select().from(onboardingChecklistsTable).where(eq(onboardingChecklistsTable.id, checklistId));
    if (!checklist) { res.status(404).json({ error: "Checklist not found" }); return; }

    const assetTasks = [
      { title: "Assign laptop", assignedTo: "IT Admin", assignedRole: "it_admin" },
      { title: "Assign monitor/display", assignedTo: "IT Admin", assignedRole: "it_admin" },
      { title: "Assign keyboard & mouse", assignedTo: "IT Admin", assignedRole: "it_admin" },
      { title: "Assign headset", assignedTo: "IT Admin", assignedRole: "it_admin" },
      { title: "Assign access card/badge", assignedTo: "HR Admin", assignedRole: "hr_admin" },
    ];

    await db.insert(onboardingTasksTable).values(
      assetTasks.map((t) => ({
        id: crypto.randomUUID(),
        checklistId,
        title: t.title,
        assignedTo: t.assignedTo,
        assignedRole: t.assignedRole,
      }))
    );

    fireAutomationEvent({ event: "onboarding.started", employeeId: checklist.employeeId }).catch(console.error);

    res.status(201).json(await buildChecklist(checklist));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
