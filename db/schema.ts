import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  boolean,
  json,

} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 教务系统账号绑定：每个 Kimi 用户绑定一个 lxjw 教务账号。
 * 密码用 AES-256-GCM 加密存储（见 api/lib/lixin/crypto.ts）。
 */
export const jwBindings = mysqlTable("jw_bindings", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  studentId: varchar("studentId", { length: 64 }).notNull(),
  passwordEnc: text("passwordEnc").notNull(),
  realName: varchar("realName", { length: 64 }),
  college: varchar("college", { length: 128 }),
  className: varchar("className", { length: 128 }),
  status: mysqlEnum("status", ["active", "error"]).default("active").notNull(),
  lastError: text("lastError"),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type JwBinding = typeof jwBindings.$inferSelect;

/**
 * 课程条目：一门课在某一星期的某一节次区间。
 * weeks 为 JSON 数组（[1,2,3,...,16]），精确到周，避免解析"1-16周"文本的歧义。
 */
export const courses = mysqlTable("courses", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  semester: varchar("semester", { length: 32 }).notNull(), // 如 2026-2027-1
  courseName: varchar("courseName", { length: 128 }).notNull(),
  teacher: varchar("teacher", { length: 128 }),
  location: varchar("location", { length: 128 }),
  dayOfWeek: int("dayOfWeek").notNull(), // 1=周一 ... 7=周日
  startSection: int("startSection").notNull(),
  endSection: int("endSection").notNull(),
  weeks: json("weeks").$type<number[]>().notNull(),
  weeksText: varchar("weeksText", { length: 128 }),
  rawText: text("rawText"), // 抓取到的原始单元格文本，便于排查解析问题
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Course = typeof courses.$inferSelect;

/** 全局配置（学期开始日期、当前学期、节次时间、公告等），管理员可改 */
export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/** 每个用户的提醒设置 */
export const reminderSettings = mysqlTable("reminder_settings", {
  userId: bigint("userId", { mode: "number", unsigned: true })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }),
  enableClassReminder: boolean("enableClassReminder").default(false).notNull(),
  minutesBefore: int("minutesBefore").default(15).notNull(),
  enableDailyDigest: boolean("enableDailyDigest").default(false).notNull(),
  digestHour: int("digestHour").default(21).notNull(), // 前一晚推送次日课表
  serverChanKey: varchar("serverChanKey", { length: 128 }),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type ReminderSettings = typeof reminderSettings.$inferSelect;

/** 抓取日志：记录每次同步结果与原始响应片段，方便联调 lxjw 接口 */
export const fetchLogs = mysqlTable("fetch_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 32 }).notNull(), // schedule / grades / probe
  ok: boolean("ok").notNull(),
  message: text("message"),
  sample: text("sample"), // 原始响应截断片段（联调用）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
