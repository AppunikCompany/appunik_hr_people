import { db } from "@workspace/db";
import { kraTemplatesTable } from "@workspace/db";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const templates = await db.select().from(kraTemplatesTable);
    return Response.json(templates);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
