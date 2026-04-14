import { db } from "@workspace/db";
import { automationRulesTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";
import { fireAutomationEvent } from "@/lib/automations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { id } = await params;
    const [rule] = await db.select().from(automationRulesTable).where(eq(automationRulesTable.id, id));
    if (!rule) return Response.json({ error: "Rule not found" }, { status: 404 });

    // Trigger for all active employees
    const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));
    let triggered = 0;
    for (const emp of employees) {
      await fireAutomationEvent({ event: rule.triggerEvent ?? "employee.created", employeeId: emp.id });
      triggered++;
    }

    return Response.json({ triggered, ruleId: id, ruleName: rule.name });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
