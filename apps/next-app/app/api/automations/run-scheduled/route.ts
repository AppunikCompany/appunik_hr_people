import { getAuthUser, unauthorized, forbidden, hasRole } from "@/lib/auth";
import { runScheduledAutomations } from "@/lib/automations";

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ["super_admin", "hr_admin"])) return forbidden();

    const { searchParams } = new URL(request.url);
    const today = searchParams.get("date") ?? new Date().toISOString().split("T")[0];
    await runScheduledAutomations({ today });
    return Response.json({ success: true, date: today });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
