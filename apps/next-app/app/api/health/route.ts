import { HealthCheckResponse } from "@workspace/api-zod";

export async function GET() {
  const data = HealthCheckResponse.parse({ status: "ok" });
  return Response.json(data);
}
