import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();

/** Get latest 60 notifications for the logged-in user */
router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(60);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Unread count (lightweight — polled every 30s by the bell) */
router.get("/notifications/unread-count", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const rows = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
    res.json({ count: rows.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Mark a single notification as read */
router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, req.params.id as string), eq(notificationsTable.userId, userId)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Mark all notifications as read */
router.patch("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.userId, userId));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
