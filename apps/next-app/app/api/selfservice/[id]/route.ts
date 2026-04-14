import { db } from "@workspace/db";
import { employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { canReadEmployee } from "@/lib/ownership";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();

    const { id: employeeId } = await params;
    const canRead = await canReadEmployee(user, employeeId);
    if (!canRead) return Response.json({ error: "Access denied" }, { status: 403 });

    const body = await request.json();
    const { phone, address, emergencyContact, emergencyPhone, gender, dateOfBirth } = body as Record<string, string>;
    const updates: Record<string, unknown> = {};
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;
    if (emergencyContact !== undefined) updates.emergencyContact = emergencyContact;
    if (emergencyPhone !== undefined) updates.emergencyPhone = emergencyPhone;
    if (gender !== undefined) updates.gender = gender;
    if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth;

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.update(employeesTable).set(updates).where(eq(employeesTable.id, employeeId));
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    return Response.json(emp);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    // Employees cannot delete their own record via self-service
    return Response.json({ error: "Not allowed" }, { status: 403 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
