import { mysqlTable, varchar, int, timestamp, index, uniqueIndex } from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";

/**
 * Raw biometric punch log — source of truth for device attendance.
 * Attendance records are re-derived from these punches on every sync.
 * easyTimeId is unique: positive IDs come from EasyTime Pro API; negative IDs
 * are synthetic keys for ADMS push punches.
 */
export const biometricPunchLogsTable = mysqlTable(
  "people_biometric_punch_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    easyTimeId: int("easy_time_id").notNull(),
    empCode: varchar("emp_code", { length: 50 }).notNull(),
    employeeId: varchar("employee_id", { length: 36 }).references(() => employeesTable.id, { onDelete: "set null" }),
    punchTime: timestamp("punch_time").notNull(),
    punchState: int("punch_state").notNull().default(255),
    verifyType: int("verify_type").notNull().default(1),
    terminalSn: varchar("terminal_sn", { length: 64 }),
    terminalAlias: varchar("terminal_alias", { length: 128 }),
    isAttendance: int("is_attendance"),
    source: int("source"), // 1=Device, 2=Manual, 3=Mobile, 4=PenDrive (EasyTime); null for ADMS
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_biometric_easy_time_id").on(table.easyTimeId),
    uniqueIndex("uq_biometric_emp_punch").on(table.empCode, table.punchTime),
    index("idx_biometric_employee_punch").on(table.employeeId, table.punchTime),
  ],
);

export type BiometricPunchLog = typeof biometricPunchLogsTable.$inferSelect;
