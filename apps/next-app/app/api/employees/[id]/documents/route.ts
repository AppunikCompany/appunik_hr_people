import { db } from "@workspace/db";
import { employeesTable, employeeDocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, isPrivileged } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const docs = await db.select().from(employeeDocumentsTable).where(eq(employeeDocumentsTable.employeeId, id));
    return Response.json(docs);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id: targetId } = await params;
    const body = await request.json();

    // Non-privileged users can only upload docs for themselves
    if (!isPrivileged(user)) {
      const [self] = await db.select().from(employeesTable).where(eq(employeesTable.userId, user.id));
      if (!self || self.id !== targetId) {
        return Response.json({ error: "Access denied: cannot upload documents for another employee" }, { status: 403 });
      }
    }

    const docId = crypto.randomUUID();
    await db.insert(employeeDocumentsTable).values({ ...body, id: docId, employeeId: targetId });
    const [doc] = await db.select().from(employeeDocumentsTable).where(eq(employeeDocumentsTable.id, docId));
    return Response.json(doc, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
