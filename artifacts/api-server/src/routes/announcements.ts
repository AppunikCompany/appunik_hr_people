import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { announcementsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";

const router: IRouter = Router();

router.get("/announcements", requireAuth, async (_req, res) => {
  try {
    const announcements = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.isPinned), desc(announcementsTable.createdAt));
    const today = new Date().toISOString().split("T")[0];
    const active = announcements.filter(a => a.isActive && (!a.expiryDate || a.expiryDate >= today));
    res.json(active);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.get("/announcements/all", requireAuth, requireRole("super_admin", "hr_admin"), async (_req, res) => {
  try {
    const announcements = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt));
    res.json(announcements);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.post("/announcements", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const id = crypto.randomUUID();
    const poster = (req as any).user;
    await db.insert(announcementsTable).values({
      id, ...req.body,
      postedByUserId: poster?.id ?? null,
      postedByName: poster ? `${poster.firstName ?? ""} ${poster.lastName ?? ""}`.trim() || poster.email || "HR" : "HR",
    });
    const [ann] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id));
    res.status(201).json(ann);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.patch("/announcements/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.update(announcementsTable).set(req.body).where(eq(announcementsTable.id, req.params.id as string));
    const [ann] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, req.params.id as string));
    if (!ann) { res.status(404).json({ error: "Not found" }); return; }
    res.json(ann);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

router.delete("/announcements/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db.delete(announcementsTable).where(eq(announcementsTable.id, req.params.id as string));
    res.status(204).send();
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

export default router;
