import { db } from "@workspace/db";
import { emailTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const templates = await db.select().from(emailTemplatesTable);
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
    const etId = crypto.randomUUID();
    await db.insert(emailTemplatesTable).values({ ...body, id: etId, variables: body.variables ?? [], isActive: body.isActive ?? true });
    const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, etId));
    return Response.json(tmpl, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
