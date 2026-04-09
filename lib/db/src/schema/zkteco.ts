import { mysqlTable, varchar, int, timestamp } from "drizzle-orm/mysql-core";

/**
 * Raw punch log — used only for deduplication.
 * No UI. Punches become normal attendance records.
 */
export const zktecoPunchLogsTable = mysqlTable("people_zkteco_punch_logs", {
  id:           varchar("id",           { length: 36 }).primaryKey(),
  memberId:     int("member_id").notNull(),       // matches employee.zktecoMemberId
  punchTime:    varchar("punch_time",   { length: 30 }).notNull(), // "YYYY-MM-DD HH:MM:SS"
  punchType:    varchar("punch_type",   { length: 5 }).default("in"),
  verifyMethod: varchar("verify_method",{ length: 20 }).default("fingerprint"),
  createdAt:    timestamp("created_at").defaultNow(),
});
