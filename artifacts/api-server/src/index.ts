import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { config as loadDotEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env as early as possible (before any DB imports).
for (const envPath of [
  resolve(__dirname, "../.env"), // artifacts/api-server/.env
  resolve(__dirname, "../../..", ".env"), // repo root .env
]) {
  if (existsSync(envPath)) {
    loadDotEnv({ path: envPath });
    break;
  }
}

const { default: app } = await import("./app");

const rawPort =
  process.env["PORT"] ??
  (process.env.NODE_ENV === "development" ? "3001" : undefined);

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
