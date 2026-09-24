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
  uniqueIndex,
  index,
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
  // 每人自己的学期日历：不同年级/校区开学日期、节次时间可能不同，按个人实际提取保存
  semester: varchar("semester", { length: 32 }),
  beginOn: varchar("beginOn", { length: 10 }),
  periodTimes: json("periodTimes").$type<string[]>(),
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

/**
 * 课程备注：按内容 key（courseName|dayOfWeek|startSection|endSection）挂在用户名下。
 * 课表每次同步会整批重建 courses 行，备注独立成表才能在同步后存活。
 */
export const courseNotes = mysqlTable(
  "course_notes",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseKey: varchar("courseKey", { length: 255 }).notNull(),
    note: text("note").notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("uq_note_user_course").on(t.userId, t.courseKey)],
);

export type CourseNote = typeof courseNotes.$inferSelect;

/**
 * 全站通知（调课提醒等）：管理员发布，用户端弹窗展示。
 * expiresAt 为空 = 只能手动关闭；到期后视为自动关闭（查询时过滤，无需定时任务）。
 */
export const announcements = mysqlTable("announcements", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  content: text("content").notNull(),
  createdBy: bigint("createdBy", { mode: "number", unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  status: mysqlEnum("status", ["active", "closed"]).default("active").notNull(),
  closedAt: timestamp("closedAt"),
});

export type Announcement = typeof announcements.$inferSelect;

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

/** 访问日志：记录用户打开网站（仅管理员可见统计；不记录 IP，保护隐私） */
export const visitLogs = mysqlTable(
  "visit_logs",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 冗余快照：用户删号后统计仍可读，也避免每次 join
    studentId: varchar("studentId", { length: 64 }),
    realName: varchar("realName", { length: 64 }),
    college: varchar("college", { length: 128 }),
    visitedAt: timestamp("visitedAt").defaultNow().notNull(),
  },
  (table) => [index("idx_visit_user_time").on(table.userId, table.visitedAt)],
);

export type VisitLog = typeof visitLogs.$inferSelect;

/** 留言墙：公开的需求/反馈（可自定义昵称，前台公开可见） */
export const wallMessages = mysqlTable(
  "wall_messages",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: varchar("nickname", { length: 32 }).notNull(), // 自定义昵称
    content: varchar("content", { length: 500 }).notNull(),
    category: varchar("category", { length: 20 }).notNull().default("other"), // 需求 / 建议 / 吐槽 / 其他
    likeCount: int("likeCount").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("idx_wall_created").on(table.createdAt)],
);

export type WallMessage = typeof wallMessages.$inferSelect;

/** 留言点赞记录：同一用户对同一条只能赞一次 */
export const wallLikes = mysqlTable(
  "wall_likes",
  {
    id: serial("id").primaryKey(),
    messageId: bigint("messageId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => wallMessages.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("uniq_wall_like").on(table.messageId, table.userId)],
);



/* ================================================================== *
 * 留言回复
 * ================================================================== */

/** 留言回复：挂在某条留言下；结构上只支持一层（回复的回复也挂到根留言） */
export const wallReplies = mysqlTable(
  "wall_replies",
  {
    id: serial("id").primaryKey(),
    messageId: bigint("messageId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => wallMessages.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: varchar("nickname", { length: 32 }).notNull(),
    content: varchar("content", { length: 500 }).notNull(),
    /** 被回复的回复 id（用于 @某人），为空表示直接回复留言 */
    replyToId: bigint("replyToId", { mode: "number", unsigned: true }),
    replyToNickname: varchar("replyToNickname", { length: 32 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("idx_reply_message").on(table.messageId, table.createdAt)],
);

export type WallReply = typeof wallReplies.$inferSelect;

/* ================================================================== *
 * 代课悬赏
 * ================================================================== */

/**
 * 代课悬赏单。
 *
 * 时间字段同时存「节次」和「具体时刻」：
 *   - 节次用于按作息表换算，保证换校区/换教学楼也准确；
 *   - 具体时刻在发布时由前端按所选教学楼算出并固化，便于列表直接展示。
 */
export const substitutePosts = mysqlTable(
  "substitute_posts",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: varchar("nickname", { length: 32 }).notNull(),
    courseName: varchar("courseName", { length: 128 }).notNull(),
    /** 校区：松江 / 浦东 */
    campus: varchar("campus", { length: 16 }).notNull(),
    /** 上课地点（教室名，用于换算作息） */
    location: varchar("location", { length: 64 }).notNull(),
    /** 星期 1-7 */
    dayOfWeek: int("dayOfWeek").notNull(),
    /** 起始节 / 结束节 */
    startSection: int("startSection").notNull(),
    endSection: int("endSection").notNull(),
    /** 由教学楼作息换算出的具体时刻，如 08:30 / 10:05 */
    startTime: varchar("startTime", { length: 8 }).notNull(),
    endTime: varchar("endTime", { length: 8 }).notNull(),
    /** 具体日期（可选，例如只代某一天） */
    classDate: varchar("classDate", { length: 16 }),
    /** 悬赏价格（元），0 表示面议 */
    price: int("price").notNull().default(0),
    /** 是否面议 */
    priceNegotiable: boolean("priceNegotiable").default(false).notNull(),
    /** 补充说明：要求、联系方式提示等 */
    note: varchar("note", { length: 500 }),
    /** 状态：open 招募中 / taken 已接单 / done 已完成 / closed 已取消 */
    status: mysqlEnum("status", ["open", "taken", "done", "closed"])
      .default("open")
      .notNull(),
    /** 当前确认接单者 */
    takerId: bigint("takerId", { mode: "number", unsigned: true }).references(
      () => users.id,
      { onDelete: "set null" },
    ),
    takerNickname: varchar("takerNickname", { length: 32 }),
    takenAt: timestamp("takenAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_sub_status").on(table.status, table.createdAt),
    index("idx_sub_user").on(table.userId),
  ],
);

export type SubstitutePost = typeof substitutePosts.$inferSelect;

/** 代课报名：一条悬赏可有多人报名，发布者挑选确认 */
export const substituteApplications = mysqlTable(
  "substitute_applications",
  {
    id: serial("id").primaryKey(),
    postId: bigint("postId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => substitutePosts.id, { onDelete: "cascade" }),
    userId: bigint("userId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: varchar("nickname", { length: 32 }).notNull(),
    /** 报名留言 */
    message: varchar("message", { length: 200 }),
    /** 状态：pending 待挑选 / accepted 已选中 / rejected 未选中 */
    status: mysqlEnum("status", ["pending", "accepted", "rejected"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("uniq_sub_apply").on(table.postId, table.userId)],
);

export type SubstituteApplication = typeof substituteApplications.$inferSelect;
