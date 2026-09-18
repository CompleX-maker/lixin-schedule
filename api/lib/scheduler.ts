import { nanoid } from "nanoid";
import { DEFAULT_SEMESTER_CONFIG, type SemesterConfig } from "@contracts/types";
import { decryptSecret } from "./lixin/crypto";
import { currentSemester, fetchSchedule } from "./lixin/schedule";
import { notifyUser } from "./notify";
import {
  getCourses,
  getSetting,
  listAllBindings,
  listAllReminders,
  markBindingStatus,
  replaceCourses,
  setSetting,
  upsertBinding,
  addFetchLog,
} from "../queries/schedule";

/**
 * 后台调度器（吸取电费监测站经验）：
 *  - 平台容器无人访问会休眠 → 从请求头学习公网 origin，每 4 分钟自 ping 保活
 *  - 多实例可能并存 → DB 租约（appSettings["schedulerLease"]）防重复执行
 *  - 课表同步锚定时间点（每天 06:40 / 22:20），而非固定间隔
 *  - 上课提醒每分钟检查，当天已提醒的课次落库去重
 */

const INSTANCE_ID = nanoid(8);
let publicOrigin: string | null = null;
let started = false;

/** 由请求中间件调用：学习公网 origin（用于自 ping 保活） */
export function learnOrigin(req: Request) {
  if (publicOrigin) return;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
    publicOrigin = `${proto}://${host}`;
    console.log(`[scheduler] learned origin: ${publicOrigin}`);
  }
}

async function acquireLease(): Promise<boolean> {
  const raw = await getSetting("schedulerLease");
  const now = Date.now();
  if (raw) {
    try {
      const j = JSON.parse(raw);
      // 租约 90 秒内被别的实例持有则放弃
      if (j.instanceId !== INSTANCE_ID && now - j.ts < 90_000) return false;
    } catch {
      /* 忽略坏数据，直接抢 */
    }
  }
  await setSetting("schedulerLease", JSON.stringify({ instanceId: INSTANCE_ID, ts: now }));
  return true;
}

async function loadSemesterConfig(): Promise<SemesterConfig> {
  const raw = await getSetting("semesterConfig");
  try {
    return raw
      ? { ...DEFAULT_SEMESTER_CONFIG, ...JSON.parse(raw) }
      : { ...DEFAULT_SEMESTER_CONFIG, semester: currentSemester() };
  } catch {
    return { ...DEFAULT_SEMESTER_CONFIG, semester: currentSemester() };
  }
}

function currentWeek(cfg: SemesterConfig, now = new Date()): number {
  const start = new Date(cfg.startDate + "T00:00:00+08:00").getTime();
  return Math.floor((now.getTime() - start) / (7 * 24 * 3600 * 1000)) + 1;
}

function shanghaiNow(): Date {
  // 用 +08:00 偏移构造"上海墙钟"对应的本地字段
  const s = new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" });
  return new Date(s);
}

/** 每 4 分钟：租约 + 自 ping 保活 */
async function heartbeatTick() {
  try {
    if (!(await acquireLease())) return;
    if (publicOrigin) {
      await fetch(`${publicOrigin}/api/trpc/ping`, { signal: AbortSignal.timeout(8000) }).catch(
        () => {},
      );
    }
  } catch (e) {
    console.error("[scheduler] heartbeat error:", e);
  }
}

/** 每 30 分钟检查：是否到达同步锚点（06:40 / 22:20），是则全量同步 */
let lastSyncAnchor = "";
async function syncTick() {
  try {
    if (!(await acquireLease())) return;
    const now = shanghaiNow();
    const hm = now.getHours() * 100 + now.getMinutes();
    const anchor =
      hm >= 640 && hm < 710
        ? `${now.toDateString()}-0640`
        : hm >= 2220 && hm < 2250
          ? `${now.toDateString()}-2220`
          : null;
    if (!anchor || anchor === lastSyncAnchor) return;
    lastSyncAnchor = anchor;

    const cfg = await loadSemesterConfig();
    const bindings = await listAllBindings();
    for (const b of bindings) {
      if (b.status !== "active") continue;
      try {
        const outcome = await fetchSchedule(b.studentId, decryptSecret(b.passwordEnc), cfg.semester);
        await replaceCourses(b.userId, cfg.semester, outcome.courses);
        if (outcome.student) {
          await upsertBinding(b.userId, {
            studentId: b.studentId,
            passwordEnc: b.passwordEnc,
            realName: outcome.student.name ?? b.realName,
            college: outcome.student.college ?? b.college,
          });
        }
        await markBindingStatus(b.userId, "active", null);
        await addFetchLog(b.userId, "schedule", true, `定时同步：${outcome.courses.length} 条课程`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await markBindingStatus(b.userId, "error", msg);
        await addFetchLog(b.userId, "schedule", false, `定时同步失败：${msg}`);
      }
    }
    console.log(`[scheduler] sync anchor ${anchor} done (${bindings.length} bindings)`);
  } catch (e) {
    console.error("[scheduler] sync error:", e);
  }
}

/** 每分钟：上课提醒 + 每晚次日课表推送 */
async function remindTick() {
  try {
    if (!(await acquireLease())) return;
    const cfg = await loadSemesterConfig();
    const now = shanghaiNow();
    const week = currentWeek(cfg, now);
    const dow = now.getDay() === 0 ? 7 : now.getDay(); // 1-7
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const reminders = await listAllReminders();
    for (const r of reminders) {
      if (!r.enableClassReminder && !r.enableDailyDigest) continue;
      const courses = await getCourses(r.userId, cfg.semester);

      // —— 上课前提醒 ——
      if (r.enableClassReminder) {
        for (const c of courses) {
          if (c.dayOfWeek !== dow || !c.weeks.includes(week)) continue;
          const startStr = cfg.periodTimes[c.startSection - 1];
          if (!startStr) continue;
          const [sh, sm] = startStr.split(":").map(Number);
          const startMin = sh * 60 + sm;
          const diff = startMin - nowMin;
          if (diff !== r.minutesBefore) continue;
          const dedupKey = `notified:${r.userId}:${now.toDateString()}`;
          const notified: string[] = JSON.parse((await getSetting(dedupKey)) ?? "[]");
          const tag = `${c.id}`;
          if (notified.includes(tag)) continue;
          notified.push(tag);
          await setSetting(dedupKey, JSON.stringify(notified.slice(-60)));
          await notifyUser(
            r,
            `上课提醒：${c.courseName}`,
            `${r.minutesBefore} 分钟后（${startStr}）\n${c.courseName}\n地点：${c.location ?? "待定"}\n第 ${c.startSection}-${c.endSection} 节`,
          );
        }
      }

      // —— 每晚推送次日课表 ——
      if (r.enableDailyDigest && now.getHours() === r.digestHour && now.getMinutes() === 0) {
        const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
        const tDow = tomorrow.getDay() === 0 ? 7 : tomorrow.getDay();
        const tWeek = currentWeek(cfg, tomorrow);
        const list = courses
          .filter((c) => c.dayOfWeek === tDow && c.weeks.includes(tWeek))
          .sort((a, b) => a.startSection - b.startSection);
        const body = list.length
          ? list
              .map(
                (c) =>
                  `第${c.startSection}-${c.endSection}节 ${c.courseName}${c.location ? ` @ ${c.location}` : ""}`,
              )
              .join("\n")
          : "明天没有课，好好休息 :)";
        await notifyUser(r, `明日课表（${tomorrow.getMonth() + 1}/${tomorrow.getDate()}）`, body);
      }
    }
  } catch (e) {
    console.error("[scheduler] remind error:", e);
  }
}

export function startScheduler() {
  if (started) return;
  started = true;
  console.log(`[scheduler] started, instance=${INSTANCE_ID}`);
  setInterval(heartbeatTick, 4 * 60 * 1000);
  setInterval(syncTick, 30 * 60 * 1000);
  setInterval(remindTick, 60 * 1000);
  // 启动后先跑一轮（不等第一个间隔）
  setTimeout(heartbeatTick, 15_000);
  setTimeout(syncTick, 30_000);
}
