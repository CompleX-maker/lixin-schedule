import { and, count, desc, eq, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

/** 留言墙：拉取公开留言（按时间倒序），并带上点赞数与当前用户是否已赞 */
export async function listWallMessages(currentUserId?: number, limit = 100) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.wallMessages.id,
      userId: schema.wallMessages.userId,
      nickname: schema.wallMessages.nickname,
      content: schema.wallMessages.content,
      category: schema.wallMessages.category,
      likeCount: schema.wallMessages.likeCount,
      createdAt: schema.wallMessages.createdAt,
    })
    .from(schema.wallMessages)
    .orderBy(desc(schema.wallMessages.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // 当前用户已赞的留言 id 集合
  let likedIds = new Set<number>();
  if (currentUserId) {
    const likes = await db
      .select({ messageId: schema.wallLikes.messageId })
      .from(schema.wallLikes)
      .where(eq(schema.wallLikes.userId, currentUserId));
    likedIds = new Set(likes.map((l) => l.messageId));
  }

  return rows.map((r) => ({
    ...r,
    liked: likedIds.has(r.id),
    isMine: currentUserId === r.userId,
  }));
}

/** 发布留言 */
export async function createWallMessage(input: {
  userId: number;
  nickname: string;
  content: string;
  category: string;
}) {
  const db = getDb();
  await db.insert(schema.wallMessages).values({
    userId: input.userId,
    nickname: input.nickname.slice(0, 32),
    content: input.content.slice(0, 500),
    category: input.category.slice(0, 20),
  });
}

/** 删除留言（仅限本人或管理员） */
export async function deleteWallMessage(id: number) {
  const db = getDb();
  await db.delete(schema.wallMessages).where(eq(schema.wallMessages.id, id));
}

/** 点赞 / 取消点赞（幂等） */
export async function toggleWallLike(messageId: number, userId: number) {
  const db = getDb();
  const existing = await db
    .select({ id: schema.wallLikes.id })
    .from(schema.wallLikes)
    .where(
      and(eq(schema.wallLikes.messageId, messageId), eq(schema.wallLikes.userId, userId)),
    )
    .limit(1);

  if (existing.length > 0) {
    // 取消赞
    await db.delete(schema.wallLikes).where(eq(schema.wallLikes.id, existing[0].id));
    await db
      .update(schema.wallMessages)
      .set({ likeCount: sql`GREATEST(${schema.wallMessages.likeCount} - 1, 0)` })
      .where(eq(schema.wallMessages.id, messageId));
    return { liked: false };
  }

  await db.insert(schema.wallLikes).values({ messageId, userId });
  await db
    .update(schema.wallMessages)
    .set({ likeCount: sql`${schema.wallMessages.likeCount} + 1` })
    .where(eq(schema.wallMessages.id, messageId));
  return { liked: true };
}

/** 同一用户发帖频率限制检查：N 秒内最多 1 条 */
export async function recentPostCount(userId: number, withinSeconds = 60) {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(schema.wallMessages)
    .where(
      and(
        eq(schema.wallMessages.userId, userId),
        sql`${schema.wallMessages.createdAt} > DATE_SUB(NOW(), INTERVAL ${withinSeconds} SECOND)`,
      ),
    );
  return Number(rows.at(0)?.n ?? 0);
}

/** 留言总数（用于展示） */
export async function wallMessageCount() {
  const db = getDb();
  const rows = await db.select({ n: count() }).from(schema.wallMessages);
  return Number(rows.at(0)?.n ?? 0);
}
