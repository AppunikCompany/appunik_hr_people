import { db } from "@workspace/db";
import { automationRulesTable, emailTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const rules = await db.select().from(automationRulesTable);
    const templates = await db.select().from(emailTemplatesTable);
    const tmplMap = new Map(templates.map((t) => [t.id, t.name]));
    const result = rules.map((r) => ({
      ...r,
      templateName: tmplMap.get(r.templateId) ?? "",
    }));
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const id = crypto.randomUUID();
    const { name, code, triggerType, triggerEvent, cronExpr, templateId, recipients, isActive } = await request.json() as {
      name: string; code: string; triggerType: string; triggerEvent?: string; cronExpr?: string;
      templateId: string; recipients: string; isActive?: boolean;
    };
    await db.insert(automationRulesTable).values({
      id, name, code, triggerType,
      triggerEvent: triggerEvent || null,
      cronExpr: cronExpr || null,
      templateId, recipients,
      isActive: isActive ?? true,
    });
    const [rule] = await db.select().from(automationRulesTable).where(eq(automationRulesTable.id, id));
    const [tmpl] = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.id, rule.templateId));
    return Response.json({ ...rule, templateName: tmpl?.name ?? "" }, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
