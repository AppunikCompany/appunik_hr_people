import { db } from "@workspace/db";
import { generatedLettersTable, employeesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const letters = await db.select().from(generatedLettersTable).orderBy(desc(generatedLettersTable.createdAt));
    const employees = await db.select().from(employeesTable);
    const empMap = new Map(employees.map(e => [e.id, `${e.firstName} ${e.lastName}`]));
    return Response.json(letters.map(l => ({ ...l, employeeName: empMap.get(l.employeeId) ?? "" })));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
