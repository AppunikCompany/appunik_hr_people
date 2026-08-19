import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { companyDocumentsTable, hrEmployeeLettersTable, employeesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/authMiddleware";
import { getRequestEmployeeId, isDocumentAdmin } from "../lib/ownership";
import { notifyEmployee } from "../lib/notify";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY DOCUMENTS  (policies, handbooks — all employees read, HR/admin write)
// ─────────────────────────────────────────────────────────────────────────────

/** List (metadata only — no fileData to keep response small) */
router.get("/documents/company", requireAuth, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: companyDocumentsTable.id,
        name: companyDocumentsTable.name,
        description: companyDocumentsTable.description,
        category: companyDocumentsTable.category,
        fileName: companyDocumentsTable.fileName,
        mimeType: companyDocumentsTable.mimeType,
        isActive: companyDocumentsTable.isActive,
        createdAt: companyDocumentsTable.createdAt,
      })
      .from(companyDocumentsTable)
      .where(eq(companyDocumentsTable.isActive, true))
      .orderBy(desc(companyDocumentsTable.createdAt));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Upload a new company document */
router.post("/documents/company", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { name, description, category, fileName, fileData, mimeType } =
      req.body as {
        name?: string; description?: string; category?: string;
        fileName?: string; fileData?: string; mimeType?: string;
      };

    if (!name?.trim()) { res.status(400).json({ error: "Document name is required" }); return; }
    if (!fileName?.trim()) { res.status(400).json({ error: "File name is required" }); return; }
    if (!fileData?.trim()) { res.status(400).json({ error: "File data is required" }); return; }
    if (!mimeType?.trim()) { res.status(400).json({ error: "MIME type is required" }); return; }

    const id = crypto.randomUUID();
    await db.insert(companyDocumentsTable).values({
      id,
      name: name.trim(),
      description: description?.trim() ?? null,
      category: category ?? "general",
      fileName: fileName.trim(),
      fileData: fileData.trim(),
      mimeType: mimeType.trim(),
      uploadedByUserId: req.user?.id ?? null,
    });

    const [doc] = await db
      .select({
        id: companyDocumentsTable.id,
        name: companyDocumentsTable.name,
        description: companyDocumentsTable.description,
        category: companyDocumentsTable.category,
        fileName: companyDocumentsTable.fileName,
        mimeType: companyDocumentsTable.mimeType,
        isActive: companyDocumentsTable.isActive,
        createdAt: companyDocumentsTable.createdAt,
      })
      .from(companyDocumentsTable)
      .where(eq(companyDocumentsTable.id, id));

    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Download a company document (returns base64 + metadata) */
router.get("/documents/company/:id/download", requireAuth, async (req, res) => {
  try {
    const [doc] = await db
      .select()
      .from(companyDocumentsTable)
      .where(eq(companyDocumentsTable.id, req.params.id as string));

    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    res.json({
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileData: doc.fileData, // base64
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Edit company document name / category / description */
router.patch("/documents/company/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { name, category, description } = req.body as { name?: string; category?: string; description?: string };
    await db
      .update(companyDocumentsTable)
      .set({ ...(name && { name }), ...(category && { category }), description: description ?? null })
      .where(eq(companyDocumentsTable.id, req.params.id as string));
    const [updated] = await db.select().from(companyDocumentsTable).where(eq(companyDocumentsTable.id, req.params.id as string));
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Soft-delete (deactivate) a company document */
router.delete("/documents/company/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db
      .update(companyDocumentsTable)
      .set({ isActive: false })
      .where(eq(companyDocumentsTable.id, req.params.id as string));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE DOCUMENTS  (letters/files specific to one employee)
// ─────────────────────────────────────────────────────────────────────────────

/** List employee documents
 *  - HR/admin: all, or filter by ?employeeId=
 *  - Employee: only their own
 */
router.get("/documents/employee", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: hrEmployeeLettersTable.id,
        employeeId: hrEmployeeLettersTable.employeeId,
        name: hrEmployeeLettersTable.name,
        documentType: hrEmployeeLettersTable.documentType,
        fileName: hrEmployeeLettersTable.fileName,
        mimeType: hrEmployeeLettersTable.mimeType,
        createdAt: hrEmployeeLettersTable.createdAt,
      })
      .from(hrEmployeeLettersTable)
      .orderBy(desc(hrEmployeeLettersTable.createdAt));

    let filtered = rows;

    if (!isDocumentAdmin(req)) {
      // Employee sees only their own
      const ownEmployeeId = await getRequestEmployeeId(req);
      if (!ownEmployeeId) { res.json([]); return; }
      filtered = rows.filter((r) => r.employeeId === ownEmployeeId);
    } else {
      const empId = req.query.employeeId as string | undefined;
      if (empId) filtered = rows.filter((r) => r.employeeId === empId);
    }

    // Enrich with employee names
    const allEmps = filtered.length
      ? await db
          .select({ id: employeesTable.id, firstName: employeesTable.firstName, lastName: employeesTable.lastName })
          .from(employeesTable)
      : [];
    const empMap = new Map(allEmps.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

    res.json(filtered.map((r) => ({ ...r, employeeName: empMap.get(r.employeeId) ?? "" })));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Upload a document for a specific employee */
router.post("/documents/employee", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    const { employeeId, name, documentType, fileName, fileData, mimeType } =
      req.body as {
        employeeId?: string; name?: string; documentType?: string;
        fileName?: string; fileData?: string; mimeType?: string;
      };

    if (!employeeId) { res.status(400).json({ error: "Employee is required" }); return; }
    if (!name?.trim()) { res.status(400).json({ error: "Document name is required" }); return; }
    if (!fileName?.trim()) { res.status(400).json({ error: "File name is required" }); return; }
    if (!fileData?.trim()) { res.status(400).json({ error: "File data is required" }); return; }
    if (!mimeType?.trim()) { res.status(400).json({ error: "MIME type is required" }); return; }

    // Verify employee exists
    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

    const id = crypto.randomUUID();
    await db.insert(hrEmployeeLettersTable).values({
      id,
      employeeId,
      name: name.trim(),
      documentType: documentType ?? "other",
      fileName: fileName.trim(),
      fileData: fileData.trim(),
      mimeType: mimeType.trim(),
      uploadedByUserId: req.user?.id ?? null,
    });

    notifyEmployee(employeeId, {
      type: "document.uploaded",
      title: "New document from HR",
      body: `HR has uploaded "${name.trim()}" (${(documentType ?? "other").replace(/_/g, " ")}) to your profile.`,
      link: "/letters",
    }).catch(console.error);

    res.status(201).json({
      id, employeeId, name: name.trim(), documentType: documentType ?? "other",
      fileName: fileName.trim(), mimeType: mimeType.trim(),
      employeeName: `${emp.firstName} ${emp.lastName}`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Download an employee document */
router.get("/documents/employee/:id/download", requireAuth, async (req, res) => {
  try {
    const [doc] = await db
      .select()
      .from(hrEmployeeLettersTable)
      .where(eq(hrEmployeeLettersTable.id, req.params.id as string));

    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    // Access check: employee can only download their own documents
    if (!isDocumentAdmin(req)) {
      const ownEmployeeId = await getRequestEmployeeId(req);
      if (!ownEmployeeId || ownEmployeeId !== doc.employeeId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    res.json({
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileData: doc.fileData, // base64
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Delete an employee document */
router.delete("/documents/employee/:id", requireAuth, requireRole("super_admin", "hr_admin"), async (req, res) => {
  try {
    await db
      .delete(hrEmployeeLettersTable)
      .where(eq(hrEmployeeLettersTable.id, req.params.id as string));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
