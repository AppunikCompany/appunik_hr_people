import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  employeesTable,
  attendanceRecordsTable,
  leaveRequestsTable,
  leaveBalancesTable,
  leaveTypesTable,
  assetsTable,
  assetAssignmentsTable,
  assetCategoriesTable,
} from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const PRIVILEGED_ROLES = new Set(["super_admin", "hr_admin", "it_admin", "manager"]);

function canAccessEmployee(req: Request, employeeId: string): boolean {
  if (!req.user) return false;
  if (PRIVILEGED_ROLES.has(req.user.role ?? "")) return true;
  return req.user.id === employeeId;
}

const router: IRouter = Router();

router.get("/self-service/profile/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!canAccessEmployee(req, empId)) {
      res.status(403).json({ error: "Access denied" }); return;
    }
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, empId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    res.json(emp);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/self-service/attendance/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!canAccessEmployee(req, empId)) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const { month, year } = req.query as Record<string, string>;
    const all = await db
      .select()
      .from(attendanceRecordsTable)
      .where(eq(attendanceRecordsTable.employeeId, empId));

    let filtered = all;
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      filtered = all.filter((r) => {
        const d = new Date(r.date);
        return d.getMonth() + 1 === m && d.getFullYear() === y;
      });
    }

    const presentDays = filtered.filter((r) => r.type === "wfo" && !r.isHalfDay).length;
    const wfhDays = filtered.filter((r) => r.type === "wfh").length;
    const halfDays = filtered.filter((r) => r.isHalfDay).length;
    const lateDays = filtered.filter((r) => r.isLate).length;
    const totalHours = filtered.reduce((s, r) => s + (r.hoursWorked ?? 0), 0);

    res.json({
      records: filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 30),
      summary: { presentDays, wfhDays, halfDays, lateDays, totalHours: Math.round(totalHours * 10) / 10 },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/self-service/leave-summary/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!canAccessEmployee(req, empId)) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));

    const balances = await db
      .select()
      .from(leaveBalancesTable)
      .where(and(eq(leaveBalancesTable.employeeId, empId), eq(leaveBalancesTable.year, year)));

    const leaveTypes = await db.select().from(leaveTypesTable);
    const ltMap = new Map(leaveTypes.map((lt) => [lt.id, lt]));

    const allRequests = await db
      .select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.employeeId, empId))
      .orderBy(desc(leaveRequestsTable.createdAt));

    const pendingByType = new Map<string, number>();
    for (const r of allRequests) {
      if (r.status === "pending") {
        pendingByType.set(r.leaveTypeId, (pendingByType.get(r.leaveTypeId) ?? 0) + r.days);
      }
    }

    const enrichedBalances = balances.map((b) => {
      const pending = pendingByType.get(b.leaveTypeId) ?? 0;
      return {
        ...b,
        allocated: b.balance,
        pending,
        leaveTypeName: ltMap.get(b.leaveTypeId)?.name ?? "Unknown",
        available: Math.max(0, b.balance - b.used - pending),
      };
    });

    const recentRequests = allRequests.slice(0, 10).map((r) => ({
      ...r,
      leaveTypeName: ltMap.get(r.leaveTypeId)?.name ?? "Leave",
    }));

    res.json({
      balances: enrichedBalances,
      recentRequests,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/self-service/assets/:employeeId", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = req.params.employeeId as string;
    if (!canAccessEmployee(req, empId)) {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const assignments = await db
      .select()
      .from(assetAssignmentsTable)
      .where(and(
        eq(assetAssignmentsTable.employeeId, empId),
        isNull(assetAssignmentsTable.returnedAt)
      ));

    const assetIds = assignments.map((a) => a.assetId);
    const assets = assetIds.length > 0
      ? await Promise.all(assetIds.map(async (id) => {
          const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
          return asset ?? null;
        }))
      : [];

    const categories = await db.select().from(assetCategoriesTable);
    const catMap = new Map(categories.map((c) => [c.id, c.name]));

    const result = assignments.map((a) => {
      const asset = assets.find((ast) => ast?.id === a.assetId);
      return {
        assignmentId: a.id,
        assetId: a.assetId,
        assetName: asset?.name ?? "Unknown",
        assetCode: asset?.assetCode ?? "",
        category: asset ? (catMap.get(asset.categoryId) ?? "Uncategorized") : "",
        assignedAt: a.assignedAt,
        notes: a.notes,
      };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
