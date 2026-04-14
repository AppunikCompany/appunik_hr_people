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
  employeeDocumentsTable,
  kraAssignmentsTable,
  reviewCyclesTable,
} from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { canReadEmployee } from "@/lib/ownership";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") ?? undefined;
    const type = searchParams.get("type") ?? undefined;

    if (!employeeId) {
      return Response.json({ error: "employeeId is required" }, { status: 400 });
    }

    const canRead = await canReadEmployee(user, employeeId);
    if (!canRead) return Response.json({ error: "Access denied" }, { status: 403 });

    if (type === "profile") {
      const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
      if (!emp) return Response.json({ error: "Employee not found" }, { status: 404 });
      return Response.json(emp);
    }

    if (type === "attendance") {
      const month = searchParams.get("month") ?? undefined;
      const year = searchParams.get("year") ?? undefined;
      const all = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.employeeId, employeeId));
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
      return Response.json({
        records: filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 30),
        summary: { presentDays, wfhDays, halfDays, lateDays, totalHours: Math.round(totalHours * 10) / 10 },
      });
    }

    if (type === "leave-summary") {
      const year = parseInt((searchParams.get("year") ?? "") || String(new Date().getFullYear()));
      const balances = await db.select().from(leaveBalancesTable)
        .where(and(eq(leaveBalancesTable.employeeId, employeeId), eq(leaveBalancesTable.year, year)));
      const leaveTypes = await db.select().from(leaveTypesTable);
      const ltMap = new Map(leaveTypes.map((lt) => [lt.id, lt]));
      const allRequests = await db.select().from(leaveRequestsTable)
        .where(eq(leaveRequestsTable.employeeId, employeeId))
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
      return Response.json({ balances: enrichedBalances, recentRequests });
    }

    if (type === "assets") {
      const assignments = await db.select().from(assetAssignmentsTable)
        .where(and(eq(assetAssignmentsTable.employeeId, employeeId), isNull(assetAssignmentsTable.returnedAt)));
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
      return Response.json(result);
    }

    if (type === "documents") {
      const docs = await db.select().from(employeeDocumentsTable).where(eq(employeeDocumentsTable.employeeId, employeeId));
      return Response.json(docs);
    }

    if (type === "kra") {
      const assignments = await db.select().from(kraAssignmentsTable).where(eq(kraAssignmentsTable.employeeId, employeeId));
      const cycles = await db.select().from(reviewCyclesTable);
      const cycleMap = new Map(cycles.map((c) => [c.id, c]));
      const result = assignments.map((a) => {
        const cycle = cycleMap.get(a.cycleId);
        return { ...a, cycleName: cycle?.name ?? "", cycleStatus: cycle?.status ?? "", cycleType: cycle?.cycleType ?? "" };
      });
      const byCycle = new Map<string, { cycle: typeof cycles[0] | undefined; assignments: typeof result }>();
      for (const a of result) {
        const existing = byCycle.get(a.cycleId);
        if (existing) { existing.assignments.push(a); }
        else { byCycle.set(a.cycleId, { cycle: cycleMap.get(a.cycleId), assignments: [a] }); }
      }
      const grouped = Array.from(byCycle.values()).map((g) => {
        const completed = g.assignments.filter((a) => a.status === "completed");
        const totalWeightedScore = completed.reduce((s, a) => s + (a.weightedScore ?? 0), 0);
        return {
          cycleId: g.cycle?.id ?? "",
          cycleName: g.cycle?.name ?? "",
          cycleStatus: g.cycle?.status ?? "",
          assignments: g.assignments,
          totalWeightedScore: Math.round(totalWeightedScore * 10) / 10,
          completedCount: completed.length,
          totalCount: g.assignments.length,
        };
      });
      return Response.json(grouped);
    }

    return Response.json({ error: "Invalid type parameter" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") ?? undefined;

    if (!employeeId) return Response.json({ error: "employeeId is required" }, { status: 400 });

    const canRead = await canReadEmployee(user, employeeId);
    if (!canRead) return Response.json({ error: "Access denied" }, { status: 403 });

    const body = await request.json();
    const { phone, address, emergencyContact, emergencyPhone, gender, dateOfBirth } = body as Record<string, string>;
    const updates: Record<string, unknown> = {};
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;
    if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
    if (emergencyPhone !== undefined) updates.emergencyPhone = emergencyPhone;
    if (gender !== undefined) updates.gender = gender;
    if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth;

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.update(employeesTable).set(updates).where(eq(employeesTable.id, employeeId));
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    return Response.json(emp);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
