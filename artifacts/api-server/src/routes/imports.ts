import { Router, type IRouter } from "express";
import { db, importLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";

const router: IRouter = Router();

// ── BI-10: Pre-formatted CSV import templates ──

const TEMPLATES: Record<string, { filename: string; headers: string[] }> = {
  employees: {
    filename: "employee_import_template.csv",
    headers: [
      "First Name", "Last Name", "Email", "Phone", "Department",
      "Designation", "Employment Type", "Joining Date", "Gender", "Date of Birth",
    ],
  },
  assets: {
    filename: "asset_import_template.csv",
    headers: [
      "Name", "Category", "Serial Number", "Purchase Date",
      "Purchase Cost", "Condition", "Notes",
    ],
  },
  kra: {
    filename: "kra_import_template.csv",
    headers: [
      "Employee Code", "Review Cycle", "KRA Title",
      "Weightage", "Target",
    ],
  },
};

router.get("/import/templates/:type", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res): Promise<void> => {
  try {
    const type = req.params.type as string;
    const template = TEMPLATES[type];
    if (!template) {
      res.status(400).json({ error: `Unknown template type: ${type}. Available: ${Object.keys(TEMPLATES).join(", ")}` });
      return;
    }

    const csv = template.headers.join(",") + "\n";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${template.filename}`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// List available template types
router.get("/import/templates", requireAuth, async (_req, res) => {
  res.json(Object.entries(TEMPLATES).map(([type, t]) => ({ type, filename: t.filename, columns: t.headers })));
});

// ── BI-11: Import history log ──
router.get("/import/history", requireAuth, requireRole("super_admin", "hr_admin", "it_admin"), async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? "50");
    const logs = await db.select().from(importLogsTable).orderBy(desc(importLogsTable.createdAt)).limit(limit);
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
