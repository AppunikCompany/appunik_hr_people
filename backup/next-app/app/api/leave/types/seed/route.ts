import { db } from "@workspace/db";
import { leaveTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";

const IT_LEAVE_TYPES = [
  { name: "Casual Leave", code: "CL", maxDaysPerYear: 6, accrualPerMonth: 0.5, isCarryForward: false, maxCarryForward: null, isPaidLeave: true },
  { name: "Sick Leave", code: "SL", maxDaysPerYear: 6, accrualPerMonth: 0.5, isCarryForward: false, maxCarryForward: null, isPaidLeave: true },
  { name: "Earned Leave", code: "EL", maxDaysPerYear: 15, accrualPerMonth: 1.25, isCarryForward: true, maxCarryForward: 30, isPaidLeave: true },
  { name: "Maternity Leave", code: "ML", maxDaysPerYear: 182, accrualPerMonth: null, isCarryForward: false, maxCarryForward: null, isPaidLeave: true },
  { name: "Paternity Leave", code: "PAT", maxDaysPerYear: 15, accrualPerMonth: null, isCarryForward: false, maxCarryForward: null, isPaidLeave: true },
  { name: "Bereavement Leave", code: "BL", maxDaysPerYear: 5, accrualPerMonth: null, isCarryForward: false, maxCarryForward: null, isPaidLeave: true },
  { name: "Marriage Leave", code: "MAR", maxDaysPerYear: 3, accrualPerMonth: null, isCarryForward: false, maxCarryForward: null, isPaidLeave: true },
  { name: "Loss of Pay", code: "LOP", maxDaysPerYear: 0, accrualPerMonth: null, isCarryForward: false, maxCarryForward: null, isPaidLeave: false },
  { name: "Compensatory Off", code: "CO", maxDaysPerYear: 0, accrualPerMonth: null, isCarryForward: false, maxCarryForward: null, isPaidLeave: true },
];

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const seeded: string[] = [];
    for (const lt of IT_LEAVE_TYPES) {
      const [existing] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.code, lt.code));
      if (existing) continue;
      await db.insert(leaveTypesTable).values({ id: crypto.randomUUID(), ...lt, isActive: true });
      seeded.push(lt.code);
    }
    return Response.json({ seeded });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
