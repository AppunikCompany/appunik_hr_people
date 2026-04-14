import { db } from "@workspace/db";
import { leavePoliciesTable, leaveTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const policies = await db.select().from(leavePoliciesTable);
    const types = await db.select().from(leaveTypesTable);
    const typeMap = new Map(types.map((t) => [t.id, t.name]));
    const result = policies.map((p) => ({
      ...p,
      leaveTypeName: typeMap.get(p.leaveTypeId) ?? "",
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

    const body = await request.json();
    const policyId = crypto.randomUUID();
    await db.insert(leavePoliciesTable).values({ ...body, id: policyId });
    const [policy] = await db.select().from(leavePoliciesTable).where(eq(leavePoliciesTable.id, policyId));
    const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, policy.leaveTypeId));
    return Response.json({ ...policy, leaveTypeName: lt?.name ?? "" }, { status: 201 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
