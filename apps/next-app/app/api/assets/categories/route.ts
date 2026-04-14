import { db } from "@workspace/db";
import { assetCategoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const cats = await db.select().from(assetCategoriesTable);
    return Response.json(cats);
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
    const catId = crypto.randomUUID();
    await db.insert(assetCategoriesTable).values({ ...body, id: catId });
    const [cat] = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.id, catId));
    return Response.json(cat, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
