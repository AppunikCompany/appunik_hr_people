import { db } from "@workspace/db";
import { generatedLettersTable, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const [letter] = await db.select().from(generatedLettersTable).where(eq(generatedLettersTable.id, id));
    if (!letter) return Response.json({ error: "Not found" }, { status: 404 });
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, letter.employeeId));
    return Response.json({ ...letter, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "" });
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
    await db.delete(generatedLettersTable).where(eq(generatedLettersTable.id, id));
    return new Response(null, { status: 204 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
