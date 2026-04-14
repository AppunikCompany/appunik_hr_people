import { db } from "@workspace/db";
import { letterTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const templates = await db.select().from(letterTemplatesTable);
    return Response.json(templates);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const body = await request.json();
    const id = crypto.randomUUID();
    await db.insert(letterTemplatesTable).values({ id, ...body, variables: body.variables ?? [] });
    const [tmpl] = await db.select().from(letterTemplatesTable).where(eq(letterTemplatesTable.id, id));
    return Response.json(tmpl, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
