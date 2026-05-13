import { db } from "@workspace/db";
import { assetsTable, assetCategoriesTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";
import { fireAutomationEvent } from "@/lib/automations";

async function enrichAsset(asset: typeof assetsTable.$inferSelect) {
  const [cat] = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.id, asset.categoryId));
  let assignedToName: string | null = null;
  if (asset.assignedToId) {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, asset.assignedToId));
    assignedToName = emp ? `${emp.firstName} ${emp.lastName}` : null;
  }
  return {
    ...asset,
    categoryName: cat?.name ?? "",
    assignedToName,
    assignedAt: asset.assignedAt?.toISOString() ?? null,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "it_admin"])) return forbidden();

    const { id } = await params;
    const { condition, notes } = await request.json() as { condition?: string; notes?: string };

    const [existing] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
    const prevEmployeeId = existing?.assignedToId;

    await db.update(assetsTable).set({ status: "available", assignedToId: null, assignedAt: null, condition: condition ?? undefined }).where(eq(assetsTable.id, id));
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));

    if (!asset) return Response.json({ error: "Not found" }, { status: 404 });

    if (prevEmployeeId) {
      fireAutomationEvent({
        event: "asset.returned",
        employeeId: prevEmployeeId,
        variables: { assetName: asset.name, assetCode: asset.assetCode },
      }).catch(console.error);
    }

    return Response.json(await enrichAsset(asset));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
