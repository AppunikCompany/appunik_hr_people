import { db } from "@workspace/db";
import { automationRulesTable, emailTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    const { isActive } = await request.json() as { isActive: boolean };
    await db.update(automationRulesTable).set({ isActive }).where(eq(automationRulesTable.id, id));
    const [rule] = await db.select().from(automationRulesTable).where(eq(automationRulesTable.id, id));
    if (!rule) return Response.json({ error: "Not found" }, { status: 404 });
    const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, rule.templateId));
    return Response.json({ ...rule, templateName: tmpl?.name ?? "" });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    await db.delete(automationRulesTable).where(eq(automationRulesTable.id, id));
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
