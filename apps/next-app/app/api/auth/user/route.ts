import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return Response.json({ id: null, role: "guest" });
  }

  return Response.json({
    id: user.id,
    username: user.firstName,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
    email: user.email,
    role: user.role ?? "employee",
    employeeId: user.employeeId,
  });
}
