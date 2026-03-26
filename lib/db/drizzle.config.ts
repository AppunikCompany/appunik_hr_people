import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Ensure the database is provisioned and that ../../.env (repo root) contains DATABASE_URL."
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
