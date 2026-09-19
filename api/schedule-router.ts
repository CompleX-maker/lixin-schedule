import * as cookie from "cookie";
import { z } from "zod";
import { createRouter, authedQuery, publicQuery, adminQuery } from "./middleware";
import { DEFAULT_SEMESTER_CONFIG, type SemesterConfig } from "@contracts/types";
import { getSessionCookieOptions } from "./lib/cookies";
import { JW_SESSION_COOKIE, JW_SESSION_MAX_AGE_S, signJwSession } from "./lib/jw-session";
import { decryptSecret, encryptSecret } from "./lib/lixin/crypto";
import { currentSemester, fetchSchedule, LixinAuthError, ScheduleFetchError } from "./lib/lixin/schedule";
import { findUserByUnionId, upsertUser } from "./queries/users";
import {
  addFetchLog,
  deleteBinding,
  getBinding,
  getCourses,
  getReminder,
  getSetting,
  listNotes,
  markBindingStatus,
  recentFetchLogs,
  replaceCourses,
  setSetting,
  setUserRole,
  updateBindingCalendar,
  upsertBinding,
  upsertNote,
  upsertReminder,
} from "./queries/schedule";

async function loadSemesterConfig(): Promise<SemesterConfig> {
  const raw = await getSetting("semesterConfig");
  if (!raw) return { ...DEFAULT_SEMESTER_CONFIG, semester: currentSemester() };
  try {
    return { ...DEFAULT_SEMESTER_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SEMESTER_CONFIG, semester: currentSemester() };
  }
}

/**
 * 每人自己的学期配置：优先用该账号同步时从教务系统提取的开学日期/节次时间
 * （不同年级、校区的日历可能不同，不用全局统一规格），没有才退回全局配置。
 */
async function loadUserConfig(userId: number): Promise<SemesterConfig> {
  const [binding, globalCfg] = await Promise.all([getBinding(userId), loadSemesterConfig()]);
  if (binding?.beginOn && binding.periodTimes?.length) {
    return {
      semester: binding.semester ?? globalCfg.semester,
      startDate: binding.beginOn,
      periodTimes: binding.periodTimes,
    };
  }
  return globalCfg;
}

/**
 * 登录 = 绑定的核心流程：
 * CAS 验证账密 → 抓课表 → 建档/更新（unionId=jw:学号）→ 签发会话 cookie。
 * 每个人的课表独立存储；cookie 只在当前设备，新设备重新登录。
 */
async function loginAndSync(studentId: string, password: string) {
  const cfg = await loadSemesterConfig();
  const outcome = await fetchSchedule(studentId, password, cfg.semester);

  // 建档（或更新姓名）
  await upsertUser({
    unionId: `jw:${studentId}`,
    name: outcome.student.name ?? studentId,
    lastSignInAt: new Date(),
  });
  const user = await findUserByUnionId(`jw:${studentId}`);
  if (!user) throw new Error("建档失败");

  // 自部署场景：ADMIN_STUDENT_IDS=学号1,学号2 指定的账号自动成为管理员
  const adminIds = (process.env.ADMIN_STUDENT_IDS ?? "").split(/[,，\s]+/).filter(Boolean);
  if (adminIds.includes(studentId) && user.role !== "admin") {
    await setUserRole(user.id, "admin");
  }

  await upsertBinding(user.id, {
    studentId,
    passwordEnc: encryptSecret(password),
    realName: outcome.student.name ?? null,
    college: outcome.student.college ?? null,
  });
  await replaceCourses(user.id, cfg.semester, outcome.courses);

  // 该账号自己的学期日历：按个人实际提取保存，不再只看全局统一配置
  if (outcome.extracted) {
    await updateBindingCalendar(user.id, {
      semester: cfg.semester,
      beginOn: outcome.extracted.beginOn,
      periodTimes: outcome.extracted.periodTimes,
    });
    // 全局配置仅作未同步用户的兜底
    const next = { ...cfg, startDate: outcome.extracted.beginOn, periodTimes: outcome.extracted.periodTimes };
    if (next.startDate !== cfg.startDate || next.periodTimes.join() !== cfg.periodTimes.join()) {
      await setSetting("semesterConfig", JSON.stringify(next));
    }
  }

  await markBindingStatus(user.id, "active", null);
  await addFetchLog(user.id, "schedule", true, `登录同步成功：${outcome.courses.length} 条课程`);
  return { user, count: outcome.courses.length, name: outcome.student.name };
}

/** 已登录用户的增量同步（登录会话复用，不验密） */
async function syncUser(userId: number): Promise<{ count: number }> {
  const binding = await getBinding(userId);
  if (!binding) throw new Error("尚未登录过教务账号");
  const cfg = await loadSemesterConfig();
  const password = decryptSecret(binding.passwordEnc);
  try {
    const outcome = await fetchSchedule(binding.studentId, password, cfg.semester);
    await replaceCourses(userId, cfg.semester, outcome.courses);
    if (outcome.extracted) {
      await updateBindingCalendar(userId, {
        semester: cfg.semester,
        beginOn: outcome.extracted.beginOn,
        periodTimes: outcome.extracted.periodTimes,
      });
      const next = { ...cfg, startDate: outcome.extracted.beginOn, periodTimes: outcome.extracted.periodTimes };
      if (next.startDate !== cfg.startDate || next.periodTimes.join() !== cfg.periodTimes.join()) {
        await setSetting("semesterConfig", JSON.stringify(next));
      }
    }
    if (outcome.student) {
      await upsertBinding(userId, {
        studentId: binding.studentId,
        passwordEnc: binding.passwordEnc,
        realName: outcome.student.name ?? binding.realName,
        college: outcome.student.college ?? binding.college,
      });
    }
    await markBindingStatus(userId, "active", null);
    await addFetchLog(userId, "schedule", true, `同步成功：${outcome.courses.length} 条课程`);
    return { count: outcome.courses.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const sample =
      e instanceof ScheduleFetchError
        ? JSON.stringify({ log: e.log, samples: e.samples })
        : e instanceof LixinAuthError
          ? JSON.stringify({ log: e.log })
          : undefined;
    await markBindingStatus(userId, "error", msg);
    await addFetchLog(userId, "schedule", false, msg, sample);
    throw e;
  }
}

export const scheduleRouter = createRouter({
  /** 教务账密登录：验证 + 抓课表 + 建档 + 发 cookie */
  login: publicQuery
    .input(z.object({ studentId: z.string().min(4).max(64), password: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const { count, name } = await loginAndSync(input.studentId, input.password);
      const token = await signJwSession(input.studentId);
      const opts = getSessionCookieOptions(ctx.req.headers);
      ctx.resHeaders.append(
        "set-cookie",
        cookie.serialize(JW_SESSION_COOKIE, token, {
          httpOnly: opts.httpOnly,
          path: opts.path,
          sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
          secure: opts.secure,
          maxAge: JW_SESSION_MAX_AGE_S,
        }),
      );
      return { ok: true as const, name: name ?? input.studentId, count };
    }),

  logout: publicQuery.mutation(({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(JW_SESSION_COOKIE, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { ok: true };
  }),

  /** 当前登录身份（学生或 Kimi 管理员） */
  me: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const binding = await getBinding(ctx.user.id);
    return {
      name: ctx.user.name,
      role: ctx.user.role,
      studentId: binding?.studentId ?? null,
      realName: binding?.realName ?? null,
      bindStatus: binding?.status ?? null,
      lastError: binding?.lastError ?? null,
      lastSyncAt: binding?.lastSyncAt ?? null,
    };
  }),

  /** 课表页首屏状态 */
  status: authedQuery.query(async ({ ctx }) => {
    const [binding, cfg] = await Promise.all([getBinding(ctx.user.id), loadUserConfig(ctx.user.id)]);
    const count = binding ? (await getCourses(ctx.user.id, cfg.semester)).length : 0;
    return {
      bound: !!binding,
      studentId: binding?.studentId ?? null,
      realName: binding?.realName ?? null,
      status: binding?.status ?? null,
      lastError: binding?.lastError ?? null,
      lastSyncAt: binding?.lastSyncAt ?? null,
      courseCount: count,
      config: cfg,
    };
  }),

  sync: authedQuery.mutation(async ({ ctx }) => {
    const r = await syncUser(ctx.user.id);
    return { ok: true, count: r.count };
  }),

  /** 清除我的数据（课表 + 账号） */
  wipeMe: authedQuery.mutation(async ({ ctx }) => {
    await deleteBinding(ctx.user.id);
    return { ok: true };
  }),

  myCourses: authedQuery.query(async ({ ctx }) => {
    const cfg = await loadUserConfig(ctx.user.id);
    const list = await getCourses(ctx.user.id, cfg.semester);
    return { semester: cfg.semester, courses: list };
  }),

  config: publicQuery.query(() => loadSemesterConfig()),

  updateConfig: adminQuery
    .input(
      z.object({
        semester: z.string().regex(/^\d{4}-\d{4}-[12]$/),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(8).max(16),
      }),
    )
    .mutation(async ({ input }) => {
      await setSetting("semesterConfig", JSON.stringify(input));
      return { ok: true };
    }),

  reminder: authedQuery.query(async ({ ctx }) => getReminder(ctx.user.id)),

  updateReminder: authedQuery
    .input(
      z.object({
        email: z.string().email().max(320).nullish(),
        enableClassReminder: z.boolean().optional(),
        minutesBefore: z.number().int().min(5).max(120).optional(),
        enableDailyDigest: z.boolean().optional(),
        digestHour: z.number().int().min(0).max(23).optional(),
        serverChanKey: z.string().max(128).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await upsertReminder(ctx.user.id, input);
      return { ok: true };
    }),

  /** 最近抓取日志（含接口样本） */
  logs: authedQuery.query(({ ctx }) => recentFetchLogs(ctx.user.id, 5)),

  /** 课程备注：key = courseName|dayOfWeek|startSection|endSection */
  notes: authedQuery.query(({ ctx }) => listNotes(ctx.user.id)),

  saveNote: authedQuery
    .input(
      z.object({
        courseKey: z.string().min(1).max(255),
        note: z.string().max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await upsertNote(ctx.user.id, input.courseKey, input.note);
      return { ok: true };
    }),

  /** 管理员：查看/设置 SMTP 发信配置（QQ邮箱授权码） */
  mailConfig: adminQuery.query(async () => {
    const raw = await getSetting("mailConfig");
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      return { host: j.host ?? "", port: j.port ?? 465, user: j.user ?? "", hasPass: !!j.pass };
    } catch {
      return null;
    }
  }),

  updateMailConfig: adminQuery
    .input(
      z.object({
        host: z.string().min(1).max(128),
        port: z.number().int().min(1).max(65535),
        user: z.string().email().max(320),
        pass: z.string().max(128).optional(), // 不传则保留旧值
      }),
    )
    .mutation(async ({ input }) => {
      let old: any = {};
      const raw = await getSetting("mailConfig");
      if (raw) {
        try {
          old = JSON.parse(raw);
        } catch {
          /* ignore */
        }
      }
      const next = {
        host: input.host,
        port: input.port,
        user: input.user,
        pass: input.pass || old.pass || "",
      };
      await setSetting("mailConfig", JSON.stringify(next));
      return { ok: true };
    }),
});
