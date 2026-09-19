import { desc, eq, and, gt, isNull, or } from "drizzle-orm";
import { getDb } from "./connection";
import { announcements, type Announcement } from "../../db/schema";

/** 当前生效的通知：active 且未到期（到期即自动关闭，无需定时任务） */
export async function getActiveAnnouncement(): Promise<Announcement | null> {
  const now = new Date();
  const rows = await getDb()
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.status, "active"),
        or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
      ),
    )
    .orderBy(desc(announcements.id))
    .limit(1);
  return rows[0] ?? null;
}

/** 发布新通知：同时把之前的 active 通知全部关掉（同一时间只生效一条） */
export async function createAnnouncement(
  userId: number,
  title: string,
  content: string,
  ttlHours: number | null,
): Promise<number> {
  const db = getDb();
  await db
    .update(announcements)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(announcements.status, "active"));
  const expiresAt = ttlHours ? new Date(Date.now() + ttlHours * 3600_000) : null;
  const [res] = await db.insert(announcements).values({
    title,
    content,
    createdBy: userId,
    expiresAt,
  });
  return Number(res.insertId);
}

export async function closeAnnouncement(id: number) {
  await getDb()
    .update(announcements)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(announcements.id, id));
}

export async function listAnnouncements(limit = 8): Promise<Announcement[]> {
  return getDb().select().from(announcements).orderBy(desc(announcements.id)).limit(limit);
}
