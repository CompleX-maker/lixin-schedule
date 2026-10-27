import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./queries/connection";
import { getBinding } from "./queries/schedule";
import { authedQuery, createRouter } from "./middleware";

/** 我的学号（来自教务绑定）。 */
async function myStudentId(userId: number): Promise<string | null> {
  const b = await getBinding(userId);
  return b?.studentId ?? null;
}

/** 学号 -> 已注册用户；users.unionId 约定为 jw:<学号>。 */
async function userByStudentId(studentId: string): Promise<{ id: number; name: string | null } | null> {
  const rows: any = await getDb().execute(
    sql`SELECT id, name FROM users WHERE unionId = ${"jw:" + studentId} LIMIT 1`,
  );
  const list = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
  const r = list?.[0];
  return r ? { id: Number(r.id), name: r.name ?? null } : null;
}

async function studentIdOf(userId: number): Promise<string | null> {
  const rows: any = await getDb().execute(
    sql`SELECT studentId FROM jw_bindings WHERE userId = ${userId} LIMIT 1`,
  );
  const list = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
  return list?.[0]?.studentId ?? null;
}

async function nameOf(userId: number): Promise<string | null> {
  const rows: any = await getDb().execute(sql`SELECT name FROM users WHERE id = ${userId} LIMIT 1`);
  const list = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];
  return list?.[0]?.name ?? null;
}

function rowsOf(res: any): any[] {
  if (!Array.isArray(res)) return [];
  const first = res[0];
  return Array.isArray(first) ? first : res;
}

/** 已建立协作的对象（双向 accepted）。 */
async function partners(userId: number) {
  const res: any = await getDb().execute(sql`
    SELECT c.id, c.token, c.fromUserId, c.toUserId, c.respondedAt
    FROM collab_invites c
    WHERE c.status = 'accepted' AND (c.fromUserId = ${userId} OR c.toUserId = ${userId})
    ORDER BY c.respondedAt DESC
  `);
  const out: any[] = [];
  for (const r of rowsOf(res)) {
    const otherId = Number(r.fromUserId) === userId ? Number(r.toUserId) : Number(r.fromUserId);
    if (!otherId) continue;
    out.push({
      inviteId: Number(r.id),
      userId: otherId,
      name: await nameOf(otherId),
      studentId: await studentIdOf(otherId),
    });
  }
  return out;
}

/** 待我处理的邀请。 */
async function inbox(userId: number) {
  const sid = await myStudentId(userId);
  if (!sid) return [];
  const res: any = await getDb().execute(sql`
    SELECT id, token, fromUserId, createdAt
    FROM collab_invites
    WHERE status = 'pending' AND toStudentId = ${sid} AND fromUserId <> ${userId}
    ORDER BY createdAt DESC LIMIT 10
  `);
  const out: any[] = [];
  for (const r of rowsOf(res)) {
    out.push({
      inviteId: Number(r.id),
      token: r.token,
      fromUserId: Number(r.fromUserId),
      fromName: await nameOf(Number(r.fromUserId)),
      fromStudentId: await studentIdOf(Number(r.fromUserId)),
      createdAt: r.createdAt,
    });
  }
  return out;
}

export const collabRouter = createRouter({
  /** 协作面板初始状态：我是谁、已协作者、待处理邀请 */
  state: authedQuery.query(async ({ ctx }) => ({
    me: {
      userId: ctx.user.id,
      name: ctx.user.name ?? null,
      studentId: await myStudentId(ctx.user.id),
    },
    partners: await partners(ctx.user.id),
    inbox: await inbox(ctx.user.id),
  })),

  /** 按学号发起邀请。对方没注册时返回 shareLink，前端提示邀请分享。 */
  invite: authedQuery
    .input(z.object({ studentId: z.string().min(4).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const target = input.studentId.trim();
      const mine = await myStudentId(ctx.user.id);
      if (mine && mine === target) {
        return { ok: false as const, reason: "self" as const };
      }
      const peer = await userByStudentId(target);
      const token = randomBytes(16).toString("hex");

      if (!peer) {
        // 未注册：仍留一条邀请记录，对方注册并绑定该学号后可见
        await getDb().execute(sql`
          INSERT INTO collab_invites (fromUserId, toStudentId, toUserId, token, status)
          VALUES (${ctx.user.id}, ${target}, NULL, ${token}, 'pending')
        `);
        return { ok: true as const, registered: false as const, shareLink: `https://stellaura.tech/?collab=${token}` };
      }

      const dup: any = await getDb().execute(sql`
        SELECT id FROM collab_invites
        WHERE fromUserId = ${ctx.user.id} AND toUserId = ${peer.id} AND status IN ('pending','accepted')
        LIMIT 1
      `);
      if (rowsOf(dup).length > 0) {
        return { ok: true as const, registered: true as const, already: true as const };
      }

      await getDb().execute(sql`
        INSERT INTO collab_invites (fromUserId, toStudentId, toUserId, token, status)
        VALUES (${ctx.user.id}, ${target}, ${peer.id}, ${token}, 'pending')
      `);
      return { ok: true as const, registered: true as const, name: peer.name, token };
    }),

  /** 我发出的、还没被处理的邀请（可撤回） */
  sent: authedQuery.query(async ({ ctx }) => {
    const res: any = await getDb().execute(sql`
      SELECT id, toStudentId, toUserId, token, createdAt
      FROM collab_invites
      WHERE fromUserId = ${ctx.user.id} AND status = 'pending'
      ORDER BY createdAt DESC LIMIT 20
    `);
    const list: any[] = [];
    for (const r of rowsOf(res)) {
      list.push({
        inviteId: Number(r.id),
        toStudentId: r.toStudentId,
        toName: r.toUserId ? await nameOf(Number(r.toUserId)) : null,
        createdAt: r.createdAt,
      });
    }
    return list;
  }),

  /** 撤回自己发出的邀请（仅 pending 状态可撤） */
  revoke: authedQuery
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().execute(sql`
        DELETE FROM collab_invites
        WHERE id = ${input.inviteId} AND fromUserId = ${ctx.user.id} AND status = 'pending'
      `);
      return { ok: true as const };
    }),

  accept: authedQuery
    .input(z.object({ token: z.string().min(8).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const sid = await myStudentId(ctx.user.id);
      const res: any = await getDb().execute(sql`
        SELECT id, toStudentId FROM collab_invites WHERE token = ${input.token} LIMIT 1
      `);
      const row = rowsOf(res)[0];
      if (!row) return { ok: false as const, reason: "notfound" as const };
      if (sid && row.toStudentId && row.toStudentId !== sid) {
        return { ok: false as const, reason: "other" as const };
      }
      await getDb().execute(sql`
        UPDATE collab_invites
        SET status = 'accepted', toUserId = ${ctx.user.id}, respondedAt = NOW()
        WHERE id = ${Number(row.id)} AND status = 'pending'
      `);
      return { ok: true as const };
    }),

  decline: authedQuery
    .input(z.object({ token: z.string().min(8).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await getDb().execute(sql`
        UPDATE collab_invites
        SET status = 'declined', toUserId = ${ctx.user.id}, respondedAt = NOW()
        WHERE token = ${input.token} AND status = 'pending'
      `);
      return { ok: true as const };
    }),

  /** 解除协作 */
  remove: authedQuery
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getDb().execute(sql`
        DELETE FROM collab_invites
        WHERE id = ${input.inviteId}
          AND (fromUserId = ${ctx.user.id} OR toUserId = ${ctx.user.id})
      `);
      return { ok: true as const };
    }),

  /** 多人的课表：分批查询，支持最多 30 人 */
  partnerCourses: authedQuery
    .input(z.object({ userIds: z.array(z.number().int().positive()).min(1).max(30) }))
    .query(async ({ ctx, input }) => {
      const me = ctx.user.id;
      const want = [...new Set(input.userIds)].filter((n) => n !== me);
      if (want.length === 0) return { ok: true as const, partners: [] };

      // 1) 允许的协作对象
      const allowedRes: any = await getDb().execute(sql`
        SELECT DISTINCT CASE WHEN fromUserId = ${me} THEN toUserId ELSE fromUserId END AS uid
        FROM collab_invites
        WHERE status = 'accepted' AND (fromUserId = ${me} OR toUserId = ${me})
      `);
      const allowed = new Set(rowsOf(allowedRes).map((r) => Number(r.uid)));
      const ids = want.filter((id) => allowed.has(id));
      if (ids.length === 0) return { ok: true as const, partners: [] };
      const ids2 = sql.raw(ids.join(","));

      // 2) 绑定信息 + 姓名（一次查完）
      const metaRes: any = await getDb().execute(sql`
        SELECT b.userId AS userId, b.semester AS semester, b.realName AS realName, u.name AS name
        FROM jw_bindings b LEFT JOIN users u ON u.id = b.userId
        WHERE b.userId IN (${ids2})
      `);
      const meta = new Map<number, any>();
      for (const r of rowsOf(metaRes)) meta.set(Number(r.userId), r);

      // 3) 课程（一次查完，按各自学期过滤）
      const courseRes: any = await getDb().execute(sql`
        SELECT userId, semester, courseName, teacher, location, dayOfWeek, startSection, endSection, weeks
        FROM courses WHERE userId IN (${ids2})
      `);
      const byUser = new Map<number, any[]>();
      for (const c of rowsOf(courseRes)) {
        const uid = Number(c.userId);
        const m = meta.get(uid);
        if (!m?.semester || c.semester !== m.semester) continue;
        const list = byUser.get(uid) ?? [];
        list.push(c);
        byUser.set(uid, list);
      }

      const partners = ids.map((uid) => {
        const m = meta.get(uid);
        return {
          userId: uid,
          name: m?.name ?? m?.realName ?? null,
          courses: byUser.get(uid) ?? [],
        };
      });
      return { ok: true as const, partners };
    }),
});
