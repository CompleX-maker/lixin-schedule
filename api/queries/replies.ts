import { and, count, eq, inArray, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

/* ================================================================== *
 * 留言回复
 * ================================================================== */

/** 拉取若干留言下的回复，按时间正序；返回按 messageId 分组 */
export async function listRepliesFor(
  messageIds: number[],
  currentUserId?: number,
) {
  if (messageIds.length === 0) return new Map<number, any[]>();

  const db = getDb();
  const rows = await db
    .select({
      id: schema.wallReplies.id,
      messageId: schema.wallReplies.messageId,
      userId: schema.wallReplies.userId,
      nickname: schema.wallReplies.nickname,
      content: schema.wallReplies.content,
      replyToId: schema.wallReplies.replyToId,
      replyToNickname: schema.wallReplies.replyToNickname,
      createdAt: schema.wallReplies.createdAt,
    })
    .from(schema.wallReplies)
    .where(inArray(schema.wallReplies.messageId, messageIds))
    .orderBy(schema.wallReplies.createdAt);

  const grouped = new Map<number, any[]>();
  for (const r of rows) {
    const list = grouped.get(r.messageId) ?? [];
    list.push({ ...r, isMine: currentUserId === r.userId });
    grouped.set(r.messageId, list);
  }
  return grouped;
}

/** 创建回复 */
export async function createReply(input: {
  messageId: number;
  userId: number;
  nickname: string;
  content: string;
  replyToId?: number | null;
}) {
  const db = getDb();

  // 若回复的是某条回复，带上被回复者昵称，便于前端展示 @某人
  let replyToNickname: string | null = null;
  if (input.replyToId) {
    const target = await db
      .select({ nickname: schema.wallReplies.nickname })
      .from(schema.wallReplies)
      .where(eq(schema.wallReplies.id, input.replyToId))
      .limit(1);
    replyToNickname = target.at(0)?.nickname ?? null;
  }

  await db.insert(schema.wallReplies).values({
    messageId: input.messageId,
    userId: input.userId,
    nickname: input.nickname.slice(0, 32),
    content: input.content.slice(0, 500),
    replyToId: input.replyToId ?? null,
    replyToNickname,
  });
}

/** 删除回复 */
export async function deleteReply(id: number) {
  const db = getDb();
  await db.delete(schema.wallReplies).where(eq(schema.wallReplies.id, id));
}

/** 每条留言的回复数，用于列表展示 */
export async function replyCountsFor(messageIds: number[]) {
  if (messageIds.length === 0) return new Map<number, number>();
  const db = getDb();
  const rows = await db
    .select({
      messageId: schema.wallReplies.messageId,
      n: count(),
    })
    .from(schema.wallReplies)
    .where(inArray(schema.wallReplies.messageId, messageIds))
    .groupBy(schema.wallReplies.messageId);

  return new Map(rows.map((r) => [r.messageId, Number(r.n)]));
}

/** 回复频率限制：N 秒内最多 1 条 */
export async function recentReplyCount(userId: number, withinSeconds = 30) {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(schema.wallReplies)
    .where(
      and(
        eq(schema.wallReplies.userId, userId),
        sql`${schema.wallReplies.createdAt} > DATE_SUB(NOW(), INTERVAL ${withinSeconds} SECOND)`,
      ),
    );
  return Number(rows.at(0)?.n ?? 0);
}

/* ================================================================== *
 * 管理员可见的真实身份
 * ================================================================== */

/**
 * 批量取用户真实身份（学号 + 姓名），**仅管理员接口调用**。
 *
 * 学号存放在 users.unionId 里，格式为 `jw:<学号>`；非教务登录的账号
 * 没有学号，此处返回 null 而不是泄露原始 unionId。
 */
export async function resolveRealIdentities(userIds: number[]) {
  const ids = [...new Set(userIds.filter((n) => Number.isFinite(n)))];
  if (ids.length === 0) return new Map<number, { studentId: string | null; name: string | null }>();

  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      unionId: schema.users.unionId,
      name: schema.users.name,
    })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));

  return new Map(
    rows.map((r) => {
      const m = /^jw:(\d+)$/.exec(r.unionId ?? "");
      return [r.id, { studentId: m ? m[1] : null, name: r.name ?? null }];
    }),
  );
}

/** 取某条回复的作者 id（用于删除权限校验） */
export async function getReplyOwner(id: number) {
  const db = getDb();
  const rows = await db
    .select({ userId: schema.wallReplies.userId })
    .from(schema.wallReplies)
    .where(eq(schema.wallReplies.id, id))
    .limit(1);
  return rows.at(0) ?? null;
}
