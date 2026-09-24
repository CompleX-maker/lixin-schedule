import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

/* ================================================================== *
 * 代课悬赏
 * ================================================================== */

export interface CreateSubstituteInput {
  userId: number;
  nickname: string;
  courseName: string;
  campus: string;
  location: string;
  dayOfWeek: number;
  startSection: number;
  endSection: number;
  startTime: string;
  endTime: string;
  classDate?: string | null;
  price: number;
  priceNegotiable: boolean;
  note?: string | null;
}

/** 发布悬赏 */
export async function createSubstitutePost(input: CreateSubstituteInput) {
  const db = getDb();
  await db.insert(schema.substitutePosts).values({
    userId: input.userId,
    nickname: input.nickname.slice(0, 32),
    courseName: input.courseName.slice(0, 128),
    campus: input.campus.slice(0, 16),
    location: input.location.slice(0, 64),
    dayOfWeek: input.dayOfWeek,
    startSection: input.startSection,
    endSection: input.endSection,
    startTime: input.startTime.slice(0, 8),
    endTime: input.endTime.slice(0, 8),
    classDate: input.classDate?.slice(0, 16) ?? null,
    price: input.price,
    priceNegotiable: input.priceNegotiable,
    note: input.note?.slice(0, 500) ?? null,
  });
}

/** 悬赏列表（带报名数、当前用户是否已报名） */
export async function listSubstitutePosts(
  currentUserId?: number,
  limit = 100,
  status?: string,
) {
  const db = getDb();

  const where = status && status !== "all"
    ? eq(schema.substitutePosts.status, status as any)
    : undefined;

  const rows = await db
    .select()
    .from(schema.substitutePosts)
    .where(where)
    .orderBy(desc(schema.substitutePosts.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // 报名数
  const applyCounts = await db
    .select({ postId: schema.substituteApplications.postId, n: count() })
    .from(schema.substituteApplications)
    .where(inArray(schema.substituteApplications.postId, ids))
    .groupBy(schema.substituteApplications.postId);
  const countMap = new Map(applyCounts.map((r) => [r.postId, Number(r.n)]));

  // 当前用户的报名状态
  let myApplied = new Map<number, string>();
  if (currentUserId) {
    const mine = await db
      .select({
        postId: schema.substituteApplications.postId,
        status: schema.substituteApplications.status,
      })
      .from(schema.substituteApplications)
      .where(
        and(
          inArray(schema.substituteApplications.postId, ids),
          eq(schema.substituteApplications.userId, currentUserId),
        ),
      );
    myApplied = new Map(mine.map((r) => [r.postId, r.status]));
  }

  return rows.map((r) => ({
    ...r,
    applyCount: countMap.get(r.id) ?? 0,
    myApplyStatus: myApplied.get(r.id) ?? null,
    isMine: currentUserId === r.userId,
  }));
}

/** 单条悬赏详情（含报名列表） */
export async function getSubstitutePost(postId: number, currentUserId?: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.substitutePosts)
    .where(eq(schema.substitutePosts.id, postId))
    .limit(1);

  const post = rows.at(0);
  if (!post) return null;

  const applications = await db
    .select({
      id: schema.substituteApplications.id,
      userId: schema.substituteApplications.userId,
      nickname: schema.substituteApplications.nickname,
      message: schema.substituteApplications.message,
      status: schema.substituteApplications.status,
      createdAt: schema.substituteApplications.createdAt,
    })
    .from(schema.substituteApplications)
    .where(eq(schema.substituteApplications.postId, postId))
    .orderBy(schema.substituteApplications.createdAt);

  return {
    ...post,
    isMine: currentUserId === post.userId,
    applications: applications.map((a) => ({
      ...a,
      isMine: currentUserId === a.userId,
    })),
  };
}

/** 报名接单 */
export async function applyForSubstitute(
  postId: number,
  userId: number,
  nickname: string,
  message?: string | null,
) {
  const db = getDb();
  await db.insert(schema.substituteApplications).values({
    postId,
    userId,
    nickname: nickname.slice(0, 32),
    message: message?.slice(0, 200) ?? null,
  });
}

/** 取消报名 */
export async function cancelApplication(postId: number, userId: number) {
  const db = getDb();
  await db
    .delete(schema.substituteApplications)
    .where(
      and(
        eq(schema.substituteApplications.postId, postId),
        eq(schema.substituteApplications.userId, userId),
        // 已被选中的不能自己取消
        eq(schema.substituteApplications.status, "pending"),
      ),
    );
}

/** 发布者挑选接单者：选中一人，其余标记未选中，悬赏转为已接单 */
export async function acceptApplicant(
  postId: number,
  applicationId: number,
  takerNickname: string,
  takerId: number,
) {
  const db = getDb();
  await db
    .update(schema.substituteApplications)
    .set({ status: "accepted" })
    .where(eq(schema.substituteApplications.id, applicationId));

  await db
    .update(schema.substituteApplications)
    .set({ status: "rejected" })
    .where(
      and(
        eq(schema.substituteApplications.postId, postId),
        sql`${schema.substituteApplications.id} <> ${applicationId}`,
      ),
    );

  await db
    .update(schema.substitutePosts)
    .set({
      status: "taken",
      takerId,
      takerNickname: takerNickname.slice(0, 32),
      takenAt: new Date(),
    })
    .where(eq(schema.substitutePosts.id, postId));
}

/** 更新悬赏状态（发布者或管理员） */
export async function updateSubstituteStatus(
  postId: number,
  status: "open" | "taken" | "done" | "closed",
) {
  const db = getDb();
  await db
    .update(schema.substitutePosts)
    .set({ status })
    .where(eq(schema.substitutePosts.id, postId));
}

/** 删除悬赏 */
export async function deleteSubstitutePost(postId: number) {
  const db = getDb();
  await db.delete(schema.substitutePosts).where(eq(schema.substitutePosts.id, postId));
}

/** 发布频率限制 */
export async function recentSubstituteCount(userId: number, withinSeconds = 120) {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(schema.substitutePosts)
    .where(
      and(
        eq(schema.substitutePosts.userId, userId),
        sql`${schema.substitutePosts.createdAt} > DATE_SUB(NOW(), INTERVAL ${withinSeconds} SECOND)`,
      ),
    );
  return Number(rows.at(0)?.n ?? 0);
}

/** 开启中的悬赏数量 */
export async function openSubstituteCount() {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(schema.substitutePosts)
    .where(eq(schema.substitutePosts.status, "open"));
  return Number(rows.at(0)?.n ?? 0);
}

/** 查某人对某悬赏的报名状态（null 表示未报名） */
export async function getMyApplication(postId: number, userId: number) {
  const db = getDb();
  const rows = await db
    .select({ id: schema.substituteApplications.id, status: schema.substituteApplications.status })
    .from(schema.substituteApplications)
    .where(
      and(
        eq(schema.substituteApplications.postId, postId),
        eq(schema.substituteApplications.userId, userId),
      ),
    )
    .limit(1);
  return rows.at(0) ?? null;
}
