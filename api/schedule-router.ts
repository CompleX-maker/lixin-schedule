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
  createWallMessage,
  deleteWallMessage,
  listWallMessages,
  recentPostCount,
  toggleWallLike,
  wallMessageCount,
} from "./queries/wall";
import {
  createReply,
  deleteReply,
  getReplyOwner,
  listRepliesFor,
  recentReplyCount,
  replyCountsFor,
  resolveRealIdentities,
} from "./queries/replies";
import {
  acceptApplicant,
  applyForSubstitute,
  cancelApplication,
  createSubstitutePost,
  deleteSubstitutePost,
  getMyApplication,
  getSubstitutePost,
  listSubstitutePosts,
  openSubstituteCount,
  recentSubstituteCount,
  updateSubstituteStatus,
} from "./queries/substitute";
import {
  PERIOD_GROUPS,
  resolveCampus,
  resolvePeriodGroup,
  sectionRange,
} from "../src/lib/campus-timetable";

import {
  recordVisit,
  recentVisits,
  visitByPeriod,
  visitByUser,
  visitOverview,
} from "./queries/visits";
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
    // 记录访问（5 分钟内去重，失败不影响主流程）
    try {
      await recordVisit({
        userId: ctx.user.id,
        studentId: binding?.studentId ?? null,
        realName: binding?.realName ?? ctx.user.name ?? null,
        college: binding?.college ?? null,
      });
    } catch {
      /* 统计失败不阻断身份查询 */
    }
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

  /** 手动同步（登录会话复用，不验密）。带冷却，避免频繁请求教务系统 */
  sync: authedQuery.mutation(async ({ ctx }) => {
    const binding = await getBinding(ctx.user.id);
    if (binding?.lastSyncAt) {
      const elapsed = Date.now() - new Date(binding.lastSyncAt).getTime();
      const COOLDOWN_MS = 5 * 60 * 1000; // 5 分钟
      if (elapsed < COOLDOWN_MS) {
        const wait = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        throw new Error(`同步过于频繁，请 ${wait} 秒后再试`);
      }
    }
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

  /** 留言墙：公开列表（含回复；真实身份仅管理员可见） */
  wallList: publicQuery.query(async ({ ctx }) => {
    const [list, total] = await Promise.all([
      listWallMessages(ctx.user?.id, 100),
      wallMessageCount(),
    ]);

    const ids = list.map((m) => m.id);
    const [replies, counts] = await Promise.all([
      listRepliesFor(ids, ctx.user?.id),
      replyCountsFor(ids),
    ]);

    // 仅管理员：解析每条留言/回复背后用户的真实学号姓名
    let identities = new Map<number, { studentId: string | null; name: string | null }>();
    const isAdmin = ctx.user?.role === "admin";
    if (isAdmin) {
      const uids: number[] = [];
      for (const m of list) uids.push(m.userId);
      for (const arr of replies.values()) for (const r of arr) uids.push(r.userId);
      identities = await resolveRealIdentities(uids);
    }

    const decorate = (authorId: number) =>
      isAdmin ? (identities.get(authorId) ?? { studentId: null, name: null }) : null;

    return {
      list: list.map((m) => ({
        ...m,
        replyCount: counts.get(m.id) ?? 0,
        identity: decorate(m.userId),
        replies: (replies.get(m.id) ?? []).map((r) => ({
          ...r,
          identity: decorate(r.userId),
        })),
      })),
      total,
      isAdmin,
    };
  }),

  /** 留言墙：回复（登录用户，30 秒内限 1 条） */
  wallReply: authedQuery
    .input(
      z.object({
        messageId: z.number().int().positive(),
        nickname: z.string().trim().min(1).max(32),
        content: z.string().trim().min(1).max(500),
        replyToId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recent = await recentReplyCount(ctx.user.id, 30);
      if (recent > 0) throw new Error("回复得太快啦，缓 30 秒～");
      await createReply({
        messageId: input.messageId,
        userId: ctx.user.id,
        nickname: input.nickname,
        content: input.content,
        replyToId: input.replyToId ?? null,
      });
      return { ok: true };
    }),

  /** 留言墙：删除回复（本人或管理员） */
  wallReplyDelete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const owner = await getReplyOwner(input.id);
      if (!owner) throw new Error("回复不存在");
      if (owner.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("只能删除自己的回复");
      }
      await deleteReply(input.id);
      return { ok: true };
    }),

  /** 留言墙：发布（登录用户，60 秒内限 1 条） */
  wallPost: authedQuery
    .input(
      z.object({
        nickname: z.string().trim().min(1).max(32),
        content: z.string().trim().min(1).max(500),
        category: z.enum(["需求", "建议", "吐槽", "其他"]).default("其他"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const recent = await recentPostCount(ctx.user.id, 60);
      if (recent > 0) throw new Error("发得太快啦，歇一分钟再来～");
      await createWallMessage({
        userId: ctx.user.id,
        nickname: input.nickname,
        content: input.content,
        category: input.category,
      });
      return { ok: true };
    }),

  /** 留言墙：点赞/取消 */
  wallToggleLike: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => toggleWallLike(input.id, ctx.user.id)),

  /** 留言墙：删除（本人或管理员） */
  wallDelete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await listWallMessages(undefined, 500);
      const target = rows.find((r) => r.id === input.id);
      if (!target) throw new Error("留言不存在");
      if (target.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("只能删除自己的留言");
      }
      await deleteWallMessage(input.id);
      return { ok: true };
    }),

  /** 作息表：返回各作息组的节次时间，供前端换算与展示 */
  periodGroups: publicQuery.query(() =>
    PERIOD_GROUPS.map((g) => ({
      key: g.key,
      campus: g.campus,
      label: g.label,
      buildings: g.buildings,
      periodTimes: g.periodTimes,
    })),
  ),

  /** 由教室名解析所属校区/作息组与节次时间 */
  resolveLocation: publicQuery
    .input(z.object({ location: z.string().max(64), startSection: z.number().int().min(1).max(13), endSection: z.number().int().min(1).max(13) }))
    .query(({ input }) => {
      const group = resolvePeriodGroup(input.location);
      const range = sectionRange(input.location, input.startSection, input.endSection);
      return {
        campus: resolveCampus(input.location),
        groupKey: group.key,
        groupLabel: group.label,
        periodTimes: group.periodTimes,
        range,
      };
    }),

  /* ---------------- 代课悬赏 ---------------- */

  /** 代课悬赏：列表 */
  subList: publicQuery
    .input(z.object({ status: z.enum(["all", "open", "taken", "done", "closed"]).default("all") }).optional())
    .query(async ({ ctx, input }) => {
      const [list, open] = await Promise.all([
        listSubstitutePosts(ctx.user?.id, 100, input?.status ?? "all"),
        openSubstituteCount(),
      ]);

      let identities = new Map<number, { studentId: string | null; name: string | null }>();
      const isAdmin = ctx.user?.role === "admin";
      if (isAdmin) {
        const uids: number[] = [];
        for (const p of list) {
          uids.push(p.userId);
          if (p.takerId) uids.push(p.takerId);
        }
        identities = await resolveRealIdentities(uids);
      }
      const decorate = (uid?: number | null) =>
        isAdmin && uid ? (identities.get(uid) ?? { studentId: null, name: null }) : null;

      return {
        list: list.map((p) => ({
          ...p,
          identity: decorate(p.userId),
          takerIdentity: decorate(p.takerId),
        })),
        openCount: open,
        isAdmin,
      };
    }),

  /** 代课悬赏：详情（含报名列表） */
  subDetail: publicQuery
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const post = await getSubstitutePost(input.id, ctx.user?.id);
      if (!post) throw new Error("悬赏不存在");

      const myApplication = ctx.user ? await getMyApplication(input.id, ctx.user.id) : null;

      // 报名列表只有发布者和管理员能看
      const isAdmin = ctx.user?.role === "admin";
      const canSeeApplicants = post.isMine || isAdmin;
      if (!canSeeApplicants) {
        return {
          ...post,
          applications: [] as typeof post.applications,
          applicantsHidden: true,
          myApplyStatus: myApplication?.status ?? null,
        };
      }

      let identities = new Map<number, { studentId: string | null; name: string | null }>();
      if (isAdmin) {
        identities = await resolveRealIdentities(post.applications.map((a) => a.userId));
      }
      return {
        ...post,
        applicantsHidden: false,
        myApplyStatus: myApplication?.status ?? null,
        applications: post.applications.map((a) => ({
          ...a,
          identity: isAdmin ? (identities.get(a.userId) ?? { studentId: null, name: null }) : null,
        })),
      };
    }),

  /** 代课悬赏：发布（2 分钟内限 1 条） */
  subCreate: authedQuery
    .input(
      z.object({
        nickname: z.string().trim().min(1).max(32),
        courseName: z.string().trim().min(1).max(128),
        location: z.string().trim().min(1).max(64),
        dayOfWeek: z.number().int().min(1).max(7),
        startSection: z.number().int().min(1).max(13),
        endSection: z.number().int().min(1).max(13),
        classDate: z.string().trim().max(16).nullable().optional(),
        price: z.number().int().min(0).max(100000),
        priceNegotiable: z.boolean().default(false),
        note: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endSection < input.startSection) throw new Error("结束节次不能早于开始节次");

      const recent = await recentSubstituteCount(ctx.user.id, 120);
      if (recent > 0) throw new Error("发布得太频繁啦，歇两分钟～");

      // 服务端按教学楼作息换算具体时刻，不信任前端传来的时间
      const range = sectionRange(input.location, input.startSection, input.endSection);
      if (!range) throw new Error("无法识别该教室的作息时间，请检查上课地点");

      await createSubstitutePost({
        userId: ctx.user.id,
        nickname: input.nickname,
        courseName: input.courseName,
        campus: resolveCampus(input.location),
        location: input.location,
        dayOfWeek: input.dayOfWeek,
        startSection: input.startSection,
        endSection: input.endSection,
        startTime: range.start,
        endTime: range.end,
        classDate: input.classDate ?? null,
        price: input.price,
        priceNegotiable: input.priceNegotiable,
        note: input.note ?? null,
      });
      return { ok: true, startTime: range.start, endTime: range.end };
    }),

  /** 代课悬赏：报名接单 */
  subApply: authedQuery
    .input(
      z.object({
        postId: z.number().int().positive(),
        nickname: z.string().trim().min(1).max(32),
        message: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const post = await getSubstitutePost(input.postId, ctx.user.id);
      if (!post) throw new Error("悬赏不存在");
      if (post.userId === ctx.user.id) throw new Error("不能接自己发的单");
      if (post.status !== "open") throw new Error("该悬赏已不在招募中");

      const mine = await getMyApplication(input.postId, ctx.user.id);
      if (mine) throw new Error("你已经报过名了，等待发布者挑选");

      await applyForSubstitute(input.postId, ctx.user.id, input.nickname, input.message ?? null);
      return { ok: true };
    }),

  /** 代课悬赏：取消报名 */
  subCancelApply: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await cancelApplication(input.postId, ctx.user.id);
      return { ok: true };
    }),

  /** 代课悬赏：发布者挑选接单者 */
  subAccept: authedQuery
    .input(
      z.object({
        postId: z.number().int().positive(),
        applicationId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const post = await getSubstitutePost(input.postId, ctx.user.id);
      if (!post) throw new Error("悬赏不存在");
      if (post.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("只有发布者可以挑选接单者");
      }
      const app = post.applications.find((a) => a.id === input.applicationId);
      if (!app) throw new Error("报名记录不存在");

      await acceptApplicant(input.postId, input.applicationId, app.nickname, app.userId);
      return { ok: true };
    }),

  /** 代课悬赏：改状态（发布者或管理员） */
  subUpdateStatus: authedQuery
    .input(
      z.object({
        postId: z.number().int().positive(),
        status: z.enum(["open", "taken", "done", "closed"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const post = await getSubstitutePost(input.postId, ctx.user.id);
      if (!post) throw new Error("悬赏不存在");
      if (post.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("只能操作自己发布的悬赏");
      }
      await updateSubstituteStatus(input.postId, input.status);
      return { ok: true };
    }),

  /** 代课悬赏：删除（发布者或管理员） */
  subDelete: authedQuery
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const post = await getSubstitutePost(input.postId, ctx.user.id);
      if (!post) throw new Error("悬赏不存在");
      if (post.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("只能删除自己发布的悬赏");
      }
      await deleteSubstitutePost(input.postId);
      return { ok: true };
    }),

  /** 管理员：访问统计（总体 + 时间维度 + 人名名单 + 最近流水） */
  visitStats: adminQuery.query(async () => {
    const [overview, periods, users, recent] = await Promise.all([
      visitOverview(),
      visitByPeriod(),
      visitByUser(),
      recentVisits(60),
    ]);
    return { overview, periods, users, recent };
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
