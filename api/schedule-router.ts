import { z } from "zod";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { DEFAULT_SEMESTER_CONFIG, type SemesterConfig } from "@contracts/types";
import { decryptSecret, encryptSecret } from "./lib/lixin/crypto";
import { currentSemester, fetchSchedule, LixinAuthError, ScheduleFetchError } from "./lib/lixin/schedule";
import {
  addFetchLog,
  deleteBinding,
  getBinding,
  getCourses,
  getReminder,
  getSetting,
  markBindingStatus,
  recentFetchLogs,
  replaceCourses,
  setSetting,
  upsertBinding,
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

/** 抓取并落库；失败时记录日志并更新绑定状态。返回课程数。 */
async function syncUser(userId: number): Promise<{ count: number; hit?: string }> {
  const binding = await getBinding(userId);
  if (!binding) throw new Error("尚未绑定教务账号");
  const cfg = await loadSemesterConfig();
  const password = decryptSecret(binding.passwordEnc);
  try {
    const outcome = await fetchSchedule(binding.studentId, password, cfg.semester);
    await replaceCourses(userId, cfg.semester, outcome.courses);
    if (outcome.student) {
      await upsertBinding(userId, {
        studentId: binding.studentId,
        passwordEnc: binding.passwordEnc,
        realName: outcome.student.name ?? binding.realName,
        college: outcome.student.college ?? binding.college,
      });
    }
    await markBindingStatus(userId, "active", null);
    await addFetchLog(userId, "schedule", true, `同步成功：${outcome.courses.length} 条课程（命中 ${outcome.hit}）`);
    return { count: outcome.courses.length, hit: outcome.hit };
  } catch (e) {
    const isAuth = e instanceof LixinAuthError;
    const msg = e instanceof Error ? e.message : String(e);
    const sample =
      e instanceof ScheduleFetchError
        ? JSON.stringify({ log: e.log, samples: e.samples })
        : isAuth
          ? JSON.stringify({ log: e.log })
          : undefined;
    await markBindingStatus(userId, "error", msg);
    await addFetchLog(userId, "schedule", false, msg, sample);
    throw e;
  }
}

export const scheduleRouter = createRouter({
  /** 当前用户的绑定/同步状态 + 学期配置（课表页首屏用） */
  status: authedQuery.query(async ({ ctx }) => {
    const [binding, cfg] = await Promise.all([getBinding(ctx.user.id), loadSemesterConfig()]);
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

  /** 绑定教务账号：先真实登录验证，成功才保存 */
  bind: authedQuery
    .input(z.object({ studentId: z.string().min(4).max(64), password: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      await upsertBinding(ctx.user.id, {
        studentId: input.studentId,
        passwordEnc: encryptSecret(input.password),
      });
      try {
        const r = await syncUser(ctx.user.id);
        return { ok: true as const, count: r.count };
      } catch (e) {
        // 绑定保留（密码可能正确但课表接口未命中），错误详情进日志
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    }),

  unbind: authedQuery.mutation(async ({ ctx }) => {
    await deleteBinding(ctx.user.id);
    return { ok: true };
  }),

  sync: authedQuery.mutation(async ({ ctx }) => {
    const r = await syncUser(ctx.user.id);
    return { ok: true, count: r.count };
  }),

  myCourses: authedQuery.query(async ({ ctx }) => {
    const cfg = await loadSemesterConfig();
    const list = await getCourses(ctx.user.id, cfg.semester);
    return { semester: cfg.semester, courses: list };
  }),

  config: authedQuery.query(() => loadSemesterConfig()),

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

  /** 最近抓取日志（含接口样本），联调 lxjw 时看这里 */
  logs: authedQuery.query(({ ctx }) => recentFetchLogs(ctx.user.id, 5)),

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
