import { db } from "@workspace/db";
import { automationLogsTable, automationRulesTable, employeesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const logs = await db
      .select()
      .from(automationLogsTable)
      .orderBy(desc(automationLogsTable.sentAt))
      .limit(limit);

    const rules = await db.select().from(automationRulesTable);
    const employees = await db.select().from(employeesTable);
    const ruleMap = new Map(rules.map((r) => [r.id, r.name]));
    const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

    const result = logs.map((l) => ({
      ...l,
      ruleName: ruleMap.get(l.ruleId) ?? "",
      employeeName: l.employeeId ? (empMap.get(l.employeeId) ?? null) : null,
    }));

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
