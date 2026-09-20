import { and, count, desc, gte, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

/** 同一用户在此间隔内的重复访问不重复记流水（防刷新刷屏） */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * 记录一次访问。5 分钟内同一用户只记一条，避免刷新页面时刷屏。
 * 仅保存身份快照，不记录 IP。
 */
export async function recordVisit(input: {
  userId: number;
  studentId?: string | null;
  realName?: string | null;
  college?: string | null;
}): Promise<boolean> {
  const db = getDb();
  const since = new Date(Date.now() - DEDUP_WINDOW_MS);

  const recent = await db
    .select({ id: schema.visitLogs.id })
    .from(schema.visitLogs)
    .where(
      and(
        sql`${schema.visitLogs.userId} = ${input.userId}`,
        gte(schema.visitLogs.visitedAt, since),
      ),
    )
    .limit(1);

  if (recent.length > 0) return false;

  await db.insert(schema.visitLogs).values({
    userId: input.userId,
    studentId: input.studentId ?? null,
    realName: input.realName ?? null,
    college: input.college ?? null,
  });
  return true;
}

/** 总体统计：去重人数 + 总访问次数 */
export async function visitOverview() {
  const db = getDb();
  const rows = await db
    .select({
      totalVisits: count(),
      uniqueUsers: sql<number>`count(distinct ${schema.visitLogs.userId})`,
    })
    .from(schema.visitLogs);

  const r = rows.at(0);
  return {
    totalVisits: Number(r?.totalVisits ?? 0),
    uniqueUsers: Number(r?.uniqueUsers ?? 0),
  };
}

/** 时间维度统计：今日 / 近 7 天 / 近 30 天 的去重人数与访问次数 */
export async function visitByPeriod() {
  const db = getDb();

  async function rangeStat(since: Date) {
    const rows = await db
      .select({
        visits: count(),
        users: sql<number>`count(distinct ${schema.visitLogs.userId})`,
      })
      .from(schema.visitLogs)
      .where(gte(schema.visitLogs.visitedAt, since));
    const r = rows.at(0);
    return {
      visits: Number(r?.visits ?? 0),
      users: Number(r?.users ?? 0),
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  const [today, week, month] = await Promise.all([
    rangeStat(startOfToday),
    rangeStat(d7),
    rangeStat(d30),
  ]);

  return { today, week, month };
}

/** 按人聚合的名单：访问次数、首次/最近访问 */
export async function visitByUser(limit = 200) {
  const db = getDb();
  const rows = await db
    .select({
      userId: schema.visitLogs.userId,
      studentId: sql<string | null>`max(${schema.visitLogs.studentId})`,
      realName: sql<string | null>`max(${schema.visitLogs.realName})`,
      college: sql<string | null>`max(${schema.visitLogs.college})`,
      visits: count(),
      firstVisit: sql<Date>`min(${schema.visitLogs.visitedAt})`,
      lastVisit: sql<Date>`max(${schema.visitLogs.visitedAt})`,
    })
    .from(schema.visitLogs)
    .groupBy(schema.visitLogs.userId)
    .orderBy(desc(sql`max(${schema.visitLogs.visitedAt})`))
    .limit(limit);

  return rows.map((r) => ({
    userId: r.userId,
    studentId: r.studentId,
    realName: r.realName,
    college: r.college,
    visits: Number(r.visits),
    firstVisit: r.firstVisit,
    lastVisit: r.lastVisit,
  }));
}

/** 最近访问流水（管理员查看明细用） */
export async function recentVisits(limit = 100) {
  const db = getDb();
  return db
    .select({
      id: schema.visitLogs.id,
      studentId: schema.visitLogs.studentId,
      realName: schema.visitLogs.realName,
      visitedAt: schema.visitLogs.visitedAt,
    })
    .from(schema.visitLogs)
    .orderBy(desc(schema.visitLogs.visitedAt))
    .limit(limit);
}
