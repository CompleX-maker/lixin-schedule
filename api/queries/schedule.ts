import { and, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

export async function getBinding(userId: number) {
  const rows = await getDb()
    .select()
    .from(schema.jwBindings)
    .where(eq(schema.jwBindings.userId, userId))
    .limit(1);
  return rows.at(0) ?? null;
}

export async function upsertBinding(
  userId: number,
  data: Partial<schema.JwBinding> & { studentId: string; passwordEnc: string },
) {
  const existing = await getBinding(userId);
  if (existing) {
    await getDb()
      .update(schema.jwBindings)
      .set(data)
      .where(eq(schema.jwBindings.id, existing.id));
    return existing.id;
  }
  await getDb()
    .insert(schema.jwBindings)
    .values({ userId, ...data });
  const created = await getBinding(userId);
  return created!.id;
}

export async function markBindingStatus(
  userId: number,
  status: "active" | "error",
  lastError: string | null,
) {
  await getDb()
    .update(schema.jwBindings)
    .set({ status, lastError, lastSyncAt: new Date() })
    .where(eq(schema.jwBindings.userId, userId));
}

/** 保存该用户自己提取的学期日历（开学日期 + 节次时间） */
export async function updateBindingCalendar(
  userId: number,
  cal: { semester: string; beginOn: string; periodTimes: string[] },
) {
  await getDb()
    .update(schema.jwBindings)
    .set({ semester: cal.semester, beginOn: cal.beginOn, periodTimes: cal.periodTimes })
    .where(eq(schema.jwBindings.userId, userId));
}

export async function deleteBinding(userId: number) {
  await getDb().delete(schema.jwBindings).where(eq(schema.jwBindings.userId, userId));
  await getDb().delete(schema.courses).where(eq(schema.courses.userId, userId));
  await getDb().delete(schema.courseNotes).where(eq(schema.courseNotes.userId, userId));
}

export async function replaceCourses(
  userId: number,
  semester: string,
  list: Array<Omit<schema.Course, "id" | "userId" | "semester" | "createdAt">>,
) {
  await getDb()
    .delete(schema.courses)
    .where(and(eq(schema.courses.userId, userId), eq(schema.courses.semester, semester)));
  if (list.length > 0) {
    await getDb()
      .insert(schema.courses)
      .values(list.map((c) => ({ ...c, userId, semester })));
  }
}

export async function getCourses(userId: number, semester: string) {
  return getDb()
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.userId, userId), eq(schema.courses.semester, semester)));
}

/** 课程备注：courseKey = courseName|dayOfWeek|startSection|endSection（内容稳定，跨同步存活） */
export async function listNotes(userId: number) {
  return getDb()
    .select()
    .from(schema.courseNotes)
    .where(eq(schema.courseNotes.userId, userId));
}

/** 保存/删除备注：note 为空字符串时删除该条 */
export async function upsertNote(userId: number, courseKey: string, note: string) {
  if (!note.trim()) {
    await getDb()
      .delete(schema.courseNotes)
      .where(and(eq(schema.courseNotes.userId, userId), eq(schema.courseNotes.courseKey, courseKey)));
    return;
  }
  await getDb()
    .insert(schema.courseNotes)
    .values({ userId, courseKey, note: note.trim() })
    .onDuplicateKeyUpdate({ set: { note: note.trim() } });
}

export async function getSetting(key: string): Promise<string | null> {
  const rows = await getDb()
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, key))
    .limit(1);
  return rows.at(0)?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await getDb()
    .insert(schema.appSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function getReminder(userId: number) {
  const rows = await getDb()
    .select()
    .from(schema.reminderSettings)
    .where(eq(schema.reminderSettings.userId, userId))
    .limit(1);
  return rows.at(0) ?? null;
}

export async function upsertReminder(
  userId: number,
  data: Partial<Omit<schema.ReminderSettings, "userId" | "updatedAt">>,
) {
  await getDb()
    .insert(schema.reminderSettings)
    .values({ userId, ...data })
    .onDuplicateKeyUpdate({ set: data });
}

export async function listAllBindings() {
  return getDb().select().from(schema.jwBindings);
}

export async function listAllReminders() {
  return getDb().select().from(schema.reminderSettings);
}

/** 自部署场景：把指定学号的用户设为管理员（ADMIN_STUDENT_IDS 环境变量） */
export async function setUserRole(userId: number, role: "user" | "admin") {
  await getDb().update(schema.users).set({ role }).where(eq(schema.users.id, userId));
}

export async function addFetchLog(
  userId: number,
  kind: string,
  ok: boolean,
  message: string,
  sample?: string,
) {
  await getDb()
    .insert(schema.fetchLogs)
    .values({ userId, kind, ok, message: message.slice(0, 2000), sample: sample?.slice(0, 6000) });
}

export async function recentFetchLogs(userId: number, limit = 5) {
  const rows = await getDb()
    .select()
    .from(schema.fetchLogs)
    .where(eq(schema.fetchLogs.userId, userId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
