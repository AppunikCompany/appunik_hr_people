import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  assetsTable,
  assetCategoriesTable,
  assetAssignmentsTable,
  employeesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function nextAssetCode(): Promise<string> {
  const all = await db.select({ code: assetsTable.assetCode }).from(assetsTable);
  const nums = all
    .map((a) => parseInt(a.code.replace("AST-", ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `AST-${String(next).padStart(3, "0")}`;
}

async function enrichAsset(asset: typeof assetsTable.$inferSelect) {
  const [cat] = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.id, asset.categoryId));
  let assignedToName: string | null = null;
  if (asset.assignedToId) {
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, asset.assignedToId));
    assignedToName = emp ? `${emp.firstName} ${emp.lastName}` : null;
  }
  return {
    ...asset,
    categoryName: cat?.name ?? "",
    assignedToName,
    assignedAt: asset.assignedAt?.toISOString() ?? null,
  };
}

router.get("/assets/categories", async (_req, res) => {
  try {
    const cats = await db.select().from(assetCategoriesTable);
    res.json(cats);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/assets/categories", async (req, res) => {
  try {
    const [cat] = await db.insert(assetCategoriesTable).values(req.body).returning();
    res.status(201).json(cat);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/assets", async (req, res) => {
  try {
    const { status, category, assignedTo } = req.query as Record<string, string>;
    let assets = await db.select().from(assetsTable);
    if (status) assets = assets.filter((a) => a.status === status);
    if (category) assets = assets.filter((a) => a.categoryId === category);
    if (assignedTo) assets = assets.filter((a) => a.assignedToId === assignedTo);
    const enriched = await Promise.all(assets.map(enrichAsset));
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/assets", async (req, res) => {
  try {
    const code = await nextAssetCode();
    const [asset] = await db.insert(assetsTable).values({ ...req.body, assetCode: code, status: "available" }).returning();
    res.status(201).json(await enrichAsset(asset));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/assets/:id", async (req, res) => {
  try {
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, req.params.id));
    if (!asset) return res.status(404).json({ error: "Not found" });
    res.json(await enrichAsset(asset));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/assets/:id", async (req, res) => {
  try {
    const [asset] = await db.update(assetsTable).set(req.body).where(eq(assetsTable.id, req.params.id)).returning();
    if (!asset) return res.status(404).json({ error: "Not found" });
    res.json(await enrichAsset(asset));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/assets/:id/assign", async (req, res) => {
  try {
    const { employeeId, notes } = req.body;
    const now = new Date();

    const [asset] = await db
      .update(assetsTable)
      .set({ status: "assigned", assignedToId: employeeId, assignedAt: now })
      .where(eq(assetsTable.id, req.params.id))
      .returning();

    if (!asset) return res.status(404).json({ error: "Not found" });

    const [assignment] = await db
      .insert(assetAssignmentsTable)
      .values({ assetId: req.params.id, employeeId, notes })
      .returning();

    res.json(assignment);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/assets/:id/return", async (req, res) => {
  try {
    const { condition, notes } = req.body;
    const [asset] = await db
      .update(assetsTable)
      .set({ status: "available", assignedToId: null, assignedAt: null, condition: condition ?? undefined })
      .where(eq(assetsTable.id, req.params.id))
      .returning();

    if (!asset) return res.status(404).json({ error: "Not found" });
    res.json(await enrichAsset(asset));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
