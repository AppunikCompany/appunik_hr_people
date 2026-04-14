import { db } from "@workspace/db";
import { assetsTable, assetCategoriesTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

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

async function nextAssetCode(): Promise<string> {
  const all = await db.select({ code: assetsTable.assetCode }).from(assetsTable);
  const nums = all
    .map((a) => parseInt(a.code.replace("AST-", ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `AST-${String(next).padStart(3, "0")}`;
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const category = searchParams.get("category") ?? undefined;
    const assignedTo = searchParams.get("assignedTo") ?? undefined;

    let assets = await db.select().from(assetsTable);
    if (status) assets = assets.filter((a) => a.status === status);
    if (category) assets = assets.filter((a) => a.categoryId === category);
    if (assignedTo) assets = assets.filter((a) => a.assignedToId === assignedTo);
    const enriched = await Promise.all(assets.map(enrichAsset));
    return Response.json(enriched);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin", "it_admin"])) return forbidden();

    const body = await request.json();
    const code = await nextAssetCode();
    const astId = crypto.randomUUID();
    await db.insert(assetsTable).values({ ...body, id: astId, assetCode: code, status: "available" });
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, astId));
    return Response.json(await enrichAsset(asset), { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
